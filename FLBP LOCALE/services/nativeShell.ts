export type NativeShellPlatform = 'android' | 'ios';

const readNativeShellParam = (): string => {
    if (typeof window === 'undefined') return '';
    try {
        return new URLSearchParams(window.location.search).get('native_shell')?.trim().toLowerCase() || '';
    } catch {
        return '';
    }
};

export const getNativeShellPlatform = (): NativeShellPlatform | null => {
    const value = readNativeShellParam();
    if (value === 'android' || value === 'ios') return value;
    return null;
};

export const isEmbeddedNativeShell = (): boolean => getNativeShellPlatform() !== null;
