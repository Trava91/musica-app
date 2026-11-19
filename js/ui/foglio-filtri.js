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
  testaFinestra,
} from "./base.js";

const opzione = (valore, nome, scelto) => `<option value="${valore}" ${scelto ? "selected" : ""}>${nome}</option>`;

export function apriFiltri(app) {
  const el = $("#filtri-pannello");
  const { catalogo, filtri: f, ordine, voci } = app.stato.leggi();
  const opzRaccolta = catalogo.raccolte
    .map((r, i) => opzione(i, `${esc(r[0])} (${esc(NOMI_PIATT[r[2]] || r[2])})`, f.raccolta === i))
    .join("");

  el.innerHTML = `<div class="hf-frontale">
      ${testaFinestra("filt-titolo", "Filtri", "filt-chiudi")}
      <div class="hf-finestra-corpo">
        <div class="hf-campo-riga"><span class="hf-etichetta-campo">Generi</span><div class="hf-scelte">${chipGeneri(voci, f.macro)}</div></div>
        <div class="hf-campo-riga"><span class="hf-etichetta-campo">Piattaforme</span><div class="hf-scelte">${chipPiattaforme(f.piattaforme)}</div></div>
        <div class="hf-campo-riga"><label class="hf-etichetta-campo" for="filt-raccolta">Raccolta</label><select id="filt-raccolta" class="hf-menu"><option value="">Tutte</option>${opzRaccolta}</select></div>
        <div class="hf-campo-riga"><label class="hf-etichetta-campo" for="filt-tipo">Tipo</label>
          <select id="filt-tipo" class="hf-menu">
            ${opzione("canzoni", "Canzoni", !f.tipo || f.tipo === "canzoni")}
            ${opzione("set", "Set e mix", f.tipo === "set")}
            ${opzione("tutti", "Tutti", f.tipo === "tutti")}
          </select>
        </div>
        ${campoMinMax("filt-bpm", "BPM", f.bpm)}
        ${campoMinMax("filt-anno", "Anno", f.anno)}
        <div class="hf-campo-riga"><label class="hf-etichetta-campo" for="filt-camelot">Tonalità (es. 8A, 8B)</label><input id="filt-camelot" class="hf-campo" type="text" value="${esc((f.camelot || []).join(", "))}"></div>
        <div class="hf-campo-riga"><label class="hf-interruttore"><input id="filt-solo-scelti" type="checkbox" ${f.soloScelti !== false ? "checked" : ""}><span class="hf-levetta" aria-hidden="true"></span><span>Solo brani scelti da te</span></label></div>
        <div class="hf-campo-riga">
          <label class="hf-etichetta-campo" for="filt-ordine">Ordine</label>
          <select id="filt-ordine" class="hf-menu">
            <option value="">Automatico</option>
            ${opzione("artista", "Artista", ordine === "artista")}
            ${opzione("recenti", "Recenti", ordine === "recenti")}
            ${opzione("bpm", "BPM", ordine === "bpm")}
          </select>
        </div>
      </div>
      <div class="hf-finestra-azioni">
        <button class="hf-tasto" type="button" id="filt-azzera">Azzera</button>
        <button class="hf-tasto hf-principale" type="button" id="filt-applica">Applica</button>
      </div>
    </div>`;
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
