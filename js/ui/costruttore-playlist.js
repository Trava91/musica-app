// costruttore-playlist.js — il modulo per creare o modificare una playlist intelligente
// (coi filtri), con il conteggio dei brani che si aggiorna mentre si scrive.

import { TIPI_VERSIONE } from "../config.js";
import * as playlist from "../dati/playlist.js";
import * as regole from "../nucleo/regole.js";
import { normalizza } from "../nucleo/testo.js";
import {
  $,
  $$,
  apriFinestra,
  campoMinMax,
  chiudiFinestra,
  chipGeneri,
  chipPiattaforme,
  esc,
  leggiChipGeneri,
  leggiChipPiattaforme,
  leggiElenco,
  leggiMinMax,
  mostraAvviso,
} from "./base.js";
import { salvaPlaylist } from "./azioni-playlist.js";

const ORDINI = [
  ["artista", "Artista"],
  ["casuale", "Casuale"],
  ["bpm-su", "BPM crescente"],
  ["bpm-giu", "BPM decrescente"],
  ["armonico", "Percorso armonico"],
  ["recenti", "Aggiunti di recente"],
];

const nuovaVuota = () => ({
  id: null,
  nome: "",
  tipo: "intelligente",
  regole: { soloScelti: true, tipi: [], macro: [], piattaforme: [], raccolte: [], artisti: [], escludiArtisti: [] },
  ordine: "artista",
  seme: Math.floor(Math.random() * 1e9),
  limite: null,
});

/** Apre il costruttore: vuoto (pEsistente = null) o con una playlist intelligente da modificare. */
export function apriCostruttore(app, pEsistente) {
  const el = $("#costruttore");
  const { voci } = app.stato.leggi();
  const p = pEsistente ? JSON.parse(JSON.stringify(pEsistente)) : nuovaVuota();
  const r = p.regole;
  const tipoChip = (k) =>
    `<label class="chip"><input type="checkbox" data-campo="tipi" value="${k}" ${r.tipi?.includes(k) ? "checked" : ""}><span>${esc(k)}</span></label>`;

  el.innerHTML = `
      <div class="foglio-intestazione"><h2>${pEsistente ? "Modifica playlist" : "Nuova playlist intelligente"}</h2><button class="foglio-chiudi" id="cost-chiudi">✕</button></div>

      <div class="campo-riga"><label for="cost-nome">Nome</label><input id="cost-nome" type="text" value="${esc(p.nome)}" placeholder="Es. Tech house per correre"></div>

      <div class="campo-riga"><span class="etichetta">Generi</span><div class="chips" id="cost-macro">${chipGeneri(voci, r.macro)}</div></div>

      <div class="campo-riga"><span class="etichetta">Piattaforme</span><div class="chips">${chipPiattaforme(r.piattaforme)}</div></div>

      <div class="campo-riga"><span class="etichetta">Tipo di versione (vuoto = tutte tranne i set)</span><div class="chips">${TIPI_VERSIONE.map(tipoChip).join("")}</div></div>

      <div class="campo-riga"><label for="cost-testo">Testo libero</label><input id="cost-testo" type="text" value="${esc(r.testo || "")}" placeholder="Cerca dentro artista, titolo, generi…"></div>

      ${campoMinMax("cost-bpm", "BPM", r.bpm)}

      ${campoMinMax("cost-anno", "Anno", r.anno)}

      ${campoMinMax("cost-en", "Energia (0–1)", r.energia, 'step="0.05" min="0" max="1"')}

      <div class="campo-riga"><label for="cost-camelot">Tonalità Camelot (es. 8A, 8B)</label><input id="cost-camelot" type="text" value="${esc((r.camelot || []).join(", "))}" placeholder="separate da virgola"></div>

      <div class="campo-riga"><label for="cost-artisti">Solo questi artisti (uno per riga)</label><textarea id="cost-artisti" rows="2" placeholder="Un artista per riga">${esc((r.artisti || []).join("\n"))}</textarea></div>
      <div class="campo-riga"><label for="cost-escludi">Escludi questi artisti (uno per riga)</label><textarea id="cost-escludi" rows="2" placeholder="Un artista per riga">${esc((r.escludiArtisti || []).join("\n"))}</textarea></div>

      <div class="campo-riga"><label class="switch"><input id="cost-solo-scelti" type="checkbox" ${r.soloScelti !== false ? "checked" : ""}> Solo brani scelti da te (escludi l'esplorazione)</label></div>
      <div class="campo-riga"><label class="switch"><input id="cost-solo-schermo" type="checkbox" ${r.soloSchermoSpento ? "checked" : ""}> Solo brani ascoltabili a schermo spento</label></div>

      <div class="campo-riga">
        <label for="cost-ordine">Ordine</label>
        <select id="cost-ordine">
          ${ORDINI.map(([v, nome]) => `<option value="${v}" ${p.ordine === v ? "selected" : ""}>${nome}</option>`).join("\n          ")}
        </select>
      </div>
      <div class="campo-riga"><label for="cost-limite">Limite di brani (vuoto = nessuno)</label><input id="cost-limite" type="number" min="1" value="${p.limite ?? ""}"></div>

      <div class="conteggio-live" id="cost-conteggio">…</div>
      <div class="azioni-riga">
        <button class="btn-primary" id="cost-salva">Salva</button>
        <button class="btn-secondary" id="cost-annulla">Annulla</button>
      </div>
    `;

  const righe = (id) =>
    $(id, el)
      .value.split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => normalizza(s));
  const leggiRegole = () => ({
    soloScelti: $("#cost-solo-scelti", el).checked,
    soloSchermoSpento: $("#cost-solo-schermo", el).checked,
    macro: leggiChipGeneri(el, voci),
    piattaforme: leggiChipPiattaforme(el),
    tipi: $$('input[data-campo="tipi"]:checked', el).map((i) => i.value),
    testo: $("#cost-testo", el).value.trim() || undefined,
    bpm: leggiMinMax(el, "cost-bpm"),
    anno: leggiMinMax(el, "cost-anno"),
    energia: leggiMinMax(el, "cost-en"),
    camelot: leggiElenco(el, "#cost-camelot"),
    artisti: righe("#cost-artisti"),
    escludiArtisti: righe("#cost-escludi"),
  });

  const aggiornaConteggio = () => {
    const { catalogo, ctx } = app.stato.leggi();
    const n = regole.conta(leggiRegole(), catalogo.brani, ctx);
    $("#cost-conteggio").textContent = `${n.toLocaleString("it-IT")} brani`;
  };
  el.oninput = aggiornaConteggio; // un solo ascoltatore per tutti i campi (il foglio si riusa)
  aggiornaConteggio();

  const chiudi = () => chiudiFinestra("costruttore-overlay");
  $("#cost-chiudi").addEventListener("click", chiudi);
  $("#cost-annulla").addEventListener("click", chiudi);
  $("#cost-salva").addEventListener("click", async () => {
    const nome = $("#cost-nome", el).value.trim();
    if (!nome) {
      mostraAvviso("Dai un nome alla playlist.", "err");
      return;
    }
    const nuova = {
      id: p.id || playlist.nuovoId(nome),
      nome,
      tipo: "intelligente",
      regole: leggiRegole(),
      ordine: $("#cost-ordine", el).value,
      seme: p.seme,
      limite: $("#cost-limite", el).value ? Number($("#cost-limite", el).value) : null,
    };
    try {
      await salvaPlaylist(app, nuova);
    } catch {
      return; // già detto da salvaPlaylist
    }
    chiudi();
    mostraAvviso("Playlist salvata.", "ok");
  });

  apriFinestra("costruttore-overlay");
}
