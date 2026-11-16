// filtri.js — l'UNICO motore di filtri del Jukebox: dice se un brano passa un filtro. Lo usano
// la ricerca (cerca.js, i filtri della scheda Cerca) e le playlist intelligenti (regole.js).
// Logica pura, testata in test/filtri.test.mjs.
//
// Tra campi diversi vale l'AND; dentro lo stesso campo (una lista) basta uno. Un filtro è:
//   soloScelti        false per includere anche i brani "esplorazione" (x === 1); altrimenti esclusi
//   tipo              "canzoni" (default: niente set) | "set" (solo set) | "tutti"
//   tipi              lista di tipi di versione ammessi (si somma a `tipo`)
//   macro             indici dei macro-generi
//   piattaforme       codici delle fonti (sp, yt, sc, lo)
//   raccolta          UNA raccolta (indice)      raccolte   lista di raccolte (basta una)
//   artisti           artisti ammessi (normalizzati)      escludiArtisti   artisti esclusi
//   escludiBrani      id esclusi
//   anno, bpm, energia  [min, max] (un estremo può mancare); un brano senza il dato è escluso
//   camelot           una chiave o una lista di chiavi (lista vuota = nessun filtro)
//   testo             tutte le parole devono stare nel testo del brano (_txt)
//   soloSchermoSpento solo brani che il motore attuale suona a schermo spento (serve ctx)
// ctx descrive il telefono (vedi motori.js) e serve solo a soloSchermoSpento.

import { motoreBrano, MOTORI_CONTINUI } from "./motori.js";
import { normalizza } from "./testo.js";

function suonaSchermoSpento(brano, ctx) {
  const { motore } = motoreBrano(brano, ctx);
  return Boolean(motore) && MOTORI_CONTINUI.has(motore);
}

// Il brano ha il dato `campo` e cade in [min, max]? (estremi opzionali)
function nellIntervallo(brano, campo, [min, max]) {
  const v = brano[campo];
  if (v === undefined) return false;
  if (min !== undefined && v < min) return false;
  if (max !== undefined && v > max) return false;
  return true;
}

/**
 * @param {Record<string, any>} b un brano già passato da preparaIndice
 * @param {Record<string, any> | null | undefined} f il filtro (vedi in testa); assente = passa tutto
 * @param {Record<string, any>} [ctx] lo stato del telefono, solo per soloSchermoSpento
 */
export function passa(b, f, ctx) {
  if (!f) return true;
  if (f.soloScelti !== false && b.x === 1) return false;

  const tipo = f.tipo || "canzoni";
  if (tipo === "canzoni" && b.k === "set") return false;
  if (tipo === "set" && b.k !== "set") return false;
  if (f.tipi?.length && !f.tipi.includes(b.k)) return false;

  if (f.macro?.length && !f.macro.includes(b.g)) return false;
  if (f.piattaforme?.length && !b.s.some(([cod]) => f.piattaforme.includes(cod))) return false;
  if (f.raccolta !== undefined && f.raccolta !== null && !(b.r || []).includes(f.raccolta)) return false;
  if (f.raccolte?.length && !(b.r || []).some((i) => f.raccolte.includes(i))) return false;
  if (f.artisti?.length && !f.artisti.includes(b._normA)) return false;
  if (f.escludiArtisti?.length && f.escludiArtisti.includes(b._normA)) return false;
  if (f.escludiBrani?.length && f.escludiBrani.includes(b.id)) return false;

  if (f.anno && !nellIntervallo(b, "y", f.anno)) return false;
  if (f.bpm && !nellIntervallo(b, "b", f.bpm)) return false;
  if (f.energia && !nellIntervallo(b, "e", f.energia)) return false;

  if (f.camelot) {
    const attesi = Array.isArray(f.camelot) ? f.camelot : [f.camelot];
    if (attesi.length && !attesi.includes(b.c)) return false;
  }

  if (f.testo) {
    const parole = normalizza(f.testo).split(" ").filter(Boolean);
    if (parole.length && !parole.every((p) => b._txt.includes(p))) return false;
  }

  if (f.soloSchermoSpento && !suonaSchermoSpento(b, ctx)) return false;
  return true;
}
