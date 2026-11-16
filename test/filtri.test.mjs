// Test di js/filtri.js: l'unico motore di filtri (ricerca e playlist intelligenti). Dati inventati.

import assert from "node:assert/strict";
import { test } from "node:test";
import { cerca } from "../js/cerca.js";
import { passa } from "../js/filtri.js";
import { valuta } from "../js/regole.js";
import { normalizza } from "../js/testo.js";
import { brani, ids } from "./fixture.mjs";

/** Gli id dei brani della fixture che passano il filtro, ordinati. */
const chi = (filtro, ctx) =>
  ids(brani.filter((b) => passa(b, filtro, ctx)))
    .slice()
    .sort();

test("filtro assente: passa tutto", () => {
  assert.equal(chi(undefined).length, brani.length);
  assert.equal(chi(null).length, brani.length);
});

test("soloScelti: di default l'esplorazione (x === 1) resta fuori, con false entra", () => {
  assert.ok(!chi({}).includes("f08"));
  assert.ok(!chi({ soloScelti: true }).includes("f08"));
  assert.ok(chi({ soloScelti: false }).includes("f08"));
});

test("tipo: canzoni (default) esclude i set, set li vuole soli, tutti li lascia", () => {
  assert.ok(!chi({}).includes("f06"));
  assert.ok(!chi({ tipo: "canzoni" }).includes("f06"));
  assert.deepEqual(chi({ tipo: "set" }), ["f06"]);
  assert.ok(chi({ tipo: "tutti" }).includes("f06"));
});

test("tipi: lista di versioni ammesse, e si somma a tipo", () => {
  assert.deepEqual(chi({ tipi: ["live"] }), ["f13", "f26"]);
  assert.deepEqual(chi({ tipi: ["remix", "extended"] }), ["f02", "f24"]);
  assert.deepEqual(chi({ tipi: ["set"] }), [], "tipo canzoni (default) più tipi set: nessun brano");
  assert.deepEqual(chi({ tipo: "tutti", tipi: ["set"] }), ["f06"]);
});

test("macro: basta uno degli indici", () => {
  assert.deepEqual(chi({ macro: [10, 14] }), ["f21", "f25", "f29"]);
});

test("piattaforme: basta una fonte tra quelle chieste", () => {
  assert.deepEqual(chi({ piattaforme: ["lo"] }), ["f07"]);
  assert.deepEqual(chi({ piattaforme: ["sc"] }), ["f04", "f22", "f29"]);
});

test("raccolta (una sola) e raccolte (lista, ne basta una)", () => {
  assert.deepEqual(chi({ raccolta: 4 }), ["f04", "f22", "f29"]);
  assert.deepEqual(chi({ raccolta: 0 }).includes("f01"), true, "l'indice 0 è una raccolta valida, non 'nessuna'");
  assert.deepEqual(chi({ raccolte: [4, 5] }), ["f04", "f07", "f22", "f29"]);
  assert.deepEqual(chi({ raccolte: [] }).length, chi({}).length, "lista vuota = nessun filtro");
});

test("artisti, escludiArtisti, escludiBrani", () => {
  assert.deepEqual(chi({ artisti: [normalizza("Alfa Testound")] }), ["f10", "f24"]);
  assert.ok(!chi({ escludiArtisti: [normalizza("DJ Testino")] }).includes("f01"));
  assert.ok(chi({ escludiArtisti: [normalizza("DJ Testino")] }).includes("f10"));
  assert.ok(!chi({ escludiBrani: ["f10"] }).includes("f10"));
  assert.ok(chi({ escludiBrani: ["f10"] }).includes("f24"));
});

test("anno, bpm, energia: intervallo con estremi facoltativi", () => {
  assert.deepEqual(chi({ anno: [1990, 2000] }), ["f15"]);
  assert.deepEqual(chi({ anno: [2000, undefined] }), ["f16"]);
  assert.deepEqual(chi({ anno: [undefined, 2000] }), ["f15"]);
  assert.deepEqual(chi({ bpm: [149, 151] }), ["f18"]);
  assert.deepEqual(chi({ energia: [0.85, 1] }), ["f18"]);
});

test("intervalli: un brano senza il dato è escluso (se l'intervallo c'è)", () => {
  assert.ok(!chi({ bpm: [0, 999] }).includes("f09"), "f09 non ha il bpm");
  assert.ok(chi({}).includes("f09"));
  assert.ok(!chi({ anno: [0, 3000] }).includes("f01"), "f01 non ha l'anno");
  assert.ok(!chi({ energia: [0, 1] }).includes("f24"), "f24 non ha l'energia");
});

test("camelot: una chiave, una lista, lista vuota = nessun filtro", () => {
  assert.deepEqual(chi({ camelot: "9A" }), ["f03"]);
  assert.deepEqual(chi({ camelot: ["9A", "2B"] }), ["f03", "f05"]);
  assert.equal(chi({ camelot: [] }).length, chi({}).length);
});

test("testo: tutte le parole devono stare nel testo del brano", () => {
  assert.deepEqual(chi({ testo: "esempio completo" }), ["f11", "f12", "f13"]);
  assert.deepEqual(
    chi({ testo: "ESEMPIO, completo!" }),
    ["f11", "f12", "f13"],
    "maiuscole e punteggiatura non contano",
  );
  assert.deepEqual(chi({ testo: "esempio parolainesistente" }), []);
  assert.equal(chi({ testo: "  " }).length, chi({}).length, "solo spazi = nessun filtro");
});

test("soloSchermoSpento: serve un motore che suona a schermo spento (file, Spotify Premium)", () => {
  assert.deepEqual(chi({ soloSchermoSpento: true }), [], "senza ctx non c'è nessun motore continuo");
  assert.deepEqual(chi({ soloSchermoSpento: true }, { fileIds: new Set(["f07", "f01"]) }), ["f01", "f07"]);
  const premium = chi({ soloSchermoSpento: true }, { spotify: "premium" });
  assert.ok(premium.includes("f01") && !premium.includes("f02"), "Premium suona i brani con fonte Spotify");
});

test("i campi si sommano in AND", () => {
  assert.deepEqual(chi({ macro: [0], bpm: [124, 125], camelot: "8A", raccolte: [1] }), ["f02"]);
});

test("ricerca e playlist intelligenti usano lo stesso motore: stessi brani per lo stesso filtro", () => {
  const filtro = { macro: [0, 1], bpm: [120, 130], escludiArtisti: [normalizza("DJ Testino")] };
  const dalRicerca = ids(cerca(brani, "", filtro, "artista")).sort();
  const dallePlaylist = ids(valuta({ tipo: "intelligente", regole: filtro, ordine: "artista" }, brani)).sort();
  assert.deepEqual(dalRicerca, dallePlaylist);
  assert.deepEqual(dalRicerca, ["f10", "f19", "f24"]);
});

test("playlist: con tipi precisi i set possono entrare, senza restano fuori", () => {
  const senza = valuta({ tipo: "intelligente", regole: {}, ordine: "artista" }, brani);
  assert.ok(!ids(senza).includes("f06"));
  const con = valuta({ tipo: "intelligente", regole: { tipi: ["set"] }, ordine: "artista" }, brani);
  assert.deepEqual(ids(con), ["f06"]);
});
