// cerca.js — logica pura di ricerca e filtri sul catalogo. Nessun accesso al DOM o
// alla rete: prende in ingresso l'array "brani" del contratto dati (vedi
// strumenti/esporta.py) e restituisce array derivati. Testato in test/cerca.test.mjs.
//
// Un brano ha i campi abbreviati del contratto: a(rtista), t(itolo), v(ersione),
// k (tipo), f(eat), g (indice macro-genere), gf (generi fini), y(anno), d(urata),
// b(pm), c(amelot), e(nergia), x (1 = esplorazione), s(orgenti), r(accolte), q(uando
// aggiunto). preparaIndice() aggiunge campi che iniziano con "_", usati solo qui dentro.

import { passa } from "./filtri.js";
import { normalizza } from "./testo.js";

const parole = (testoNorm) => (testoNorm ? testoNorm.split(" ").filter(Boolean) : []);

// Da chiamare una volta sui brani appena caricati (dati/catalogo.js lo fa). Aggiunge l'indice
// di ricerca: _normA/_normT (artista/titolo normalizzati), _paroleA/_paroleT (le loro
// parole) e _txt (tutto il testo utile — compresi generi e nomi delle raccolte —
// normalizzato, per la corrispondenza "trovata da qualche parte").
export function preparaIndice(brani, raccolte) {
  for (const b of brani) {
    b._normA = normalizza(b.a);
    b._normT = normalizza(b.t);
    b._paroleA = parole(b._normA);
    b._paroleT = parole(b._normT);
    const nomiRaccolte = (b.r || []).map((i) => raccolte[i]?.[0]).filter(Boolean);
    b._txt = normalizza([b.a, b.t, b.v, b.f, b.gf, ...nomiRaccolte].filter(Boolean).join(" "));
  }
  return brani;
}

// null se una parola della query non trova corrispondenza da nessuna parte (il
// brano va escluso); altrimenti il punteggio, più alto = più rilevante.
function punteggio(brano, paroleQuery) {
  if (!paroleQuery.length) return 0;
  let tot = 0;
  for (const p of paroleQuery) {
    const inArtista = brano._paroleA.some((w) => w.startsWith(p));
    const inTitolo = brano._paroleT.some((w) => w.startsWith(p));
    if (inArtista || inTitolo) tot += 40;
    else if (brano._txt.includes(p)) tot += 10;
    else return null;
  }
  const interoQuery = paroleQuery.join(" ");
  if (brano._normA === interoQuery) tot += 100;
  else if (brano._normT === interoQuery) tot += 80;
  return tot;
}

// --- ordinamenti ---------------------------------------------------------------
function comparatore(ordine) {
  switch (ordine) {
    case "artista":
      // I brani senza artista (titoli ancora da sistemare nel catalogo) vanno in fondo.
      return (a, b) =>
        Number(!a._normA) - Number(!b._normA) || a._normA.localeCompare(b._normA) || a._normT.localeCompare(b._normT);
    case "recenti":
      return (a, b) => (b.q || "").localeCompare(a.q || "");
    case "bpm":
      return (a, b) => (a.b ?? Infinity) - (b.b ?? Infinity) || a._normA.localeCompare(b._normA);
    default:
      return null; // "rilevanza": l'ordine lo dà il punteggio, gestito a parte
  }
}

/**
 * Cerca e filtra. Restituisce l'array dei brani corrispondenti, ordinato.
 * - brani: array del catalogo, già passato da preparaIndice.
 * - testo: query libera (può essere vuota).
 * - filtri: vedi filtri.js.
 * - ordine: "rilevanza" | "artista" | "recenti" | "bpm". Se omesso: "rilevanza" con
 *   testo non vuoto, altrimenti "artista".
 */
export function cerca(brani, testo, filtri, ordine) {
  const q = parole(normalizza(testo));
  const effettivo = ordine || (q.length ? "rilevanza" : "artista");

  const risultati = [];
  for (const b of brani) {
    if (!passa(b, filtri)) continue;
    if (q.length) {
      const p = punteggio(b, q);
      if (p === null) continue;
      risultati.push(effettivo === "rilevanza" ? { b, p } : b);
    } else {
      risultati.push(b);
    }
  }

  if (effettivo === "rilevanza" && q.length) {
    risultati.sort((x, y) => y.p - x.p || x.b._normA.localeCompare(y.b._normA));
    return risultati.map((r) => r.b);
  }
  const cmp = comparatore(effettivo) || comparatore("artista");
  return risultati.sort(cmp);
}

// Tutte le versioni della stessa opera di un brano (per la scheda Artista/"Altri
// brani"), ordinate per tipo (originale prima) e poi per titolo.
export function perArtista(brani, artistaNorm) {
  const ORDINE_TIPO = { originale: 0, remix: 1, edit: 2, extended: 3, live: 4, set: 5 };
  return brani
    .filter((b) => b._normA === artistaNorm)
    .sort((a, b) => (ORDINE_TIPO[a.k] ?? 9) - (ORDINE_TIPO[b.k] ?? 9) || a._normT.localeCompare(b._normT));
}

// Conteggi per la schermata Generi: quanti brani per ciascun macro-genere (nMacro è
// la lunghezza di catalogo.macro: i generi li decide il catalogo, non questo file),
// rispettando gli altri filtri attivi (eccetto "macro" stesso). Un brano senza genere
// (o con un indice fuori dall'elenco) va in senzaGenere: nessun brano si perde.
export function conteggiMacro(brani, filtri, nMacro) {
  if (!Number.isInteger(nMacro) || nMacro < 0) {
    throw new TypeError("conteggiMacro: serve il numero dei macro-generi (catalogo.macro.length)");
  }
  const senzaFiltriGenere = { ...filtri, macro: undefined };
  const conteggi = new Array(nMacro).fill(0);
  let senzaGenere = 0;
  for (const b of brani) {
    if (!passa(b, senzaFiltriGenere)) continue;
    if (Number.isInteger(b.g) && b.g >= 0 && b.g < nMacro) conteggi[b.g]++;
    else senzaGenere++;
  }
  return { conteggi, senzaGenere };
}
