/**
 * Tiny localStorage wrapper. Every access is guarded so private mode or blocked storage never crashes the app.
 */

const PREFIX = 'go-game:';

/**
 * Reads a JSON value.
 * @template T
 * @param {string} key key without prefix
 * @param {T} fallback value returned when nothing usable is stored
 * @returns {T}
 */
export function loadValue(key, fallback) {
  try {
    const raw = globalThis.localStorage ? globalThis.localStorage.getItem(PREFIX + key) : null;
    return raw === null || raw === undefined ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Stores a JSON value.
 * @param {string} key key without prefix
 * @param {unknown} value any JSON serialisable value
 * @returns {boolean} true when the value was written
 */
export function saveValue(key, value) {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
