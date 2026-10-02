// comandi.js — cosa fanno il tasto grande, i tasti ⏮ ⏭ e la fine di un brano.
// Logica pura, testata in test/logica.test.mjs.
//
// Due brani distinti nella schermata "Suona":
//   - il SELEZIONATO: quello che si vede sul disco (la posizione della coda);
//   - quello IN CORSO: quello che si sente.
// ⏮ ⏭ spostano solo la selezione; il tasto grande agisce sul selezionato
// (pausa se è quello in corso, "suona questo" se è un altro). A fine brano parte
// il selezionato, se nel frattempo ne è stato scelto un altro, altrimenti il
// prossimo della coda.

const ESTERNI = {
  newpipe: "Manda a NewPipe",
  "spotify-app": "Apri in Spotify",
  "spotify-premium": "Suona con Spotify",
  web: "Apri sul web",
};

/**
 * Stato del tasto grande.
 * - motore: il motore del brano selezionato (motori.motoreBrano);
 * - selezionato, inCorso: id dei brani (o null);
 * - stato: "suona" | "pausa" | "fermo" (del lettore interno).
 * Restituisce {azione, icona, etichetta}; azione è "pausa" | "riprendi" |
 * "suona" (carica il selezionato) | "apri" (app esterna) | "nessuna".
 */
export function tastoPrincipale({ motore, selezionato, inCorso, stato }) {
  if (!selezionato) return { azione: "nessuna", icona: "play", etichetta: "" };
  if (motore === "file") {
    if (selezionato === inCorso && stato === "suona") return { azione: "pausa", icona: "pausa", etichetta: "Pausa" };
    if (selezionato === inCorso && stato === "pausa") return { azione: "riprendi", icona: "play", etichetta: "Riprendi" };
    return { azione: "suona", icona: "play", etichetta: inCorso && stato === "suona" ? "Suona questo" : "Suona" };
  }
  if (ESTERNI[motore]) return { azione: "apri", icona: "play", etichetta: ESTERNI[motore] };
  return { azione: "nessuna", icona: "play", etichetta: "Nessuna fonte" };
}

/**
 * Sposta la selezione di un passo (dir = +1 / -1) SENZA suonare. In fondo alla
 * coda si ferma sull'ultimo brano, a meno che "ripeti" sia attivo (allora
 * ricomincia). Restituisce il nuovo selezionato.
 */
export function spostaSelezione(coda, dir) {
  const n = coda.ordine.length;
  if (!n) return null;
  let i = coda.indice + dir;
  if (i >= n) i = coda.ripeti === "no" ? n - 1 : 0;
  if (i < 0) i = coda.ripeti === "no" ? 0 : n - 1;
  coda.indice = i;
  return coda.corrente;
}

/**
 * Cosa suonare quando finisce il brano in corso (`inCorso` = il suo id).
 * `puo(brano)` dice se il lettore lo sa suonare (per es. ha il file).
 * Sposta la coda sul brano scelto e lo restituisce; null = fine della musica.
 */
export function dopoFine(coda, inCorso, puo) {
  const sel = coda.corrente;
  if (sel && sel.id !== inCorso && puo(sel)) return sel; // ne era stato scelto un altro
  if (sel && coda.ripeti === "uno") return sel;
  const prossimo = coda.prossimoRiproducibile(puo);
  if (!prossimo) return null;
  coda.salta(prossimo.id);
  return prossimo;
}
