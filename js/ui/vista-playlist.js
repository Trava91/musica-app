// vista-playlist.js — la scheda Playlist: un cartellino per playlist (nome, regole in breve,
// quanti brani e con che cosa suonerebbe) e i tasti per crearne di nuove. Il ▶ di un
// cartellino passa la playlist alla sessione.

import { vociSelezionate } from "../nucleo/generi.js";
import * as motori from "../nucleo/motori.js";
import * as regole from "../nucleo/regole.js";
import { $, esc, mostraAvviso, NOMI_MOTORE, NOMI_ORDINE_PL, NOMI_PIATT, SVG_PLAY, vaiA } from "./base.js";
import { nuovaManuale } from "./azioni-playlist.js";
import { apriCostruttore } from "./costruttore-playlist.js";
import { apriFoglioPlaylist } from "./foglio-playlist.js";

const DIPENDENZE = ["scheda", "catalogo", "playlist", "ctx"];
const FASCE = ["f-rosso", "f-blu", "f-ambra"];

export function collegaPlaylist(app) {
  $("#pl-nuova-intelligente").addEventListener("click", () => apriCostruttore(app, null));
  $("#pl-nuova-manuale").addEventListener("click", async () => {
    if (await nuovaManuale(app)) mostraAvviso("Playlist creata.", "ok");
  });
  // Un solo ascoltatore per tutti i cartellini.
  $("#playlist-lista").addEventListener("click", (e) => {
    const tasto = e.target.closest?.(".cartellino-testa, .play-neon");
    const cartellino = tasto?.closest(".cartellino");
    if (!cartellino) return;
    const { catalogo, playlist, ctx } = app.stato.leggi();
    const p = playlist.find((x) => x.id === cartellino.dataset.id);
    if (!p) return;
    if (tasto.classList.contains("cartellino-testa")) apriFoglioPlaylist(app, p);
    else if (app.sessione.avviaPlaylist(p, regole.valuta(p, catalogo.brani, ctx))) vaiA(app, "riproduzione");
  });
  app.stato.ascolta((cambiati, s) => {
    if (s.scheda === "playlist" && cambiati.some((k) => DIPENDENZE.includes(k))) disegnaPlaylist(app);
  });
}

export function disegnaPlaylist(app) {
  const { catalogo, playlist, ctx } = app.stato.leggi();
  if (!catalogo) return;
  const n = playlist.length;
  $("#playlist-sotto").textContent = n ? `${n} playlist · quelle coi filtri si aggiornano da sole` : "";
  $("#playlist-lista").innerHTML =
    playlist
      .map((p, i) => {
        const elenco = regole.valuta(p, catalogo.brani, ctx);
        const piano = motori.pianoRiproduzione(elenco, ctx);
        const consigliato = piano.consigliato
          ? NOMI_MOTORE[piano.consigliato].toLowerCase()
          : "nessuna fonte disponibile";
        const etichette = riassuntoRegole(app, p)
          .map((t) => `<span class="etichetta-regola">${esc(t)}</span>`)
          .join("");
        return `<div class="cartellino" data-id="${esc(p.id)}">
        <button class="cartellino-testa ${FASCE[i % 3]}" type="button" aria-label="Apri la playlist ${esc(p.nome)}">
          <span class="codice-mini">P${i + 1}</span><span>${esc(p.nome)}</span>
        </button>
        ${etichette ? `<div class="cartellino-regole">${etichette}</div>` : ""}
        <div class="cartellino-piede">
          <span>${elenco.length ? `${elenco.length.toLocaleString("it-IT")} dischi · ${esc(consigliato)}${p.telefono ? ` · ${elenco.filter((b) => ctx.fileIds.has(b.id)).length} sul telefono` : ""}` : "Vuota · aggiungi dischi dalla ricerca"}</span>
          ${elenco.length ? `<button class="play-neon" type="button" aria-label="Avvia ${esc(p.nome)}">${SVG_PLAY}</button>` : ""}
        </div>
      </div>`;
      })
      .join("") || `<p class="vuoto muted">Nessuna playlist ancora. Creane una con i pulsanti qui sopra.</p>`;
}

// Le regole di una playlist in poche etichette leggibili (per il cartellino).
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
