// generi.js — come il jukebox MOSTRA i generi. Logica pura, testata in test/logica.test.mjs.
//
// Il catalogo ha 17 macro-generi, con più dettaglio su house e techno (utile
// all'assistente DJ). Nel jukebox sono troppi: qui alcuni si fondono in una sola
// "voce" (la disco ha una voce sua, separata dalla tech house). I dati non
// cambiano: i brani tengono il loro indice g e i generi fini gf, e i filtri
// restano liste di indici macro (una voce = più indici).

export const RAGGRUPPATI = {
  "Tech house": ["Tech house", "Deep e melodic", "Chicago e acid", "Techno", "Minimal"],
  "Disco": ["Disco e funky house", "Disco, funk e soul"],
};

/**
 * Le voci da mostrare: [{nome, indici}] nell'ordine dei macro-generi; un gruppo
 * prende il posto del primo dei suoi membri. Un nome di gruppo assente dal
 * catalogo viene ignorato senza errori.
 */
export function vociGeneri(macro) {
  const gruppoDi = {};
  for (const [gruppo, membri] of Object.entries(RAGGRUPPATI)) for (const m of membri) gruppoDi[m] = gruppo;
  const voci = [];
  const perGruppo = {};
  macro.forEach((nome, i) => {
    const gruppo = gruppoDi[nome];
    if (!gruppo) { voci.push({ nome, indici: [i] }); return; }
    if (!perGruppo[gruppo]) { perGruppo[gruppo] = { nome: gruppo, indici: [] }; voci.push(perGruppo[gruppo]); }
    perGruppo[gruppo].indici.push(i);
  });
  return voci;
}

// Posizione della voce che contiene il macro-genere g (-1 se g manca).
export function voceDi(voci, g) {
  if (g === undefined || g === null) return -1;
  return voci.findIndex((v) => v.indici.includes(g));
}

// Le voci interamente comprese in una lista di indici macro (es. un filtro).
export function vociSelezionate(voci, indici) {
  const set = new Set(indici || []);
  return voci.filter((v) => v.indici.every((i) => set.has(i)));
}
