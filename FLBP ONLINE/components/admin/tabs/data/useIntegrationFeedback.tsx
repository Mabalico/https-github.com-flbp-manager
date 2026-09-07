import React from 'react';
import { AdminDataConfirmModal } from './AdminDataConfirmModal';

/** Scoped feedback for the existing integration handlers, including async confirmations. */
export const useIntegrationFeedback = (t: (key: string) => string) => {
    const [message, notify] = React.useState('');
    const [question, setQuestion] = React.useState('');
    const resolve = React.useRef<((answer: boolean) => void) | null>(null);
    React.useEffect(() => () => { resolve.current?.(false); }, []);
    const ask = (text: string) => new Promise<boolean>(done => {
        resolve.current?.(false); resolve.current = done; setQuestion(text);
    });
    const answer = (value: boolean) => { const done = resolve.current; resolve.current = null; setQuestion(''); done?.(value); };
    const feedbackUI = <>
        {message && <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800"><span>{message}</span><button type="button" onClick={() => notify('')} aria-label={t('close')} className="rounded-lg border px-3 py-2">×</button></div>}
        <AdminDataConfirmModal open={!!question} tone="warning" title={t('edition_review')} description={question} confirmLabel={t('confirm')} cancelLabel={t('cancel')} onConfirm={() => answer(true)} onClose={() => answer(false)} />
    </>;
    return { notify, ask, feedbackUI };
};
