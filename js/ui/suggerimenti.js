// suggerimenti.js — le due strisce sopra i risultati della ricerca: i SUGGERIMENTI (gli artisti e i
// generi che corrispondono a quello che si scrive; un tocco apre la pagina dell'artista o sintonizza
// il genere) e le ETICHETTE dei filtri attivi, ognuna con la ✕ per toglierla. La logica è in
// nucleo/artisti.js e nucleo/etichette-filtri.js; qui si disegna e si traducono i tocchi.

import { suggerimenti } from "../nucleo/artisti.js";
import { etichetteFiltri, senzaFiltro } from "../nucleo/etichette-filtri.js";
import { $, esc, SVG_CHIUDI } from "./base.js";
import { artistiDi, vaiAArtista } from "./vista-artisti.js";
import { vaiAGenere } from "./vista-generi.js";

export function collegaSuggerimenti(app) {
  $("#cerca-suggerimenti").addEventListener("click", (e) => {
    const tasto = e.target.closest?.("[data-sugg]");
    if (!tasto) return;
    if (tasto.dataset.sugg === "artista") vaiAArtista(app, tasto.dataset.id);
    else vaiAGenere(app, app.stato.leggi().voci[Number(tasto.dataset.id)].indici, { svuotaTesto: true });
  });
  $("#cerca-etichette").addEventListener("click", (e) => {
    const tasto = e.target.closest?.("[data-chiave]");
    if (tasto) app.stato.cambia({ filtri: senzaFiltro(app.stato.leggi().filtri, tasto.dataset.chiave) });
  });
}

const vano = (sigla, id, tipo, titolo, sotto, etichetta) =>
  `<li class="hf-vano"><span class="hf-vano-num hf-vano-sigla" aria-hidden="true">${sigla}</span>
    <button class="hf-vano-corpo" type="button" data-sugg="${tipo}" data-id="${esc(id)}" aria-label="${esc(etichetta)}">
      <span class="hf-vano-titolo">${esc(titolo)}</span><span class="hf-vano-artista">${esc(sotto)}</span>
    </button><span class="hf-vano-dati"></span></li>`;

/** Gli artisti e i generi che corrispondono a `testo`, sopra i risultati (nascosti se non ce ne sono). */
export function disegnaSuggerimenti(app, testo) {
  const { catalogo, voci } = app.stato.leggi();
  const { artisti, generi } = suggerimenti(catalogo, testo, { artisti: artistiDi(app).elenco, voci });
  const box = $("#cerca-suggerimenti");
  box.hidden = !artisti.length && !generi.length;
  $("#cerca-sugg-lista").innerHTML = box.hidden
    ? ""
    : artisti
        .map((a) => {
          const sotto = `${a.n.toLocaleString("it-IT")} ${a.n === 1 ? "brano" : "brani"}`;
          return vano("ART", a.id, "artista", a.nome, sotto, `${a.nome} ${sotto}. Artista: apri la pagina`);
        })
        .concat(
          generi.map((v) =>
            vano("GEN", String(voci.indexOf(v)), "genere", v.nome, "Genere", `${v.nome} Genere: mostra i suoi brani`),
          ),
        )
        .join("");
}

/** Le etichette dei filtri attivi sopra i risultati. Restituisce quante sono (il numerino sul tasto Filtri). */
export function disegnaEtichette(app, filtri) {
  const { catalogo, voci } = app.stato.leggi();
  const etichette = etichetteFiltri(filtri, { voci, raccolte: catalogo.raccolte });
  const box = $("#cerca-etichette");
  box.hidden = etichette.length === 0;
  $("#cerca-etichette-lista").innerHTML = etichette
    .map(
      ({ chiave, testo }) =>
        `<button class="hf-tasto hf-etichetta-filtro" type="button" data-chiave="${chiave}" aria-label="${esc(`Togli il filtro: ${testo}`)}"><span>${esc(testo)}</span>${SVG_CHIUDI}</button>`,
    )
    .join("");
  return etichette.length;
}
