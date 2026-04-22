import { getNativeShellRuntime } from './nativeShell';
import { readCapacitorNativePushBridge } from './capacitorPushBridge';

export type NativePushPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported' | 'unknown';
export type NativePushPermissionDetail = 'not_determined' | 'denied' | 'authorized' | 'provisional' | 'ephemeral' | 'unknown';
export type NativePushProvider = 'fcm' | 'apns';

export interface NativePushRegistrationSnapshot {
  platform: 'android' | 'ios';
  provider: NativePushProvider;
  deviceId: string;
  deviceToken: string | null;
  permission: NativePushPermissionState;
  permissionDetail: NativePushPermissionDetail;
  pushEnabled: boolean;
  configReady: boolean;
  appVersion: string | null;
  lastError: string | null;
}

export const NATIVE_PUSH_REGISTRATION_EVENT = 'flbp-native-push-registration';
const ANDROID_NATIVE_NOTIFICATION_PERMISSION_URL = 'flbp-native://request-notification-permission';
const ANDROID_NATIVE_NOTIFICATION_SETTINGS_URL = 'flbp-native://open-notification-settings';

type NativePushBridge = {
  getRegistrationJson?: () => string;
  requestPermission?: () => unknown;
  refreshRegistration?: () => unknown;
  openSettings?: () => unknown;
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

const normalizePermissionDetail = (value: unknown): NativePushPermissionDetail => {
  const safe = String(value || '').trim().toLowerCase();
  if (
    safe === 'not_determined' ||
    safe === 'denied' ||
    safe === 'authorized' ||
    safe === 'provisional' ||
    safe === 'ephemeral'
  ) return safe;
  return 'unknown';
};

const normalizeSnapshot = (value: unknown): NativePushRegistrationSnapshot | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const runtime = getNativeShellRuntime();
  if (!runtime.isNative || !runtime.platform) return null;
  const platform = runtime.platform;
  const deviceId = String(raw.deviceId || '').trim();
  if (!deviceId) return null;
  const providerRaw = String(raw.provider || '').trim().toLowerCase();
  const provider: NativePushProvider = providerRaw === 'apns' ? 'apns' : 'fcm';
  const token = String(raw.deviceToken || '').trim();
  const permission = normalizePermission(raw.permission);
  const permissionDetail = normalizePermissionDetail(raw.permissionDetail);
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
    permissionDetail,
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
  if (!getNativeShellRuntime().isNative) return null;
  return window.FLBPNativePushBridge || window.__flbpNativePushBridge || readCapacitorNativePushBridge();
};

const triggerDedicatedAndroidNotificationSettings = (): boolean => {
  if (typeof window === 'undefined') return false;
  const runtime = getNativeShellRuntime();
  if (!(runtime.isDedicatedShell && runtime.platform === 'android')) return false;
  try {
    window.location.assign(ANDROID_NATIVE_NOTIFICATION_SETTINGS_URL);
    return true;
  } catch {
    return false;
  }
};

const triggerDedicatedAndroidNotificationPermission = (): boolean => {
  if (typeof window === 'undefined') return false;
  const runtime = getNativeShellRuntime();
  if (!(runtime.isDedicatedShell && runtime.platform === 'android')) return false;
  try {
    window.location.assign(ANDROID_NATIVE_NOTIFICATION_PERMISSION_URL);
    return true;
  } catch {
    return false;
  }
};

const invokeDedicatedAndroidBridgeMethod = async (
  method: keyof NativePushBridge,
  options: { timeoutMs?: number } = {}
): Promise<NativePushRegistrationSnapshot | null> => {
  const runtime = getNativeShellRuntime();
  if (!(runtime.isDedicatedShell && runtime.platform === 'android')) return null;
  const bridge = readBridge();
  if (!bridge?.[method]) return null;
  return invokeBridgeMethod(method, {
    waitForFreshSnapshot: true,
    timeoutMs: options.timeoutMs ?? 2400,
  });
};

export const readNativePushRegistration = (): NativePushRegistrationSnapshot | null => {
  if (typeof window === 'undefined') return null;
  if (!getNativeShellRuntime().isNative) return null;
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

export const requestNativePushPermission = async (): Promise<NativePushRegistrationSnapshot | null> => {
  if (triggerDedicatedAndroidNotificationPermission()) {
    return waitForNativePushRegistration(2400);
  }
  const viaDedicatedBridge = await invokeDedicatedAndroidBridgeMethod('requestPermission', { timeoutMs: 3600 });
  if (viaDedicatedBridge) return viaDedicatedBridge;
  return invokeBridgeMethod('requestPermission', { waitForFreshSnapshot: true });
};

export const refreshNativePushRegistration = async (): Promise<NativePushRegistrationSnapshot | null> =>
  invokeBridgeMethod('refreshRegistration');

export const openNativePushSettings = async (): Promise<NativePushRegistrationSnapshot | null> => {
  if (triggerDedicatedAndroidNotificationSettings()) {
    return waitForNativePushRegistration(2400);
  }
  const viaDedicatedBridge = await invokeDedicatedAndroidBridgeMethod('openSettings', { timeoutMs: 2400 });
  if (viaDedicatedBridge) return viaDedicatedBridge;
  return invokeBridgeMethod('openSettings', { waitForFreshSnapshot: true, timeoutMs: 2400 });
};

export const subscribeNativePushRegistration = (onChange: (snapshot: NativePushRegistrationSnapshot | null) => void) => {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => onChange(normalizeSnapshot((event as CustomEvent).detail) || readNativePushRegistration());
  window.addEventListener(NATIVE_PUSH_REGISTRATION_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(NATIVE_PUSH_REGISTRATION_EVENT, handler as EventListener);
  };
};
