// sessione.js — la "sessione di ascolto" del Jukebox: la coda, il lettore e le regole che
// decidono cosa suona. È il cervello della riproduzione, separato dall'interfaccia: non disegna
// nulla e non tocca la pagina né la rete. Riceve da fuori ciò che le serve:
//   - lettore: chi suona i file (audio/lettore.js; nei test uno finto);
//   - apri(indirizzo, {web}): apre un link verso un'app esterna (NewPipe, Spotify, web); `web` è
//     l'indirizzo da offrire se l'app non si apre;
//   - ctx(): lo stato del telefono per motori.js (file presenti, NewPipe, "Solo Jukebox"…).
// Ogni modifica della coda passa da qui. Chi disegna ascolta i cambiamenti con
// ascolta(funzione) e legge stato(), una fotografia fatta di soli dati (id, numeri, testi): la
// stessa che un giorno potrà viaggiare in rete verso una "stanza" della social radio.
//
// Due brani da non confondere (vedi comandi.js): il SELEZIONATO, quello che si vede (la
// posizione della coda), e quello IN CORSO, quello che si sente (il lettore interno, o l'ultimo
// mandato a un'app esterna).
//
// Eventi per chi ascolta:
//   {tipo: "coda", nuova?: true}       la coda o la selezione sono cambiate (nuova = coda appena avviata)
//   {tipo: "lettore"}                  è cambiato lo stato del lettore (suona/pausa/fermo, posizione)
//   {tipo: "volume", volume}           è cambiato il volume della manopola (da 0 a 1)
//   {tipo: "avviso", testo, gravita}   un messaggio per chi ascolta; gravita "" | "ok" | "err"

import { Coda } from "./coda.js";
import * as comandi from "./comandi.js";
import { registra } from "./diagnostica.js";
import { linkApertura } from "./link.js";
import { motivoSenzaMotore, motoreBrano, motoreFonte, pianoRiproduzione } from "./motori.js";
import { titoloCompleto } from "./testo.js";
import { limitaVolume, VOLUME_DEFAULT } from "./volume.js";

/**
 * @typedef {import("./valida.js").Brano} Brano
 * @typedef {import("./valida.js").Playlist} Playlist
 */

/**
 * Chi suona i file: audio/lettore.js, o uno finto nei test. La sessione si aggancia a
 * onFine, onStato e onComando.
 * @typedef {object} Lettore
 * @property {Brano | null} brano
 * @property {string} stato              "suona" | "pausa" | "fermo"
 * @property {number} posizione          secondi
 * @property {number} durata             secondi (0 se non si sa)
 * @property {number} [volume]           la posizione della manopola, da 0 a 1 (la imposta la sessione)
 * @property {(brano: Brano, info?: { album?: string, icona?: string }) => Promise<void>} suona
 * @property {() => void} pausa
 * @property {() => void} riprendi
 * @property {(secondi: number) => void} cerca
 * @property {() => void} ferma
 * @property {((brano: Brano | null) => void) | null} [onFine]      il brano è finito
 * @property {(() => void) | null} [onStato]                        stato o posizione cambiati
 * @property {((comando: string) => void) | null} [onComando]      "avanti" | "indietro" dalla schermata di blocco
 * @property {((brano: Brano, motivo: string) => void) | null} [onErrore]  il file del brano che suonava non si legge più
 */

/**
 * La fotografia della sessione: soli dati semplici.
 * @typedef {object} StatoSessione
 * @property {boolean} attiva            c'è una coda
 * @property {{ id: string, nome: string, ordine: string | null } | null} sorgente  da dove viene la coda ("lista" = una lista qualunque)
 * @property {string | null} motore      il motore con cui suona la coda ("file" = il lettore interno)
 * @property {string | null} selezionato id del brano che si vede
 * @property {number} indice             posizione del selezionato nella coda (-1 se vuota)
 * @property {number} totale             brani nella coda
 * @property {string[]} prossimi         id dei brani dopo il selezionato
 * @property {number} saltati            brani della lista lasciati fuori (senza file)
 * @property {boolean} casuale
 * @property {string} ripeti             "no" | "tutti" | "uno"
 * @property {string | null} inCorso     id del brano che si sente (o dell'ultimo mandato fuori)
 * @property {boolean} interno           il brano in corso lo suona il Jukebox
 * @property {string} lettore            "suona" | "pausa" | "fermo"
 * @property {number} posizione
 * @property {number} durata
 * @property {string | null} attuale     quello che si sente o, se non si sente nulla, il selezionato (il mini lettore)
 * @property {string | null} motoreAttuale  chi suona `attuale`
 * @property {{ azione: string, icona: string, etichetta: string }} tasto  il tasto grande (comandi.tastoPrincipale)
 * @property {number} volume             la posizione della manopola, da 0 a 1
 * @property {boolean} volumeAttivo      la manopola comanda la musica (false: la suona un'app esterna)
 */

