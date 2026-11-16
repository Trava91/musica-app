// Test di js/regole.js: playlist coi filtri, playlist a mano, rimappatura degli id. Dati inventati.

import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizza } from "../js/cerca.js";
import * as regole from "../js/regole.js";
import { brani, ids } from "./fixture.mjs";

test("regole: AND tra campi, OR dentro macro", () => {
  assert.deepEqual(
    ids(
      regole.valuta({ tipo: "intelligente", regole: { macro: [0, 1], bpm: [120, 130] }, ordine: "artista" }, brani),
    ).sort(),
    ["f01", "f02", "f03", "f10", "f19", "f24"].sort(),
  );
});

test("regole: escludiArtisti", () => {
  assert.deepEqual(
    ids(
      regole.valuta(
        {
          tipo: "intelligente",
          regole: { macro: [0, 1], bpm: [120, 130], escludiArtisti: [normalizza("DJ Testino")] },
          ordine: "artista",
        },
        brani,
      ),
    ).sort(),
    ["f10", "f19", "f24"].sort(),
  );
});

test("regole: filtro anno", () => {
  assert.deepEqual(
    ids(regole.valuta({ tipo: "intelligente", regole: { anno: [1990, 2000] }, ordine: "artista" }, brani)),
    ["f15"],
  );
});

test("regole: soloScelti:false include l'esplorazione", () => {
  assert.deepEqual(
    ids(
      regole.valuta({ tipo: "intelligente", regole: { macro: [0], soloScelti: false }, ordine: "artista" }, brani),
    ).sort(),
    ["f01", "f02", "f03", "f08"].sort(),
  );
});

test("regole: soloSchermoSpento senza file né Premium esclude tutto", () => {
  assert.equal(
    regole.valuta({ tipo: "intelligente", regole: { soloSchermoSpento: true }, ordine: "artista" }, brani, {}).length,
    0,
  );
});

// Con un file sul telefono (f07) e Spotify Premium.
const conFileEPremium = new Set(
  ids(
    regole.valuta({ tipo: "intelligente", regole: { soloSchermoSpento: true }, ordine: "artista" }, brani, {
      fileIds: new Set(["f07"]),
      spotify: "premium",
    }),
  ),
);

test("soloSchermoSpento: file abbinato incluso (f07)", () => {
  assert.ok(conFileEPremium.has("f07"));
});

test("soloSchermoSpento: Spotify Premium incluso (f01)", () => {
  assert.ok(conFileEPremium.has("f01"));
});

test("soloSchermoSpento: solo YouTube escluso, NewPipe non è continuo (f02)", () => {
  assert.ok(!conFileEPremium.has("f02"));
});

test("soloSchermoSpento: l'esplorazione resta esclusa (f08)", () => {
  assert.ok(!conFileEPremium.has("f08"));
});

test("regole: ordine armonico non perde brani", () => {
  assert.deepEqual(
    ids(
      regole.valuta({ tipo: "intelligente", regole: { macro: [0, 1], bpm: [120, 130] }, ordine: "armonico" }, brani),
    ).sort(),
    ["f01", "f02", "f03", "f10", "f19", "f24"].sort(),
  );
});

test("regole: casuale con lo stesso seme dà lo stesso ordine", () => {
  const pl = { tipo: "intelligente", regole: { macro: [0] }, ordine: "casuale", seme: 42 };
  assert.deepEqual(ids(regole.valuta(pl, brani)), ids(regole.valuta(pl, brani)));
});

test("regole: il limite tronca l'elenco", () => {
  assert.equal(regole.valuta({ tipo: "intelligente", regole: {}, ordine: "artista", limite: 2 }, brani).length, 2);
});

test("regole: playlist manuale mantiene l'ordine e ignora gli id mancanti", () => {
  assert.deepEqual(ids(regole.valuta({ tipo: "manuale", brani: ["f05", "f01", "id-inesistente"] }, brani)), [
    "f05",
    "f01",
  ]);
});

// ===================================================== rimappaPlaylist =====

const R = { vecchio1: "nuovo1", vecchio2: "unito", vecchio3: "unito" };
const man = { id: "m", tipo: "manuale", brani: ["vecchio1", "f01", "vecchio2", "vecchio3"] };

test("rimappa: id vecchi → nuovi, doppioni uniti una volta sola", () => {
  assert.deepEqual(regole.rimappaPlaylist(man, R).brani, ["nuovo1", "f01", "unito"]);
});

test("rimappa: esclusioni nelle playlist coi filtri", () => {
  assert.deepEqual(
    regole.rimappaPlaylist({ tipo: "intelligente", regole: { escludiBrani: ["vecchio1"] } }, R).regole.escludiBrani,
    ["nuovo1"],
  );
});

test("rimappa: nessun cambio → stessa playlist", () => {
  assert.ok(regole.rimappaPlaylist(man, {}) === man);
});

test("rimappa: tabella senza id della playlist → stessa playlist", () => {
  assert.ok(regole.rimappaPlaylist({ tipo: "manuale", brani: ["f01"] }, R).brani[0] === "f01");
});
