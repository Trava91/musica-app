// vista-artisti.js — le due schermate degli artisti. La PAGINA DI UN ARTISTA: tutti i suoi brani in un
// cassetto per tipo (originali, remix, live…) e il tasto «Suona tutto». L'ELENCO A–Z: una lettera alla
// volta, ogni artista col numero dei suoi brani. Si arriva dai suggerimenti della ricerca, dalla
// scheda di un brano e dal tasto «Artisti» della ricerca. Le liste e i conteggi si fanno una volta per
// catalogo (stato.derivato); qui si disegna e basta, «Suona tutto» passa alla sessione.

import { RIGHE_PER_PAGINA } from "../config.js";
import { artistiDellaLettera, elencoArtisti, gruppiDiArtista, lettereUsate } from "../nucleo/artisti.js";
import { $, $$, esc } from "./base.js";
import { allargaNumeri, mostraLista, statoVuoto } from "./riga-brano.js";

const numero = (x) => x.toLocaleString("it-IT");

/** Gli artisti del catalogo (elenco A–Z, per id, lettere usate): si preparano una volta per catalogo. */
export function artistiDi(app) {
  return app.stato.derivato("artisti", () => {
    const elenco = elencoArtisti(app.stato.leggi().catalogo.brani);
    return { elenco, perId: new Map(elenco.map((a) => [a.id, a])), lettere: lettereUsate(elenco) };
  });
}

/** Apre la pagina dell'artista `id` (il suo nome normalizzato). */
export function vaiAArtista(app, id) {
  app.stato.cambia({ scheda: "artista", artista: id });
}

/** Apre l'elenco A–Z degli artisti. */
export function vaiAgliArtisti(app) {
  app.stato.cambia({ scheda: "artisti" });
}

/** Cosa c'è sulla pagina dell'artista: serve a «Suona tutto». */
let aperto = { lista: [], nome: "" };
let lettera = ""; // la lettera dell'elenco A–Z
let visibili = []; // gli artisti della lettera
let mostrati = RIGHE_PER_PAGINA;

export function collegaArtisti(app) {
  $("#artista-suona").addEventListener("click", () => {
    const { lista, nome } = aperto;
    if (lista.length) app.sessione.suonaLista(lista, lista[0], `Brani di ${nome}`);
  });
  $("#artista-elenco").addEventListener("click", () => vaiAgliArtisti(app));
  $("#artisti-lettere").addEventListener("click", (e) => {
    const tasto = e.target.closest?.("[data-lettera]");
    if (!tasto) return;
    lettera = tasto.dataset.lettera;
    mostrati = RIGHE_PER_PAGINA;
    disegnaElenco(app);
  });
  $("#artisti-lista").addEventListener("click", (e) => {
    const riga = e.target.closest?.(".hf-vano[data-id]");
    if (riga) vaiAArtista(app, riga.dataset.id);
  });
  $("#artisti-altri").addEventListener("click", () => {
    mostrati += RIGHE_PER_PAGINA;
    disegnaElenco(app);
  });
  app.stato.ascolta((cambiati, s) => {
    if (s.scheda === "artista" && cambiati.some((k) => ["scheda", "artista", "catalogo", "ctx"].includes(k))) {
      disegnaArtista(app);
    } else if (s.scheda === "artisti" && (cambiati.includes("scheda") || cambiati.includes("catalogo"))) {
      disegnaElenco(app);
    }
  });
}

// ---------------------------------------------------------------- pagina di un artista ----
function gruppoHtml(g, id, offset) {
  return `<section class="hf-modulo" data-gruppo="${esc(g.tipo)}" aria-labelledby="${id}">
      <div class="hf-frontale">
        <div class="hf-targhetta"><h3 class="hf-targhetta-titolo" id="${id}">${esc(g.nome)}</h3><span class="hf-dettaglio">${numero(g.brani.length)}</span></div>
        <ol class="hf-cassetto" data-inizio="${offset}"></ol>
      </div>
    </section>`;
}

function disegnaArtista(app) {
  const { catalogo, artista: id } = app.stato.leggi();
  if (!catalogo || !id) return;
  const gruppi = gruppiDiArtista(catalogo.brani, id);
  const lista = gruppi.flatMap((g) => g.brani);
  const nome = artistiDi(app).perId.get(id)?.nome ?? lista[0]?.a ?? id;
  aperto = { lista, nome };
  $("#t-artista").textContent = nome;
  $("#artista-sotto").textContent = `${numero(lista.length)} brani`;
  $("#artista-suona").disabled = !lista.length;

  const schermo = $('.hf-schermo[data-schermo="artista"]');
  for (const vecchio of $$("[data-gruppo]", schermo)) vecchio.remove();
  if (!lista.length) {
    schermo.insertAdjacentHTML(
      "beforeend",
      `<section class="hf-modulo" data-gruppo="vuoto"><div class="hf-frontale">${statoVuoto(
        {
          testo: "Di questo artista non c'è nessun brano scelto.",
          azione: { etichetta: "Tutti gli artisti" },
        },
        "div",
      )}</div></section>`,
    );
    $("[data-azione-vuoto]", schermo).addEventListener("click", () => vaiAgliArtisti(app));
    return;
  }
  let offset = 0;
  gruppi.forEach((g, i) => {
    schermo.insertAdjacentHTML("beforeend", gruppoHtml(g, `t-gruppo-${i}`, offset));
    const ol = $(`[data-gruppo="${g.tipo}"] .hf-cassetto`, schermo);
    // La numerazione continua da un gruppo all'altro, come l'ordine di «Suona tutto».
    mostraLista(app, ol, g.brani, { lista, nome: `Brani di ${nome}` }, { inizio: offset });
    allargaNumeri(ol, lista.length);
    offset += g.brani.length;
  });
}

// ------------------------------------------------------------------- elenco A–Z ----
function disegnaElenco(app) {
  if (!app.stato.leggi().catalogo) return;
  const { elenco, lettere } = artistiDi(app);
  if (!lettere.includes(lettera)) lettera = lettere[0] ?? "";
  visibili = artistiDellaLettera(elenco, lettera);
  $("#artisti-sotto").textContent = `${numero(elenco.length)} artisti`;
  $("#artisti-lettere").innerHTML = lettere
    .map(
      (l) =>
        `<button class="hf-tasto hf-piccolo hf-lettera${l === lettera ? " hf-principale" : ""}" type="button" data-lettera="${esc(l)}" aria-pressed="${l === lettera}" aria-label="${l === "#" ? "Numeri e simboli" : `Lettera ${l}`}">${esc(l)}</button>`,
    )
    .join("");
  const ol = $("#artisti-lista");
  const righe = visibili.slice(0, mostrati);
  allargaNumeri(ol, Math.max(...righe.map((a) => a.n), 1));
  ol.innerHTML =
    righe
      .map(
        (a) => `<li class="hf-vano" data-id="${esc(a.id)}">
      <span class="hf-vano-num" aria-hidden="true">${a.n}</span>
      <button class="hf-vano-corpo" type="button" aria-label="${esc(`${a.nome}, ${a.n} ${a.n === 1 ? "brano" : "brani"}`)}">
        <span class="hf-vano-titolo">${esc(a.nome)}</span>
      </button>
      <span class="hf-vano-dati"></span>
    </li>`,
      )
      .join("") || statoVuoto("Nessun artista.");
  $("#artisti-altri").hidden = visibili.length <= righe.length;
  if (!$("#artisti-altri").hidden) {
    $("#artisti-altri").textContent = `Mostra altri (${numero(visibili.length - righe.length)})`;
  }
}