// ⏮ oltre questi secondi riparte dall'inizio del brano invece di passare al precedente.
export const SECONDI_PER_RIPARTIRE = 4;
// Dopo tanti file che non si riescono a suonare di fila la coda si ferma (altrimenti una playlist
// tutta rovinata girerebbe a vuoto saltando un brano dopo l'altro).
export const MAX_ERRORI_AUDIO_DI_FILA = 3;
const GIRO_RIPETI = ["no", "tutti", "uno"];

export class Sessione {
  /**
   * @param {{ lettore: Lettore, apri?: (indirizzo: string | null, opzioni?: { web?: string | null }) => void, ctx?: object | (() => any), android?: boolean, icona?: string, volume?: number }} opts
   *   android: si aprono le app (intent://) invece del web; icona: l'immagine per la schermata di blocco;
   *   volume: la posizione della manopola all'avvio (da 0 a 1, quella ricordata).
   */
  constructor({ lettore, apri = () => {}, ctx = {}, android = false, icona, volume = VOLUME_DEFAULT }) {
    this.lettore = lettore;
    this.apri = apri;
    /** @type {() => any} */
    this.leggiCtx = typeof ctx === "function" ? /** @type {() => any} */ (ctx) : () => ctx;
    this.android = android;
    this.icona = icona;
    /** @type {Coda | null} */
    this.coda = null;
    /** @type {string | null} */
    this.motore = null;
    /** @type {{ id: string, nome: string, ordine: string | null } | null} */
    this.sorgente = null;
    this.saltati = 0;
    /** @type {Brano | null} l'ultimo brano mandato a un'app esterna */
    this.esterno = null;
    /** @type {Promise<void>} la partenza dell'ultimo brano fatto suonare (chi vuole, la aspetta) */
    this.partenza = Promise.resolve();
    /** @type {Set<(evento: any) => void>} */
    this.ascoltatori = new Set();
    this.erroriDiFila = 0; // file che non si sono riusciti a suonare uno dopo l'altro
    this.volume = limitaVolume(volume);
    lettore.volume = this.volume;

    lettore.onFine = (b) => this.fineBrano(b);
    lettore.onErrore = (b, motivo) => this.erroreAudio(b, motivo);
    lettore.onStato = () => this.emetti({ tipo: "lettore" });
    lettore.onComando = (c) => this.comandoBlocco(c);
  }

  // ------------------------------------------------------------------ ascolto ----
  /** @param {(evento: any) => void} fn @returns {() => void} la funzione per smettere */
  ascolta(fn) {
    this.ascoltatori.add(fn);
    return () => {
      this.ascoltatori.delete(fn);
    };
  }

  emetti(evento) {
    for (const fn of [...this.ascoltatori]) fn(evento);
  }

  avvisa(testo, gravita = "") {
    this.emetti({ tipo: "avviso", testo, gravita });
  }

  // ------------------------------------------------------------------ lettura ----
  /** Il brano che si vede (la posizione della coda). */
  get branoSelezionato() {
    return this.coda?.corrente ?? null;
  }

  /** Il brano che si sente: quello del lettore interno, o l'ultimo mandato a un'app esterna. */
  get branoInCorso() {
    return this.lettore.brano ?? this.esterno ?? null;
  }

  /** Quello che si sente o, se non si sente nulla, il selezionato. */
  get branoAttuale() {
    return this.lettore.brano ?? this.coda?.corrente ?? null;
  }

  /** I prossimi brani della coda (al massimo `limite`). */
  prossimi(limite = Infinity) {
    return this.coda ? this.coda.prossimi.slice(0, limite) : [];
  }

  puoSuonare(b) {
    return Boolean(this.leggiCtx().fileIds?.has(b.id));
  }

  /** @returns {StatoSessione} */
  stato() {
    const l = this.lettore;
    const c = this.coda;
    const attuale = this.branoAttuale;
    return {
      attiva: Boolean(c),
      sorgente: this.sorgente && { ...this.sorgente },
      motore: this.motore,
      selezionato: c?.corrente?.id ?? null,
      indice: c ? c.indice : -1,
      totale: c ? c.ordine.length : 0,
      prossimi: c ? c.prossimi.map((b) => b.id) : [],
      saltati: this.saltati,
      casuale: Boolean(c?.casuale),
      ripeti: c?.ripeti ?? "no",
      inCorso: this.branoInCorso?.id ?? null,
      interno: Boolean(l.brano),
      lettore: l.stato,
      posizione: l.posizione,
      durata: l.durata,
      attuale: attuale?.id ?? null,
      motoreAttuale: !attuale ? null : l.brano ? "file" : motoreBrano(attuale, this.leggiCtx()).motore,
      tasto: this.statoTasto(),
      volume: this.volume,
      volumeAttivo: this.volumeAttivo,
    };
  }

