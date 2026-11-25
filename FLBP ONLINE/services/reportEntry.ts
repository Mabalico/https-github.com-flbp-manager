import type { KeyboardEvent } from 'react';

export const nextReportFieldIndex = (index: number, total: number, backwards: boolean): number | undefined => {
    const next = index + (backwards ? -1 : 1);
    return next >= 0 && next < total ? next : undefined;
};

export const reportTieState = (scores: number[]) => {
    const best = Math.max(0, ...scores);
    const leaderIndex = best > 0 ? scores.indexOf(best) : -1;
    const tied = leaderIndex >= 0 && scores.lastIndexOf(best) !== leaderIndex;
    return { tied, leaderIndex: tied ? -1 : leaderIndex };
};

export const focusReportField = (fields: HTMLElement | null, index = 0) => {
    const field = fields?.querySelector<HTMLInputElement>(`[data-report-field-index="${index}"]`);
    field?.focus();
    field?.select();
};

export const handleReportFieldEnter = (
    event: KeyboardEvent<HTMLElement>,
    options: { tied: boolean; canSave: boolean; save: () => void },
) => {
    if (event.key !== 'Enter' || event.repeat || event.nativeEvent.isComposing || !(event.target instanceof HTMLInputElement)) return;
    const rawIndex = event.target.dataset.reportFieldIndex;
    if (rawIndex === undefined) return;
    event.preventDefault();
    const total = event.currentTarget.querySelectorAll('[data-report-field-index]').length;
    const next = nextReportFieldIndex(Number(rawIndex), total, event.shiftKey);
    if (next !== undefined) focusReportField(event.currentTarget, next);
    else if (!event.shiftKey && options.tied) focusReportField(event.currentTarget);
    else if (!event.shiftKey && options.canSave) options.save();
};
