// diagnostica.js — il registro di bordo del Jukebox: gli ultimi errori (con l'ora e da dove
// vengono) e, per chi vuole un avviso, la frase da mostrare. Niente viene mandato fuori dal
// telefono: la scheda Impostazioni → Diagnostica li elenca e ha un tasto "Copia".
//
// Logica pura (non conosce la pagina): chi la collega alla pagina è main.js, che ascolta le voci
// con ascolta() e mostra l'avviso di quelle che ne hanno uno. La rete di sicurezza generale
// (installaReteDiSicurezza) riceve da fuori il "bersaglio" degli eventi (nell'app è `window`).

/** Quanti errori si tengono in memoria: i più vecchi escono. */
export const MAX_ERRORI = 20;

/**
 * @typedef {object} Voce
 * @property {number} quando     millisecondi dal 1970
 * @property {string} origine    da dove viene: "pagina", "promessa", "audio", "memoria", "avvio"...
 * @property {string} testo      cosa è successo, in poche parole
 * @property {string | null} avviso  la frase da mostrare all'utente (null = solo nel registro)
 */

/** @type {Voce[]} */
let voci = []; // la più vecchia per prima
/** @type {Set<(voce: Voce) => void>} */
const ascoltatori = new Set();

/** Un errore (di qualunque tipo) in una riga di testo, al massimo 300 caratteri. */
export function descrivi(errore) {
  let testo;
  if (errore instanceof Error) testo = errore.message ? `${errore.name}: ${errore.message}` : errore.name;
  else if (typeof errore === "string") testo = errore;
  else if (errore === undefined || errore === null) testo = "errore sconosciuto";
  else {
    try {
      testo = JSON.stringify(errore);
    } catch {
      testo = String(errore); // un oggetto con riferimenti circolari: se ne dice almeno il tipo
    }
  }
  return testo.length > 300 ? `${testo.slice(0, 297)}…` : testo;
}

/**
 * Segna un errore nel registro e lo comunica a chi ascolta.
 * @param {string} origine  da dove viene
 * @param {unknown} errore  un Error, un testo o altro
 * @param {{ avviso?: string }} [opzioni]  avviso = la frase per l'utente
 * @returns {Voce}
 */
export function registra(origine, errore, { avviso } = {}) {
  const voce = { quando: Date.now(), origine, testo: descrivi(errore), avviso: avviso ?? null };
  voci.push(voce);
  if (voci.length > MAX_ERRORI) voci = voci.slice(-MAX_ERRORI);
  for (const fn of [...ascoltatori]) fn(voce);
  return voce;
}

/** Gli errori tenuti in memoria, il più recente per primo. */
export function elenco() {
  return [...voci].reverse();
}

/** Svuota il registro (il tasto "Svuota" della Diagnostica, e i test). */
export function azzera() {
  voci = [];
}

/** @param {(voce: Voce) => void} fn @returns {() => void} la funzione per smettere */
export function ascolta(fn) {
  ascoltatori.add(fn);
  return () => {
    ascoltatori.delete(fn);
  };
}

const due = (n) => String(n).padStart(2, "0");

/** Una voce in una riga: "27/11 21:04:09 [audio] testo". */
export function rigaVoce(v) {
  const d = new Date(v.quando);
  return `${due(d.getDate())}/${due(d.getMonth() + 1)} ${due(d.getHours())}:${due(d.getMinutes())}:${due(d.getSeconds())} [${v.origine}] ${v.testo}`;
}

/** Tutto il registro come testo da copiare (il più recente per primo). Vuoto se non c'è nulla. */
export function testoPerCopia() {
  return elenco().map(rigaVoce).join("\n");
}

/**
 * La rete di sicurezza generale: ascolta gli errori non gestiti della pagina e le promesse
 * respinte che nessuno ha raccolto, li registra e prepara un avviso comprensibile. Lo stesso
 * errore a raffica (un ciclo che fallisce) dà un avviso solo ogni 5 secondi.
 * @param {{ addEventListener: (tipo: string, fn: (e: any) => void) => void }} bersaglio  nell'app, `window`
 * @param {() => number} [adesso]  l'ora (nei test una finta)
 */
export function installaReteDiSicurezza(bersaglio, adesso = Date.now) {
  let ultimo = { testo: "", quando: -Infinity };
  const segnala = (origine, errore) => {
    const testo = descrivi(errore);
    // Il browser lo segnala quando una pagina si ridisegna a metà: non è un difetto dell'app.
    if (/ResizeObserver loop/.test(testo)) return;
    const ora = adesso();
    const ripetuto = testo === ultimo.testo && ora - ultimo.quando < 5000;
    ultimo = { testo, quando: ora };
    registra(origine, errore, ripetuto ? {} : { avviso: `Qualcosa non ha funzionato: ${testo}` });
  };
  bersaglio.addEventListener("error", (e) => segnala("pagina", e.error ?? e.message));
  bersaglio.addEventListener("unhandledrejection", (e) => segnala("promessa", e.reason));
}
