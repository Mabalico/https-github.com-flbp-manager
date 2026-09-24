// Lazy-load XLSX only when needed (import/export). Keeps initial bundle lighter.

export type XLSXRuntime = typeof import('xlsx');

let _xlsx: XLSXRuntime | null = null;

export const getXLSX = async (): Promise<XLSXRuntime> => {
    if (_xlsx) return _xlsx;
    const [mod, codepages] = await Promise.all([
        import('xlsx'),
        import('xlsx/dist/cpexcel.full.mjs'),
    ]);
    const runtime = ((mod as any)?.default ?? mod) as XLSXRuntime;
    // The ESM build needs explicit codepages to preserve names in legacy XLS.
    runtime.set_cptable(codepages);
    _xlsx = runtime;
    return _xlsx;
};
