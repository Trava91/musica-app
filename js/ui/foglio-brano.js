// foglio-brano.js — la scheda di un brano (dati, dove si trova, altri brani dello stesso
// artista) e il foglio "Aggiungi a playlist". "Suona" e "Apri" passano alla sessione.

import * as cercaMod from "../nucleo/cerca.js";
import * as motori from "../nucleo/motori.js";
import { durataFmt, sottotitolo, titoloCompleto } from "../nucleo/testo.js";
import {
  $,
  $$,
  apriFinestra,
  chiudiFinestra,
  esc,
  mostraAvviso,
  NOMI_MOTORE,
  NOMI_PIATT,
  SIGLA_PIATT,
} from "./base.js";
import { nuovaManuale, salvaPlaylist } from "./azioni-playlist.js";
import { mostraLista, nomeGenere } from "./riga-brano.js";

/**
 * Apre la scheda del brano `b`. contesto: da dove è stato aperto ({lista, nome} o {coda: true}),
 * per sapere cosa suonare con "Suona".
 */
export function apriFoglioBrano(app, b, contesto = {}) {
  const el = $("#foglio-brano");
  const { catalogo, ctx, voci } = app.stato.leggi();
  const { motore } = motori.motoreBrano(b, ctx);
  const fontiRighe = b.s
    .map(([cod, rif]) => {
      const azione =
        cod === "lo"
          ? `<span class="muted small">${esc(rif)}</span>`
          : `<button class="btn-secondary btn-apri" data-cod="${esc(cod)}" data-rif="${esc(rif)}">Apri</button>`;
      return `<div class="riga-fonte"><span><span class="sigla-piatt">${esc(SIGLA_PIATT[cod] || cod)}</span>${esc(NOMI_PIATT[cod] || cod)}</span>${azione}</div>`;
    })
    .join("");
  const altriArtista = cercaMod
    .perArtista(catalogo.brani, b._normA)
    .filter((x) => x.id !== b.id)
    .slice(0, 8);

  el.innerHTML = `
      <div class="foglio-intestazione">
        <h2>${esc(titoloCompleto(b))}</h2>
        <button class="foglio-chiudi" id="foglio-chiudi">✕</button>
      </div>
      <div class="campi-brano">
        <div>${esc(sottotitolo(b))}</div>
        ${b.g !== undefined ? `<div class="muted small">${esc(nomeGenere(voci, b.g))}${b.gf ? ` — ${esc(b.gf)}` : ""}</div>` : ""}
        <div class="muted small">${[b.y, durataFmt(b.d), b.b ? `${Math.round(b.b)} bpm` : "", b.c, b.e !== undefined ? `energia ${b.e.toFixed(2)}` : ""].filter(Boolean).join(" · ")}</div>
      </div>
      <div class="azioni-riga">
        <button class="btn-primary" id="foglio-suona">▶ Suona${motore ? ` (${esc(NOMI_MOTORE[motore] || motore)})` : ""}</button>
        <button class="btn-secondary" id="foglio-aggiungi">+ Playlist</button>
      </div>
      <div class="foglio-sezione"><h3>Dove si trova</h3>${fontiRighe}</div>
      ${altriArtista.length ? `<div class="foglio-sezione"><h3>Altri di ${esc(b.a)}</h3><div class="lista" id="foglio-altri-artista"></div></div>` : ""}
    `;
  $("#foglio-chiudi").addEventListener("click", () => chiudiFinestra("foglio-overlay"));
  $("#foglio-suona").addEventListener("click", () => {
    chiudiFinestra("foglio-overlay");
    if (contesto.coda) app.sessione.premiRiga(b, { coda: true });
    else app.sessione.suonaLista(contesto.lista || [b], b, contesto.nome || "Brano singolo");
  });
  $("#foglio-aggiungi").addEventListener("click", () => apriAggiungiAPlaylist(app, b));
  for (const btn of $$(".btn-apri", el)) {
    btn.addEventListener("click", () => app.sessione.apriFonte([btn.dataset.cod, btn.dataset.rif]));
  }
  if (altriArtista.length) {
    mostraLista(app, $("#foglio-altri-artista"), altriArtista, { lista: altriArtista, nome: `Brani di ${b.a}` });
  }
  apriFinestra("foglio-overlay");
}

/** Il foglio "Aggiungi a…": le playlist manuali, o una nuova con questo brano. */
function apriAggiungiAPlaylist(app, b) {
  const el = $("#aggiungi-a-playlist");
  const manuali = app.stato.leggi().playlist.filter((p) => p.tipo === "manuale");
  el.innerHTML = `
      <div class="foglio-intestazione"><h2>Aggiungi a…</h2><button class="foglio-chiudi" id="agg-chiudi">✕</button></div>
      ${
        manuali.length
          ? `<div class="lista">${manuali.map((p) => `<button class="riga" data-id="${esc(p.id)}"><div class="riga-testo"><div class="riga-titolo">${esc(p.nome)}</div><div class="riga-sotto">${(p.brani || []).length} brani</div></div></button>`).join("")}</div>`
          : `<p class="muted">Non hai ancora playlist manuali.</p>`
      }
      <button class="btn-secondary btn-blocco" id="agg-nuova">+ Nuova playlist manuale con questo brano</button>
    `;
  const chiudi = () => chiudiFinestra("aggiungi-overlay");
  $("#agg-chiudi").addEventListener("click", chiudi);
  for (const r of $$(".riga", el)) {
    r.addEventListener("click", async () => {
      const p = manuali.find((x) => x.id === r.dataset.id);
      const brani = p.brani || [];
      try {
        await salvaPlaylist(app, { ...p, brani: brani.includes(b.id) ? brani : [...brani, b.id] });
      } catch {
        return; // già detto da salvaPlaylist
      }
      mostraAvviso(`Aggiunto a "${p.nome}".`, "ok");
      chiudi();
    });
  }
  $("#agg-nuova").addEventListener("click", async () => {
    chiudi();
    const nuova = await nuovaManuale(app, { titolo: "Nuova playlist con questo brano", brani: [b.id] });
    if (nuova) mostraAvviso(`Playlist "${nuova.nome}" creata.`, "ok");
  });
  apriFinestra("aggiungi-overlay");
}
