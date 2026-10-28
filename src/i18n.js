/**
 * User interface strings in English and Turkish. Pure data plus a lookup function (no DOM).
 */

/** Supported languages. */
export const LANGUAGES = ['en', 'tr'];

/** String tables keyed by language. `{name}` placeholders are filled by translate(). */
export const STRINGS = {
  en: {
    title: 'Go',
    tagline: 'The ancient board game of territory',
    restart: 'Restart',
    newGame: 'New game',
    langToggle: 'TR',
    langToggleLabel: 'TR: switch to Turkish',
    pass: 'Pass',
    undo: 'Undo',
    resign: 'Resign',
    resignConfirm: 'Resign?',
    black: 'Black',
    white: 'White',
    you: 'you',
    computer: 'computer',
    captures: 'Captures',
    komi: 'Komi',
    moveCount: 'Move {n}',
    toPlay: '{color} to play',
    thinking: 'Computer is thinking…',
    passed: '{color} passed',
    capturedN: '{color} captured {n}',
    scoringHelp: 'Both players passed. Tap groups to mark them dead or alive, then confirm.',
    scoringLead: 'Black {black} – White {white}',
    finishScoring: 'Confirm score',
    resumePlay: 'Resume play',
    gameOver: 'Game over',
    winsBy: '{color} wins by {margin}',
    winsResign: '{color} wins by resignation',
    draw: 'Draw',
    stones: 'Stones',
    territory: 'Territory',
    total: 'Total',
    close: 'Close',
    options: 'Options',
    moveNumbers: 'Show move numbers',
    tapTwice: 'Tap twice to place (touch)',
    sgfDownload: 'Download SGF',
    sgfUpload: 'Load SGF',
    sgfError: 'Could not read that SGF file.',
    setupTitle: 'New game',
    boardSize: 'Board size',
    mode: 'Mode',
    modeComputer: 'vs computer',
    modeTwo: 'Two players',
    level: 'Level',
    levelEasy: 'Easy',
    levelMedium: 'Medium',
    levelHard: 'Hard',
    yourColor: 'Your colour',
    handicap: 'Handicap',
    handicapNone: 'None',
    start: 'Start',
    cancel: 'Cancel',
    'reason.occupied': 'That point is taken.',
    'reason.ko': 'Ko: you cannot retake immediately.',
    'reason.superko': 'Superko: that would repeat an earlier position.',
    'reason.suicide': 'Suicide is not allowed.',
    'reason.over': 'The game is not in play.',
    tapAgain: 'Tap again to place the stone.',
    boardLabel: 'Go board, {size} by {size}',
    footerSource: 'Source on GitHub',
    keysHint: 'Keys: arrows move, Enter places, P passes, U undoes',
  },
  tr: {
    title: 'Go',
    tagline: 'Toprak kapmanın kadim tahta oyunu',
    restart: 'Yeniden başla',
    newGame: 'Yeni oyun',
    langToggle: 'EN',
    langToggleLabel: 'EN: İngilizceye geç',
    pass: 'Pas',
    undo: 'Geri al',
    resign: 'Çekil',
    resignConfirm: 'Emin misin?',
    black: 'Siyah',
    white: 'Beyaz',
    you: 'sen',
    computer: 'bilgisayar',
    captures: 'Esir',
    komi: 'Komi',
    moveCount: 'Hamle {n}',
    toPlay: 'Sıra: {color}',
    thinking: 'Bilgisayar düşünüyor…',
    passed: '{color} pas geçti',
    capturedN: '{color} {n} taş aldı',
    scoringHelp: 'İki taraf da pas geçti. Ölü ya da canlı işaretlemek için gruplara dokun, sonra onayla.',
    scoringLead: 'Siyah {black} – Beyaz {white}',
    finishScoring: 'Skoru onayla',
    resumePlay: 'Oyuna dön',
    gameOver: 'Oyun bitti',
    winsBy: '{color} {margin} puan farkla kazandı',
    winsResign: '{color} rakip çekildiği için kazandı',
    draw: 'Berabere',
    stones: 'Taş',
    territory: 'Toprak',
    total: 'Toplam',
    close: 'Kapat',
    options: 'Seçenekler',
    moveNumbers: 'Hamle numaralarını göster',
    tapTwice: 'Koymak için iki kez dokun (dokunmatik)',
    sgfDownload: 'SGF indir',
    sgfUpload: 'SGF yükle',
    sgfError: 'Bu SGF dosyası okunamadı.',
    setupTitle: 'Yeni oyun',
    boardSize: 'Tahta boyutu',
    mode: 'Mod',
    modeComputer: 'Bilgisayara karşı',
    modeTwo: 'İki oyuncu',
    level: 'Seviye',
    levelEasy: 'Kolay',
    levelMedium: 'Orta',
    levelHard: 'Zor',
    yourColor: 'Rengin',
    handicap: 'Handikap',
    handicapNone: 'Yok',
    start: 'Başla',
    cancel: 'Vazgeç',
    'reason.occupied': 'O nokta dolu.',
    'reason.ko': 'Ko: hemen geri alamazsın.',
    'reason.superko': 'Süperko: bu daha önceki bir konumu tekrarlar.',
    'reason.suicide': 'İntihar hamlesi yasak.',
    'reason.over': 'Oyun şu an oynanmıyor.',
    tapAgain: 'Taşı koymak için tekrar dokun.',
    boardLabel: 'Go tahtası, {size} x {size}',
    footerSource: 'GitHub’da kaynak kod',
    keysHint: 'Tuşlar: oklar gezdirir, Enter koyar, P pas, U geri al',
  },
};

function formatVar(lang, value) {
  return typeof value === 'number' ? formatNumber(lang, value) : String(value);
}

/**
 * Formats a number for display: Turkish uses a decimal comma (6,5), English a decimal point (6.5).
 * @param {string} lang 'en' or 'tr'
 * @param {number} value
 * @returns {string}
 */
export function formatNumber(lang, value) {
  const text = String(value);
  return lang === 'tr' ? text.replace('.', ',') : text;
}

/**
 * Looks up a string and fills its `{name}` placeholders (numbers via formatNumber).
 * Falls back to English, then to the key.
 * @param {string} lang 'en' or 'tr'
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 * @returns {string}
 */
export function translate(lang, key, vars = {}) {
  const table = STRINGS[lang] ?? STRINGS.en;
  const text = table[key] ?? STRINGS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? formatVar(table === STRINGS.tr ? 'tr' : 'en', vars[name]) : m));
}
