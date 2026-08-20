import { Platform } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import { StateStorage } from 'zustand/middleware';

/**
 * The subset of MMKV every caller in the app actually uses. Declaring it lets
 * the web build swap in a different implementation without any caller caring
 * which one it got.
 */
export interface KeyValueStore {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

const STORAGE_ID = 'fitforge';

/**
 * MMKV's web shim namespaces every key as `<id>\<key>`. The web implementation
 * below keeps that exact layout on purpose: a browser that already has a
 * session written by the MMKV shim must have that same record *overwritten*,
 * not orphaned. Writing to a fresh key would leave the old
 * `fitforge\auth-storage` — refresh token and all — sitting in `localStorage`
 * forever, which is precisely the thing BUG-07 is about.
 */
const WEB_KEY_PREFIX = `${STORAGE_ID}\\`;

/**
 * Web storage goes to `localStorage` directly rather than through MMKV.
 *
 * MMKV on web is a shim over `localStorage` that exists only so the native API
 * compiles; it adds a layer of indirection, a key-mangling scheme and a
 * constructor that has to probe for DOM access, for a platform that already has
 * a perfectly good synchronous key-value store built in. Talking to
 * `localStorage` means what the app reads is always what is actually in the
 * browser right now — including after someone clears site data in DevTools.
 *
 * Every access is guarded: `localStorage` throws rather than returning null
 * when a browser has storage disabled (Safari private mode, "block third-party
 * cookies" in a framed context), and a persisted preference is never worth
 * taking the app down for.
 */
const createWebStorage = (): KeyValueStore => {
  const key = (name: string) => `${WEB_KEY_PREFIX}${name}`;

  return {
    getString: (name) => {
      try {
        return window.localStorage.getItem(key(name)) ?? undefined;
      } catch {
        return undefined;
      }
    },
    set: (name, value) => {
      try {
        window.localStorage.setItem(key(name), value);
      } catch {
        // Storage disabled or quota exhausted — the session still works in memory.
      }
    },
    delete: (name) => {
      try {
        window.localStorage.removeItem(key(name));
      } catch {
        // As above.
      }
    },
  };
};

/**
 * Single storage instance shared by every persisted store.
 *
 * Native keeps MMKV, which is the reason the dependency is here: it is fast,
 * synchronous and app-private, so a token on disk is only readable by this app.
 */
export const storage: KeyValueStore =
  Platform.OS === 'web' ? createWebStorage() : new MMKV({ id: STORAGE_ID });

export const zustandStorage: StateStorage = {
  setItem: (name, value) => storage.set(name, value),
  getItem: (name) => storage.getString(name) ?? null,
  removeItem: (name) => storage.delete(name),
};
