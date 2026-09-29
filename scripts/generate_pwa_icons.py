#!/usr/bin/env python3
"""
Gera os ícones PWA oficiais do FechaZap:
- public/pwa-192x192.png
- public/pwa-512x512.png
- public/pwa-maskable-512x512.png
- public/apple-touch-icon.png (180x180)
- public/favicon.ico
"""

import os
import zlib
import struct
import math

def point_in_poly(x, y, poly):
    inside = False
    n = len(poly)
    p1x, p1y = poly[0]
    for i in range(1, n + 1):
        p2x, p2y = poly[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def dist_to_segment(px, py, x1, y1, x2, y2):
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(px - x1, py - y1)
    t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    projx = x1 + t * dx
    projy = y1 + t * dy
    return math.hypot(px - projx, py - projy)

def dist_to_poly_edges(px, py, poly):
    dmin = 1e9
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        d = dist_to_segment(px, py, x1, y1, x2, y2)
        if d < dmin:
            dmin = d
    return dmin

def rounded_rect_dist(x, y, w, h, r):
    # Distância positiva se estiver fora
    cx = min(max(x, r), w - r)
    cy = min(max(y, r), h - r)
    dx = abs(x - cx) - (cx - r if x < r or x > w - r else 0)
    # Forma correta de SDF para rounded box
    qx = max(abs(x - w / 2.0) - (w / 2.0 - r), 0.0)
    qy = max(abs(y - h / 2.0) - (h / 2.0 - r), 0.0)
    return math.hypot(qx, qy) - r

def make_png(w, h, rgba_func):
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter type 0
        for x in range(w):
            r, g, b, a = rgba_func(x, y, w, h)
            raw.extend((r, g, b, a))
    
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')

def render_fechazap_icon(x, y, w, h, is_maskable=False):
    nx = x / float(w)
    ny = y / float(h)

    # 1. Gradiente de fundo: Emerald (#059669) -> Teal (#0d9488)
    t = (nx * 0.5 + ny * 0.5)
    r_bg = int(5 + t * (13 - 5))
    g_bg = int(150 + t * (148 - 150))
    b_bg = int(105 + t * (136 - 105))
    bg_color = (r_bg, g_bg, b_bg, 255)

    if not is_maskable:
        # Canto arredondado (squircle) com raio 22%
        radius = w * 0.22
        sdf = rounded_rect_dist(x, y, w, h, radius)
        if sdf > 0.5:
            return (0, 0, 0, 0) # transparente
        elif sdf > -0.5:
            alpha = int(255 * (0.5 - sdf))
            bg_color = (r_bg, g_bg, b_bg, max(0, min(255, alpha)))

    # Coordenadas do raio (relativas ao centro do ícone)
    # Se maskable, escala para caber na zona segura (80%)
    scale = 0.72 if is_maskable else 0.88
    cx = 0.5
    cy = 0.5

    # Coordenadas originais do raio (0 a 1)
    bolt_raw = [
        (0.56, 0.12),
        (0.31, 0.53),
        (0.49, 0.53),
        (0.42, 0.88),
        (0.69, 0.47),
        (0.51, 0.47),
    ]

    bolt_poly = []
    for px, py in bolt_raw:
        bx = cx + (px - cx) * scale
        by = cy + (py - cy) * scale
        bolt_poly.append((bx * w, by * h))

    in_bolt = point_in_poly(x, y, bolt_poly)
    dist_edge = dist_to_poly_edges(x, y, bolt_poly)

    # 2. Sombra do raio
    shadow_poly = [(bx, by + 4) for (bx, by) in bolt_poly]
    in_shadow = point_in_poly(x, y, shadow_poly)

    # Cor do raio: Branco brilhante com gradiente sutil para amarelo dourado
    bolt_r = 255
    bolt_g = int(255 - (ny * 30))
    bolt_b = int(255 - (ny * 80))

    if in_bolt:
        # Borda interna suave (antialiasing)
        if dist_edge < 1.0:
            factor = dist_edge
            r = int(bolt_r * factor + bg_color[0] * (1 - factor))
            g = int(bolt_g * factor + bg_color[1] * (1 - factor))
            b = int(bolt_b * factor + bg_color[2] * (1 - factor))
            return (r, g, b, bg_color[3])
        return (bolt_r, bolt_g, bolt_b, bg_color[3])
    elif dist_edge < 1.2:
        # Antialiasing externo do raio
        factor = max(0.0, 1.0 - (dist_edge / 1.2))
        r = int(bolt_r * factor + bg_color[0] * (1 - factor))
        g = int(bolt_g * factor + bg_color[1] * (1 - factor))
        b = int(bolt_b * factor + bg_color[2] * (1 - factor))
        return (r, g, b, bg_color[3])
    elif in_shadow:
        # Sombra sutil
        return (int(bg_color[0] * 0.7), int(bg_color[1] * 0.7), int(bg_color[2] * 0.7), bg_color[3])

    # 3. Pequeno badge circular de confirmação no canto inferior direito
    badge_cx = w * (0.76 if is_maskable else 0.80)
    badge_cy = h * (0.76 if is_maskable else 0.80)
    badge_r = w * 0.08
    d_badge = math.hypot(x - badge_cx, y - badge_cy)

    if d_badge <= badge_r:
        if d_badge > badge_r - 1.5:
            # borda branca
            return (255, 255, 255, bg_color[3])
        return (4, 120, 87, bg_color[3])  # emerald-700
    elif d_badge <= badge_r + 1.2:
        factor = max(0.0, 1.0 - ((d_badge - badge_r) / 1.2))
        r = int(255 * factor + bg_color[0] * (1 - factor))
        g = int(255 * factor + bg_color[1] * (1 - factor))
        b = int(255 * factor + bg_color[2] * (1 - factor))
        return (r, g, b, bg_color[3])

    return bg_color

def main():
    os.makedirs('public', exist_ok=True)

    print('Gerando pwa-192x192.png...')
    png192 = make_png(192, 192, lambda x, y, w, h: render_fechazap_icon(x, y, w, h, is_maskable=False))
    with open('public/pwa-192x192.png', 'wb') as f:
        f.write(png192)

    print('Gerando pwa-512x512.png...')
    png512 = make_png(512, 512, lambda x, y, w, h: render_fechazap_icon(x, y, w, h, is_maskable=False))
    with open('public/pwa-512x512.png', 'wb') as f:
        f.write(png512)

    print('Gerando pwa-maskable-512x512.png...')
    png_mask = make_png(512, 512, lambda x, y, w, h: render_fechazap_icon(x, y, w, h, is_maskable=True))
    with open('public/pwa-maskable-512x512.png', 'wb') as f:
        f.write(png_mask)

    print('Gerando apple-touch-icon.png (180x180)...')
    png_apple = make_png(180, 180, lambda x, y, w, h: render_fechazap_icon(x, y, w, h, is_maskable=False))
    with open('public/apple-touch-icon.png', 'wb') as f:
        f.write(png_apple)

    print('Gerando favicon.png e favicon.ico (64x64)...')
    png_fav = make_png(64, 64, lambda x, y, w, h: render_fechazap_icon(x, y, w, h, is_maskable=False))
    with open('public/favicon.png', 'wb') as f:
        f.write(png_fav)

    # Formato padrão ICO encapsulando PNG
    # ICO Header (6 bytes): 0, 1 (icon type), 1 (count)
    # Directory entry (16 bytes): w(1B), h(1B), colors(1B=0), reserved(1B=0), planes(2B=1), bpp(2B=32), bytesize(4B), offset(4B=22)
    ico_header = struct.pack('<HHH', 0, 1, 1)
    ico_entry = struct.pack('<BBBBHHII', 64, 64, 0, 0, 1, 32, len(png_fav), 22)
    with open('public/favicon.ico', 'wb') as f:
        f.write(ico_header + ico_entry + png_fav)

    print('Ícones PWA gerados com sucesso!')

if __name__ == '__main__':
    main()
