// regole.js — valutazione delle playlist intelligenti: filtri combinati (AND tra
// campi, OR dentro lo stesso campo), esclusioni, ordine, limite. Logica pura,
// separata da cerca.js: qui i filtri sono più ricchi (più raccolte insieme, un
// intervallo di energia...) e non servono un punteggio di rilevanza testuale.
//
// Formato di una playlist intelligente:
//   {id, nome, tipo: "intelligente",
//    regole: {macro, artisti, testo, bpm:[min,max], anno:[min,max], energia:[min,max],
//             camelot, piattaforme, raccolte, tipi, soloScelti, soloSchermoSpento,
//             escludiArtisti, escludiBrani},
//    ordine: "casuale"|"bpm-su"|"bpm-giu"|"armonico"|"recenti"|"artista",
//    seme, limite}
// Formato di una playlist manuale: {id, nome, tipo: "manuale", brani: [id, ...]}

import { mescola } from "./casuale.js";
import { percorsoArmonico } from "./dj.js";
import { passa } from "./filtri.js";

// Le regole di una playlist sono un filtro come gli altri (filtri.js), con una sola differenza:
// di default restano fuori i set, a meno che le regole non chiedano dei tipi precisi.
function filtroDaRegole(r) {
  return r ? { ...r, tipo: r.tipi?.length ? "tutti" : "canzoni" } : r;
}

// Una playlist casuale deve poter essere "ripetuta": senza seme si usa 0, sempre lo stesso.
const mescolaDeterministico = (elenco, seme) => mescola(elenco, seme ?? 0);

function ordina(elenco, ordine, seme) {
  switch (ordine) {
    case "casuale":
      return mescolaDeterministico(elenco, seme);
    case "bpm-su":
      return elenco.slice().sort((a, b) => (a.b ?? Infinity) - (b.b ?? Infinity));
    case "bpm-giu":
      return elenco.slice().sort((a, b) => (b.b ?? -Infinity) - (a.b ?? -Infinity));
    case "armonico":
      return percorsoArmonico(elenco);
    case "recenti":
      return elenco.slice().sort((a, b) => (b.q || "").localeCompare(a.q || ""));
    default: // "artista" e ogni ordine sconosciuto
      return elenco.slice().sort((a, b) => a._normA.localeCompare(b._normA) || a._normT.localeCompare(b._normT));
  }
}

// Valuta una playlist (intelligente o manuale) sul catalogo e restituisce
// l'elenco ordinato dei brani. ctx serve solo per "soloSchermoSpento" (vedi
// motori.js): passalo com'è quando disponibile, altrimenti la regola esclude
// semplicemente tutto (nessun motore continuo configurato).
// Le playlist salvate citano i brani per id. Se un id è cambiato (catalogo.rinominati,
// vedi strumenti/esporta.py: doppioni uniti, fonti aggiunte o tolte) si usa quello
// nuovo, senza doppioni. Restituisce la playlist com'è se non cambia niente.
export function rimappaPlaylist(p, rinominati = {}) {
  if (!rinominati || !Object.keys(rinominati).length) return p;
  const nuovi = (ids) => [...new Set(ids.map((id) => rinominati[id] || id))];
  let r = p;
  if (p.brani?.some((id) => rinominati[id])) r = { ...r, brani: nuovi(p.brani) };
  if (p.regole?.escludiBrani?.some((id) => rinominati[id]))
    r = { ...r, regole: { ...p.regole, escludiBrani: nuovi(p.regole.escludiBrani) } };
  return r;
}

export function valuta(playlist, brani, ctx) {
  let elenco;
  if (playlist.tipo === "manuale") {
    const perId = new Map(brani.map((b) => [b.id, b]));
    elenco = (playlist.brani || []).map((id) => perId.get(id)).filter(Boolean);
  } else {
    const filtro = filtroDaRegole(playlist.regole);
    elenco = brani.filter((b) => passa(b, filtro, ctx));
    elenco = ordina(elenco, playlist.ordine, playlist.seme);
  }
  if (playlist.limite) elenco = elenco.slice(0, playlist.limite);
  return elenco;
}

// Solo il conteggio (per il costruttore playlist, che deve aggiornarlo dal vivo
// senza rifare l'ordinamento a ogni tocco di un filtro).
export function conta(regole, brani, ctx) {
  const filtro = filtroDaRegole(regole);
  let n = 0;
  for (const b of brani) if (passa(b, filtro, ctx)) n++;
  return n;
}
