// dialoghi.js — le finestre di dialogo dell'app, al posto di prompt() e confirm() del sistema:
// una domanda con Annulla/Conferma, una domanda con un campo di testo, un riepilogo con "Ok".
// Danno sempre una risposta (Esc o un tocco fuori = annulla) e sono una alla volta.

import { RIGHE_MAX_AVVISI } from "../config.js";
import { $, $$, esc, testaFinestra } from "./base.js";

let dialogoAperto = false;

/**
 * Apre la finestra di dialogo e aspetta la risposta.
 * @param {{ titolo: string, corpo?: string, pulsanti: { etichetta: string, valore: any, classe?: string, principale?: boolean }[], annulla: any, campo?: { etichetta: string, valore?: string } | null }} o
 *   corpo = HTML già ripulito con esc(); annulla = il valore se si chiude senza scegliere;
 *   campo = un campo di testo (la risposta del pulsante principale è il testo scritto).
 */
function dialogo({ titolo, corpo = "", pulsanti, annulla, campo = null }) {
  if (dialogoAperto) return Promise.resolve(annulla);
  dialogoAperto = true;
  return new Promise((risolvi) => {
    const overlay = $("#dialogo-overlay");
    const el = $("#dialogo");
    const precedente = document.activeElement;
    el.innerHTML = `<div class="hf-frontale">
      ${testaFinestra("dialogo-titolo", titolo)}
      <div class="hf-finestra-corpo">
        ${corpo}
        ${campo ? `<div class="hf-campo-riga"><label class="hf-etichetta-campo" for="dialogo-campo">${esc(campo.etichetta)}</label><input id="dialogo-campo" class="hf-campo" type="text" autocomplete="off" value="${esc(campo.valore ?? "")}"></div>` : ""}
      </div>
      <div class="hf-finestra-azioni">${pulsanti
        .map(
          (p, i) =>
            `<button type="button" class="${p.classe || (p.principale ? "hf-tasto hf-principale" : "hf-tasto")}" data-i="${i}">${esc(p.etichetta)}</button>`,
        )
        .join("")}</div>
    </div>`;
    const principale = pulsanti.findIndex((p) => p.principale);
    const chiudi = (valore) => {
      overlay.hidden = true;
      overlay.removeEventListener("click", fuori);
      el.removeEventListener("keydown", tasti);
      dialogoAperto = false;
      precedente?.focus?.();
      risolvi(valore);
    };
    const scegli = (i) => {
      const p = pulsanti[i];
      chiudi(campo && p.principale ? $("#dialogo-campo", el).value : p.valore);
    };
    const fuori = (e) => {
      if (e.target === overlay) chiudi(annulla);
    };
    const tasti = (e) => {
      if (e.key === "Escape") chiudi(annulla);
      else if (e.key === "Enter" && campo && e.target.id === "dialogo-campo" && principale >= 0) scegli(principale);
    };
    for (const b of $$("button[data-i]", el)) b.addEventListener("click", () => scegli(Number(b.dataset.i)));
    overlay.addEventListener("click", fuori);
    el.addEventListener("keydown", tasti);
    overlay.hidden = false;
    const primo = campo ? $("#dialogo-campo", el) : $("button[data-i]", el);
    primo?.focus();
    if (campo) primo.select();
  });
}

/** Una domanda con Annulla/Conferma. true se conferma. `pericolo` fa il tasto pericoloso (cancellazioni). */
export function chiediConferma({ titolo, testo = "", conferma = "Conferma", pericolo = false }) {
  return dialogo({
    titolo,
    corpo: testo ? `<p>${esc(testo)}</p>` : "",
    pulsanti: [
      { etichetta: "Annulla", valore: false },
      {
        etichetta: conferma,
        valore: true,
        principale: true,
        classe: pericolo ? "hf-tasto hf-pericolo" : "hf-tasto hf-principale",
      },
    ],
    annulla: false,
  });
}

/** Una domanda con un campo di testo. Il testo scritto (senza spazi ai lati), o null se annulla o è vuoto. */
export async function chiediTesto({ titolo, etichetta, valore = "", conferma = "Ok" }) {
  const risposta = await dialogo({
    titolo,
    pulsanti: [
      { etichetta: "Annulla", valore: null },
      { etichetta: conferma, valore: "", principale: true },
    ],
    annulla: null,
    campo: { etichetta, valore },
  });
  return risposta?.trim() || null;
}

/**
 * Un riepilogo con un "Ok": qualche frase e, se serve, un elenco (i nomi dei file non riconosciuti).
 * @param {{ titolo: string, righe?: string[], elencoTitolo?: string, elenco?: string[] }} o
 */
export function mostraRiepilogo({ titolo, righe = [], elencoTitolo = "", elenco = [] }) {
  const voci = elenco.slice(0, RIGHE_MAX_AVVISI).map((r) => `<li>${esc(r)}</li>`);
  if (elenco.length > RIGHE_MAX_AVVISI) voci.push(`<li>…e altri ${elenco.length - RIGHE_MAX_AVVISI}</li>`);
  return dialogo({
    titolo,
    corpo:
      righe.map((r) => `<p>${esc(r)}</p>`).join("") +
      (elenco.length
        ? `<details class="hf-dettagli" open><summary>${esc(elencoTitolo)} (${elenco.length})</summary><ul class="hf-elenco">${voci.join("")}</ul></details>`
        : ""),
    pulsanti: [{ etichetta: "Ok", valore: undefined, principale: true }],
    annulla: undefined,
  });
}
