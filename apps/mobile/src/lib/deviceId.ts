import { Platform } from 'react-native';
import { storage } from './storage';

const DEVICE_ID_KEY = 'device.id';

/**
 * A random identifier, generated once and kept in MMKV for the life of the
 * install.
 *
 * `Math.random` rather than a crypto UUID because React Native ships no
 * `crypto.randomUUID` on either platform and this value is not a secret: it
 * names which session row the backend should re-use, and every request that
 * carries it is already authenticated by an access token. Two installs colliding
 * would matter only if they belonged to the same account, which 122 bits makes
 * uninteresting.
 */
const generateDeviceId = () => {
  const random = () => Math.random().toString(16).slice(2, 10).padStart(8, '0');
  return `${random()}-${random()}-${random()}-${random()}`;
};

/**
 * The identifier this install sends with `/auth/login` and `/auth/register`.
 *
 * Without it the API cannot tell one sign-in from another and appends a fresh
 * session row every time, so a user who signs in and out a few times on this
 * phone would push their other devices past the five-device cap and silently
 * log them out. With it, the phone keeps one row across every sign-in.
 */
export const getDeviceId = (): string => {
  const stored = storage.getString(DEVICE_ID_KEY);
  if (stored) return stored;

  const created = generateDeviceId();
  storage.set(DEVICE_ID_KEY, created);
  return created;
};

/** What the user sees in "your devices", and the platform the session runs on. */
export const getDeviceInfo = () => ({
  deviceId: getDeviceId(),
  deviceName: `FitForge on ${Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web'}`,
  platform: Platform.OS,
});
