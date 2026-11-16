// vista-diagnostica.js — il riquadro Diagnostica delle Impostazioni: gli ultimi errori registrati
// (nucleo/diagnostica.js) e il tasto "Copia". Resta tutto sul telefono: niente viene inviato.

import { elenco, registra, rigaVoce, testoPerCopia } from "../nucleo/diagnostica.js";
import { $, esc, mostraAvviso } from "./base.js";

/** Ridisegna l'elenco degli errori. */
export function disegnaDiagnostica() {
  const voci = elenco();
  $("#imp-diagnostica").innerHTML = voci.length
    ? `<ul class="elenco-diagnostica">${voci.map((v) => `<li>${esc(rigaVoce(v))}</li>`).join("")}</ul>`
    : `<p class="muted">Nessun errore registrato.</p>`;
  $("#imp-diagnostica-copia").hidden = voci.length === 0;
}

export function collegaDiagnostica() {
  $("#imp-diagnostica-copia").addEventListener("click", async () => {
    const testo = testoPerCopia();
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
