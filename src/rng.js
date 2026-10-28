/**
 * Small seeded pseudo random number generator (mulberry32).
 * Every random decision in the game logic goes through one of these so tests are deterministic.
 */

/**
 * Creates a seeded random number generator.
 * @param {number} [seed=1] any integer seed
 * @returns {{next: () => number, int: (n: number) => number}} `next` returns a float in [0, 1), `int(n)` an integer in [0, n)
 */
export function createRng(seed = 1) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n) => Math.floor(next() * n) };
}
