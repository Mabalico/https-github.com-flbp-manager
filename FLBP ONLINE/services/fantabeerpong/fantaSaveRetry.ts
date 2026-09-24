export const FANTA_SAVE_MAX_ATTEMPTS = 3;

const FANTA_SAVE_TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);
const FANTA_SAVE_RETRY_BASE_MS = 180;
const FANTA_SAVE_RETRY_JITTER_MS = 220;
const FANTA_SAVE_RETRY_MAX_MS = 2_000;

export const isTransientFantaSaveStatus = (status: number): boolean =>
  FANTA_SAVE_TRANSIENT_STATUSES.has(Number(status));

const parseRetryAfterMs = (value: string | null, now: number): number | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

  const retryAt = Date.parse(raw);
  if (!Number.isFinite(retryAt)) return null;
  return Math.max(0, retryAt - now);
};

export const getFantaSaveRetryDelayMs = (
  retryIndex: number,
  retryAfter: string | null = null,
  random: () => number = Math.random,
  now: number = Date.now(),
): number => {
  const serverDelay = parseRetryAfterMs(retryAfter, now);
  if (serverDelay != null) return Math.min(FANTA_SAVE_RETRY_MAX_MS, Math.round(serverDelay));

  const safeRetryIndex = Math.max(0, Math.floor(retryIndex));
  const safeRandom = Math.min(1, Math.max(0, Number(random()) || 0));
  const exponentialDelay = FANTA_SAVE_RETRY_BASE_MS * (2 ** safeRetryIndex);
  return Math.min(
    FANTA_SAVE_RETRY_MAX_MS,
    Math.round(exponentialDelay + (safeRandom * FANTA_SAVE_RETRY_JITTER_MS)),
  );
};

type FantaSaveRetryOptions = {
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
};

const defaultSleep = (delayMs: number) =>
  new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs));

/**
 * Retries only short-lived gateway/throttling failures. The save RPC is a
 * transactional upsert for one user and replaces that user's four roster
 * rows, so replaying the same payload is state-idempotent.
 */
export const runFantaSaveRequestWithRetry = async (
  request: () => Promise<Response>,
  options: FantaSaveRetryOptions = {},
): Promise<Response> => {
  const sleep = options.sleep || defaultSleep;
  const random = options.random || Math.random;
  const now = options.now || Date.now;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < FANTA_SAVE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await request();
      const hasRetry = attempt + 1 < FANTA_SAVE_MAX_ATTEMPTS;
      if (!hasRetry || response.ok || !isTransientFantaSaveStatus(response.status)) return response;

      await sleep(getFantaSaveRetryDelayMs(
        attempt,
        response.headers.get('retry-after'),
        random,
        now(),
      ));
    } catch (error) {
      lastError = error;
      if (attempt + 1 >= FANTA_SAVE_MAX_ATTEMPTS) throw error;
      await sleep(getFantaSaveRetryDelayMs(attempt, null, random, now()));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Fanta save failed');
};
