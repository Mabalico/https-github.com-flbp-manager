// Lazy-load XLSX only when needed (import/export). Keeps initial bundle lighter.

export type XLSXRuntime = typeof import('xlsx');

let _xlsx: XLSXRuntime | null = null;

export const getXLSX = async (): Promise<XLSXRuntime> => {
    if (_xlsx) return _xlsx;
    const mod: any = await import('xlsx');
    _xlsx = (mod?.default ?? mod) as XLSXRuntime;
    return _xlsx;
};
