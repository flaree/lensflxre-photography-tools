import { API_BASE_URL } from '../constants/config';

const REQUEST_TIMEOUT = 30000;

// ---------------------------------------------------------------------------
// Cache metadata reported by the API
// ---------------------------------------------------------------------------

/**
 * Where a response came from, as reported by the API's `X-Cache` header.
 *
 * - `MISS`    - scraped from Transfermarkt just now
 * - `HIT`     - served from the API's cache, still within its TTL
 * - `STALE`   - the scrape was blocked, so expired data was served instead
 * - `UNKNOWN` - no `X-Cache` header on the response
 */
export type CacheStatus = 'MISS' | 'HIT' | 'STALE' | 'UNKNOWN';

export interface CacheInfo {
  status: CacheStatus;
  /** How old the underlying data is, in seconds. Null when the API reported no age. */
  ageSeconds: number | null;
  /** When this response was observed, as a ms timestamp. */
  observedAt: number;
}

const readCacheInfo = (response: Response): CacheInfo => {
  const marker = response.headers.get('X-Cache');
  const status: CacheStatus =
    marker === 'HIT' || marker === 'MISS' || marker === 'STALE' ? marker : 'UNKNOWN';

  // Age is only sent for HIT and STALE, and Number(null) is 0, so check the raw value first.
  const rawAge = response.headers.get('Age');
  const age = rawAge === null ? NaN : Number(rawAge);

  return {
    status,
    ageSeconds: Number.isFinite(age) ? age : null,
    observedAt: Date.now(),
  };
};

type CacheInfoListener = (_info: CacheInfo | null) => void;

const listeners = new Set<CacheInfoListener>();
let currentInfo: CacheInfo | null = null;
let lastResponseAt = 0;

// The full-league generator fires dozens of requests back to back. A single STALE response in that
// burst is the thing worth telling the user about, so it outranks the HIT/MISS responses either
// side of it instead of being immediately overwritten.
const BURST_WINDOW_MS = 2500;
const SEVERITY: Record<CacheStatus, number> = { UNKNOWN: 0, MISS: 1, HIT: 1, STALE: 2 };

const publishCacheInfo = (info: CacheInfo): void => {
  const withinBurst = currentInfo !== null && info.observedAt - lastResponseAt < BURST_WINDOW_MS;
  lastResponseAt = info.observedAt;

  if (withinBurst && currentInfo !== null && SEVERITY[currentInfo.status] > SEVERITY[info.status]) {
    return;
  }

  currentInfo = info;
  listeners.forEach((listener) => listener(info));
};

/** The cache status of the most recent API response, or null before the first one. */
export const getCacheInfo = (): CacheInfo | null => currentInfo;

/** Subscribe to cache status changes. Returns an unsubscribe function. */
export const subscribeToCacheInfo = (listener: CacheInfoListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when the API answers 503, meaning Transfermarkt blocked the scrape and the API had no
 * cached copy to fall back on. Retrying immediately tends to prolong the block.
 */
export class ApiUnavailableError extends Error {
  readonly retryAfterSeconds: number | null;

  constructor(retryAfterSeconds: number | null) {
    const wait = retryAfterSeconds === null
      ? 'Please try again shortly.'
      : `Please try again in about ${retryAfterSeconds} seconds.`;
    super(`Transfermarkt is blocking requests right now. ${wait}`);
    this.name = 'ApiUnavailableError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Turn an error from this module into a message suitable for showing to the user.
 *
 * @param error - The caught error
 * @param fallback - Message to use for errors with nothing better to say
 */
export const describeApiError = (error: unknown, fallback: string): string => {
  if (error instanceof ApiUnavailableError) {
    return error.message;
  }
  if (error instanceof Error && error.message.includes('timeout')) {
    return error.message;
  }
  return fallback;
};

// ---------------------------------------------------------------------------
// Local in-memory TTL cache (5 minutes)
// ---------------------------------------------------------------------------
const CACHE_TTL = 5 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiry: number;
  cache: CacheInfo;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apiCache = new Map<string, CacheEntry<any>>();

/**
 * Re-date a stored cache status for a local replay.
 *
 * The payload is however old the API said it was, plus however long we have held it. Serving it
 * again is a cache hit by definition, but a payload the API marked STALE stays STALE.
 */
const replayCacheInfo = (info: CacheInfo): CacheInfo => ({
  status: info.status === 'STALE' ? 'STALE' : 'HIT',
  ageSeconds: (info.ageSeconds ?? 0) + Math.round((Date.now() - info.observedAt) / 1000),
  observedAt: Date.now(),
});

function getCached<T>(key: string): T | null {
  const entry = apiCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) { return null; }
  if (Date.now() > entry.expiry) { apiCache.delete(key); return null; }
  publishCacheInfo(replayCacheInfo(entry.cache));
  return entry.data;
}

function setCached<T>(key: string, data: T, cache: CacheInfo): void {
  apiCache.set(key, { data, expiry: Date.now() + CACHE_TTL, cache });
}

const fetchWithTimeout = async (url: string, timeout = REQUEST_TIMEOUT): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout - please try again');
    }
    throw error;
  }
};

