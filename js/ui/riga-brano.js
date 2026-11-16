// riga-brano.js — la "targhetta" di un brano nelle liste (codice di selezione, titolo, fascia
// con l'artista, riga di dati, tasto ▶) e le liste che le contengono. Ogni lista ha UN solo
// ascoltatore di tocchi: il corpo della riga apre la scheda del brano, il tasto ▶ passa alla
// sessione, che decide cosa suonare.

import { voceDi } from "../nucleo/generi.js";
import { sottotitolo, titoloCompleto } from "../nucleo/testo.js";
import { $, $$, classeFascia, codiceSelezione, esc, SIGLA_PIATT, SVG_PLAY } from "./base.js";
import { apriFoglioBrano } from "./foglio-brano.js";

/** Il nome del genere come lo mostra il jukebox (house e techno → "Tech house"). */
export function nomeGenere(voci, g) {
  const v = voceDi(voci, g);
  return v < 0 ? "" : voci[v].nome;
}

/** Quello che serve per disegnare le righe: chi suona adesso e lo stato del telefono. */
function datiRighe(app, s = app.sessione.stato()) {
  const { ctx, voci } = app.stato.leggi();
  return { inCorso: s.inCorso, interno: s.interno, suona: s.lettore === "suona", ctx, voci };
}

function iconaInCorso(d) {
  if (d.interno && !d.suona) return SVG_PLAY;
  return `<span class="eq${d.interno ? " attivo" : ""}" aria-hidden="true"><i></i><i></i><i></i></span>`;
}

function etichettaInCorso(d) {
  if (!d.interno) return "Riapri nell'app esterna";
  return d.suona ? "Pausa" : "Riprendi";
}

// Targhetta del brano: codice di selezione, titolo a macchina, fascia con
// l'artista, riga di dati. Il corpo apre la scheda, il tasto tondo suona.
function rigaBrano(b, i, d, { grande = false, play = true } = {}) {
  const piatt = [...new Set(b.s.map(([c]) => SIGLA_PIATT[c] || c))].join(" ");
  const meta = [b.b ? `${Math.round(b.b)} BPM` : "", b.c || "", nomeGenere(d.voci, b.g), b.y || "", piatt]
    .filter(Boolean)
    .join(" · ");
  const inCorso = b.id === d.inCorso;
  const spento = d.ctx.soloJukebox && !d.ctx.fileIds.has(b.id); // "Solo Jukebox": non è sul telefono
  return `<div class="striscia${grande ? " grande" : ""}${inCorso ? " in-corso" : ""}${spento ? " senza-file" : ""}" data-id="${esc(b.id)}">
      <button class="striscia-corpo" type="button" aria-label="${esc(`${titoloCompleto(b)} di ${b.a || "artista sconosciuto"}`)}: apri la scheda">
        <span class="striscia-codice" aria-hidden="true">${codiceSelezione(i)}</span>
        <span class="striscia-testo">
          <span class="striscia-titolo">${esc(titoloCompleto(b))}</span>
          <span class="striscia-fascia ${classeFascia(voceDi(d.voci, b.g))}">${esc(sottotitolo(b))}</span>
          <span class="striscia-meta">${esc(meta)}</span>
        </span>
      </button>
      ${play ? `<button class="striscia-play" type="button" aria-label="${inCorso ? etichettaInCorso(d) : `Suona ${esc(titoloCompleto(b))}`}">${inCorso ? iconaInCorso(d) : SVG_PLAY}</button>` : ""}
    </div>`;
}

// Per ogni contenitore: le righe mostrate e il loro contesto. Il contenitore ha un solo
// ascoltatore, che legge da qui la lista attuale (cambia a ogni disegno).
const liste = new WeakMap();

/**
 * Disegna una lista di brani in `contenitore`.
 * contesto: {lista, nome} = la lista da cui suonare ("suona da qui"), oppure {coda: true} per
 * le righe della coda attuale (lì ▶ salta a quel brano).
 * opzioni: inizio (numero del primo codice di selezione), grande, play, vuoto (frase se non ci
 * sono righe).
 */
export function mostraLista(app, contenitore, righe, contesto, opzioni = {}) {
  const d = datiRighe(app);
  const inizio = opzioni.inizio ?? 0;
  contenitore.innerHTML =
    righe.map((b, i) => rigaBrano(b, inizio + i, d, opzioni)).join("") ||
    (opzioni.vuoto ? `<p class="vuoto muted">${esc(opzioni.vuoto)}</p>` : "");
  if (!liste.has(contenitore)) collegaLista(app, contenitore);
  liste.set(contenitore, { righe, contesto });
}

function collegaLista(app, contenitore) {
  contenitore.addEventListener("click", (e) => {
    const tasto = e.target.closest?.(".striscia-corpo, .striscia-play");
    const riga = tasto?.closest(".striscia");
    const lista = liste.get(contenitore);
    if (!riga || !lista || !contenitore.contains(riga)) return;
    const b = lista.righe.find((x) => x.id === riga.dataset.id) || app.stato.brano(riga.dataset.id);
    if (!b) return;
    const { contesto } = lista;
    if (tasto.classList.contains("striscia-corpo")) apriFoglioBrano(app, b, contesto);
    else if (contesto.coda) app.sessione.premiRiga(b, { coda: true });
    else app.sessione.premiRiga(b, { lista: contesto.lista || lista.righe, nome: contesto.nome });
  });
}

// Aggiorna l'evidenziazione del brano in corso in tutte le liste visibili, senza ridisegnarle.
let ultimaChiave = null;
export function aggiornaEvidenziati(app, s = app.sessione.stato()) {
  const chiave = `${s.inCorso}|${s.lettore}`;
  if (chiave === ultimaChiave) return;
  ultimaChiave = chiave;
  const d = datiRighe(app, s);
  for (const el of $$(".striscia")) {
    const on = el.dataset.id === s.inCorso;
    el.classList.toggle("in-corso", on);
    const btn = $(".striscia-play", el);
    if (!btn) continue;
    btn.innerHTML = on ? iconaInCorso(d) : SVG_PLAY;
    if (on) btn.setAttribute("aria-label", etichettaInCorso(d));
  }
}
