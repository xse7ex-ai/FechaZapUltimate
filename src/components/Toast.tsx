import React from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-xl border transition-all animate-in slide-in-from-bottom-2 duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-950 text-emerald-50 border-emerald-800'
              : toast.type === 'error'
              ? 'bg-rose-950 text-rose-50 border-rose-800'
              : toast.type === 'warning'
              ? 'bg-amber-950 text-amber-50 border-amber-700/80 shadow-amber-950/20'
              : 'bg-slate-900 text-slate-50 border-slate-700'
          }`}
        >
          {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
          {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />}
          {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 animate-bounce-slow" />}
          {toast.type === 'info' && <Info className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />}

          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm leading-tight">{toast.title}</h4>
            {toast.description && (
              <p className="text-xs text-slate-300 mt-1 leading-normal">{toast.description}</p>
            )}
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  onDismiss(toast.id);
                }}
                className="mt-2 text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors inline-flex items-center gap-1 cursor-pointer"
              >
                <span>{toast.action.label}</span>
              </button>
            )}
          </div>

          <button
            onClick={() => onDismiss(toast.id)}
            className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
