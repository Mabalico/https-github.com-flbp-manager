import { getNativeShellPlatform } from './nativeShell';

export type NativePushPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported' | 'unknown';
export type NativePushProvider = 'fcm' | 'apns';

export interface NativePushRegistrationSnapshot {
  platform: 'android' | 'ios';
  provider: NativePushProvider;
  deviceId: string;
  deviceToken: string | null;
  permission: NativePushPermissionState;
  pushEnabled: boolean;
  configReady: boolean;
  appVersion: string | null;
  lastError: string | null;
}

export const NATIVE_PUSH_REGISTRATION_EVENT = 'flbp-native-push-registration';

type NativePushBridge = {
  getRegistrationJson?: () => string;
  requestPermission?: () => unknown;
  refreshRegistration?: () => unknown;
};

declare global {
  interface Window {
    FLBPNativePushBridge?: NativePushBridge;
    __flbpNativePushBridge?: NativePushBridge;
    __flbpNativePushRegistration?: unknown;
  }
}

const normalizePermission = (value: unknown): NativePushPermissionState => {
  const safe = String(value || '').trim().toLowerCase();
  if (safe === 'granted' || safe === 'denied' || safe === 'prompt' || safe === 'unsupported') return safe;
  return 'unknown';
};

const normalizeSnapshot = (value: unknown): NativePushRegistrationSnapshot | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const platform = getNativeShellPlatform();
  if (!platform) return null;
  const deviceId = String(raw.deviceId || '').trim();
  if (!deviceId) return null;
  const providerRaw = String(raw.provider || '').trim().toLowerCase();
  const provider: NativePushProvider = providerRaw === 'apns' ? 'apns' : 'fcm';
  const token = String(raw.deviceToken || '').trim();
  const permission = normalizePermission(raw.permission);
  const configReady = raw.configReady === false ? false : true;
  const pushEnabled = raw.pushEnabled === true || (permission === 'granted' && !!token);
  const appVersion = String(raw.appVersion || '').trim() || null;
  const lastError = String(raw.lastError || '').trim() || null;
  return {
    platform,
    provider,
    deviceId,
    deviceToken: token || null,
    permission,
    pushEnabled,
    configReady,
    appVersion,
    lastError,
  };
};

const tryParseRegistrationJson = (raw: unknown): NativePushRegistrationSnapshot | null => {
  if (typeof raw !== 'string') return normalizeSnapshot(raw);
  const safe = raw.trim();
  if (!safe) return null;
  try {
    return normalizeSnapshot(JSON.parse(safe));
  } catch {
    return null;
  }
};

const readBridge = (): NativePushBridge | null => {
  if (typeof window === 'undefined') return null;
  return window.FLBPNativePushBridge || window.__flbpNativePushBridge || null;
};

export const readNativePushRegistration = (): NativePushRegistrationSnapshot | null => {
  if (typeof window === 'undefined') return null;
  const bridge = readBridge();
  if (bridge?.getRegistrationJson) {
    try {
      const fromBridge = tryParseRegistrationJson(bridge.getRegistrationJson());
      if (fromBridge) return fromBridge;
    } catch {
      // ignore
    }
  }
  return tryParseRegistrationJson(window.__flbpNativePushRegistration);
};

const waitForNativePushRegistration = (timeoutMs = 1600): Promise<NativePushRegistrationSnapshot | null> => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let finished = false;
    const cleanup = () => {
      window.removeEventListener(NATIVE_PUSH_REGISTRATION_EVENT, onEvent as EventListener);
      window.clearTimeout(timerId);
    };
    const finish = (value: NativePushRegistrationSnapshot | null) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(value);
    };
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      finish(normalizeSnapshot(detail) || readNativePushRegistration());
    };
    const timerId = window.setTimeout(() => finish(readNativePushRegistration()), timeoutMs);
    window.addEventListener(NATIVE_PUSH_REGISTRATION_EVENT, onEvent as EventListener, { once: true });
  });
};

const invokeBridgeMethod = async (
  method: keyof NativePushBridge,
  options: { waitForFreshSnapshot?: boolean; timeoutMs?: number } = {}
): Promise<NativePushRegistrationSnapshot | null> => {
  const bridge = readBridge();
  const fn = bridge?.[method];
  if (!fn) return readNativePushRegistration();
  try {
    const immediate = tryParseRegistrationJson(fn());
    if (!options.waitForFreshSnapshot && immediate && immediate.permission !== 'prompt') return immediate;
    const fromEvent = await waitForNativePushRegistration(options.timeoutMs ?? (options.waitForFreshSnapshot ? 6000 : 1800));
    return fromEvent || immediate || readNativePushRegistration();
  } catch {
    return await waitForNativePushRegistration(options.timeoutMs ?? (options.waitForFreshSnapshot ? 6000 : 1800));
  }
};

export const requestNativePushPermission = async (): Promise<NativePushRegistrationSnapshot | null> =>
  invokeBridgeMethod('requestPermission', { waitForFreshSnapshot: true });

export const refreshNativePushRegistration = async (): Promise<NativePushRegistrationSnapshot | null> =>
  invokeBridgeMethod('refreshRegistration');

export const subscribeNativePushRegistration = (onChange: (snapshot: NativePushRegistrationSnapshot | null) => void) => {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => onChange(normalizeSnapshot((event as CustomEvent).detail) || readNativePushRegistration());
  window.addEventListener(NATIVE_PUSH_REGISTRATION_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(NATIVE_PUSH_REGISTRATION_EVENT, handler as EventListener);
  };
};