  /**
   * La manopola comanda il volume solo quando la musica la suona il Jukebox (o la suonerà: senza
   * coda, o con una coda di file). Con le app esterne il volume lo decide l'app.
   */
  get volumeAttivo() {
    return Boolean(this.lettore.brano) || !this.coda || this.motore === "file";
  }

  /** Il tasto grande: cosa fa sul brano selezionato (vedi comandi.tastoPrincipale). */
  statoTasto() {
    const sel = this.coda?.corrente;
    if (!sel) return { azione: "nessuna", icona: "play", etichetta: "" };
    const { motore } = motoreBrano(sel, this.leggiCtx());
    return comandi.tastoPrincipale({
      motore,
      selezionato: sel.id,
      inCorso: this.lettore.brano?.id || null,
      stato: this.lettore.stato,
    });
  }

  // ------------------------------------------------------------------ comandi ----

  /**
   * Suona `brano` e poi il resto di `lista` (come le app di musica). Col motore "file" la coda
   * contiene solo i brani che hanno il file; con un'app esterna il brano si apre subito lì.
   * Con "Solo Jukebox" un brano senza file non apre altre app: si parte dal primo brano dopo di
   * lui che ha il file. false se non parte nulla.
   * @param {Brano[]} lista @param {Brano} brano @param {string} [nome]
   */
  suonaLista(lista, brano, nome = "Brano singolo") {
    const ctx = this.leggiCtx();
    let b = brano;
    if (ctx.soloJukebox && !ctx.fileIds?.has(b.id)) {
      const i = lista.findIndex((x) => x.id === b.id);
      const dopo = lista.slice(i + 1).find((x) => ctx.fileIds?.has(x.id));
      if (!dopo) {
        this.avvisa("Questo brano non è sul telefono.", "err");
        return false;
      }
      this.avvisa(`"${titoloCompleto(b)}" non è sul telefono: parto da "${titoloCompleto(dopo)}".`);
      b = dopo;
    }
    const { motore } = motoreBrano(b, ctx);
    if (!motore) {
      this.avvisa(motivoSenzaMotore(b, ctx), "err");
      return false;
    }
    const brani = motore === "file" ? lista.filter((x) => this.puoSuonare(x)) : lista;
    this.avviaCoda({ id: "lista", nome }, brani, motore, { da: b, saltati: lista.length - brani.length });
    if (motore !== "file") this.tasto(); // apre l'app esterna sul brano
    return true;
  }

  /**
   * Avvia una playlist (elenco = i suoi brani, già valutati) col motore consigliato dal suo
   * piano di riproduzione. Con un'app esterna non apre nulla: il primo brano lo apre il tasto
   * grande. false se la playlist è vuota.
   * @param {{ id: string, nome: string, ordine?: string }} p @param {Brano[]} elenco
   */
  avviaPlaylist(p, elenco) {
    if (!elenco.length) {
      this.avvisa("Playlist vuota.", "err");
      return false;
    }
    const motore = pianoRiproduzione(elenco, this.leggiCtx()).consigliato;
    const brani = motore === "file" ? elenco.filter((b) => this.puoSuonare(b)) : elenco;
    this.avviaCoda(p, brani, motore, { saltati: elenco.length - brani.length });
    if (motore !== "file") this.avvisa(`"${p.nome}" pronta: premi il tasto grande per aprire il primo brano.`);
    return true;
  }

  /**
   * ▶ su una riga. Sul brano in corso: pausa e riprendi (o lo riapre nell'app esterna). Su un
   * brano della coda ({coda: true}): salta lì e lo suona. Altrove: suona la lista da quel brano.
   * @param {Brano} b @param {{ lista?: Brano[] | null, nome?: string, coda?: boolean }} [contesto]
   */
  premiRiga(b, { lista = null, nome, coda = false } = {}) {
    if (b.id === this.branoInCorso?.id) {
      if (this.lettore.brano) this.alterna();
      else this.apriEsterno(b);
      return;
    }
    if (coda || !lista) {
      if (!this.coda) return;
      this.coda.salta(b.id);
      this.emetti({ tipo: "coda" });
      this.tasto();
      return;
    }
    this.suonaLista(lista, b, nome || "Brano singolo");
  }

