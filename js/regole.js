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

import { normalizza } from "./cerca.js";
import { percorsoArmonico } from "./dj.js";
import { motoreBrano, MOTORI_CONTINUI } from "./motori.js";

function suonaSchermoSpento(b, ctx) {
  const { motore } = motoreBrano(b, ctx);
  return Boolean(motore) && MOTORI_CONTINUI.has(motore);
}

function corrisponde(b, r, ctx) {
  if (!r) return true;
  if (r.soloScelti !== false && b.x === 1) return false;
  if (r.soloSchermoSpento && !suonaSchermoSpento(b, ctx)) return false;
  if (r.macro?.length && !r.macro.includes(b.g)) return false;
  if (r.tipi?.length) {
    if (!r.tipi.includes(b.k)) return false;
  } else if (b.k === "set") {
    return false; // come in cerca.js: di default i set restano fuori, servono espliciti
  }
  if (r.piattaforme?.length && !b.s.some(([cod]) => r.piattaforme.includes(cod))) return false;
  if (r.raccolte?.length && !(b.r || []).some((i) => r.raccolte.includes(i))) return false;
  if (r.artisti?.length && !r.artisti.includes(b._normA)) return false;
  if (r.camelot?.length && !r.camelot.includes(b.c)) return false;
  if (r.escludiArtisti?.length && r.escludiArtisti.includes(b._normA)) return false;
  if (r.escludiBrani?.length && r.escludiBrani.includes(b.id)) return false;

  const range = (campo, [min, max]) => {
    if (b[campo] === undefined) return false;
    if (min !== undefined && b[campo] < min) return false;
    if (max !== undefined && b[campo] > max) return false;
    return true;
  };
  if (r.bpm && !range("b", r.bpm)) return false;
  if (r.anno && !range("y", r.anno)) return false;
  if (r.energia && !range("e", r.energia)) return false;

  if (r.testo) {
    const parole = normalizza(r.testo).split(" ").filter(Boolean);
    if (parole.length && !parole.every((p) => b._txt.includes(p))) return false;
  }
  return true;
}

// PRNG deterministico (mulberry32): stesso seme → stesso mescolamento, sempre.
// Serve a poter "ripetere" una playlist casuale, non a garantire imprevedibilità.
function mulberry32(seme) {
  let a = seme >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mescolaDeterministico(elenco, seme) {
  const rand = mulberry32(seme ?? 0);
  const a = elenco.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ordina(elenco, ordine, seme) {
  switch (ordine) {
    case "casuale": return mescolaDeterministico(elenco, seme);
    case "bpm-su": return elenco.slice().sort((a, b) => (a.b ?? Infinity) - (b.b ?? Infinity));
    case "bpm-giu": return elenco.slice().sort((a, b) => (b.b ?? -Infinity) - (a.b ?? -Infinity));
    case "armonico": return percorsoArmonico(elenco);
    case "recenti": return elenco.slice().sort((a, b) => (b.q || "").localeCompare(a.q || ""));
    case "artista": return elenco.slice().sort((a, b) => a._normA.localeCompare(b._normA) || a._normT.localeCompare(b._normT));
    default: return elenco.slice().sort((a, b) => a._normA.localeCompare(b._normA) || a._normT.localeCompare(b._normT));
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
  if (p.regole?.escludiBrani?.some((id) => rinominati[id])) r = { ...r, regole: { ...p.regole, escludiBrani: nuovi(p.regole.escludiBrani) } };
  return r;
}

export function valuta(playlist, brani, ctx) {
  let elenco;
  if (playlist.tipo === "manuale") {
    const perId = new Map(brani.map((b) => [b.id, b]));
    elenco = (playlist.brani || []).map((id) => perId.get(id)).filter(Boolean);
  } else {
    elenco = brani.filter((b) => corrisponde(b, playlist.regole, ctx));
    elenco = ordina(elenco, playlist.ordine, playlist.seme);
  }
  if (playlist.limite) elenco = elenco.slice(0, playlist.limite);
  return elenco;
}

// Solo il conteggio (per il costruttore playlist, che deve aggiornarlo dal vivo
// senza rifare l'ordinamento a ogni tocco di un filtro).
export function conta(regole, brani, ctx) {
  let n = 0;
  for (const b of brani) if (corrisponde(b, regole, ctx)) n++;
  return n;
}
