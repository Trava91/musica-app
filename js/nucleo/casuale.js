// casuale.js — il generatore casuale ripetibile del Jukebox (mulberry32): stesso seme →
// stessa sequenza, sempre. Serve a poter "ripetere" una coda o una playlist casuale, non a
// garantire imprevedibilità. Logica pura, testata in test/casuale.test.mjs.
//
// Il seme lo decide chi chiama: coda.js senza seme usa l'ora (ogni coda è diversa),
// regole.js senza seme usa 0 (una playlist salvata resta sempre uguale).

/**
 * @param {number} seme
 * @returns {() => number} una funzione che a ogni chiamata dà un numero in [0, 1)
 */
export function mulberry32(seme) {
  let a = seme >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Una copia mescolata dell'elenco (Fisher-Yates); l'originale non si tocca.
 * @template T
 * @param {T[]} elenco
 * @param {number} seme
 * @returns {T[]}
 */
export function mescola(elenco, seme) {
  const rand = mulberry32(seme);
  const a = elenco.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
