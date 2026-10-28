import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, LANGUAGES, translate, formatNumber } from '../src/i18n.js';

test('English and Turkish tables have the same keys and no empty strings', () => {
  assert.deepEqual(LANGUAGES, ['en', 'tr']);
  const en = Object.keys(STRINGS.en).sort();
  assert.deepEqual(Object.keys(STRINGS.tr).sort(), en);
  for (const lang of LANGUAGES) for (const key of en) assert.ok(STRINGS[lang][key].length > 0, `${lang}.${key}`);
});

test('translate fills placeholders and falls back to the key', () => {
  assert.equal(translate('en', 'moveCount', { n: 7 }), 'Move 7');
  assert.equal(translate('tr', 'toPlay', { color: 'Siyah' }), 'Sıra: Siyah');
  assert.equal(translate('xx', 'pass'), 'Pass');
  assert.equal(translate('en', 'no-such-key'), 'no-such-key');
});

test('every move rejection reason has a message in both languages', () => {
  for (const reason of ['occupied', 'ko', 'superko', 'suicide', 'over']) {
    for (const lang of LANGUAGES) assert.ok(STRINGS[lang][`reason.${reason}`], `${lang} reason.${reason}`);
  }
});

test('numbers use a decimal point in English and a decimal comma in Turkish', () => {
  assert.equal(formatNumber('en', 6.5), '6.5');
  assert.equal(formatNumber('tr', 6.5), '6,5');
  assert.equal(formatNumber('tr', 40), '40');
  assert.equal(translate('tr', 'winsBy', { color: 'Beyaz', margin: 3.5 }), 'Beyaz 3,5 puan farkla kazandı');
  assert.equal(translate('en', 'winsBy', { color: 'White', margin: 3.5 }), 'White wins by 3.5');
});
