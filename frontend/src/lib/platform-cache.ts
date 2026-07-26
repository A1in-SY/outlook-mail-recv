import { api, SESSION_ENDED_EVENT, type Platform } from "@/lib/api";

/**
 * The platform list is seeded from a fixed list in the backend and effectively never
 * changes at runtime, but both the usage dialog and the filter dialog need it and each
 * was refetching on every open.
 *
 * Caching the resolved array is not enough on its own: the two dialogs can be opened
 * before either request settles, so the in-flight promise is shared too. A rejected
 * request is never retained, otherwise one offline moment would leave every later open
 * showing an empty list.
 */
let cached: Platform[] | null = null;
let inFlight: Promise<Platform[]> | null = null;

export function loadPlatforms(): Promise<Platform[]> {
  if (cached) return Promise.resolve(cached);
  if (inFlight) return inFlight;

  inFlight = api.platforms
    .list()
    .then((platforms) => {
      cached = platforms;
      return platforms;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Call after anything that could change the server-side list, and on logout. */
export function invalidatePlatforms() {
  cached = null;
  inFlight = null;
}

// Dropping the cache when the session ends keeps one user's list from surviving into
// the next login. Subscribing here rather than calling from each logout path means a
// future sign-out route cannot forget to do it.
window.addEventListener(SESSION_ENDED_EVENT, invalidatePlatforms);
