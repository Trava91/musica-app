// coda.js — la coda di riproduzione del Jukebox: posizione corrente, avanti, indietro,
// casuale, ripeti, e i brani messi in coda a mano. Logica pura: non tocca l'audio
// (audio/lettore.js) né l'interfaccia (ui/), solo lo stato "che cosa viene dopo".
//
// Ogni posto della coda è una VOCE { brano, da, quando }: il brano, chi l'ha messo (oggi
// sempre "io"; con la social radio l'utente della stanza: è il punto in cui agganciare i
// limiti per utente) e quando, in millisecondi. `ordine` resta l'elenco dei BRANI
// nell'ordine in cui suoneranno, come prima: chi guarda la coda non deve sapere delle voci.
//
// Nella coda un brano compare una volta sola: salta(id) e togli(id) lavorano per id.

import { mescola } from "./casuale.js";

/**
 * @typedef {import("./valida.js").Brano} Brano
 * @typedef {{ brano: Brano, da: string, quando: number }} Voce
 */

// Senza seme ogni coda casuale è diversa: il seme è l'ora.
const mescolaCoda = (elenco, seme) => mescola(elenco, seme ?? Date.now() >>> 0);

export class Coda {
  /**
   * elenco: i brani nell'ordine "naturale" (quello deciso da regole.valuta).
   * opts.casuale: mescola subito. opts.ripeti: "no" | "tutti" | "uno".
   * opts.seme: per un mescolamento ripetibile (comodo nei test); senza, cambia
   * a ogni avvio della coda. opts.da / opts.quando: chi ha messo questi brani e quando.
   * @param {Brano[]} [elenco]
   * @param {{ casuale?: boolean, ripeti?: string, seme?: number, da?: string, quando?: number }} [opts]
   */
  constructor(elenco = [], { casuale = false, ripeti = "no", seme, da = "io", quando = Date.now() } = {}) {
    /** @type {Voce[]} le voci nell'ordine naturale (quello di partenza, con dentro quelle accodate) */
    this.originali = elenco.map((brano) => ({ brano, da, quando }));
    this.seme = seme;
    this.casuale = casuale;
    this.ripeti = ripeti;
    /** @type {Voce[]} le voci nell'ordine in cui suonano */
    this.voci = casuale ? mescolaCoda(this.originali, seme) : this.originali.slice();
    /** @type {Brano[]} i brani nell'ordine in cui suonano (sempre allineato a `voci`) */
    this.ordine = [];
    this.allinea();
    this.indice = elenco.length ? 0 : -1;
  }

  allinea() {
    this.ordine = this.voci.map((v) => v.brano);
  }

  get corrente() {
    return this.indice >= 0 && this.indice < this.ordine.length ? this.ordine[this.indice] : null;
  }

  /** @returns {Voce | null} la voce del brano corrente: chi l'ha messo e quando */
  get voceCorrente() {
    return this.indice >= 0 && this.indice < this.voci.length ? this.voci[this.indice] : null;
  }

  get prossimi() {
    return this.indice >= 0 ? this.ordine.slice(this.indice + 1) : [];
  }

  impostaCasuale(on) {
    if (on === this.casuale) return;
    const attuale = this.corrente;
    this.casuale = on;
    this.voci = on ? mescolaCoda(this.originali, this.seme) : this.originali.slice();
    this.allinea();
    this.indice = attuale ? this.ordine.findIndex((b) => b.id === attuale.id) : -1;
  }

  // Avanza di uno. Con ripeti "uno" resta fermo; a fine coda con ripeti "tutti"
  // ricomincia; altrimenti restituisce null (coda finita).
  avanti() {
    if (this.ripeti === "uno") return this.corrente;
    if (this.indice < this.ordine.length - 1) {
      this.indice++;
      return this.corrente;
    }
    if (this.ripeti === "tutti" && this.ordine.length) {
      this.indice = 0;
      return this.corrente;
    }
    this.indice = this.ordine.length;
    return null;
  }

  indietro() {
    if (this.indice > 0) this.indice--;
    return this.corrente;
  }

  salta(id) {
    const i = this.ordine.findIndex((b) => b.id === id);
    if (i >= 0) this.indice = i;
    return this.corrente;
  }

  /**
   * Mette un brano in coda: subito dopo il corrente (`dopoCorrente`) o in fondo. Se il brano
   * era già più avanti nella coda, si sposta (un brano compare una volta sola). Il brano
   * corrente non si accoda: restituisce false. A coda finita, il brano accodato diventa il
   * corrente (è il prossimo che suonerà).
   * @param {Brano} brano
   * @param {{ da?: string, quando?: number, dopoCorrente?: boolean }} [opts]
   */
  accoda(brano, { da = "io", quando = Date.now(), dopoCorrente = false } = {}) {
    if (this.corrente?.id === brano.id) return false;
    this.togli(brano.id);
    const voce = { brano, da, quando };
    // Nell'ordine naturale (quello a cui si torna togliendo il casuale) va dopo il corrente o in fondo.
    const corrente = dopoCorrente ? this.voceCorrente : null;
    const posCorrente = corrente ? this.originali.indexOf(corrente) : -1;
    this.originali.splice(posCorrente >= 0 ? posCorrente + 1 : this.originali.length, 0, voce);
    const pos = Math.max(0, Math.min(dopoCorrente ? this.indice + 1 : this.voci.length, this.voci.length));
    this.voci.splice(pos, 0, voce);
    if (this.indice < 0) this.indice = 0;
    this.allinea();
    return true;
  }

  /**
   * Toglie un brano dalla coda. Se era il corrente, il corrente diventa quello che veniva dopo
   * (o la coda è finita, se era l'ultimo). false se il brano non era in coda.
   * @param {string} id
   */
  togli(id) {
    const pos = this.voci.findIndex((v) => v.brano.id === id);
    if (pos < 0) return false;
    this.voci.splice(pos, 1);
    this.originali = this.originali.filter((v) => v.brano.id !== id);
    if (pos < this.indice) this.indice--;
    if (!this.voci.length) this.indice = -1;
    this.allinea();
    return true;
  }

  // Il prossimo brano che il motore attuale può davvero suonare — per es. un
  // motore "file" deve saltare i brani senza un file abbinato sul telefono.
  // predicato(brano) -> bool. null se non ce n'è nessuno riproducibile avanti.
  prossimoRiproducibile(predicato) {
    for (let i = this.indice + 1; i < this.ordine.length; i++) {
      if (predicato(this.ordine[i])) return this.ordine[i];
    }
    if (this.ripeti === "tutti") {
      for (let i = 0; i <= this.indice && i < this.ordine.length; i++) {
        if (predicato(this.ordine[i])) return this.ordine[i];
      }
    }
    return null;
  }
}
