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
  confirmDisabled?: boolean;
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
  confirmDisabled = false,
  onConfirm,
  onClose,
  children,
}) => {
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const previousActiveRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    if (!open) return;

    previousActiveRef.current = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => cancelRef.current?.focus(), 20);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'Tab') {
        const dialog = dialogRef.current;
        const selector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
        const focusable: HTMLElement[] = dialog
          ? Array.from(dialog.querySelectorAll<HTMLElement>(selector))
          : [];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-[28px] border shadow-2xl shadow-slate-900/10 ${classes.panel}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${classes.iconWrap}`}>
              {tone === 'info' ? <Info className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <h3 id={titleId} className="text-xl font-black text-slate-950">
                {title}
              </h3>
              {description ? (
                <p id={descriptionId} className="mt-2 text-sm font-medium leading-6 text-slate-600">
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
                  <div key={item.label} className="flex flex-col gap-1 rounded-xl bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <dt className="text-sm font-semibold text-slate-600">{item.label}</dt>
                    <dd className="min-w-0 break-words text-sm font-black text-slate-950">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {children ? <div className="space-y-3 text-sm font-medium leading-6 text-slate-700">{children}</div> : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-end">
          <button ref={cancelRef} type="button" onClick={onClose} className={`${cancelButtonClass} w-full sm:w-auto`}>
            {cancelLabel}
          </button>
          <button type="button" disabled={confirmDisabled} onClick={onConfirm} className={`${confirmButtonClass} w-full disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
