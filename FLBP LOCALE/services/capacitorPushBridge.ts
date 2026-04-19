import { getNativeShellRuntime, type NativeShellPlatform } from './nativeShell';

type NativePushPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported' | 'unknown';
type NativePushPermissionDetail = 'not_determined' | 'denied' | 'authorized' | 'provisional' | 'ephemeral' | 'unknown';
type NativePushProvider = 'fcm' | 'apns';

type NativePushSnapshotPayload = {
  platform: NativeShellPlatform;
  provider: NativePushProvider;
  deviceId: string;
  deviceToken: string | null;
  permission: NativePushPermissionState;
  permissionDetail: NativePushPermissionDetail;
  pushEnabled: boolean;
  configReady: boolean;
  appVersion: string | null;
  lastError: string | null;
};

type CapacitorPushBridge = {
  getRegistrationJson: () => string;
  requestPermission: () => unknown;
  refreshRegistration: () => unknown;
  openSettings: () => unknown;
};

type PushNotificationsPlugin = typeof import('@capacitor/push-notifications').PushNotifications;

const EVENT_NAME = 'flbp-native-push-registration';
const STORAGE_PREFIX = 'flbp_capacitor_push_';
const DEVICE_ID_KEY = `${STORAGE_PREFIX}device_id`;
const DEVICE_TOKEN_KEY = `${STORAGE_PREFIX}device_token`;
const PERMISSION_KEY = `${STORAGE_PREFIX}permission`;
const PERMISSION_DETAIL_KEY = `${STORAGE_PREFIX}permission_detail`;
const LAST_ERROR_KEY = `${STORAGE_PREFIX}last_error`;
const APP_VERSION_KEY = `${STORAGE_PREFIX}app_version`;
const CHANNEL_ID = 'team_calls';

let bridge: CapacitorPushBridge | null = null;
let listenersReady = false;
let registerInFlight: Promise<void> | null = null;
let fallbackDeviceId: string | null = null;

const readStorage = (key: string): string => {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key)?.trim() || '';
  } catch {
    return '';
  }
};

const writeStorage = (key: string, value: string | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (value === null || value.trim() === '') {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value.trim());
    }
  } catch {
    // Storage can be unavailable in restricted WebViews. The bridge still returns a session snapshot.
  }
};

const runtimePlatform = (): NativeShellPlatform | null => {
  const runtime = getNativeShellRuntime();
  return runtime.isCapacitorWrapper ? runtime.platform : null;
};

