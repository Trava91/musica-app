// base.js — gli aiuti comuni dell'interfaccia: trovare gli elementi, ripulire il testo, avvisi,
// finestre, schede, e i pezzi che si ripetevano tra "Filtri" e "Costruttore playlist" (campo
// min–max, chip di piattaforme e generi). Solo disegno: nessuna decisione su cosa suonare
// (quella è di nucleo/sessione.js).
//
// Ogni vista riceve `app` = { stato, sessione, android, avvia, aggiornaDati } da main.js.

import { DURATA_AVVISO_MS } from "../config.js";
import { vociSelezionate } from "../nucleo/generi.js";

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
// Dove suona il brano, per il mini lettore e la scheda Suona.
export const NOMI_DOVE = {
  file: "nel Jukebox",
  "spotify-premium": "in Spotify",
  newpipe: "in NewPipe",
  "spotify-app": "in Spotify",
  web: "sul web",
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
export const SVG_PLAY = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>`;
export const SVG_PAUSA = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>`;

// Codice di selezione come sui jukebox (A1…A9, B1…): solo decorativo, dipende
// dalla posizione nella lista mostrata.
export function codiceSelezione(i) {
  return String.fromCharCode(65 + (Math.floor(i / 9) % 26)) + ((i % 9) + 1);
}

// Colore della fascia dell'artista: fisso per voce di genere (vedi generi.js),
// così la lista "suona" a colori e tutta la Tech house ha lo stesso colore.
export function classeFascia(voce) {
  return voce < 0 ? "f-neutra" : ["f-rosso", "f-blu", "f-ambra"][voce % 3];
}

// --------------------------------------------------------------------- avvisi ----
let timerAvviso = null;

/** Un avviso in basso. tipo: "" | "ok" | "err"; opts: {duration, actionLabel, onAction}. */
export function mostraAvviso(msg, type = "", opts = {}) {
  const t = $("#toast");
  clearTimeout(timerAvviso);
  t.innerHTML = "";
  const span = document.createElement("span");
  span.textContent = msg;
  t.appendChild(span);
  if (opts.actionLabel) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = opts.actionLabel;
    btn.addEventListener("click", () => {
      t.hidden = true;
      clearTimeout(timerAvviso);
      opts.onAction?.();
    });
    t.appendChild(btn);
  }
  t.className = `toast${type ? ` ${type}` : ""}`;
  t.hidden = false;
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
// esistono e la sessione passa il link web.
export function apriLink(url) {
  if (!url) return;
  if (url.startsWith("intent://")) window.location.href = url;
  else window.open(url, "_blank", "noopener");
}

// -------------------------------------------------------------------- finestre ----
export function apriFinestra(id) {
  $(`#${id}`).hidden = false;
}

export function chiudiFinestra(id) {
  $(`#${id}`).hidden = true;
}

/** Un tocco fuori dal foglio chiude la finestra. Da chiamare una volta all'avvio. */
export function collegaFinestre() {
  for (const ov of $$(".overlay")) {
    ov.addEventListener("click", (e) => {
      if (e.target === ov) ov.hidden = true;
    });
  }
}

// ---------------------------------------------------------------------- schede ----
/** Apre una scheda (cerca, generi, playlist, riproduzione, impostazioni). */
export function vaiA(app, scheda) {
  app.stato.cambia({ scheda });
}

/** I tasti delle schede in basso e le sezioni che si mostrano. Da chiamare prima delle viste. */
export function collegaSchede(app) {
  for (const btn of $$(".tab")) btn.addEventListener("click", () => vaiA(app, btn.dataset.tab));
  app.stato.ascolta((cambiati, s) => {
    if (!cambiati.includes("scheda")) return;
    for (const b of $$(".tab")) b.classList.toggle("attivo", b.dataset.tab === s.scheda);
    for (const sez of $$(".schermo")) sez.hidden = sez.dataset.schermo !== s.scheda;
  });
}

// ------------------------------------------- pezzi comuni di Filtri e Costruttore ----
const PIATTAFORME = [
  ["sp", "Spotify"],
  ["yt", "YouTube"],
  ["sc", "SoundCloud"],
  ["lo", "File"],
];

/** Le chip delle piattaforme, accese quelle in `scelte`. */
export function chipPiattaforme(scelte) {
  return PIATTAFORME.map(
    ([cod, nome]) =>
      `<label class="chip"><input type="checkbox" data-campo="piattaforme" value="${cod}" ${scelte?.includes(cod) ? "checked" : ""}><span>${esc(nome)}</span></label>`,
  ).join("");
}

export function leggiChipPiattaforme(el) {
  return $$('input[data-campo="piattaforme"]:checked', el).map((i) => i.value);
}

// Chip delle voci di genere: il valore è la posizione della voce; accesa se tutti i suoi
// indici sono nella lista.
export function chipGeneri(voci, indici) {
  const scelte = new Set(vociSelezionate(voci, indici).map((v) => v.nome));
  return voci
    .map(
      (v, i) =>
        `<label class="chip"><input type="checkbox" data-campo="macro" value="${i}" ${scelte.has(v.nome) ? "checked" : ""}><span>${esc(v.nome)}</span></label>`,
    )
    .join("");
}

export function leggiChipGeneri(el, voci) {
  return $$('input[data-campo="macro"]:checked', el).flatMap((i) => voci[Number(i.value)].indici);
}

/** Una riga "etichetta: min – max" (BPM, anno, energia). Gli id sono `${id}-min` e `${id}-max`. */
export function campoMinMax(id, etichetta, valori, attributi = "") {
  const campo = (lato, i) =>
    `<input id="${id}-${lato}" type="number"${attributi ? ` ${attributi}` : ""} placeholder="${lato}" value="${valori?.[i] ?? ""}">`;
  return `<div class="campo-riga"><span class="etichetta">${esc(etichetta)}</span><div class="doppio-range">${campo("min", 0)}<span>–</span>${campo("max", 1)}</div></div>`;
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
