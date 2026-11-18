// etichette-filtri.js — i filtri attivi della ricerca come etichette ("Tech house", "BPM 120–128"),
// ciascuna con il modo di toglierla. Logica pura: la scheda Cerca ne fa dei tasti con la ✕. Anche il
// numero dei filtri attivi (il numerino sul tasto Filtri) è il numero di queste etichette.
// Testata in test/etichette-filtri.test.mjs.

import { vociSelezionate } from "./generi.js";

const NOMI_PIATTAFORME = { sp: "Spotify", yt: "YouTube", sc: "SoundCloud", lo: "File" };

// Un intervallo [min, max] con un estremo che può mancare: "BPM 120–128", "BPM da 120", "BPM fino a 128".
function intervallo(nome, [min, max]) {
  if (min !== undefined && max !== undefined) return `${nome} ${min}–${max}`;
  if (min !== undefined) return `${nome} da ${min}`;
  if (max !== undefined) return `${nome} fino a ${max}`;
  return null;
}

/**
 * Le etichette dei filtri attivi, nell'ordine in cui si leggono. Un filtro al suo valore di
 * partenza (tutti i generi, solo scelti, solo canzoni…) non ha etichetta.
 * @param {Record<string, any>} filtri
 * @param {{ voci?: { nome: string, indici: number[] }[], raccolte?: any[][] }} [catalogo]
 * @returns {{ chiave: string, testo: string }[]}
 */
export function etichetteFiltri(filtri, { voci = [], raccolte = [] } = {}) {
  const f = filtri || {};
  const e = [];
  if (f.macro?.length) {
    const nomi = vociSelezionate(voci, f.macro).map((v) => v.nome);
    e.push({ chiave: "macro", testo: nomi.length ? nomi.join(", ") : `${f.macro.length} generi` });
  }
  if (f.piattaforme?.length) {
    e.push({ chiave: "piattaforme", testo: f.piattaforme.map((c) => NOMI_PIATTAFORME[c] || c).join(", ") });
  }
  if (f.raccolta !== undefined && f.raccolta !== null) {
    e.push({ chiave: "raccolta", testo: raccolte[f.raccolta]?.[0] ?? `Raccolta ${f.raccolta}` });
  }
  const anno = f.anno && intervallo("Anno", f.anno);
  if (anno) e.push({ chiave: "anno", testo: anno });
  const bpm = f.bpm && intervallo("BPM", f.bpm);
  if (bpm) e.push({ chiave: "bpm", testo: bpm });
  const camelot = [f.camelot ?? []].flat();
  if (camelot.length) e.push({ chiave: "camelot", testo: `Tonalità ${camelot.join(", ")}` });
  if (f.soloScelti === false) e.push({ chiave: "soloScelti", testo: "Anche i non scelti" });
  if (f.tipo === "set") e.push({ chiave: "tipo", testo: "Solo set e mix" });
  else if (f.tipo === "tutti") e.push({ chiave: "tipo", testo: "Canzoni e set" });
  return e;
}

/** I filtri senza quello di `chiave` (che torna al valore di partenza); gli altri restano come sono. */
export function senzaFiltro(filtri, chiave) {
  const f = { ...filtri };
  switch (chiave) {
    case "macro":
    case "piattaforme":
    case "camelot":
      f[chiave] = [];
      break;
    case "soloScelti":
      f.soloScelti = true;
      break;
    case "tipo":
      f.tipo = "canzoni";
      break;
    default:
      f[chiave] = undefined; // raccolta, anno, bpm
  }
  return f;
}
