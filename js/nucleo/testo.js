// testo.js — come il Jukebox scrive i testi dei brani: normalizzazione per la ricerca,
// titolo con versione, artista con feat., durata. Logica pura, testata in test/testo.test.mjs.

/**
 * Minuscole, senza accenti né punteggiatura, "&" come "and": il testo su cui si cerca.
 * @param {string | undefined} s
 */
export function normalizza(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Il titolo come si legge: "Titolo (versione)", con un segnaposto se manca.
 * @param {{ t?: string, v?: string }} b
 */
export function titoloCompleto(b) {
  let t = b.t || "(senza titolo)";
  if (b.v) t += ` (${b.v})`;
  return t;
}

/**
 * L'artista come si legge: "Artista feat. Ospite", con un segnaposto se manca.
 * @param {{ a?: string, f?: string }} b
 */
export function sottotitolo(b) {
  let s = b.a || "(artista sconosciuto)";
  if (b.f) s += ` feat. ${b.f}`;
  return s;
}

/**
 * Secondi come "m:ss" (stringa vuota se il dato manca).
 * @param {number | undefined} sec
 */
export function durataFmt(sec) {
  if (sec === undefined) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Una data "2026-10-24" (o con l'ora dopo) come "24/10/2026". Se non è in quella forma resta com'è.
 * @param {string | undefined} testo
 */
export function dataBreve(testo) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(testo ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (testo ?? "");
}
