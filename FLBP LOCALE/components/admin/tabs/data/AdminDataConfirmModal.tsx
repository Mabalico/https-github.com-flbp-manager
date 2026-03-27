import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';

interface AdminDataConfirmModalProps {
  open: boolean;
  tone?: 'danger' | 'warning' | 'info';
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  summaryItems?: Array<{
    label: string;
    value: React.ReactNode;
  }>;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}

const toneClasses = {
  danger: {
    panel: 'border-rose-200 bg-white',
    iconWrap: 'bg-rose-50 text-rose-700 border border-rose-200',
    confirm: 'border border-rose-600 bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500',
  },
  warning: {
    panel: 'border-amber-200 bg-white',
    iconWrap: 'bg-amber-50 text-amber-700 border border-amber-200',
    confirm: 'border border-amber-500 bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-amber-500',
  },
  info: {
    panel: 'border-sky-200 bg-white',
    iconWrap: 'bg-sky-50 text-sky-700 border border-sky-200',
    confirm: 'border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500',
  },
} as const;

export const AdminDataConfirmModal: React.FC<AdminDataConfirmModalProps> = ({
  open,
  tone = 'danger',
  title,
  description,
  confirmLabel,
  cancelLabel = 'Annulla',
  summaryItems = [],
  onConfirm,
  onClose,
  children,
}) => {
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);
  const previousActiveRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    previousActiveRef.current = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => cancelRef.current?.focus(), 20);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      previousActiveRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const classes = toneClasses[tone];
  const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
  const cancelButtonClass =
    `inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 ${ring} focus-visible:ring-slate-300`;
  const confirmButtonClass =
    `inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-black transition shadow-sm ${ring} ${classes.confirm}`;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-data-modal-title"
        aria-describedby="admin-data-modal-description"
        className={`w-full max-w-xl rounded-[28px] border shadow-2xl shadow-slate-900/10 ${classes.panel}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${classes.iconWrap}`}>
              {tone === 'info' ? <Info className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <h3 id="admin-data-modal-title" className="text-xl font-black text-slate-950">
                {title}
              </h3>
              {description ? (
                <p id="admin-data-modal-description" className="mt-2 text-sm font-medium leading-6 text-slate-600">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          {summaryItems.length ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3">
              <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Riepilogo impatto</div>
              <dl className="mt-3 space-y-2">
                {summaryItems.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5">
                    <dt className="text-sm font-semibold text-slate-600">{item.label}</dt>
                    <dd className="text-sm font-black text-slate-950">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {children ? <div className="space-y-3 text-sm font-medium leading-6 text-slate-700">{children}</div> : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-5">
          <button ref={cancelRef} type="button" onClick={onClose} className={cancelButtonClass}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className={confirmButtonClass}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
