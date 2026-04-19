export type NativeShellPlatform = 'android' | 'ios';
export type NativeShellRuntime = 'browser' | 'dedicated-native-shell' | 'capacitor-wrapper';

export interface NativeShellRuntimeInfo {
    runtime: NativeShellRuntime;
    platform: NativeShellPlatform | null;
    isNative: boolean;
    isDedicatedShell: boolean;
    isCapacitorWrapper: boolean;
}

type CapacitorRuntime = {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    platform?: string;
};

const normalizeNativePlatform = (value: unknown): NativeShellPlatform | null => {
    const safe = String(value || '').trim().toLowerCase();
    if (safe === 'android' || safe === 'ios') return safe;
    return null;
};

const readNativeShellParam = (): string => {
    if (typeof window === 'undefined') return '';
    try {
        return new URLSearchParams(window.location.search).get('native_shell')?.trim().toLowerCase() || '';
    } catch {
        return '';
    }
};

const getDedicatedNativeShellPlatform = (): NativeShellPlatform | null => normalizeNativePlatform(readNativeShellParam());

const readCapacitorRuntime = (): CapacitorRuntime | null => {
    if (typeof window === 'undefined') return null;
    const capacitor = (window as Window & { Capacitor?: CapacitorRuntime }).Capacitor;
    if (!capacitor || typeof capacitor !== 'object') return null;
    return capacitor;
};

const getCapacitorWrapperPlatform = (): NativeShellPlatform | null => {
    const capacitor = readCapacitorRuntime();
    if (!capacitor) return null;

    let isNativePlatform = true;
    if (typeof capacitor.isNativePlatform === 'function') {
        try {
            isNativePlatform = capacitor.isNativePlatform();
        } catch {
            isNativePlatform = false;
        }
    }
    if (!isNativePlatform) return null;

    try {
        return normalizeNativePlatform(
            typeof capacitor.getPlatform === 'function' ? capacitor.getPlatform() : capacitor.platform
        );
    } catch {
        return normalizeNativePlatform(capacitor.platform);
    }
};

export const getNativeShellRuntime = (): NativeShellRuntimeInfo => {
    const dedicatedPlatform = getDedicatedNativeShellPlatform();
    if (dedicatedPlatform) {
        return {
            runtime: 'dedicated-native-shell',
            platform: dedicatedPlatform,
            isNative: true,
            isDedicatedShell: true,
            isCapacitorWrapper: false,
        };
    }

    const capacitorPlatform = getCapacitorWrapperPlatform();
    if (capacitorPlatform) {
        return {
            runtime: 'capacitor-wrapper',
            platform: capacitorPlatform,
            isNative: true,
            isDedicatedShell: false,
            isCapacitorWrapper: true,
        };
    }

    return {
        runtime: 'browser',
        platform: null,
        isNative: false,
        isDedicatedShell: false,
        isCapacitorWrapper: false,
    };
};

export const getNativeShellPlatform = (): NativeShellPlatform | null => getNativeShellRuntime().platform;

export const isEmbeddedNativeShell = (): boolean => getNativeShellRuntime().isNative;
