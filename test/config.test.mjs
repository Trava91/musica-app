// Test di js/config.js: i tempi e le soglie raccolti in un posto solo hanno ancora i valori di sempre,
// e le impostazioni si leggono da una memoria finta.

import assert from "node:assert/strict";
import { test } from "node:test";
import * as config from "../js/config.js";
import { RAGGRUPPATI } from "../js/nucleo/generi.js";
import { TOLLERANZA_BPM } from "../js/nucleo/dj.js";

test("tempi e soglie: i valori di prima che fossero raccolti in config.js", () => {
  assert.equal(config.ATTESA_RICERCA_MS, 120);
  assert.equal(config.RIGHE_PER_PAGINA, 100);
  assert.equal(config.PROSSIMI_MOSTRATI, 30);
  assert.equal(config.RIGHE_MAX_PLAYLIST, 200);
  assert.equal(config.RIGHE_MAX_AVVISI, 200);
  assert.equal(config.ATTESA_CACHE_MS, 5000);
  assert.equal(config.MAX_TENTATIVI_SALVATAGGIO, 3);
  assert.equal(config.DURATA_AVVISO_MS, 3200);
  assert.equal(config.DURATA_AVVISO_LUNGO_MS, 7000);
  assert.equal(config.SECONDI_PER_RIPARTIRE, 4);
});

test("tolleranza BPM e gruppi di generi: si vedono da config.js ma vivono nella logica pura", () => {
  assert.equal(config.TOLLERANZA_BPM, TOLLERANZA_BPM);
  assert.equal(config.TOLLERANZA_BPM, 0.06);
  assert.equal(config.RAGGRUPPATI, RAGGRUPPATI);
});

test("i tipi di versione e l'ordine dei motori", () => {
  assert.deepEqual(config.TIPI_VERSIONE, ["originale", "remix", "edit", "extended", "live", "set"]);
  assert.deepEqual(config.MOTORI_DEFAULT, ["file", "spotify-premium", "newpipe", "spotify-app", "web"]);
});

test("leggiConfig: i valori di default quando la memoria è vuota", () => {
  const vuota = { getItem: () => null };
  assert.deepEqual(config.leggiConfig(vuota), {
    tipo: "github-privato",
    url: "",
    owner: "Trava91",
    repo: "musica-dati",
    file: "catalogo.json",
    token: "",
  });
  assert.equal(config.configPronta(config.leggiConfig(vuota)), false);
});

test("volume: pieno se non è mai stato toccato; letto e tenuto tra 0 e 1", () => {
  const memoria = (/** @type {string | null} */ v) => ({
    getItem: (chiave) => (chiave === "jukebox.volume" ? v : null),
  });
  assert.equal(config.leggiPreferenzaVolume(memoria(null)), 1);
  assert.equal(config.leggiPreferenzaVolume(memoria("0.62")), 0.62);
  assert.equal(config.leggiPreferenzaVolume(memoria("0")), 0);
  assert.equal(config.leggiPreferenzaVolume(memoria("7")), 1);
  assert.equal(config.leggiPreferenzaVolume(memoria("-1")), 0);
  assert.equal(config.leggiPreferenzaVolume(memoria("rovinato")), 1);
  assert.equal(config.leggiPreferenzaVolume(memoria("")), 1);
});

test("volume: si salva sotto jukebox.volume, già dentro i limiti", () => {
  /** @type {Record<string, string>} */
  const scritto = {};
  const memoria = { setItem: (chiave, valore) => (scritto[chiave] = valore) };
  config.salvaPreferenzaVolume(0.62, memoria);
  assert.deepEqual(scritto, { "jukebox.volume": "0.62" });
  config.salvaPreferenzaVolume(3, memoria);
  assert.equal(scritto["jukebox.volume"], "1");
  assert.equal(config.leggiPreferenzaVolume({ getItem: (chiave) => scritto[chiave] ?? null }), 1);
});

test("configPronta: con GitHub serve il token, con 'url' l'indirizzo", () => {
  const base = { owner: "", repo: "", file: "" };
  assert.equal(config.configPronta({ ...base, tipo: "github-privato", url: "", token: "abc" }), true);
  assert.equal(config.configPronta({ ...base, tipo: "url", url: "../app-dati/catalogo.json", token: "" }), true);
  assert.equal(config.configPronta({ ...base, tipo: "url", url: "", token: "abc" }), false);
});