const randomDeviceId = (platform: NativeShellPlatform): string => {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `capacitor_${platform}_${random.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;
};

const readOrCreateDeviceId = (platform: NativeShellPlatform): string => {
  const stored = readStorage(DEVICE_ID_KEY);
  if (stored) return stored;
  if (fallbackDeviceId) return fallbackDeviceId;
  const next = randomDeviceId(platform);
  fallbackDeviceId = next;
  writeStorage(DEVICE_ID_KEY, next);
  return next;
};

const capacitorPushAvailable = (): boolean => {
  if (typeof window === 'undefined') return false;
  const capacitor = (window as Window & { Capacitor?: { isPluginAvailable?: (name: string) => boolean } }).Capacitor;
  if (!capacitor?.isPluginAvailable) return true;
  try {
    return capacitor.isPluginAvailable('PushNotifications');
  } catch {
    return false;
  }
};

const mapPermission = (value: unknown): NativePushPermissionState => {
  const safe = String(value || '').trim().toLowerCase();
  if (safe === 'granted') return 'granted';
  if (safe === 'denied') return 'denied';
  if (safe === 'prompt' || safe === 'prompt-with-rationale') return 'prompt';
  return 'unknown';
};

const permissionDetailFor = (permission: NativePushPermissionState, raw?: unknown): NativePushPermissionDetail => {
  const safe = String(raw || '').trim().toLowerCase();
  if (safe === 'granted') return 'authorized';
  if (safe === 'denied') return 'denied';
  if (safe === 'prompt' || safe === 'prompt-with-rationale') return 'not_determined';
  if (permission === 'granted') return 'authorized';
  if (permission === 'denied') return 'denied';
  if (permission === 'prompt') return 'not_determined';
  return 'unknown';
};

const currentSnapshot = (): NativePushSnapshotPayload | null => {
  const platform = runtimePlatform();
  if (!platform) return null;
  const permission = mapPermission(readStorage(PERMISSION_KEY) || 'unknown');
  const permissionDetail = permissionDetailFor(permission, readStorage(PERMISSION_DETAIL_KEY));
  const token = readStorage(DEVICE_TOKEN_KEY) || null;
  const configReady = capacitorPushAvailable();
  const lastError = readStorage(LAST_ERROR_KEY) || (!configReady ? 'Plugin PushNotifications non disponibile nel wrapper Capacitor.' : null);
  return {
    platform,
    provider: platform === 'ios' ? 'apns' : 'fcm',
    deviceId: readOrCreateDeviceId(platform),
    deviceToken: token,
    permission: configReady ? permission : 'unsupported',
    permissionDetail,
    pushEnabled: configReady && permission === 'granted' && !!token,
    configReady,
    appVersion: readStorage(APP_VERSION_KEY) || null,
    lastError,
  };
};

const publishSnapshot = () => {
  if (typeof window === 'undefined') return null;
  const snapshot = currentSnapshot();
  if (!snapshot) return null;
  (window as Window & { __flbpNativePushRegistration?: unknown }).__flbpNativePushRegistration = snapshot;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: snapshot }));
  return snapshot;
};

const setPermission = (rawPermission: unknown) => {
  const permission = mapPermission(rawPermission);
  writeStorage(PERMISSION_KEY, permission);
  writeStorage(PERMISSION_DETAIL_KEY, permissionDetailFor(permission, rawPermission));
};

const loadPushPlugin = async (): Promise<PushNotificationsPlugin | null> => {
  if (!runtimePlatform()) return null;
  try {
    const module = await import('@capacitor/push-notifications');
    return module.PushNotifications;
  } catch (error) {
    writeStorage(LAST_ERROR_KEY, error instanceof Error ? error.message : 'Plugin PushNotifications non caricabile.');
    publishSnapshot();
    return null;
  }
};

const refreshAppVersion = async () => {
  try {
    const module = await import('@capacitor/app');
    const info = await module.App.getInfo();
    writeStorage(APP_VERSION_KEY, info.version || null);
  } catch {
    // App version is diagnostic only.
  }
};

const syncPermission = async (push: PushNotificationsPlugin): Promise<NativePushPermissionState> => {
  const status = await push.checkPermissions();
  setPermission(status.receive);
  return mapPermission(status.receive);
};

const createAndroidChannel = async (push: PushNotificationsPlugin) => {
  const platform = runtimePlatform();
  if (platform !== 'android') return;
  try {
    await push.createChannel({
      id: CHANNEL_ID,
      name: 'Chiamate squadra',
      description: 'Notifiche per convocare i giocatori durante il torneo.',
      importance: 4,
      visibility: 1,
      vibration: true,
    });
  } catch {
    // Channel creation is best-effort; token registration must not fail for this.
  }
};

const extractCallPayload = (data: unknown): { action: string; callId: string } => {
  const raw = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const flbpRaw = raw.flbp;
  const flbp = typeof flbpRaw === 'string'
    ? (() => {
        try { return JSON.parse(flbpRaw) as Record<string, unknown>; } catch { return {}; }
      })()
    : flbpRaw && typeof flbpRaw === 'object'
      ? flbpRaw as Record<string, unknown>
      : {};
  return {
    action: String(flbp.action || raw.action || '').trim().toLowerCase(),
    callId: String(flbp.callId || raw.callId || '').trim(),
  };
};

const clearDeliveredCallNotifications = async (push: PushNotificationsPlugin, callId: string) => {
  if (!callId) return;
  try {
    const delivered = await push.getDeliveredNotifications();
    const notifications = delivered.notifications.filter((notification) => {
      const payload = extractCallPayload(notification.data);
      return payload.callId === callId;
    });
    if (notifications.length) {
      await push.removeDeliveredNotifications({ notifications });
    }
  } catch {
    // Clearing delivered notifications is best-effort.
  }
};

const registerWithNativePush = async (push: PushNotificationsPlugin) => {
  if (registerInFlight) return registerInFlight;
  registerInFlight = push.register()
    .catch((error) => {
      writeStorage(LAST_ERROR_KEY, error instanceof Error ? error.message : 'Registrazione push non riuscita.');
      publishSnapshot();
    })
    .finally(() => {
      registerInFlight = null;
    });
  return registerInFlight;
};

const ensureListeners = async (push: PushNotificationsPlugin) => {
  if (listenersReady) return;
  listenersReady = true;

  await push.addListener('registration', (token) => {
    writeStorage(DEVICE_TOKEN_KEY, token.value || null);
    writeStorage(LAST_ERROR_KEY, null);
    setPermission('granted');
    publishSnapshot();
  });

  await push.addListener('registrationError', (error) => {
    writeStorage(LAST_ERROR_KEY, error.error || 'Registrazione push non riuscita.');
    publishSnapshot();
  });

  await push.addListener('pushNotificationReceived', async (notification) => {
    const payload = extractCallPayload(notification.data);
    if ((payload.action === 'cancelled' || payload.action === 'acknowledged') && payload.callId) {
      await clearDeliveredCallNotifications(push, payload.callId);
    }
  });

  await push.addListener('pushNotificationActionPerformed', () => {
    void refreshRegistration();
  });
};

const refreshRegistration = async () => {
  const push = await loadPushPlugin();
  if (!push) return JSON.stringify(currentSnapshot());
  await refreshAppVersion();
  await ensureListeners(push);
  await createAndroidChannel(push);
  const permission = await syncPermission(push);
  publishSnapshot();
  if (permission === 'granted') {
    await registerWithNativePush(push);
  }
  publishSnapshot();
  return JSON.stringify(currentSnapshot());
};

const requestPermission = async () => {
  const push = await loadPushPlugin();
  if (!push) return JSON.stringify(currentSnapshot());
  await refreshAppVersion();
  await ensureListeners(push);
  await createAndroidChannel(push);
  const status = await push.requestPermissions();
  setPermission(status.receive);
  publishSnapshot();
  if (mapPermission(status.receive) === 'granted') {
    await registerWithNativePush(push);
  }
  publishSnapshot();
  return JSON.stringify(currentSnapshot());
};

const openSettings = async () => {
  if (typeof window !== 'undefined') {
    const plugins = (window as Window & { Capacitor?: { Plugins?: Record<string, any> } }).Capacitor?.Plugins;
    const settingsPlugin = plugins?.FLBPAppSettings;
    try {
      if (settingsPlugin?.openNotificationSettings) {
        await settingsPlugin.openNotificationSettings();
      } else if (settingsPlugin?.openSettings) {
        await settingsPlugin.openSettings();
      } else {
        writeStorage(LAST_ERROR_KEY, 'Apri le impostazioni dell’app dal sistema e abilita le notifiche per FLBP.');
      }
    } catch (error) {
      writeStorage(LAST_ERROR_KEY, error instanceof Error ? error.message : 'Impostazioni notifiche non apribili dal wrapper.');
    }
  }
  return refreshRegistration();
};

export const readCapacitorNativePushBridge = (): CapacitorPushBridge | null => {
  if (!runtimePlatform()) return null;
  if (bridge) return bridge;
  bridge = {
    getRegistrationJson: () => JSON.stringify(currentSnapshot()),
    requestPermission,
    refreshRegistration,
    openSettings,
  };
  void refreshRegistration();
  return bridge;
};

