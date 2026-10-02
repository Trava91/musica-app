// lettore.js — il lettore interno del Jukebox per i file sul telefono: un solo
// <audio>, comandabile anche dalla schermata di blocco e dalla notifica
// (Media Session). Non decide cosa suonare dopo: a fine brano chiama onFine e
// la scelta la fa comandi.dopoFine.

import * as file from "./file.js";

export class Lettore {
  /**
   * onFine(brano): il brano è finito.
   * onStato(): è cambiato qualcosa da mostrare (stato, posizione, durata).
   * onComando("avanti" | "indietro"): tasti precedente/successivo della
   * schermata di blocco o delle cuffie.
   */
  constructor({ onFine, onStato, onComando } = {}) {
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.brano = null;
    this.stato = "fermo"; // "suona" | "pausa" | "fermo"
    this.urlCorrente = null;
    this.onFine = onFine;
    this.onStato = onStato;
    this.onComando = onComando;
    this.ultimoAggiornamento = 0;

    const a = this.audio;
    a.addEventListener("playing", () => this.imposta("suona"));
    a.addEventListener("pause", () => { if (!a.ended) this.imposta("pausa"); });
    a.addEventListener("ended", () => { this.imposta("fermo"); this.onFine?.(this.brano); });
    a.addEventListener("loadedmetadata", () => this.onStato?.());
    a.addEventListener("timeupdate", () => {
      const ora = Date.now();
      if (ora - this.ultimoAggiornamento < 900) return; // basta un aggiornamento al secondo
      this.ultimoAggiornamento = ora;
      this.aggiornaPosizione();
      this.onStato?.();
    });

    const ms = navigator.mediaSession;
    if (ms) {
      const prova = (azione, fn) => { try { ms.setActionHandler(azione, fn); } catch { /* azione non supportata */ } };
      prova("play", () => this.riprendi());
      prova("pause", () => this.pausa());
      prova("nexttrack", () => this.onComando?.("avanti"));
      prova("previoustrack", () => this.onComando?.("indietro"));
      prova("seekto", (d) => { if (d.seekTime !== undefined) this.cerca(d.seekTime); });
    }
  }

  imposta(stato) {
    this.stato = stato;
    if (navigator.mediaSession) navigator.mediaSession.playbackState = stato === "suona" ? "playing" : stato === "pausa" ? "paused" : "none";
    this.onStato?.();
  }

  get posizione() { return this.audio.currentTime || 0; }
  get durata() { return Number.isFinite(this.audio.duration) ? this.audio.duration : 0; }

  /** Carica e suona un brano. info: {album, icona} per la schermata di blocco. */
  async suona(brano, { album = "Jukebox", icona } = {}) {
    const u = await file.url(brano.id);
    if (!u) throw new Error("Il file di questo brano non è più sul telefono.");
    if (this.urlCorrente) URL.revokeObjectURL(this.urlCorrente);
    this.urlCorrente = u;
    this.brano = brano;
    this.audio.src = u;
    if (navigator.mediaSession && globalThis.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: brano.v ? `${brano.t} (${brano.v})` : brano.t || "",
        artist: brano.a || "",
        album,
        artwork: icona ? [{ src: icona, sizes: "512x512", type: "image/png" }] : [],
      });
    }
    await this.audio.play();
  }

  pausa() { this.audio.pause(); }
  riprendi() { if (this.brano) this.audio.play().catch(() => {}); }
  cerca(secondi) { this.audio.currentTime = Math.max(0, Math.min(secondi, this.durata || secondi)); this.aggiornaPosizione(); }

  ferma() {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    if (this.urlCorrente) URL.revokeObjectURL(this.urlCorrente);
    this.urlCorrente = null;
    this.brano = null;
    this.imposta("fermo");
  }

  aggiornaPosizione() {
    const ms = navigator.mediaSession;
    if (!ms?.setPositionState || !this.durata) return;
    try {
      ms.setPositionState({ duration: this.durata, playbackRate: this.audio.playbackRate || 1, position: Math.min(this.posizione, this.durata) });
    } catch { /* valori non ancora pronti */ }
  }
}
