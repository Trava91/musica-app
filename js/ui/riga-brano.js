// riga-brano.js — il vano di un brano nei cassetti (numero, titolo, artista, dati, segno FILE per i
// brani sul telefono, tasto ▶) e le liste che li contengono. Ogni lista ha UN solo ascoltatore di
// tocchi: il vano apre la scheda del brano, il tasto ▶ passa alla sessione, che decide cosa suonare.

import { voceDi } from "../nucleo/generi.js";
import { motivoSenzaMotore, motoreBrano } from "../nucleo/motori.js";
import { durataFmt, sottotitolo, titoloCompleto } from "../nucleo/testo.js";
import { $, $$, esc, SIGLA_PIATT, SVG_APRI, SVG_CHIUDI, SVG_PAUSA, SVG_PLAY } from "./base.js";
import { apriFoglioBrano } from "./foglio-brano.js";
import { apriMenuCoda } from "./menu-coda.js";

/** Il nome del genere come lo mostra il jukebox (house e techno → "Tech house"). */
export function nomeGenere(voci, g) {
  const v = voceDi(voci, g);
  return v < 0 ? "" : voci[v].nome;
}

/** Quello che serve per disegnare i vani: chi suona adesso e lo stato del telefono. */
function datiRighe(app, s = app.sessione.stato()) {
  const { ctx, voci } = app.stato.leggi();
  return { inCorso: s.inCorso, interno: s.interno, suona: s.lettore === "suona", ctx, voci };
}

// Il tasto ▶ del brano in corso: pausa se suona, riprendi se è in pausa, "riapri" se è in un'app esterna.
function iconaInCorso(d) {
  if (!d.interno) return SVG_APRI;
  return d.suona ? SVG_PAUSA : SVG_PLAY;
}

function etichettaInCorso(d) {
  if (!d.interno) return "Riapri nell'app esterna";
  return d.suona ? "Pausa" : "Riprendi";
}

// La larghezza del numero dei vani: la stessa per tutto il cassetto, quanto serve al numero più alto
// (fino a 99 basta quella di sempre).
const CIFRA_PX = 13;
export function allargaNumeri(contenitore, massimo) {
  const cifre = String(Math.max(1, massimo)).length;
  contenitore.style.setProperty("--hf-vano-num", `${Math.max(40, 14 + cifre * CIFRA_PX)}px`);
}

// Le due azioni in più di un vano: il "+" (menu «Suona dopo» / «In fondo alla coda») e, nel cassetto
// «A seguire», la ✕ che toglie il brano dalla coda.
const SVG_PIU = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;

