/**
 * The "New game" dialog: board size, mode, level, colour, handicap and komi.
 */
import { KOMI_OPTIONS, defaultKomi, maxHandicap } from './game.js';
import { levelsForSize } from './ai.js';

/**
 * Wires the setup dialog.
 * @param {{dialog: HTMLDialogElement, form: HTMLFormElement, t: (key: string) => string,
 *   onStart: (settings: object) => void}} deps
 * @returns {{open: (settings: object) => void, refreshText: (num: (value: number) => string) => void}}
 */
export function createSetupDialog({ dialog, form, t, onStart }) {
  const handicapSelect = form.elements.namedItem('handicap');
  const komiSelect = form.elements.namedItem('komi');
  const levelSelect = form.elements.namedItem('level');
  const colorSelect = form.elements.namedItem('color');

  for (const k of KOMI_OPTIONS) komiSelect.add(new Option(String(k), String(k)));

  const size = () => Number(form.elements.namedItem('size').value);
  const mode = () => form.elements.namedItem('mode').value;

  function fillHandicaps(selected) {
    handicapSelect.replaceChildren(new Option(t('handicapNone'), '0'));
    for (let h = 2; h <= maxHandicap(size()); h++) handicapSelect.add(new Option(String(h), String(h)));
    handicapSelect.value = String(Math.min(selected, maxHandicap(size())));
  }

  function syncFields() {
    const levels = levelsForSize(size());
    for (const option of levelSelect.options) option.disabled = !levels.includes(option.value);
    if (!levels.includes(levelSelect.value)) levelSelect.value = levels[0];
    const vsComputer = mode() === 'computer';
    levelSelect.disabled = !vsComputer;
    colorSelect.disabled = !vsComputer;
  }

  form.addEventListener('change', (event) => {
    const name = event.target.name;
    if (name === 'size') fillHandicaps(Number(handicapSelect.value));
    if (name === 'size' || name === 'handicap') komiSelect.value = String(defaultKomi(Number(handicapSelect.value)));
    syncFields();
  });

  form.addEventListener('submit', () => {
    onStart({
      size: size(),
      mode: mode(),
      level: levelSelect.value,
      color: Number(colorSelect.value),
      handicap: Number(handicapSelect.value),
      komi: Number(komiSelect.value),
    });
  });

  return {
    /** Opens the dialog pre-filled with the given settings. */
    open(settings) {
      form.elements.namedItem('size').value = String(settings.size);
      form.elements.namedItem('mode').value = settings.mode;
      levelSelect.value = settings.level;
      colorSelect.value = String(settings.color);
      fillHandicaps(settings.handicap);
      komiSelect.value = String(settings.komi);
      syncFields();
      dialog.showModal();
    },
    /** Re-translates the generated "None" handicap option. */
    refreshText(num) {
      if (handicapSelect.options[0]) handicapSelect.options[0].textContent = t('handicapNone');
      for (const option of komiSelect.options) option.textContent = num(Number(option.value));
    },
  };
}
