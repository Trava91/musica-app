// base.js — gli aiuti comuni dell'interfaccia: trovare gli elementi, ripulire il testo, avvisi,
// finestre, schede (e le due disposizioni: telefono e da 700 px), e i pezzi che si ripetono tra
// "Filtri" e "Costruttore playlist" (campo min–max, scelte di piattaforme e generi). Solo disegno:
// nessuna decisione su cosa suonare (quella è di nucleo/sessione.js).
//
// Ogni vista riceve `app` = { stato, sessione, android, avvia, aggiornaDati } da main.js.

import { ATTESA_APERTURA_APP_MS, DURATA_AVVISO_LUNGO_MS, DURATA_AVVISO_MS } from "../config.js";
import { vociSelezionate } from "../nucleo/generi.js";
import { collegaTastieraFinestre, mostra, nascondi } from "./finestre.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Il testo ripulito prima di finire nella pagina. */
export function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ---------------------------------------------------------------- nomi e icone ----
export const NOMI_MOTORE = {
  file: "Nel Jukebox (file)",
  "spotify-premium": "Con Spotify",
  newpipe: "Con NewPipe",
  "spotify-app": "Apri in Spotify",
  web: "Apri sul web",
};
// Dove suona il brano, per la scheda Suona.
export const NOMI_DOVE = {
  file: "nel Jukebox",
  "spotify-premium": "in Spotify",
  newpipe: "in NewPipe",
  "spotify-app": "in Spotify",
  web: "sul web",
};
// Sul display, al posto del tempo, quando il brano lo suona un'app esterna.
export const SCRITTE_DOVE = {
  "spotify-premium": "IN SPOTIFY",
  newpipe: "IN NEWPIPE",
  "spotify-app": "IN SPOTIFY",
  web: "SUL WEB",
};
export const NOMI_PIATT = { sp: "Spotify", yt: "YouTube", sc: "SoundCloud", lo: "File sul telefono" };
export const SIGLA_PIATT = { sp: "SP", yt: "YT", sc: "SC", lo: "FILE" };
export const NOMI_ORDINE_PL = {
  artista: "per artista",
  casuale: "casuale",
  "bpm-su": "BPM crescente",
  "bpm-giu": "BPM decrescente",
  armonico: "percorso armonico",
  recenti: "recenti",
};
export const SVG_PLAY = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>`;
export const SVG_PAUSA = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="6.5" y="5" width="3.8" height="14" fill="currentColor"/><rect x="13.7" y="5" width="3.8" height="14" fill="currentColor"/></svg>`;
// "Riapri nell'app esterna": una freccia che esce dal riquadro.
export const SVG_APRI = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>`;
export const SVG_CHIUDI = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`;

// --------------------------------------------------------------------- avvisi ----
let timerAvviso = null;

// Lo sente anche chi legge lo schermo: le aree #annuncio (cortese) e #annuncio-errore (subito) stanno sempre
// nella pagina; svuotarle e riscriverle fa rileggere anche lo stesso messaggio due volte di fila.
function annuncia(msg, errore) {
  const area = $(errore ? "#annuncio-errore" : "#annuncio");
  area.textContent = "";
  setTimeout(() => {
    area.textContent = msg;
  }, 60);
}

/**
 * Un avviso in basso, una striscia di display. tipo: "" | "ok" | "err"; opts: {duration,
 * actionLabel, onAction} (un tasto a destra se c'è qualcosa da fare).
 */
export function mostraAvviso(msg, type = "", opts = {}) {
  const t = $("#toast");
  clearTimeout(timerAvviso);
  const pezzi = [];
  if (type === "ok" || type === "err") {
    const led = document.createElement("span");
    led.className = type === "ok" ? "hf-led hf-acceso" : "hf-led hf-arancio hf-acceso";
    pezzi.push(led);
  }
  const testo = document.createElement("span");
  testo.className = "hf-avviso-testo";
  testo.textContent = msg;
  pezzi.push(testo);
  if (opts.actionLabel) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hf-tasto";
    btn.textContent = opts.actionLabel;
    btn.addEventListener("click", () => {
      t.hidden = true;
      clearTimeout(timerAvviso);
      opts.onAction?.();
    });
    pezzi.push(btn);
  }
  t.replaceChildren(...pezzi);
  t.className = `hf-avviso${type === "ok" ? " hf-ok" : type === "err" ? " hf-errore" : ""}`;
  t.hidden = false;
  annuncia(msg, type === "err");
  timerAvviso = setTimeout(() => {
    t.hidden = true;
  }, opts.duration || DURATA_AVVISO_MS);
}

