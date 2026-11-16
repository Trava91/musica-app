// lettore.js — il lettore interno del Jukebox per i file sul telefono: un solo
// <audio>, comandabile anche dalla schermata di blocco e dalla notifica
// (Media Session). Non decide cosa suonare dopo: a fine brano chiama onFine e
// la scelta la fa comandi.dopoFine.

import { ATTESA_BLOCCO_MS } from "../config.js";
import * as file from "../dati/file-audio.js";
import { registra } from "../nucleo/diagnostica.js";
import { titoloCompleto } from "../nucleo/testo.js";

// Cosa dice il browser quando un file non si riesce a suonare (MediaError.code).
const MOTIVI_ERRORE = {
  1: "caricamento interrotto",
  2: "errore di lettura del file",
  3: "file danneggiato",
  4: "formato non riconosciuto",
};

export class Lettore {
  /**
   * onFine(brano): il brano è finito.
   * onStato(): è cambiato qualcosa da mostrare (stato, posizione, durata).
   * onComando("avanti" | "indietro"): tasti precedente/successivo della
   * schermata di blocco o delle cuffie.
   * onErrore(brano, motivo): il file di un brano che stava suonando non si riesce più a
   * leggere (il lettore si è già fermato). Gli errori all'avvio di un brano li dice invece
   * suona(), respingendo la sua promessa.
   */
  constructor({ onFine, onStato, onComando, onErrore } = {}) {
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.brano = null;
    this.stato = "fermo"; // "suona" | "pausa" | "fermo"
    this.urlCorrente = null;
    this.onFine = onFine;
    this.onStato = onStato;
    this.onComando = onComando;
    this.onErrore = onErrore;
    this.ultimoAggiornamento = 0;
    this.generazione = 0; // sale a ogni brano nuovo o stop: chi arriva in ritardo si accorge di essere superato
    this.inAvvio = false; // suona() sta aspettando che l'audio parta
    this.timerBlocco = null;

    const a = this.audio;
    a.addEventListener("playing", () => {
      clearTimeout(this.timerBlocco);
      this.imposta("suona");
    });
    a.addEventListener("error", () => this.errore(MOTIVI_ERRORE[a.error?.code] || "file non leggibile"));
    a.addEventListener("stalled", () => this.sospetta());
    a.addEventListener("pause", () => {
      if (!a.ended) this.imposta("pausa");
    });
    a.addEventListener("ended", () => {
      this.imposta("fermo");
      this.onFine?.(this.brano);
    });
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
      const prova = (azione, fn) => {
        try {
          ms.setActionHandler(azione, fn);
        } catch {
          /* azione non supportata */
        }
      };
      prova("play", () => this.riprendi());
      prova("pause", () => this.pausa());
      prova("nexttrack", () => this.onComando?.("avanti"));
      prova("previoustrack", () => this.onComando?.("indietro"));
      prova("seekto", (d) => {
        if (d.seekTime !== undefined) this.cerca(d.seekTime);
      });
    }
  }

  imposta(stato) {
    this.stato = stato;
    if (navigator.mediaSession)
      navigator.mediaSession.playbackState = stato === "suona" ? "playing" : stato === "pausa" ? "paused" : "none";
    this.onStato?.();
  }

  get posizione() {
    return this.audio.currentTime || 0;
  }
  get durata() {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
  }

  /**
   * Carica e suona un brano. info: {album, icona} per la schermata di blocco. Se il file non si
   * riesce a suonare respinge la promessa e il lettore resta fermo; se nel frattempo è partito un
   * altro brano (o c'è stato uno stop) non dice nulla: l'esito di questo non interessa più.
   */
  async suona(brano, { album = "Jukebox", icona } = {}) {
    const turno = ++this.generazione;
    const u = await file.url(brano.id);
    if (!u) throw new Error("Il file di questo brano non è più sul telefono.");
    if (turno !== this.generazione) {
      URL.revokeObjectURL(u);
      return;
    }
    if (this.urlCorrente) URL.revokeObjectURL(this.urlCorrente);
    this.urlCorrente = u;
    this.brano = brano;
    this.audio.src = u;
    if (navigator.mediaSession && globalThis.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: titoloCompleto(brano),
        artist: brano.a || "",
        album,
        artwork: icona ? [{ src: icona, sizes: "512x512", type: "image/png" }] : [],
      });
    }
    this.inAvvio = true;
    try {
      await this.audio.play();
    } catch (err) {
      if (turno !== this.generazione) return; // interrotto da un brano più nuovo: non è un errore
      // Il browser vuole un tocco prima dell'audio: il brano resta caricato, basta un ▶.
      if (err?.name !== "NotAllowedError") this.ferma();
      throw err;
    } finally {
      this.inAvvio = false;
    }
  }

  pausa() {
    this.audio.pause();
  }
  riprendi() {
    if (this.brano) this.audio.play().catch((err) => registra("audio", err));
  }
  cerca(secondi) {
    this.audio.currentTime = Math.max(0, Math.min(secondi, this.durata || secondi));
    this.aggiornaPosizione();
  }

  ferma() {
    this.generazione++;
    clearTimeout(this.timerBlocco);
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    if (this.urlCorrente) URL.revokeObjectURL(this.urlCorrente);
    this.urlCorrente = null;
    this.brano = null;
    this.imposta("fermo");
  }

  // Il file smette di leggersi mentre suona. Se il brano sta ancora partendo (suona() aspetta
  // l'audio) lo dirà la sua promessa respinta: ascoltare anche questo evento farebbe saltare due brani.
  errore(motivo) {
    if (!this.brano || this.inAvvio) return;
    const brano = this.brano;
    this.ferma();
    this.onErrore?.(brano, motivo);
  }

  // Il browser dice che il file non arriva ("stalled"): per un file già sul telefono non
  // dovrebbe mai succedere. Se dopo un po' l'audio non scorre, il file si considera rovinato.
  sospetta() {
    clearTimeout(this.timerBlocco);
    this.timerBlocco = setTimeout(() => {
      const a = this.audio;
      if (this.brano && !this.inAvvio && !a.paused && a.readyState < 3) this.errore("il file si è bloccato");
    }, ATTESA_BLOCCO_MS);
  }

  aggiornaPosizione() {
    const ms = navigator.mediaSession;
    if (!ms?.setPositionState || !this.durata) return;
    try {
      ms.setPositionState({
        duration: this.durata,
        playbackRate: this.audio.playbackRate || 1,
        position: Math.min(this.posizione, this.durata),
      });
    } catch {
      /* valori non ancora pronti */
    }
  }
}
