export const downloadBlob = (blob: Blob, filename: string) => {
    // Guard against SSR/non-browser environments
    if (typeof document === 'undefined') return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Some browsers (notably Safari / embedded WebViews) may fail if we revoke immediately.
    // Delay revocation slightly to let the download start.
    const revoke = () => URL.revokeObjectURL(url);
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') window.setTimeout(revoke, 1500);
    else setTimeout(revoke, 1500);
};
