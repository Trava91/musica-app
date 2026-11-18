// tastiera.js — le scorciatoie da tastiera del PC. Legge dalla pagina dove sta il fuoco e dà i fatti a
// nucleo/scorciatoie.js, che decide se il tasto è un comando: «/» porta alla ricerca, Spazio pausa o
// riprendi, ← → brano precedente o successivo. Mai mentre si scrive in un campo, mai con una finestra
// aperta, mai su un controllo che usa già quel tasto (la barra, la manopola, la scala, un menu).

import { comandoDaTasto } from "../nucleo/scorciatoie.js";
import { $, $$, vaiA } from "./base.js";

// Dove si scrive; dove le frecce hanno già un senso; dove lo Spazio è del controllo.
const CAMPI =
  "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]), textarea, [contenteditable]";
const CONTROLLI = "select, input[type=range], [role=slider], [role=radio], [role=radiogroup]";
const BOTTONI =
  "button, a[href], summary, input[type=checkbox], input[type=radio], input[type=button], input[type=submit]";

export function collegaTastiera(app) {
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    const el = e.target instanceof Element ? e.target : null;
    const comando = comandoDaTasto(e, {
      inCampo: Boolean(el?.matches(CAMPI)),
      suControllo: Boolean(el?.closest(CONTROLLI)),
      suBottone: Boolean(el?.closest(BOTTONI)),
      finestraAperta: $$(".hf-velo").some((v) => !v.hidden),
    });
    if (!comando) return;
    if (comando === "cerca") {
      e.preventDefault();
      vaiA(app, "cerca");
      $("#cerca-testo").select();
      $("#cerca-testo").focus();
    } else if (app.sessione.stato().attiva) {
      e.preventDefault();
      if (comando === "alterna") app.sessione.tasto();
      else if (comando === "avanti") app.sessione.avanti();
      else app.sessione.indietro();
    }
  });
}
