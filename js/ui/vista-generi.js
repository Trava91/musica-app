// vista-generi.js — la scheda Generi: una pulsantiera con un tasto per voce di genere, i più
// pieni in alto. Un tasto mette quel genere nei filtri e porta alla ricerca.

import * as cercaMod from "../nucleo/cerca.js";
import { $, codiceSelezione, esc } from "./base.js";

const DIPENDENZE = ["scheda", "catalogo", "filtri"];

export function collegaGeneri(app) {
  // Un solo ascoltatore per tutta la pulsantiera.
  $("#generi-lista").addEventListener("click", (e) => {
    const el = e.target.closest?.(".tasto-genere");
    if (!el) return;
    const { filtri, voci } = app.stato.leggi();
    const macro = el.dataset.idx === "tutti" ? [] : [...voci[Number(el.dataset.idx)].indici];
    app.stato.cambia({ filtri: { ...filtri, macro }, scheda: "cerca" });
  });
  app.stato.ascolta((cambiati, s) => {
    if (s.scheda === "generi" && cambiati.some((k) => DIPENDENZE.includes(k))) disegnaGeneri(app);
  });
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
  // Acceso = il filtro attivo è esattamente quella voce.
  const ordine = voci
    .map((v, i) => ({
      nome: v.nome,
      i,
      conta: v.indici.reduce((s, x) => s + conteggi[x], 0),
      acceso: v.indici.length === scelti.length && v.indici.every((x) => scelti.includes(x)),
    }))
    .sort((a, b) => b.conta - a.conta);
  const tasto = (
    g,
    pos,
  ) => `<button class="tasto-genere${g.acceso ? " acceso" : ""}" type="button" data-idx="${g.i}" aria-pressed="${g.acceso}">
        <span class="tasto-nome">${esc(g.nome)}</span>
        <span class="tasto-sotto"><span class="codice-mini">${codiceSelezione(pos)}</span>${n(g.conta)} dischi</span>
      </button>`;
  const totale = conteggi.reduce((s, x) => s + x, 0) + senzaGenere;
  $("#generi-lista").innerHTML =
    `<button class="tasto-genere largo${scelti.length ? "" : " acceso"}" type="button" data-idx="tutti" aria-pressed="${!scelti.length}">
        <span class="tasto-nome">Tutti i generi</span>
        <span class="tasto-sotto">${n(totale)} dischi${senzaGenere ? ` · ${n(senzaGenere)} ancora senza genere` : ""}</span>
      </button>${ordine.map(tasto).join("")}`;
}
