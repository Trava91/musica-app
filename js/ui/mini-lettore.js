// mini-lettore.js — il mini lettore: sul telefono, fuori dalla schermata Suona, un display piccolo
// sopra la barra delle sezioni (titolo e artista che scorrono, il tempo o "IN NEWPIPE") e il tasto
// ▶/⏸. Tutto il display si tocca e apre Suona. Da 700 px non serve: Suona è sempre in vista.
// Mostra quello che si SENTE, altrimenti il brano selezionato.

import { sottotitolo, titoloCompleto } from "../nucleo/testo.js";
import { $, SCRITTE_DOVE, suonaInVista, vaiA } from "./base.js";
import { creaDisplay } from "./hifi/display-vfd.js";

/** @type {ReturnType<typeof creaDisplay> | null} */
let display = null;

export function collegaMini(app) {
  display = creaDisplay($("#mini-display"), { compatto: true, etichetta: "Mini lettore" });
  $("#mini-apri").addEventListener("click", () => vaiA(app, "riproduzione"));
  $("#mini-pausa").addEventListener("click", () => app.sessione.alterna());
}

/** Visibile se c'è un brano e la schermata Suona non si vede. */
export function aggiornaMini(app, s = app.sessione.stato()) {
  const mini = $("#mini-lettore");
  const brano = app.sessione.branoAttuale;
  mini.hidden = !brano || suonaInVista(app);
  if (mini.hidden || !display) return;
  display.testi(titoloCompleto(brano), sottotitolo(brano));
  const esterno = !s.interno && s.motoreAttuale && s.motoreAttuale !== "file";
  if (esterno) display.cifre({ scritta: SCRITTE_DOVE[s.motoreAttuale] || "APP ESTERNA" });
  else display.cifre({ tempo: s.interno ? s.posizione : 0, durata: s.interno ? s.durata : brano.d || 0 });
  $("#mini-apri").setAttribute("aria-label", `${titoloCompleto(brano)}: apri la schermata Suona`);
  const pausa = $("#mini-pausa");
  pausa.hidden = !s.interno;
  pausa.dataset.stato = s.lettore === "suona" ? "pausa" : "suona";
  pausa.setAttribute("aria-label", s.lettore === "suona" ? "Pausa" : "Riprendi");
}