// Il vano del brano: numero, titolo, artista, i dati in piccolo, FILE e durata a destra, il tasto ▶ e
// la seconda azione (+ o ✕). `nellaCoda`: il vano sta in «A seguire».
function rigaBrano(b, n, d, { play = true, nellaCoda = false } = {}) {
  const piatt = [...new Set(b.s.map(([c]) => SIGLA_PIATT[c] || c))].join(" ");
  const meta = [b.b ? `${Math.round(b.b)} BPM` : "", b.c || "", nomeGenere(d.voci, b.g), b.y || "", piatt]
    .filter(Boolean)
    .join(" · ");
  const inCorso = b.id === d.inCorso;
  const file = Boolean(d.ctx.fileIds?.has(b.id));
  // Spento se con le impostazioni di adesso nessun motore lo può suonare ("Solo Jukebox" e non è
  // sul telefono, file del PC non ancora importato...): il tasto ▶ spiega perché.
  const spento = !motoreBrano(b, d.ctx).motore;
  const etichettaPlay = spento
    ? `${titoloCompleto(b)}: non si può suonare. ${motivoSenzaMotore(b, d.ctx)}`
    : `Suona ${titoloCompleto(b)}`;
  const classi = [
    "hf-vano",
    play ? "hf-con-azione hf-con-seconda" : "",
    inCorso ? "hf-in-corso" : "",
    spento ? "hf-spento" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const tasto = play
    ? `<button class="hf-tasto hf-piccolo hf-vano-azione" type="button" data-etichetta="${esc(etichettaPlay)}" aria-label="${esc(inCorso ? etichettaInCorso(d) : etichettaPlay)}"${spento && !inCorso ? ` aria-disabled="true" title="${esc(motivoSenzaMotore(b, d.ctx))}"` : ""}>${inCorso ? iconaInCorso(d) : SVG_PLAY}</button>`
    : "";
  const seconda = !play
    ? ""
    : nellaCoda
      ? `<button class="hf-tasto hf-piccolo hf-vano-seconda" type="button" data-azione="togli" aria-label="${esc(`Togli ${titoloCompleto(b)} dalla coda`)}">${SVG_CHIUDI}</button>`
      : `<button class="hf-tasto hf-piccolo hf-vano-seconda" type="button" data-azione="coda" aria-label="${esc(`Metti ${titoloCompleto(b)} in coda`)}">${SVG_PIU}</button>`;
  return `<li class="${classi}" data-id="${esc(b.id)}">
      <span class="hf-vano-num" aria-hidden="true">${n}</span>
      <button class="hf-vano-corpo" type="button">
        <span class="hf-vano-titolo">${esc(titoloCompleto(b))}</span>
        <span class="hf-vano-artista">${esc(sottotitolo(b))}</span>
        ${meta ? `<span class="hf-vano-nota">${esc(meta)}</span>` : ""}
        <span class="hf-sr">${file ? ". Sul telefono" : ""}. Apri la scheda</span>
      </button>
      <span class="hf-vano-dati">${file ? `<span class="hf-vano-file" aria-hidden="true">FILE</span>` : ""}${b.d ? `<span class="hf-vano-durata">${durataFmt(b.d)}</span>` : ""}</span>
      ${tasto}${seconda}
    </li>`;
}

// Per ogni contenitore: le righe mostrate e il loro contesto. Il contenitore ha un solo
// ascoltatore, che legge da qui la lista attuale (cambia a ogni disegno).
const liste = new WeakMap();

/**
 * Disegna una lista di brani in `contenitore` (un <ol class="hf-cassetto">).
 * contesto: {lista, nome} = la lista da cui suonare ("suona da qui"), oppure {coda: true} per
 * le righe della coda attuale (lì ▶ salta a quel brano).
 * opzioni: inizio (quanti vani ci sono prima: il primo si numera inizio + 1), play (il tasto ▶),
 * vuoto (cosa mostrare se non ci sono righe: una frase, oppure { testo, azione: { etichetta, fai } }
 * con un tasto).
 */
export function mostraLista(app, contenitore, righe, contesto, opzioni = {}) {
  const d = datiRighe(app);
  const inizio = opzioni.inizio ?? 0;
  allargaNumeri(contenitore, inizio + righe.length);
  contenitore.innerHTML =
    righe.map((b, i) => rigaBrano(b, inizio + i + 1, d, { ...opzioni, nellaCoda: Boolean(contesto.coda) })).join("") ||
    statoVuoto(opzioni.vuoto);
  if (!liste.has(contenitore)) collegaLista(app, contenitore);
  liste.set(contenitore, { righe, contesto, azioneVuoto: opzioni.vuoto?.azione?.fai });
}

/**
 * "Mostra altri": aggiunge in fondo a una lista già disegnata le righe nuove, senza ridisegnare
 * quelle di prima. `inizio` = quante righe ci sono prima della prima nuova (per il numero del vano).
 * Il contesto della lista (da dove suonare) resta quello di mostraLista.
 */
export function aggiungiLista(app, contenitore, nuove, inizio) {
  const lista = liste.get(contenitore);
  if (!lista || !nuove.length) return;
  const d = datiRighe(app);
  allargaNumeri(contenitore, inizio + nuove.length);
  const nellaCoda = Boolean(lista.contesto.coda);
  contenitore.insertAdjacentHTML(
    "beforeend",
    nuove.map((b, i) => rigaBrano(b, inizio + i + 1, d, { nellaCoda })).join(""),
  );
  lista.righe = lista.righe.concat(nuove);
}

/**
 * Lo "stato vuoto" di una lista: una frase e, se c'è, un tasto per uscirne. `tag` = "li" dentro un
 * cassetto, "div" altrove.
 */
export function statoVuoto(vuoto, tag = "li") {
  if (!vuoto) return "";
  const { testo, azione } = typeof vuoto === "string" ? { testo: vuoto, azione: null } : vuoto;
  return `<${tag} class="hf-stato-vuoto"><p>${esc(testo)}</p>${azione ? `<button class="hf-tasto" type="button" data-azione-vuoto>${esc(azione.etichetta)}</button>` : ""}</${tag}>`;
}

function collegaLista(app, contenitore) {
  contenitore.addEventListener("click", (e) => {
    if (e.target.closest?.("[data-azione-vuoto]")) {
      liste.get(contenitore)?.azioneVuoto?.();
      return;
    }
    const tasto = e.target.closest?.(".hf-vano-corpo, .hf-vano-azione, .hf-vano-seconda");
    const riga = tasto?.closest(".hf-vano");
    const lista = liste.get(contenitore);
    if (!riga || !lista || !contenitore.contains(riga)) return;
    const b = lista.righe.find((x) => x.id === riga.dataset.id) || app.stato.brano(riga.dataset.id);
    if (!b) return;
    const { contesto } = lista;
    if (tasto.classList.contains("hf-vano-corpo")) apriFoglioBrano(app, b, contesto);
    else if (tasto.classList.contains("hf-vano-seconda")) {
      if (tasto.dataset.azione === "togli") app.sessione.togli(b.id);
      else apriMenuCoda(app, b);
    } else if (contesto.coda) app.sessione.premiRiga(b, { coda: true });
    else app.sessione.premiRiga(b, { lista: contesto.lista || lista.righe, nome: contesto.nome });
  });
}

// Aggiorna il brano in corso in tutte le liste visibili, senza ridisegnarle.
let ultimaChiave = null;
export function aggiornaEvidenziati(app, s = app.sessione.stato()) {
  const chiave = `${s.inCorso}|${s.lettore}|${s.interno}`;
  if (chiave === ultimaChiave) return;
  ultimaChiave = chiave;
  const d = datiRighe(app, s);
  for (const el of $$(".hf-vano[data-id]")) {
    const on = el.dataset.id === s.inCorso;
    el.classList.toggle("hf-in-corso", on);
    const btn = $(".hf-vano-azione", el);
    if (!btn) continue;
    btn.innerHTML = on ? iconaInCorso(d) : SVG_PLAY;
    btn.setAttribute("aria-label", on ? etichettaInCorso(d) : btn.dataset.etichetta || "Suona");
  }
}