  /** Il tasto grande: pausa, riprendi, "suona questo" o apri nell'app esterna. */
  tasto() {
    const sel = this.coda?.corrente;
    const t = this.statoTasto();
    if (t.azione === "pausa") this.lettore.pausa();
    else if (t.azione === "riprendi") this.lettore.riprendi();
    else if (t.azione === "suona") this.suona(sel);
    else if (t.azione === "apri") this.apriEsterno(sel);
  }

  // ⏮ ⏭ cambiano subito brano: coi file del telefono lo suona il Jukebox (⏮ dopo qualche secondo
  // riparte dall'inizio); con le app esterne apre il brano nuovo nell'app.
  avanti() {
    this.spostaDi(1);
  }

  indietro() {
    this.spostaDi(-1);
  }

  spostaDi(dir) {
    if (!this.coda) return;
    if (this.motore === "file") {
      this.comandoBlocco(dir > 0 ? "avanti" : "indietro");
      return;
    }
    comandi.spostaSelezione(this.coda, dir);
    this.emetti({ tipo: "coda" });
    this.tasto();
  }

  /** Sposta la selezione su un brano della coda, senza suonarlo. */
  saltaA(id) {
    if (!this.coda) return;
    this.coda.salta(id);
    this.emetti({ tipo: "coda" });
  }

  /** Casuale acceso o spento (senza argomento: il contrario di adesso). */
  casuale(on) {
    if (!this.coda) return;
    this.coda.impostaCasuale(on ?? !this.coda.casuale);
    this.emetti({ tipo: "coda" });
  }

  /** Ripeti "no" | "tutti" | "uno" (senza argomento: il prossimo del giro). */
  ripeti(valore) {
    if (!this.coda) return;
    this.coda.ripeti = valore ?? GIRO_RIPETI[(GIRO_RIPETI.indexOf(this.coda.ripeti) + 1) % GIRO_RIPETI.length];
    this.emetti({ tipo: "coda" });
  }

  /**
   * Mette un brano nella coda attuale, dopo il corrente o in fondo. false se non c'è una coda o
   * se il brano è il corrente. `da` = chi lo mette (oggi sempre "io").
   * @param {Brano} brano @param {{ da?: string, dopoCorrente?: boolean }} [opts]
   */
  accoda(brano, { da = "io", dopoCorrente = false } = {}) {
    if (!this.coda?.accoda(brano, { da, dopoCorrente })) return false;
    this.emetti({ tipo: "coda" });
    return true;
  }

  /** Toglie un brano dalla coda attuale. false se non c'era. */
  togli(id) {
    if (!this.coda?.togli(id)) return false;
    this.emetti({ tipo: "coda" });
    return true;
  }

  pausa() {
    this.lettore.pausa();
  }

  riprendi() {
    this.lettore.riprendi();
  }

  /** Pausa se suona, altrimenti riprendi. */
  alterna() {
    if (this.lettore.stato === "suona") this.pausa();
    else this.riprendi();
  }

  /** Sposta la posizione nel brano in corso. */
  cerca(secondi) {
    this.lettore.cerca(secondi);
  }

  /**
   * Il volume della manopola, da 0 a 1 (oltre i limiti si ferma lì). Regola il lettore interno e
   * lo dice a chi ascolta (main.js lo ricorda tra un avvio e l'altro). Un valore che non è un
   * numero si ignora: meglio niente che la musica a tutto volume per sbaglio.
   * @param {number} v
   */
  impostaVolume(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return;
    const nuovo = limitaVolume(v);
    if (nuovo === this.volume) return;
    this.volume = nuovo;
    this.lettore.volume = nuovo;
    this.emetti({ tipo: "volume", volume: nuovo });
  }

  /** Spegne il lettore interno (la coda resta). */
  ferma() {
    this.lettore.ferma();
  }

  /**
   * Apre una fonte scelta a mano (il tasto "Apri" della scheda del brano) nella sua app o sul
   * web. Non tocca la coda né ferma la musica.
   * @param {string[]} fonte [codice, riferimento]
   */
  apriFonte(fonte) {
    this.apri(linkApertura(motoreFonte(fonte, this.leggiCtx()), fonte, { android: this.android }), {
      web: linkApertura("web", fonte, { android: false }),
    });
  }

  // ------------------------------------------------------------------ interni ----