/** La rotella di attesa sopra tutto. */
export function attesa(on) {
  $("#spinner").hidden = !on;
}

// ----------------------------------------------------------------- link esterni ----
// Sul telefono Android i link intent:// aprono NewPipe/Spotify; sul PC (anteprima) non
// esistono e la sessione passa il link web. `web` = l'indirizzo da offrire se l'app non si apre.
export function apriLink(url, { web = null } = {}) {
  if (!url) return;
  if (!url.startsWith("intent://")) {
    window.open(url, "_blank", "noopener");
    return;
  }
  // Se l'app si apre, il Jukebox passa in secondo piano (la pagina diventa "nascosta"). Se dopo un
  // attimo è ancora lì, l'apertura non è partita: si offre il web invece di non fare nulla.
  let partita = false;
  const controlla = () => {
    if (document.hidden) partita = true;
  };
  document.addEventListener("visibilitychange", controlla);
  window.location.href = url;
  setTimeout(() => {
    document.removeEventListener("visibilitychange", controlla);
    if (partita || document.hidden) return;
    mostraAvviso(
      "L'app non si è aperta.",
      "err",
      web
        ? {
            actionLabel: "Apri sul web",
            onAction: () => window.open(web, "_blank", "noopener"),
            duration: DURATA_AVVISO_LUNGO_MS,
          }
        : {},
    );
  }, ATTESA_APERTURA_APP_MS);
}

// -------------------------------------------------------------------- finestre ----
// Aprire e chiudere passa da finestre.js: fuoco dentro, sfondo inerte, Esc, fuoco di ritorno.
export function apriFinestra(id) {
  mostra($(`#${id}`));
}

export function chiudiFinestra(id) {
  nascondi($(`#${id}`));
}

/** La testa di una finestra: il titolo (con il suo id, per aria-labelledby) e, se serve, il ✕. */
export function testaFinestra(idTitolo, titolo, idChiudi = "") {
  const chiudi = idChiudi
    ? `<button class="hf-tasto hf-piccolo" type="button" id="${idChiudi}" aria-label="Chiudi">${SVG_CHIUDI}</button>`
    : "";
  return `<div class="hf-finestra-testa"><h2 class="hf-finestra-titolo" id="${idTitolo}">${esc(titolo)}</h2>${chiudi}</div>`;
}

/** Un tocco fuori dalla finestra la chiude; Esc e Tab con una finestra aperta. Da chiamare una volta all'avvio. */
export function collegaFinestre() {
  // (le finestre di dialogo hanno la loro chiusura: devono sempre dare una risposta)
  for (const velo of $$(".hf-velo:not([data-dialogo])")) {
    velo.addEventListener("click", (e) => {
      if (e.target === velo) nascondi(velo);
    });
  }
  collegaTastieraFinestre();
}

// ---------------------------------------------------------------------- schede ----
// Sotto i 700 px la schermata Suona è una scheda come le altre; da 700 px in su sta sempre in vista
// nella colonna di sinistra (e a destra c'è la sezione scelta): lì "Suona" non è una scheda.
const LARGA = "(min-width: 700px)";
/** @type {MediaQueryList | null} */
let mqLarga = null;
const ascoltatoriLarghezza = new Set();
let ultimaSezione = "cerca"; // l'ultima scheda diversa da Suona: a destra quando Suona è a sinistra

function larghezza() {
  if (!mqLarga) mqLarga = matchMedia(LARGA);
  return mqLarga;
}

/** true da 700 px in su: due colonne, con la schermata Suona sempre in vista. */
export function vistaLarga() {
  return larghezza().matches;
}

/** La schermata Suona si vede (è la scheda aperta, o siamo da 700 px in su). */
export function suonaInVista(app) {
  return vistaLarga() || app.stato.leggi().scheda === "riproduzione";
}

/** fn(larga) quando si passa da una disposizione all'altra (rotazione, finestra del PC). */
export function seCambiaLarghezza(fn) {
  ascoltatoriLarghezza.add(fn);
}

/** Apre una scheda (cerca, generi, playlist, riproduzione, impostazioni). */
export function vaiA(app, scheda) {
  if (scheda === "riproduzione" && vistaLarga()) return; // Suona è già in vista, a sinistra
  app.stato.cambia({ scheda });
}

// Le pagine degli artisti si raggiungono da Cerca: lì resta giù il tasto della barra.
const TASTO_DI = { artista: "cerca", artisti: "cerca" };

