// coda.js — la coda di riproduzione del Jukebox: posizione corrente, avanti,
// indietro, casuale, ripeti. Logica pura: non tocca l'audio (lettore.js, M2) né
// la UI (ui.js), solo lo stato "che cosa viene dopo".

function mulberry32(seme) {
  let a = seme >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mescola(elenco, seme) {
  const rand = mulberry32(seme ?? (Date.now() >>> 0));
  const a = elenco.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Coda {
  /**
   * elenco: i brani nell'ordine "naturale" (quello deciso da regole.valuta).
   * opts.casuale: mescola subito. opts.ripeti: "no" | "tutti" | "uno".
   * opts.seme: per un mescolamento ripetibile (comodo nei test); senza, cambia
   * a ogni avvio della coda.
   */
  constructor(elenco = [], { casuale = false, ripeti = "no", seme } = {}) {
    this.originale = elenco.slice();
    this.seme = seme;
    this.casuale = casuale;
    this.ripeti = ripeti;
    this.ordine = casuale ? mescola(elenco, seme) : elenco.slice();
    this.indice = elenco.length ? 0 : -1;
  }

  get corrente() {
    return this.indice >= 0 && this.indice < this.ordine.length ? this.ordine[this.indice] : null;
  }

  get prossimi() {
    return this.indice >= 0 ? this.ordine.slice(this.indice + 1) : [];
  }

  impostaCasuale(on) {
    if (on === this.casuale) return;
    const attuale = this.corrente;
    this.casuale = on;
    this.ordine = on ? mescola(this.originale, this.seme) : this.originale.slice();
    this.indice = attuale ? this.ordine.findIndex((b) => b.id === attuale.id) : -1;
  }

  impostaRipeti(v) {
    this.ripeti = v;
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