  // La coda che suona adesso: da una playlist, dalla ricerca, da un artista... Col motore
  // "file" parte subito nel lettore interno.
  avviaCoda(sorgente, brani, motore, { da = null, saltati = 0 } = {}) {
    this.motore = motore;
    this.sorgente = { id: sorgente.id, nome: sorgente.nome, ordine: sorgente.ordine ?? null };
    this.coda = new Coda(brani, { ripeti: "no" });
    if (da) this.coda.salta(da.id);
    this.saltati = saltati;
    this.erroriDiFila = 0;
    this.lettore.ferma();
    this.esterno = null;
    this.emetti({ tipo: "coda", nuova: true });
    if (motore === "file") this.suona(this.coda.corrente);
  }

  suona(b) {
    if (!b) return this.partenza;
    this.erroriDiFila = 0;
    this.partenza = this.suonaDaFile(b, new Set());
    return this.partenza;
  }

  // Un file che non si riesce a suonare fa passare al successivo. `falliti` sono quelli già
  // provati in questo giro: non si riprovano, così una coda tutta rovinata non gira all'infinito.
  async suonaDaFile(b, falliti) {
    try {
      await this.lettore.suona(b, { album: this.sorgente?.nome || "Jukebox", icona: this.icona });
      this.erroriDiFila = 0;
    } catch (err) {
      if (err?.name === "NotAllowedError") {
        this.avvisa("Premi ▶ per far partire la musica."); // il browser vuole un tocco prima dell'audio
      } else {
        return this.fileNonSuonabile(b, err?.message || "errore sconosciuto", falliti);
      }
    }
    this.emetti({ tipo: "coda" });
  }

  // Il file di un brano si è rotto mentre suonava (l'evento viene dal lettore).
  erroreAudio(b, motivo) {
    if (!this.coda || this.motore !== "file") return;
    this.partenza = this.fileNonSuonabile(b, motivo, new Set());
  }

  // Un file che non si suona: lo dice, lo segna nella diagnostica e passa al prossimo. Dopo
  // MAX_ERRORI_AUDIO_DI_FILA errori di fila si ferma e lo dice.
  async fileNonSuonabile(b, motivo, falliti) {
    falliti.add(b.id);
    this.erroriDiFila++;
    registra("audio", `«${titoloCompleto(b)}» (${b.id}): ${motivo}`);
    if (this.erroriDiFila >= MAX_ERRORI_AUDIO_DI_FILA) {
      this.lettore.ferma();
      this.avvisa(
        `Ho trovato ${this.erroriDiFila} file che non si riescono a suonare di fila: mi fermo. Controlla la musica sul telefono.`,
        "err",
      );
      this.emetti({ tipo: "coda" });
      return;
    }
    this.avvisa(`Non riesco a suonare «${titoloCompleto(b)}»: passo al prossimo.`, "err");
    const prossimo = this.coda && comandi.dopoFine(this.coda, b.id, (x) => !falliti.has(x.id) && this.puoSuonare(x));
    if (prossimo && !falliti.has(prossimo.id)) return this.suonaDaFile(prossimo, falliti);
    this.emetti({ tipo: "coda" });
  }

  // Apre un brano in un'app esterna (NewPipe, Spotify, web) e lo segna come "in corso": il
  // lettore interno si ferma, così non suonano due cose insieme.
  apriEsterno(b) {
    const { motore, fonte } = motoreBrano(b, this.leggiCtx());
    if (!motore || motore === "file") return;
    this.lettore.ferma();
    this.esterno = b;
    this.emetti({ tipo: "coda" });
    this.apri(linkApertura(motore, fonte, { android: this.android }), {
      web: linkApertura("web", fonte, { android: false }),
    });
  }

  // A fine brano: il selezionato se nel frattempo ne è stato scelto un altro, altrimenti il
  // prossimo che si può suonare; a fine coda il lettore si ferma.
  fineBrano(b) {
    if (!this.coda || this.motore !== "file") return;
    const prossimo = comandi.dopoFine(this.coda, b?.id, (x) => this.puoSuonare(x));
    if (prossimo) this.suona(prossimo);
    else {
      this.lettore.ferma();
      this.emetti({ tipo: "coda" });
    }
  }

  // Tasti precedente/successivo della schermata di blocco o delle cuffie (e ⏮ ⏭ coi file): lì
  // ci si aspetta che il brano cambi subito.
  comandoBlocco(c) {
    if (!this.coda || this.motore !== "file") return;
    if (c === "indietro" && this.lettore.posizione > SECONDI_PER_RIPARTIRE) {
      this.lettore.cerca(0);
      return;
    }
    const b = comandi.spostaSelezione(this.coda, c === "avanti" ? 1 : -1);
    if (b) this.suona(b);
  }
}
