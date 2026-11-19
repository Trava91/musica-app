// scorciatoie.js — le scorciatoie da tastiera del PC: quale comando fa un tasto, e quando NON deve
// farlo (mentre si scrive, su un controllo che usa già quel tasto, con una finestra aperta).
// Logica pura: ui/tastiera.js legge la pagina e dà qui i fatti. Testata in test/scorciatoie.test.mjs.
//
//   /          porta alla ricerca        Spazio    pausa / riprendi
//   ←  →       brano precedente / successivo

/**
 * @typedef {object} Fatti
 * @property {boolean} inCampo        si sta scrivendo (campo di testo, area di testo)
 * @property {boolean} suControllo    il fuoco è su un controllo che usa le frecce (barra, manopola, scala, menu)
 * @property {boolean} suBottone      il fuoco è su un tasto, un link o una casella: lo Spazio è suo
 * @property {boolean} finestraAperta una finestra a comparsa è aperta
 */

/**
 * Il comando di un tasto premuto: "cerca" | "alterna" | "avanti" | "indietro", oppure null se non
 * deve succedere nulla (e il tasto fa quello che farebbe da solo).
 * @param {{ key: string, ctrlKey?: boolean, altKey?: boolean, metaKey?: boolean, repeat?: boolean }} tasto
 * @param {Fatti} fatti
 * @returns {"cerca" | "alterna" | "avanti" | "indietro" | null}
 */
export function comandoDaTasto(tasto, fatti) {
  if (tasto.ctrlKey || tasto.altKey || tasto.metaKey) return null; // sono le scorciatoie del browser
  if (fatti.finestraAperta || fatti.inCampo) return null;
  switch (tasto.key) {
    case "/":
      return "cerca";
    case " ":
      return fatti.suControllo || fatti.suBottone || tasto.repeat ? null : "alterna";
    case "ArrowRight":
      return fatti.suControllo ? null : "avanti";
    case "ArrowLeft":
      return fatti.suControllo ? null : "indietro";
    default:
      return null;
  }
}
