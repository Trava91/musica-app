// artisti.js — gli artisti del catalogo: l'elenco A–Z con i conti, la pagina di un artista (i suoi
// brani raggruppati per tipo) e i suggerimenti che compaiono scrivendo nella ricerca (artisti e
// generi che corrispondono). Logica pura: niente pagina, niente rete. Testata in test/artisti.test.mjs.
//
// Un artista si riconosce dal nome normalizzato (`_normA` dei brani, vedi cerca.preparaIndice):
// è l'id che viaggia fra le viste. Contano solo i brani "scelti" (non quelli da esplorare), di
// ogni tipo: canzoni, remix, live e anche i set.

import { passa } from "./filtri.js";
import { vociGeneri } from "./generi.js";
import { normalizza } from "./testo.js";

/** @typedef {import("./valida.js").Brano} Brano */
/** @typedef {{ id: string, nome: string, n: number, parole: string[] }} Artista */

// L'ordine dei gruppi nella pagina di un artista; un tipo sconosciuto finisce in "altro".
export const TIPI_ORDINE = ["originale", "remix", "edit", "extended", "live", "set"];
export const NOMI_GRUPPO = {
  originale: "Originali",
  remix: "Remix",
  edit: "Edit",
  extended: "Extended",
  live: "Live",
  set: "Set e mix",
  altro: "Altro",
};
// Quanti suggerimenti al massimo, e da quante lettere in su (con una sola sarebbero rumore).
export const MAX_ARTISTI_SUGGERITI = 5;
export const MAX_GENERI_SUGGERITI = 3;
export const LETTERE_MINIME = 2;

const FILTRO_ARTISTA = { soloScelti: true, tipo: "tutti" };

const parole = (testoNorm) => (testoNorm ? testoNorm.split(" ").filter(Boolean) : []);

/**
 * Tutti gli artisti con almeno un brano scelto, in ordine alfabetico, ciascuno col numero dei suoi
 * brani. I brani senza artista non compaiono. Da fare una volta per catalogo (stato.derivato).
 * @param {Brano[]} brani già passati da cerca.preparaIndice
 * @returns {Artista[]}
 */
export function elencoArtisti(brani) {
  /** @type {Map<string, Artista>} */
  const perId = new Map();
  for (const b of brani) {
    const id = b._normA;
    if (!id || !passa(b, FILTRO_ARTISTA)) continue;
    const gia = perId.get(id);
    if (gia) gia.n++;
    else perId.set(id, { id, nome: b.a ?? id, n: 1, parole: parole(id) });
  }
  return [...perId.values()].sort((x, y) => x.id.localeCompare(y.id, "it"));
}

/** La lettera sotto cui sta un artista nell'elenco A–Z: A–Z, oppure "#" (numeri e simboli). */
export function letteraDi(id) {
  const c = (id || "").charAt(0).toUpperCase();
  return c >= "A" && c <= "Z" ? c : "#";
}

/** Le lettere che hanno almeno un artista, nell'ordine dell'elenco ("#" in fondo). */
export function lettereUsate(elenco) {
  const usate = new Set(elenco.map((a) => letteraDi(a.id)));
  return [...usate].sort((a, b) => Number(a === "#") - Number(b === "#") || a.localeCompare(b));
}

/** Gli artisti di una lettera (tutti, se la lettera è vuota). */
export function artistiDellaLettera(elenco, lettera) {
  return lettera ? elenco.filter((a) => letteraDi(a.id) === lettera) : elenco;
}

/**
 * I brani di un artista raggruppati per tipo, nell'ordine di TIPI_ORDINE (poi "altro"), ogni
 * gruppo per titolo. I gruppi vuoti non ci sono.
 * @param {Brano[]} brani @param {string} id l'id dell'artista (nome normalizzato)
 * @returns {{ tipo: string, nome: string, brani: Brano[] }[]}
 */
export function gruppiDiArtista(brani, id) {
  const perTipo = new Map();
  for (const b of brani) {
    if (b._normA !== id || !passa(b, FILTRO_ARTISTA)) continue;
    const tipo = TIPI_ORDINE.includes(b.k) ? b.k : "altro";
    if (!perTipo.has(tipo)) perTipo.set(tipo, []);
    perTipo.get(tipo).push(b);
  }
  return [...TIPI_ORDINE, "altro"]
    .filter((tipo) => perTipo.has(tipo))
    .map((tipo) => ({
      tipo,
      nome: NOMI_GRUPPO[tipo],
      brani: perTipo.get(tipo).sort((a, b) => a._normT.localeCompare(b._normT, "it") || a.id.localeCompare(b.id)),
    }));
}

/** Tutti i brani di un artista in fila, gruppo dopo gruppo: la lista di "Suona tutto". */
export const braniDiArtista = (brani, id) => gruppiDiArtista(brani, id).flatMap((g) => g.brani);

// Ogni parola scritta è l'inizio di una parola del nome.
const corrisponde = (paroleNome, paroleQuery) => paroleQuery.every((q) => paroleNome.some((w) => w.startsWith(q)));

/**
 * I suggerimenti per quello che si sta scrivendo: gli artisti e i generi il cui nome corrisponde
 * (ogni parola scritta è l'inizio di una parola del nome). Sotto LETTERE_MINIME lettere: niente.
 * Gli artisti: prima il nome identico, poi quelli che iniziano così, poi i più forniti.
 * @param {{ brani: Brano[], macro: string[] }} catalogo
 * @param {string} testo
 * @param {{ artisti?: Artista[], voci?: { nome: string, indici: number[] }[] }} [pronti]
 *   l'elenco artisti e le voci di genere se già pronti (si rifanno a ogni lettera, altrimenti)
 * @returns {{ artisti: Artista[], generi: { nome: string, indici: number[] }[] }}
 */
export function suggerimenti(catalogo, testo, { artisti, voci } = {}) {
  const norm = normalizza(testo);
  const q = parole(norm);
  if (!q.length || norm.replace(/ /g, "").length < LETTERE_MINIME) return { artisti: [], generi: [] };
  const elenco = artisti ?? elencoArtisti(catalogo.brani);
  const trovati = [];
  for (const a of elenco) {
    if (!corrisponde(a.parole, q)) continue;
    const grado = a.id === norm ? 0 : a.id.startsWith(norm) ? 1 : 2;
    trovati.push({ a, grado });
  }
  trovati.sort((x, y) => x.grado - y.grado || y.a.n - x.a.n || x.a.id.localeCompare(y.a.id, "it"));
  const generi = (voci ?? vociGeneri(catalogo.macro))
    .filter((v) => corrisponde(parole(normalizza(v.nome)), q))
    .slice(0, MAX_GENERI_SUGGERITI);
  return { artisti: trovati.slice(0, MAX_ARTISTI_SUGGERITI).map((t) => t.a), generi };
}