// Quale sezione si vede, quale tasto della barra è giù e, sul telefono, se si vede Suona.
function mostraScheda(s) {
  const larga = vistaLarga();
  if (s.scheda && s.scheda !== "riproduzione") ultimaSezione = s.scheda;
  const sezione = s.scheda === "riproduzione" ? ultimaSezione : s.scheda;
  $("#app").dataset.vista = !larga && s.scheda === "riproduzione" ? "suona" : "sezioni";
  const attiva = larga ? sezione : s.scheda;
  for (const b of $$("[data-tab]")) {
    if (b.dataset.tab === (TASTO_DI[attiva] ?? attiva)) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  for (const sez of $$(".hf-schermo")) sez.hidden = sez.dataset.schermo !== sezione;
}

/** I tasti delle sezioni e le schermate che si mostrano. Da chiamare prima delle viste. */
export function collegaSchede(app) {
  for (const btn of $$("[data-tab]")) btn.addEventListener("click", () => vaiA(app, btn.dataset.tab));
  app.stato.ascolta((cambiati, s) => {
    if (cambiati.includes("scheda")) mostraScheda(s);
  });
  larghezza().addEventListener("change", () => {
    const s = app.stato.leggi();
    // Diventato largo mentre si guardava Suona: a destra torna l'ultima sezione (lo stato cambia,
    // e chi la disegna se ne accorge).
    if (vistaLarga() && s.scheda === "riproduzione") app.stato.cambia({ scheda: ultimaSezione });
    else mostraScheda(s);
    for (const fn of ascoltatoriLarghezza) fn(vistaLarga());
  });
}

// ------------------------------------------- pezzi comuni di Filtri e Costruttore ----
const PIATTAFORME = [
  ["sp", "Spotify"],
  ["yt", "YouTube"],
  ["sc", "SoundCloud"],
  ["lo", "File"],
];

/** Una scelta da spuntare (un tasto con il LED): `campo` e `valore` finiscono sulla casella. */
export function casellaScelta(campo, valore, nome, spuntata) {
  return `<label class="hf-scelta-casella"><input type="checkbox" data-campo="${esc(campo)}" value="${esc(valore)}"${spuntata ? " checked" : ""}><span class="hf-scelta-tasto"><span class="hf-led"></span>${esc(nome)}</span></label>`;
}

/** Le scelte delle piattaforme, spuntate quelle in `scelte`. */
export function chipPiattaforme(scelte) {
  return PIATTAFORME.map(([cod, nome]) => casellaScelta("piattaforme", cod, nome, scelte?.includes(cod))).join("");
}

export function leggiChipPiattaforme(el) {
  return $$('input[data-campo="piattaforme"]:checked', el).map((i) => i.value);
}

// Scelte delle voci di genere: il valore è la posizione della voce; spuntata se tutti i suoi
// indici sono nella lista.
export function chipGeneri(voci, indici) {
  const scelte = new Set(vociSelezionate(voci, indici).map((v) => v.nome));
  return voci.map((v, i) => casellaScelta("macro", i, v.nome, scelte.has(v.nome))).join("");
}

export function leggiChipGeneri(el, voci) {
  return $$('input[data-campo="macro"]:checked', el).flatMap((i) => voci[Number(i.value)].indici);
}

/** Una riga "etichetta: min – max" (BPM, anno, energia). Gli id sono `${id}-min` e `${id}-max`. */
export function campoMinMax(id, etichetta, valori, attributi = "") {
  const campo = (lato, i) =>
    `<input id="${id}-${lato}" class="hf-campo hf-corto" type="number"${attributi ? ` ${attributi}` : ""} placeholder="${lato}" aria-label="${esc(etichetta)}, ${lato === "min" ? "da" : "a"}" value="${valori?.[i] ?? ""}">`;
  return `<div class="hf-campo-riga"><span class="hf-etichetta-campo" id="${id}-etichetta">${esc(etichetta)}</span><div class="hf-minmax" role="group" aria-labelledby="${id}-etichetta">${campo("min", 0)}<span aria-hidden="true">–</span>${campo("max", 1)}</div></div>`;
}

/** Il valore di un campo min–max: [min, max] (uno dei due può mancare) o undefined se vuoti. */
export function leggiMinMax(el, id) {
  const num = (lato) => {
    const v = $(`#${id}-${lato}`, el).value;
    return v === "" ? undefined : Number(v);
  };
  const min = num("min");
  const max = num("max");
  return min === undefined && max === undefined ? undefined : [min, max];
}

/** Un elenco "a, b, c" in maiuscolo (le tonalità Camelot). */
export function leggiElenco(el, sel) {
  return $(sel, el)
    .value.split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}
