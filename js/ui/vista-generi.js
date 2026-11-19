// vista-generi.js — la scheda Generi: una pulsantiera con un tasto per voce di genere (LED, nome e
// quanti dischi), i più pieni in alto. Un tasto mette quel genere nei filtri e porta alla ricerca.

import * as cercaMod from "../nucleo/cerca.js";
import { $, esc } from "./base.js";

const DIPENDENZE = ["scheda", "catalogo", "filtri"];

/**
 * Mette un genere (le sue voci: una lista di indici) nei filtri e porta alla ricerca. `svuotaTesto`:
 * toglie anche quello che era scritto nel campo, per vedere tutto il genere.
 */
export function vaiAGenere(app, indici, { svuotaTesto = false } = {}) {
  if (svuotaTesto) $("#cerca-testo").value = "";
  app.stato.cambia({ filtri: { ...app.stato.leggi().filtri, macro: [...indici] }, scheda: "cerca" });
}

export function collegaGeneri(app) {
  // Un solo ascoltatore per tutta la pulsantiera.
  $("#generi-lista").addEventListener("click", (e) => {
    const el = e.target.closest?.(".hf-tasto-genere");
    if (!el) return;
    vaiAGenere(app, el.dataset.idx === "tutti" ? [] : app.stato.leggi().voci[Number(el.dataset.idx)].indici);
  });
  app.stato.ascolta((cambiati, s) => {
    if (s.scheda === "generi" && cambiati.some((k) => DIPENDENZE.includes(k))) disegnaGeneri(app);
  });
}

// Un tasto della pulsantiera: acceso (giù, LED verde) se il filtro attivo è esattamente quella voce.
function tasto({ idx, nome, conta, acceso, tutti = false }) {
  return `<button class="hf-tasto hf-tasto-genere${tutti ? " hf-tutti" : ""}" type="button" data-idx="${idx}" aria-pressed="${acceso}">
      <span class="hf-genere-nome"><span class="hf-led${acceso ? " hf-acceso" : ""}"></span>${esc(nome)}</span>
      <span class="hf-genere-conta">${esc(conta)}</span>
    </button>`;
}

export function disegnaGeneri(app) {
  const { catalogo, filtri, voci } = app.stato.leggi();
  if (!catalogo) return;
  // I conteggi non dipendono dai filtri: si fanno una volta per catalogo.
  const { conteggi, senzaGenere } = app.stato.derivato("conteggiMacro", () =>
    cercaMod.conteggiMacro(catalogo.brani, {}, catalogo.macro.length),
  );
  const scelti = filtri.macro || [];
  const n = (x) => x.toLocaleString("it-IT");
  // Tasti in ordine di quantità, come una pulsantiera: i generi più pieni in alto.
  const ordine = voci
    .map((v, i) => ({
      nome: v.nome,
      i,
      conta: v.indici.reduce((s, x) => s + conteggi[x], 0),
      acceso: v.indici.length === scelti.length && v.indici.every((x) => scelti.includes(x)),
    }))
    .sort((a, b) => b.conta - a.conta);
  const totale = conteggi.reduce((s, x) => s + x, 0) + senzaGenere;
  $("#generi-lista").innerHTML =
    tasto({
      idx: "tutti",
      nome: "Tutti i generi",
      conta: `${n(totale)} dischi${senzaGenere ? ` · ${n(senzaGenere)} ancora senza genere` : ""}`,
      acceso: !scelti.length,
      tutti: true,
    }) + ordine.map((g) => tasto({ idx: g.i, nome: g.nome, conta: `${n(g.conta)} dischi`, acceso: g.acceso })).join("");
}
