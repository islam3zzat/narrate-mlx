// Number formatting for the `stat` visual. Pure (no React, no Intl: ICU data differs between Node and Chrome builds).

/** Units written straight after the number ("99.9%", "3x"); every other unit gets a space ("180 ms"). */
export const NO_SPACE_UNITS = new Set(['%', '‰', '°', 'x', '×']);

/** Fractional digits of the shortest round-trip form of the most precise number; 99 for exponent forms (forces the "more than 4" error). */
export const inferDecimals = (...xs: (number | undefined)[]): number => {
  let d = 0;
  for (const x of xs) {
    if (x === undefined) continue;
    const s = String(x);
    if (/e/i.test(s)) return 99;
    const i = s.indexOf('.');
    if (i >= 0) d = Math.max(d, s.length - i - 1);
  }
  return d;
};

/** Fixed `d` decimals, "," grouping of the integer part from 1,000 up, ASCII "-" for negatives (never "-0"), half away from zero. */
export const formatNumber = (x: number, d: number): string => {
  const n = Math.round(Math.abs(x) * 10 ** d);
  const s = String(n).padStart(d + 1, '0');
  const int = s.slice(0, s.length - d).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = d > 0 ? '.' + s.slice(s.length - d) : '';
  return (x < 0 && n > 0 ? '-' : '') + int + frac;
};

/** The number and its unit as shown. */
export const formatStat = (x: number, d: number, unit?: string): string =>
  formatNumber(x, d) + (unit ? (NO_SPACE_UNITS.has(unit) ? '' : ' ') + unit : '');
