// foglio-filtri.js — il pannello Filtri della ricerca: generi, piattaforme, raccolta, tipo,
// BPM, anno, tonalità, solo scelti, ordine. "Applica" e "Azzera" cambiano lo stato: i
// risultati si ridisegnano da soli (vista-cerca.js).

import { FILTRI_DEFAULT } from "../nucleo/stato.js";
import {
  $,
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
  NOMI_PIATT,
} from "./base.js";

const opzione = (valore, nome, scelto) => `<option value="${valore}" ${scelto ? "selected" : ""}>${nome}</option>`;

export function apriFiltri(app) {
  const el = $("#filtri-pannello");
  const { catalogo, filtri: f, ordine, voci } = app.stato.leggi();
  const opzRaccolta = catalogo.raccolte
    .map((r, i) => opzione(i, `${esc(r[0])} (${esc(NOMI_PIATT[r[2]] || r[2])})`, f.raccolta === i))
    .join("");

  el.innerHTML = `
      <div class="foglio-intestazione"><h2>Filtri</h2><button class="foglio-chiudi" id="filt-chiudi">✕</button></div>
      <div class="campo-riga"><span class="etichetta">Generi</span><div class="chips">${chipGeneri(voci, f.macro)}</div></div>
      <div class="campo-riga"><span class="etichetta">Piattaforme</span><div class="chips">${chipPiattaforme(f.piattaforme)}</div></div>
      <div class="campo-riga"><label for="filt-raccolta">Raccolta</label><select id="filt-raccolta"><option value="">Tutte</option>${opzRaccolta}</select></div>
      <div class="campo-riga"><span class="etichetta">Tipo</span>
        <select id="filt-tipo">
          ${opzione("canzoni", "Canzoni", !f.tipo || f.tipo === "canzoni")}
          ${opzione("set", "Set e mix", f.tipo === "set")}
          ${opzione("tutti", "Tutti", f.tipo === "tutti")}
        </select>
      </div>
      ${campoMinMax("filt-bpm", "BPM", f.bpm)}
      ${campoMinMax("filt-anno", "Anno", f.anno)}
      <div class="campo-riga"><label for="filt-camelot">Tonalità (es. 8A, 8B)</label><input id="filt-camelot" type="text" value="${esc((f.camelot || []).join(", "))}"></div>
      <div class="campo-riga"><label class="switch"><input id="filt-solo-scelti" type="checkbox" ${f.soloScelti !== false ? "checked" : ""}> Solo brani scelti da te</label></div>
      <div class="campo-riga">
        <label for="filt-ordine">Ordine</label>
        <select id="filt-ordine">
          <option value="">Automatico</option>
          ${opzione("artista", "Artista", ordine === "artista")}
          ${opzione("recenti", "Recenti", ordine === "recenti")}
          ${opzione("bpm", "BPM", ordine === "bpm")}
        </select>
      </div>
      <div class="azioni-riga">
        <button class="btn-primary" id="filt-applica">Applica</button>
        <button class="btn-secondary" id="filt-azzera">Azzera</button>
      </div>
    `;
  const chiudi = () => chiudiFinestra("filtri-overlay");
  $("#filt-chiudi").addEventListener("click", chiudi);
  $("#filt-applica").addEventListener("click", () => {
    const raccolta = $("#filt-raccolta", el).value;
    chiudi();
    app.stato.cambia({
      filtri: {
        soloScelti: $("#filt-solo-scelti", el).checked,
        tipo: $("#filt-tipo", el).value,
        macro: leggiChipGeneri(el, voci),
        piattaforme: leggiChipPiattaforme(el),
        raccolta: raccolta === "" ? undefined : Number(raccolta),
        bpm: leggiMinMax(el, "filt-bpm"),
        anno: leggiMinMax(el, "filt-anno"),
        camelot: leggiElenco(el, "#filt-camelot"),
      },
      ordine: $("#filt-ordine", el).value || undefined,
    });
  });
  $("#filt-azzera").addEventListener("click", () => {
    chiudi();
    app.stato.cambia({ filtri: { ...FILTRI_DEFAULT }, ordine: undefined });
  });
  apriFinestra("filtri-overlay");
}
