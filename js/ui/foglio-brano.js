// foglio-brano.js — la scheda di un brano (dati, dove si trova, altri brani dello stesso
// artista) e il foglio "Aggiungi a playlist". "Suona", "Suona dopo", "In fondo alla coda" e "Apri"
// passano alla sessione; "Vai all'artista" e "Vai al genere" portano alle loro pagine.

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
  testaFinestra,
} from "./base.js";
import { nuovaManuale, salvaPlaylist } from "./azioni-playlist.js";
import { mostraLista, nomeGenere } from "./riga-brano.js";
import { artistiDi, vaiAArtista } from "./vista-artisti.js";
import { vaiAGenere } from "./vista-generi.js";

/**
 * Apre la scheda del brano `b`. contesto: da dove è stato aperto ({lista, nome} o {coda: true}),
 * per sapere cosa suonare con "Suona".
 */
export function apriFoglioBrano(app, b, contesto = {}) {
  const el = $("#foglio-brano");
  const { catalogo, ctx, voci } = app.stato.leggi();
  const { motore } = motori.motoreBrano(b, ctx);
  // "Dove si trova": una riga per fonte, con la sigla e il tasto Apri (il file sul telefono si legge e basta).
  const fonti = b.s
    .map(([cod, rif]) => {
      const azione =
        cod === "lo"
          ? `<span class="hf-fonte-file">${esc(rif)}</span>`
          : `<button class="hf-tasto" type="button" data-cod="${esc(cod)}" data-rif="${esc(rif)}" aria-label="Apri su ${esc(NOMI_PIATT[cod] || cod)}">Apri</button>`;
      return `<li><span class="hf-fonti-nome"><span class="hf-sigla" aria-hidden="true">${esc(SIGLA_PIATT[cod] || cod)}</span>${esc(NOMI_PIATT[cod] || cod)}</span>${azione}</li>`;
    })
    .join("");
  const haArtista = Boolean(b._normA && artistiDi(app).perId.has(b._normA)); // ha una pagina (brani scelti)
  const vociGenere = voci.filter((v) => v.indici.includes(b.g));
  const altriArtista = cercaMod
    .perArtista(catalogo.brani, b._normA)
    .filter((x) => x.id !== b.id)
    .slice(0, 8);
  const dati = [
    b.y,
    durataFmt(b.d),
    b.b ? `${Math.round(b.b)} bpm` : "",
    b.c,
    b.e !== undefined ? `energia ${b.e.toFixed(2)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  el.innerHTML = `<div class="hf-frontale">
      ${testaFinestra("foglio-titolo", titoloCompleto(b), "foglio-chiudi")}
      <div class="hf-finestra-corpo">
        <div class="hf-scheda-dati">
          <p class="hf-scheda-artista">${esc(sottotitolo(b))}</p>
          ${b.g !== undefined ? `<p class="hf-nota">${esc(nomeGenere(voci, b.g))}${b.gf ? ` — ${esc(b.gf)}` : ""}</p>` : ""}
          ${dati ? `<p class="hf-nota">${esc(dati)}</p>` : ""}
        </div>
        <div class="hf-azioni">
          <button class="hf-tasto hf-principale" type="button" id="foglio-suona">▶ Suona${motore ? ` (${esc(NOMI_MOTORE[motore] || motore)})` : ""}</button>
          <button class="hf-tasto" type="button" id="foglio-aggiungi">+ Playlist</button>
        </div>
        <div class="hf-azioni">
          <button class="hf-tasto" type="button" id="foglio-dopo">Suona dopo</button>
          <button class="hf-tasto" type="button" id="foglio-fondo">In fondo alla coda</button>
        </div>
        ${
          haArtista || vociGenere.length
            ? `<div class="hf-azioni">
          ${haArtista ? `<button class="hf-tasto" type="button" id="foglio-artista" aria-label="${esc(`Vai all'artista ${b.a}`)}">Vai all'artista</button>` : ""}
          ${vociGenere.length ? `<button class="hf-tasto" type="button" id="foglio-genere" aria-label="${esc(`Vai al genere ${vociGenere[0].nome}`)}">Vai al genere</button>` : ""}
        </div>`
            : ""
        }
        <div class="hf-parte"><h3 class="hf-titoletto">Dove si trova</h3><ul class="hf-fonti">${fonti}</ul></div>
        ${altriArtista.length ? `<div class="hf-parte"><h3 class="hf-titoletto">Altri di ${esc(b.a)}</h3><ol class="hf-cassetto" id="foglio-altri-artista"></ol></div>` : ""}
      </div>
    </div>`;
  $("#foglio-chiudi").addEventListener("click", () => chiudiFinestra("foglio-overlay"));
  $("#foglio-suona").addEventListener("click", () => {
    chiudiFinestra("foglio-overlay");
    if (contesto.coda) app.sessione.premiRiga(b, { coda: true });
    else app.sessione.suonaLista(contesto.lista || [b], b, contesto.nome || "Brano singolo");
  });
  $("#foglio-aggiungi").addEventListener("click", () => apriAggiungiAPlaylist(app, b));
  // Il feedback («suona dopo», «in fondo alla coda») lo dà la sessione con un avviso, sopra la finestra.
  $("#foglio-dopo").addEventListener("click", () => app.sessione.accoda(b, { dopoCorrente: true }));
  $("#foglio-fondo").addEventListener("click", () => app.sessione.accoda(b));
  $("#foglio-artista")?.addEventListener("click", () => {
    chiudiFinestra("foglio-overlay");
    vaiAArtista(app, b._normA);
  });
  $("#foglio-genere")?.addEventListener("click", () => {
    chiudiFinestra("foglio-overlay");
    vaiAGenere(app, vociGenere[0].indici, { svuotaTesto: true });
  });
  for (const btn of $$("button[data-cod]", el)) {
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
  const vani = manuali
    .map(
      (p, i) => `<li class="hf-vano">
        <span class="hf-vano-num" aria-hidden="true">${i + 1}</span>
        <button class="hf-vano-corpo" type="button" data-id="${esc(p.id)}">
          <span class="hf-vano-titolo">${esc(p.nome)}</span><span class="hf-vano-artista">${(p.brani || []).length} brani</span>
        </button>
        <span class="hf-vano-dati"></span>
      </li>`,
    )
    .join("");
  el.innerHTML = `<div class="hf-frontale">
      ${testaFinestra("agg-titolo", "Aggiungi a…", "agg-chiudi")}
      <div class="hf-finestra-corpo">
        ${manuali.length ? `<ol class="hf-cassetto">${vani}</ol>` : `<p>Non hai ancora playlist fatte a mano.</p>`}
        <button class="hf-tasto hf-tutto" type="button" id="agg-nuova">+ Nuova playlist con questo brano</button>
      </div>
    </div>`;
  const chiudi = () => chiudiFinestra("aggiungi-overlay");
  $("#agg-chiudi").addEventListener("click", chiudi);
  for (const r of $$(".hf-vano-corpo", el)) {
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
