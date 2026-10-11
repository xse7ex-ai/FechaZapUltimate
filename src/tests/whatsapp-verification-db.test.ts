import { describe, it, expect, beforeEach } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';

// ==============================================================================
// Testes de Banco de Dados Real (PostgreSQL 16 Engine via PGlite)
// Validação das Constraints, Triggers de Segurança e RPC register_whatsapp_connection
// ==============================================================================

describe('WhatsApp Conexões - Testes Reais de Banco de Dados (PostgreSQL 16)', () => {
  let db: PGlite;

  const userA = '11111111-1111-1111-1111-111111111111';
  const userB = '22222222-2222-2222-2222-222222222222';
  const userC = '33333333-3333-3333-3333-333333333333';

  beforeEach(async () => {
    db = new PGlite();

    // 1. Configura schemas e roles base do Supabase
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;

      DO $$ BEGIN
        CREATE ROLE authenticated NOLOGIN;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE ROLE service_role NOLOGIN;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE ROLE anon NOLOGIN;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      CREATE TABLE auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT
      );

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
        SELECT coalesce(
          nullif(current_setting('request.jwt.claim.role', true), ''),
          (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
          'anon'
        )::text;
      $$ LANGUAGE sql STABLE;

      CREATE TABLE public.profiles (
        id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        email TEXT,
        nome TEXT,
        plano TEXT NOT NULL DEFAULT 'GRATUITO'
      );

      CREATE TABLE public.whatsapp_connections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        waba_id TEXT,
        phone_number_id TEXT NOT NULL,
        display_phone_number TEXT,
        access_token_encrypted TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'revoked')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Popula usuários
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES 
        ('${userA}', 'userA@example.com'),
        ('${userB}', 'userB@example.com'),
        ('${userC}', 'userC@example.com');

      INSERT INTO public.profiles (id, email, nome, plano) VALUES
        ('${userA}', 'userA@example.com', 'User A', 'TURBO'),
        ('${userB}', 'userB@example.com', 'User B', 'TURBO'),
        ('${userC}', 'userC@example.com', 'User C', 'GRATUITO');
    `);

    // 3. Aplica a migração oficial
    await db.exec(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN (
          SELECT conname 
          FROM pg_constraint 
          WHERE conrelid = 'public.whatsapp_connections'::regclass 
            AND contype = 'c'
            AND pg_get_constraintdef(oid) ILIKE '%status%'
        ) LOOP
          EXECUTE 'ALTER TABLE public.whatsapp_connections DROP CONSTRAINT ' || quote_ident(r.conname);
        END LOOP;
      END $$;

      ALTER TABLE public.whatsapp_connections
        ADD CONSTRAINT whatsapp_connections_status_check
        CHECK (status IN ('active', 'inactive', 'revoked', 'pending_verification'));

      ALTER TABLE public.whatsapp_connections
        ALTER COLUMN status SET DEFAULT 'pending_verification';

      DROP INDEX IF EXISTS public.idx_whatsapp_conn_unique_active_phone;
      DROP INDEX IF EXISTS public.idx_whatsapp_conn_unique_active_or_pending_phone;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_conn_unique_active_or_pending_phone
        ON public.whatsapp_connections(phone_number_id)
        WHERE status IN ('active', 'pending_verification');

      CREATE OR REPLACE FUNCTION public.check_whatsapp_connection_security()
      RETURNS TRIGGER AS $$
      DECLARE
        v_user_plano TEXT;
        v_central_phone TEXT;
        v_jwt_role TEXT;
        v_auth_role TEXT;
        v_is_service_role BOOLEAN;
      BEGIN
        v_central_phone := 'central_fechazap_shared_106934522435791';

        IF NEW.phone_number_id = v_central_phone 
           OR NEW.phone_number_id = '106934522435791' 
           OR NEW.phone_number_id ILIKE '%central_fechazap%' THEN
          RAISE EXCEPTION 'FORBIDDEN_CENTRAL_PHONE: O identificador central do FechaZap não pode ser cadastrado como conexão individual.'
            USING ERRCODE = '42501';
        END IF;

        IF NEW.waba_id IS NOT NULL AND (
          NEW.waba_id = 'central_waba_fechazap' 
          OR NEW.waba_id = '106934522435790'
          OR NEW.waba_id ILIKE '%central_waba%'
        ) THEN
          RAISE EXCEPTION 'FORBIDDEN_CENTRAL_WABA: O WABA ID central do FechaZap não pode ser cadastrado como conexão individual.'
            USING ERRCODE = '42501';
        END IF;

        IF NEW.status IN ('active', 'pending_verification') THEN
          IF EXISTS (
            SELECT 1 FROM public.whatsapp_connections
            WHERE phone_number_id = NEW.phone_number_id
              AND status IN ('active', 'pending_verification')
              AND user_id <> NEW.user_id
              AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          ) THEN
            RAISE EXCEPTION 'PHONE_NUMBER_ALREADY_CLAIMED: Este phone_number_id já está vinculado (ativo ou pendente) a outro usuário.'
              USING ERRCODE = '23505';
          END IF;

          SELECT plano INTO v_user_plano
          FROM public.profiles
          WHERE id = NEW.user_id;

          IF v_user_plano IS NULL OR v_user_plano <> 'TURBO' THEN
            RAISE EXCEPTION 'UPGRADE_REQUIRED: Apenas usuários com plano TURBO podem cadastrar conexões comerciais individuais da Meta Cloud API.'
              USING ERRCODE = 'P0001';
          END IF;
        END IF;

        IF NEW.status = 'active' THEN
          v_jwt_role := coalesce(current_setting('request.jwt.claim.role', true), '');
          
          BEGIN
            v_auth_role := auth.role();
          EXCEPTION WHEN OTHERS THEN
            v_auth_role := NULL;
          END;

          v_is_service_role := (
            v_jwt_role = 'service_role' 
            OR v_auth_role = 'service_role'
            OR session_user = 'service_role'
          );

          IF v_jwt_role = 'authenticated' OR v_auth_role = 'authenticated' OR NOT v_is_service_role THEN
            RAISE EXCEPTION 'FORBIDDEN_ACTIVATION: Apenas o backend confiável (service_role) pode ativar conexões individuais após verificação oficial com a Meta.'
              USING ERRCODE = '42501';
          END IF;
        END IF;

        NEW.updated_at := NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

      DROP TRIGGER IF EXISTS trg_check_whatsapp_connection_security ON public.whatsapp_connections;
      CREATE TRIGGER trg_check_whatsapp_connection_security
        BEFORE INSERT OR UPDATE ON public.whatsapp_connections
        FOR EACH ROW
        EXECUTE FUNCTION public.check_whatsapp_connection_security();

      CREATE OR REPLACE FUNCTION public.register_whatsapp_connection(
        p_phone_number_id TEXT,
        p_waba_id TEXT DEFAULT NULL,
        p_display_phone_number TEXT DEFAULT NULL
      )
      RETURNS JSONB AS $$
      DECLARE
        v_uid UUID;
        v_new_id UUID;
      BEGIN
        v_uid := auth.uid();
        IF v_uid IS NULL THEN
          RAISE EXCEPTION 'Operação negada: usuário não autenticado.'
            USING ERRCODE = '42501';
        END IF;

        IF p_phone_number_id IS NULL OR trim(p_phone_number_id) = '' THEN
          RAISE EXCEPTION 'phone_number_id obrigatório.'
            USING ERRCODE = '22023';
        END IF;

        UPDATE public.whatsapp_connections
        SET status = 'inactive',
            updated_at = NOW()
        WHERE user_id = v_uid AND status IN ('active', 'pending_verification');

        INSERT INTO public.whatsapp_connections (
          user_id,
          waba_id,
          phone_number_id,
          display_phone_number,
          status,
          created_at,
          updated_at
        )
        VALUES (
          v_uid,
          trim(p_waba_id),
          trim(p_phone_number_id),
          trim(p_display_phone_number),
          'pending_verification',
          NOW(),
          NOW()
        )
        RETURNING id INTO v_new_id;

        RETURN jsonb_build_object(
          'success', true,
          'id', v_new_id,
          'phone_number_id', trim(p_phone_number_id),
          'status', 'pending_verification'
        );
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

      REVOKE ALL ON FUNCTION public.register_whatsapp_connection(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
      GRANT EXECUTE ON FUNCTION public.register_whatsapp_connection(TEXT, TEXT, TEXT) TO authenticated, service_role;
    `);
  });

  it('1. RPC cria nova conexão SEMPRE em pending_verification, nunca active', async () => {
    await db.exec(`
      SET "request.jwt.claim.sub" = '${userA}';
      SET "request.jwt.claim.role" = 'authenticated';
    `);

    const res = await db.query(`
      SELECT public.register_whatsapp_connection('phone-test-1', 'waba-test-1', '+5511999990001') as result;
    `);

    const result = res.rows[0].result as any;
    expect(result.success).toBe(true);
    expect(result.status).toBe('pending_verification');

    const dbRow = await db.query(`SELECT status FROM public.whatsapp_connections WHERE id = '${result.id}'`);
    expect(dbRow.rows[0].status).toBe('pending_verification');
  });

  it('2. Constraint aceita pending_verification e preserva active, inactive, revoked', async () => {
    // Insere como service_role para testar todos os 4 estados
    await db.exec(`SET "request.jwt.claim.role" = 'service_role';`);

    const insertStates = ['active', 'inactive', 'revoked', 'pending_verification'];
    for (const st of insertStates) {
      const id = `00000000-0000-0000-0000-00000000000${insertStates.indexOf(st) + 1}`;
      await db.exec(`
        INSERT INTO public.whatsapp_connections (id, user_id, phone_number_id, status)
        VALUES ('${id}', '${userA}', 'phone-state-${st}', '${st}');
      `);
      const row = await db.query(`SELECT status FROM public.whatsapp_connections WHERE id = '${id}'`);
      expect(row.rows[0].status).toBe(st);
    }
  });

  it('3. Trigger impede usuário authenticated de executar UPDATE direto para status active', async () => {
    // Cria conexão pendente
    await db.exec(`
      SET "request.jwt.claim.sub" = '${userA}';
      SET "request.jwt.claim.role" = 'authenticated';
    `);
    const rpcRes = await db.query(`SELECT public.register_whatsapp_connection('phone-user-a-lock') as result;`);
    const id = (rpcRes.rows[0].result as any).id;

    // Tenta UPDATE direto para active
    expect(async () => {
      await db.exec(`
        UPDATE public.whatsapp_connections
        SET status = 'active'
        WHERE id = '${id}';
      `);
    }).toThrow('FORBIDDEN_ACTIVATION');
  });

  it('4. Chamada de service_role (supabaseAdmin) consegue ativar normalmente', async () => {
    await db.exec(`
      SET "request.jwt.claim.sub" = '${userA}';
      SET "request.jwt.claim.role" = 'authenticated';
    `);
    const rpcRes = await db.query(`SELECT public.register_whatsapp_connection('phone-to-activate') as result;`);
    const id = (rpcRes.rows[0].result as any).id;

    // Backend confiável ativa com access_token
    await db.exec(`SET "request.jwt.claim.role" = 'service_role';`);
    await db.exec(`
      UPDATE public.whatsapp_connections
      SET status = 'active', access_token_encrypted = 'encrypted-secret-token'
      WHERE id = '${id}';
    `);

    const row = await db.query(`SELECT status FROM public.whatsapp_connections WHERE id = '${id}'`);
    expect(row.rows[0].status).toBe('active');
  });

  it('5. Bloqueio absoluto do número central para conexões pendentes', async () => {
    await db.exec(`
      SET "request.jwt.claim.sub" = '${userA}';
      SET "request.jwt.claim.role" = 'authenticated';
    `);

    expect(async () => {
      await db.query(`SELECT public.register_whatsapp_connection('central_fechazap_shared_106934522435791');`);
    }).toThrow('FORBIDDEN_CENTRAL_PHONE');

    expect(async () => {
      await db.query(`SELECT public.register_whatsapp_connection('106934522435791');`);
    }).toThrow('FORBIDDEN_CENTRAL_PHONE');

    expect(async () => {
      await db.query(`SELECT public.register_whatsapp_connection('phone-valid-99', 'central_waba_fechazap');`);
    }).toThrow('FORBIDDEN_CENTRAL_WABA');
  });

  it('6. Unicidade impede reivindicação conflitante entre pendente e ativo de usuários distintos', async () => {
    await db.exec(`
      SET "request.jwt.claim.sub" = '${userA}';
      SET "request.jwt.claim.role" = 'authenticated';
    `);
    await db.query(`SELECT public.register_whatsapp_connection('phone-shared-conflict');`);

    // Usuário B tenta reivindicar o mesmo número
    await db.exec(`
      SET "request.jwt.claim.sub" = '${userB}';
      SET "request.jwt.claim.role" = 'authenticated';
    `);

    expect(async () => {
      await db.query(`SELECT public.register_whatsapp_connection('phone-shared-conflict');`);
    }).toThrow('PHONE_NUMBER_ALREADY_CLAIMED');
  });

  it('7. Usuário sem plano TURBO não pode cadastrar conexões mesmo que pendentes', async () => {
    await db.exec(`
      SET "request.jwt.claim.sub" = '${userC}';
      SET "request.jwt.claim.role" = 'authenticated';
    `);

    expect(async () => {
      await db.query(`SELECT public.register_whatsapp_connection('phone-free-user');`);
    }).toThrow('UPGRADE_REQUIRED');
  });

  it('8. Conexões legadas sem token são migradas para pending_verification', async () => {
    // Insere conexão legada simulada como service_role antes do update
    const legacyId = '99999999-9999-9999-9999-999999999999';
    await db.exec(`SET "request.jwt.claim.role" = 'service_role';`);
    await db.exec(`
      INSERT INTO public.whatsapp_connections (id, user_id, phone_number_id, status, access_token_encrypted)
      VALUES ('${legacyId}', '${userA}', 'phone-legado-teste', 'active', NULL);
    `);

    // Executa a migração de dados legados
    await db.exec(`
      UPDATE public.whatsapp_connections
      SET status = 'pending_verification',
          updated_at = NOW()
      WHERE status = 'active' AND (access_token_encrypted IS NULL OR trim(access_token_encrypted) = '');
    `);

    const row = await db.query(`SELECT status FROM public.whatsapp_connections WHERE id = '${legacyId}'`);
    expect(row.rows[0].status).toBe('pending_verification');
  });
});
