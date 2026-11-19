// vista-diagnostica.js — il riquadro Diagnostica delle Impostazioni: gli ultimi errori registrati
// (nucleo/diagnostica.js) e il tasto "Copia". Resta tutto sul telefono: niente viene inviato.

import { elenco, registra, rigaVoce, testoMisure, testoPerCopia } from "../nucleo/diagnostica.js";
import { $, esc, mostraAvviso } from "./base.js";

// Come si chiamano le misure di velocità (vedi nucleo/diagnostica.js: segna).
const NOMI_MISURE = {
  controllo: "Controllo del catalogo",
  indice: "Indice di ricerca",
  catalogo: "Lettura del catalogo",
  primaLista: "Dall'apertura alla prima lista",
  ricerca: "Ultima ricerca",
  disegno: "Disegno della lista",
  playlist: "Scheda Playlist (calcolo e disegno)",
};

/** Ridisegna le misure di velocità e l'elenco degli errori. */
export function disegnaDiagnostica() {
  const voci = elenco();
  const righeMisure = testoMisure(NOMI_MISURE)
    .split("\n")
    .filter(Boolean)
    .map((riga) => `<li>${esc(riga)}</li>`);
  $("#imp-diagnostica").innerHTML =
    (righeMisure.length ? `<ul>${righeMisure.join("")}</ul>` : "") +
    (voci.length
      ? `<ul>${voci.map((v) => `<li>${esc(rigaVoce(v))}</li>`).join("")}</ul>`
      : `<p>Nessun errore registrato.</p>`);
  $("#imp-diagnostica-copia").hidden = voci.length === 0 && righeMisure.length === 0;
}

export function collegaDiagnostica() {
  $("#imp-diagnostica-copia").addEventListener("click", async () => {
    const testo = [testoMisure(NOMI_MISURE), testoPerCopia()].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard.writeText(testo);
      mostraAvviso("Copiato negli appunti.", "ok");
    } catch (err) {
      // Gli appunti non sono disponibili (permesso negato, pagina non attiva): niente è perso, il
      // testo resta qui sopra e si può selezionare a mano.
      registra("appunti", err);
      mostraAvviso("Non riesco a copiare: seleziona il testo qui sopra e copialo a mano.", "err");
    }
  });
}
