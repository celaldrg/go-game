import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { loadValue, saveValue } from '../src/storage.js';

test('the seeded RNG is deterministic and in range', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 100; i++) {
    const x = a.next();
    assert.equal(x, b.next());
    assert.ok(x >= 0 && x < 1);
  }
  const ints = new Set(Array.from({ length: 200 }, () => a.int(5)));
  assert.deepEqual([...ints].sort(), [0, 1, 2, 3, 4]);
  assert.notEqual(createRng(1).next(), createRng(2).next());
});

test('storage falls back safely without localStorage and when it throws', () => {
  assert.equal(globalThis.localStorage, undefined);
  assert.equal(loadValue('lang', 'en'), 'en');
  assert.equal(saveValue('lang', 'tr'), false);

  const data = new Map();
  globalThis.localStorage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, v) };
  try {
    assert.equal(saveValue('lang', 'tr'), true);
    assert.equal(loadValue('lang', 'en'), 'tr');
    data.set('go-game:broken', '{oops');
    assert.equal(loadValue('broken', 1), 1);
    globalThis.localStorage = {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
    };
    assert.equal(loadValue('lang', 'en'), 'en');
    assert.equal(saveValue('lang', 'tr'), false);
  } finally {
    delete globalThis.localStorage;
  }
});
