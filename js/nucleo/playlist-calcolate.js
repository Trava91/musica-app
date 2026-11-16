// playlist-calcolate.js — il risultato del calcolo di una playlist (i suoi brani e il "piano di
// riproduzione", cioè con che motore suonerebbe), conservato finché non cambia qualcosa che lo
// cambia. Senza, ogni apertura della scheda Playlist rifaceva tutto da capo per ogni playlist
// (con il percorso armonico, il pezzo più pesante, compreso).
//
// Il risultato di una playlist dipende da: il catalogo, la playlist stessa (le sue regole o i suoi
// brani: ogni modifica ne crea un oggetto nuovo) e lo stato del telefono usato da motori.js
// (file presenti, ordine dei motori, NewPipe, Solo Jukebox, Spotify). Se uno di questi cambia, la
// playlist si ricalcola alla prossima richiesta; altrimenti si restituisce lo stesso risultato.
// Logica pura: non conosce la pagina né la rete.

import { pianoRiproduzione } from "./motori.js";
import { valuta } from "./regole.js";

/**
 * @typedef {import("./valida.js").Brano} Brano
 * @typedef {import("./valida.js").Playlist} Playlist
 * @typedef {{ elenco: Brano[], piano: ReturnType<typeof pianoRiproduzione> }} Calcolata
 */

/** I pezzi di ctx da cui dipende il risultato (vedi motori.js). */
const chiaveCtx = (ctx) => [ctx.fileIds, ctx.priorita, ctx.usaNewPipe, ctx.soloJukebox, ctx.spotify];

export class PlaylistCalcolate {
  constructor() {
    /** @type {WeakMap<object, { chiave: unknown[], risultato: Calcolata }>} */
    this.salvate = new WeakMap();
    /** Quante volte si è calcolato davvero (per i test: la seconda richiesta uguale non deve contare). */
    this.calcoli = 0;
  }

  /**
   * I brani e il piano di `playlist`, dal conservato se nulla è cambiato.
   * @param {Playlist} playlist
   * @param {{ brani: Brano[] }} catalogo
   * @param {any} ctx
   * @returns {Calcolata}
   */
  leggi(playlist, catalogo, ctx) {
    const chiave = [catalogo, ...chiaveCtx(ctx)];
    const salvata = this.salvate.get(playlist);
    if (salvata?.chiave.every((x, i) => x === chiave[i])) return salvata.risultato;
    const elenco = valuta(playlist, catalogo.brani, ctx);
    const risultato = { elenco, piano: pianoRiproduzione(elenco, ctx) };
    this.salvate.set(playlist, { chiave, risultato });
    this.calcoli++;
    return risultato;
  }
}