/**
 * Fetch JSON from the API, recording where the response came from.
 *
 * @param path - Path below the API base URL
 * @param failureMessage - Message for the error thrown on a non-OK response
 * @returns The parsed body and the response's cache metadata
 */
const requestJson = async <T>(
  path: string,
  failureMessage: string
): Promise<{ data: T; cache: CacheInfo }> => {
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`);

  if (response.status === 503) {
    const rawRetry = response.headers.get('Retry-After');
    const retryAfter = rawRetry === null ? NaN : Number(rawRetry);
    throw new ApiUnavailableError(Number.isFinite(retryAfter) ? retryAfter : null);
  }

  if (!response.ok) {
    throw new Error(failureMessage);
  }

  const cache = readCacheInfo(response);
  publishCacheInfo(cache);

  return { data: await response.json(), cache };
};

// Type definitions for API responses
export interface Club {
  id: string;
  name: string;
  country?: string;
}

export interface Player {
  id?: string;
  name: string;
  shirtNumber?: string | number;
  position: string;
}

export interface StaffMember {
  id?: string | null;
  name: string;
  role?: string | null;
  department?: string | null;
  age?: number | null;
  nationality?: string[];
  appointed?: string | null;
  contractExpires?: string | null;
  lastClubId?: string | null;
  lastClubName?: string | null;
}

export interface ClubProfile {
  id?: string;
  name?: string;
  stadiumName?: string;
  addressLine3?: string;
  manager?: string;
  /** First-team coaching, medical and kit staff, in the order Transfermarkt lists them. */
  staff?: StaffMember[];
}

export interface LeagueClubsResponse {
  clubs: Club[];
}

export interface PlayersResponse {
  players: Player[];
}

export interface SearchResponse {
  results: Club[];
}

export const fetchLeagueClubs = async (competitionCode: string): Promise<LeagueClubsResponse> => {
  const key = `league:${competitionCode}`;
  const cached = getCached<LeagueClubsResponse>(key);
  if (cached) { return cached; }
  const { data, cache } = await requestJson<LeagueClubsResponse>(
    `/competitions/${competitionCode}/clubs`,
    `Failed to fetch clubs for competition ${competitionCode}`
  );
  setCached(key, data, cache);
  return data;
};

/**
 * Fetch club profile by club ID
 * @param clubId - The club ID
 * @returns Club profile data
 */
export const fetchClubProfile = async (clubId: string): Promise<ClubProfile> => {
  const key = `profile:${clubId}`;
  const cached = getCached<ClubProfile>(key);
  if (cached) { return cached; }
  const { data, cache } = await requestJson<ClubProfile>(
    `/clubs/${clubId}/profile`,
    `Failed to fetch profile for club ${clubId}`
  );
  setCached(key, data, cache);
  return data;
};

/**
 * Fetch club players by club ID
 * @param clubId - The club ID
 * @returns Response containing players array
 */
export const fetchClubPlayers = async (clubId: string): Promise<PlayersResponse> => {
  const key = `players:${clubId}`;
  const cached = getCached<PlayersResponse>(key);
  if (cached) { return cached; }
  const { data, cache } = await requestJson<PlayersResponse>(
    `/clubs/${clubId}/players`,
    `Failed to fetch players for club ${clubId}`
  );
  setCached(key, data, cache);
  return data;
};

/**
 * Search for clubs by name
 * @param searchTerm - The search term
 * @returns Response containing search results
 */
export const searchClubs = async (searchTerm: string): Promise<SearchResponse> => {
  const { data } = await requestJson<SearchResponse>(
    `/clubs/search/${encodeURIComponent(searchTerm)}`,
    `Failed to search for clubs with term "${searchTerm}"`
  );
  return data;
};

/**
 * Fetch full squad data for code generation
 * @param clubId - The club ID
 * @returns Object containing both profile and player data
 */
export const fetchFullSquadData = async (clubId: string): Promise<{ profile: ClubProfile | null; players: PlayersResponse }> => {
  const [profile, players] = await Promise.all([
    fetchClubProfile(clubId).catch(() => null),
    fetchClubPlayers(clubId)
  ]);

  return { profile, players };
};
