// stato.js — il contenitore dello stato dell'app: catalogo, playlist, filtri e ordine della
// ricerca, ctx (lo stato del telefono per motori.js) e la scheda aperta. Logica pura: niente
// pagina, niente rete. Chi cambia qualcosa chiama cambia(parziale); chi disegna ascolta con
// ascolta(funzione) e riceve l'elenco delle chiavi cambiate, così ridisegna solo se serve.
//
// La coda e la riproduzione NON stanno qui: sono della sessione di ascolto (sessione.js).

import { vociGeneri } from "./generi.js";
import { PlaylistCalcolate } from "./playlist-calcolate.js";

/**
 * @typedef {import("./valida.js").Brano} Brano
 * @typedef {import("./valida.js").Playlist} Playlist
 */

/** I filtri della ricerca quando non se ne è scelto nessuno. */
export const FILTRI_DEFAULT = Object.freeze({ soloScelti: true, tipo: "canzoni" });

/** Il ctx prima che l'avvio legga le preferenze e i file sul telefono (vedi motori.js). */
export function ctxIniziale() {
  return { fileIds: new Set(), spotify: "non-configurato", usaNewPipe: true, soloJukebox: false, priorita: [] };
}

/**
 * @typedef {object} DatiApp
 * @property {{ brani: Brano[], macro: string[], raccolte: any[], [campo: string]: any } | null} catalogo
 * @property {{ nome: string, indici: number[] }[]} voci   le voci di genere mostrate (da generi.vociGeneri), seguono il catalogo
 * @property {Playlist[]} playlist
 * @property {object} filtri       i filtri della ricerca (forma in filtri.js)
 * @property {string | undefined} ordine  l'ordine dei risultati scelto a mano (undefined = automatico)
 * @property {any} ctx
 * @property {string | null} scheda       la scheda aperta (cerca, generi, playlist, riproduzione, impostazioni, artista, artisti)
 * @property {string | null} artista      l'artista della pagina «artista» (il suo nome normalizzato)
 */

export class Stato {
  /** @param {Partial<DatiApp>} [iniziale] */
  constructor(iniziale = {}) {
    /** @type {DatiApp} */
    this.dati = {
      catalogo: null,
      voci: [],
      playlist: [],
      filtri: { ...FILTRI_DEFAULT },
      ordine: undefined,
      ctx: ctxIniziale(),
      scheda: null,
      artista: null,
      ...iniziale,
    };
    /** @type {Map<string, Brano>} */
    this.indice = new Map();
    /** @type {Map<string, any>} cose calcolate sul catalogo, buone finché il catalogo non cambia */
    this.derivati = new Map();
    this.playlistCalcolate = new PlaylistCalcolate();
    if (this.dati.catalogo) this.indicizza();
    /** @type {Set<(cambiati: string[], dati: DatiApp) => void>} */
    this.ascoltatori = new Set();
  }

  /** Lo stato attuale. Si legge e basta: per cambiarlo c'è cambia(). */
  leggi() {
    return this.dati;
  }

  /**
   * Cambia una o più chiavi e avvisa chi ascolta con l'elenco di quelle davvero cambiate
   * (confronto per riferimento: un oggetto nuovo conta come cambiato). Col catalogo cambiano
   * anche le voci di genere e l'indice id → brano. Restituisce le chiavi cambiate.
   * @param {Partial<DatiApp>} parziale
   */
  cambia(parziale) {
    const prima = this.dati;
    const dopo = { ...prima, ...parziale };
    if (dopo.catalogo !== prima.catalogo) dopo.voci = dopo.catalogo ? vociGeneri(dopo.catalogo.macro) : [];
    const cambiati = Object.keys(dopo).filter((k) => dopo[k] !== prima[k]);
    if (!cambiati.length) return cambiati;
    this.dati = dopo;
    if (cambiati.includes("catalogo")) {
      this.indicizza();
      this.derivati.clear(); // i conteggi e i totali del catalogo di prima non valgono più
    }
    for (const fn of [...this.ascoltatori]) fn(cambiati, dopo);
    return cambiati;
  }

  /** Cambia solo alcuni campi del ctx (ne nasce uno nuovo: chi ascolta vede "ctx"). */
  cambiaCtx(parziale) {
    return this.cambia({ ctx: { ...this.dati.ctx, ...parziale } });
  }

  /** Il brano con quell'id nel catalogo attuale (null se non c'è), senza scorrere la lista. */
  brano(id) {
    return this.indice.get(id) ?? null;
  }

  /**
   * Una cosa calcolata sul catalogo (i conteggi dei generi, il totale dei dischi): si calcola la
   * prima volta che serve e poi si ricorda, finché il catalogo non cambia.
   * @template T
   * @param {string} chiave
   * @param {() => T} calcolo
   * @returns {T}
   */
  derivato(chiave, calcolo) {
    if (!this.derivati.has(chiave)) this.derivati.set(chiave, calcolo());
    return this.derivati.get(chiave);
  }

  /**
   * I brani e il piano di riproduzione di una playlist (vedi playlist-calcolate.js): si rifà solo
   * se è cambiato il catalogo, la playlist o lo stato del telefono (ctx).
   * @param {Playlist} playlist
   * @returns {import("./playlist-calcolate.js").Calcolata}
   */
  calcola(playlist) {
    const { catalogo, ctx } = this.dati;
    if (!catalogo) throw new Error("calcola: il catalogo non è ancora caricato");
    return this.playlistCalcolate.leggi(playlist, catalogo, ctx);
  }

  /** @param {(cambiati: string[], dati: DatiApp) => void} fn @returns {() => void} la funzione per smettere */
  ascolta(fn) {
    this.ascoltatori.add(fn);
    return () => {
      this.ascoltatori.delete(fn);
    };
  }

  indicizza() {
    this.indice = new Map((this.dati.catalogo?.brani || []).map((b) => [b.id, b]));
  }
}
