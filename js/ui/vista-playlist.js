// vista-playlist.js — la scheda Playlist: un vano per playlist nel cassetto (nome, quanti brani e con
// che cosa suonerebbe, regole in breve, FILE se è tenuta sul telefono) e i tasti per crearne di
// nuove. Il vano apre il foglio della playlist; il suo ▶ passa la playlist alla sessione.

import { segna } from "../nucleo/diagnostica.js";
import { vociSelezionate } from "../nucleo/generi.js";
import { $, esc, mostraAvviso, NOMI_MOTORE, NOMI_ORDINE_PL, NOMI_PIATT, SVG_PLAY, vaiA } from "./base.js";
import { nuovaManuale } from "./azioni-playlist.js";
import { apriCostruttore } from "./costruttore-playlist.js";
import { apriFoglioPlaylist } from "./foglio-playlist.js";
import { statoVuoto } from "./riga-brano.js";

const DIPENDENZE = ["scheda", "catalogo", "playlist", "ctx"];

export function collegaPlaylist(app) {
  $("#pl-nuova-intelligente").addEventListener("click", () => apriCostruttore(app, null));
  $("#pl-nuova-manuale").addEventListener("click", async () => {
    if (await nuovaManuale(app)) mostraAvviso("Playlist creata.", "ok");
  });
  // Un solo ascoltatore per tutti i vani.
  $("#playlist-lista").addEventListener("click", (e) => {
    if (e.target.closest?.("[data-azione-vuoto]")) {
      apriCostruttore(app, null); // lo stato vuoto: "Crea la prima playlist"
      return;
    }
    const tasto = e.target.closest?.(".hf-vano-corpo, .hf-vano-azione");
    const vano = tasto?.closest(".hf-vano");
    if (!vano) return;
    const p = app.stato.leggi().playlist.find((x) => x.id === vano.dataset.id);
    if (!p) return;
    if (tasto.classList.contains("hf-vano-corpo")) apriFoglioPlaylist(app, p);
    else if (app.sessione.avviaPlaylist(p, app.stato.calcola(p).elenco)) vaiA(app, "riproduzione");
  });
  app.stato.ascolta((cambiati, s) => {
    if (s.scheda === "playlist" && cambiati.some((k) => DIPENDENZE.includes(k))) disegnaPlaylist(app);
  });
}

function vanoPlaylist(app, p, i) {
  const { ctx } = app.stato.leggi();
  const { elenco, piano } = app.stato.calcola(p); // conservato: la seconda apertura non ricalcola
  const consigliato = piano.consigliato ? NOMI_MOTORE[piano.consigliato].toLowerCase() : "nessuna fonte disponibile";
  const sulTelefono = p.telefono ? ` · ${elenco.filter((b) => ctx.fileIds.has(b.id)).length} sul telefono` : "";
  const riga = elenco.length
    ? `${elenco.length.toLocaleString("it-IT")} dischi · ${consigliato}${sulTelefono}`
    : "Vuota · aggiungi dischi dalla ricerca";
  const regole = riassuntoRegole(app, p).join(" · ");
  return `<li class="hf-vano${elenco.length ? " hf-con-azione" : ""}" data-id="${esc(p.id)}">
      <span class="hf-vano-num" aria-hidden="true">${i + 1}</span>
      <button class="hf-vano-corpo" type="button" aria-label="Apri la playlist ${esc(p.nome)}">
        <span class="hf-vano-titolo">${esc(p.nome)}</span>
        <span class="hf-vano-artista">${esc(riga)}</span>
        ${regole ? `<span class="hf-vano-nota">${esc(regole)}</span>` : ""}
      </button>
      <span class="hf-vano-dati">${p.telefono ? `<span class="hf-vano-file" aria-hidden="true">FILE</span>` : ""}</span>
      ${elenco.length ? `<button class="hf-tasto hf-piccolo hf-vano-azione" type="button" aria-label="Avvia ${esc(p.nome)}">${SVG_PLAY}</button>` : ""}
    </li>`;
}

export function disegnaPlaylist(app) {
  const { catalogo, playlist } = app.stato.leggi();
  if (!catalogo) return;
  const inizio = performance.now();
  const n = playlist.length;
  $("#playlist-sotto").textContent = n ? `${n} · quelle coi filtri si aggiornano da sole` : "";
  $("#playlist-lista").innerHTML =
    playlist.map((p, i) => vanoPlaylist(app, p, i)).join("") ||
    statoVuoto({ testo: "Nessuna playlist ancora.", azione: { etichetta: "Crea la prima playlist" } });
  segna("playlist", performance.now() - inizio, `${n} playlist`);
}

// Le regole di una playlist in poche parole leggibili (per il vano).
function riassuntoRegole(app, p) {
  if (p.tipo === "manuale") return ["scelti a mano"];
  const r = p.regole || {};
  const intervallo = (x, unita = "") => (x ? `${x[0] ?? "…"}–${x[1] ?? "…"}${unita}` : "");
  return [
    ...vociSelezionate(app.stato.leggi().voci, r.macro).map((v) => v.nome),
    ...(r.piattaforme || []).map((c) => NOMI_PIATT[c] || c),
    ...(r.tipi || []),
    r.testo ? `"${r.testo}"` : "",
    intervallo(r.bpm, " BPM"),
    intervallo(r.anno),
    r.camelot?.length ? r.camelot.join(" ") : "",
    r.artisti?.length ? `${r.artisti.length} artisti` : "",
    r.soloSchermoSpento ? "schermo spento" : "",
    NOMI_ORDINE_PL[p.ordine] || "",
    p.limite ? `max ${p.limite}` : "",
  ].filter(Boolean);
}
