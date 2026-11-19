// percorso.js — la strada fatta dentro l'app: le schede visitate e le finestre aperte, in pila. Serve al
// tasto "indietro" del telefono, che deve chiudere la finestra aperta o tornare alla scheda di prima
// invece di far uscire dall'app. Logica pura: il collegamento con la cronologia del browser sta in
// ui/navigazione.js. Testata in test/percorso.test.mjs.
//
// Una voce è una scheda ({ tipo: "scheda", scheda, extra }: `extra` è per la pagina di un artista, che
// ne ha una per artista) oppure una finestra ({ tipo: "finestra", id }). La prima voce è dove si
// parte e non si può togliere: indietro da lì lascia l'app, e questo lo decide il browser.

/**
 * @typedef {{ tipo: "scheda", scheda: string, extra: string | null }} VoceScheda
 * @typedef {{ tipo: "finestra", id: string }} VoceFinestra
 * @typedef {VoceScheda | VoceFinestra} Voce
 */

export class Percorso {
  constructor() {
    /** @type {Voce[]} */
    this.pila = [];
  }

  /** Quante voci ci sono oltre la prima: quanti "indietro" restano dentro l'app. */
  get profondita() {
    return Math.max(0, this.pila.length - 1);
  }

  /**
   * L'ultima scheda della pila (quella che si vede, finestre a parte).
   * @returns {VoceScheda | null}
   */
  get scheda() {
    for (let i = this.pila.length - 1; i >= 0; i--) {
      const v = this.pila[i];
      if (v.tipo === "scheda") return v;
    }
    return null;
  }

  /**
   * Si va a una scheda. Se è già quella in cima non cambia nulla. Se c'era già più sotto nella pila ci
   * si torna (le voci sopra spariscono: la strada non fa giri); altrimenti si aggiunge.
   * @param {string} scheda @param {string | null} [extra]
   */
  vai(scheda, extra = null) {
    const uguale = (v) => v.tipo === "scheda" && v.scheda === scheda && (v.extra ?? null) === (extra ?? null);
    const cima = this.scheda;
    if (cima && uguale(cima)) return;
    const prima = this.pila.findIndex(uguale);
    if (prima >= 0) this.pila.length = prima + 1;
    else this.pila.push({ tipo: "scheda", scheda, extra: extra ?? null });
  }

  /** Si apre una finestra (una finestra già aperta non si aggiunge due volte). */
  apriFinestra(id) {
    if (this.pila.some((v) => v.tipo === "finestra" && v.id === id)) return;
    this.pila.push({ tipo: "finestra", id });
  }

  /** Si chiude una finestra, anche se non è l'ultima. false se non risultava aperta. */
  chiudiFinestra(id) {
    const i = this.pila.findLastIndex((v) => v.tipo === "finestra" && v.id === id);
    if (i < 0) return false;
    this.pila.splice(i, 1);
    return true;
  }

  /**
   * "Indietro": toglie l'ultima voce. `tolta` è cosa va chiuso (una finestra) o lasciato (una scheda,
   * e allora `scheda` dice dove si torna). null se non c'è più strada dentro l'app.
   * @returns {{ tolta: Voce, scheda: { scheda: string, extra: string | null } | null } | null}
   */
  indietro() {
    if (this.pila.length <= 1) return null;
    const tolta = /** @type {Voce} */ (this.pila.pop());
    const s = this.scheda;
    return { tolta, scheda: s && { scheda: s.scheda, extra: s.extra } };
  }
}
