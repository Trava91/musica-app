// Test di js/cerca.js: normalizzazione, ricerca, filtri, conteggi. Dati inventati (test/fixture.json).

import assert from "node:assert/strict";
import { test } from "node:test";
import * as cerca from "../js/cerca.js";
import { brani, ids } from "./fixture.mjs";

test("normalizza: accenti", () => {
  assert.equal(cerca.normalizza("Ünïcode Tëst"), "unicode test");
});

test("normalizza: e commerciale", () => {
  assert.equal(cerca.normalizza("Rock & Roll"), "rock and roll");
});

test("normalizza: punteggiatura", () => {
  assert.equal(cerca.normalizza("Prova, Uno! (Remix)"), "prova uno remix");
});

test("cerca: query multi-parola per prefisso su artista", () => {
  assert.deepEqual(ids(cerca.cerca(brani, "dj test", undefined, "rilevanza")).sort(), ["f01", "f02", "f03"].sort());
});

test("cerca: artista esatto > prefisso in titolo > solo nell'indice", () => {
  assert.deepEqual(ids(cerca.cerca(brani, "esempio completo", undefined, "rilevanza")), ["f11", "f13", "f12"]);
});

test("cerca: tipo default esclude i set", () => {
  assert.ok(!cerca.cerca(brani, "", {}, "artista").some((b) => b.id === "f06"));
});

test("cerca: tipo 'set' include solo i set", () => {
  assert.deepEqual(ids(cerca.cerca(brani, "", { tipo: "set" }, "artista")), ["f06"]);
});

test("cerca: soloScelti di default esclude l'esplorazione", () => {
  assert.ok(!cerca.cerca(brani, "", {}, "artista").some((b) => b.id === "f08"));
});

test("cerca: soloScelti:false include l'esplorazione", () => {
  assert.ok(cerca.cerca(brani, "", { soloScelti: false }, "artista").some((b) => b.id === "f08"));
});

test("cerca: filtro BPM 120-130", () => {
  assert.deepEqual(
    ids(cerca.cerca(brani, "", { bpm: [120, 130] }, "bpm")).sort(),
    ["f01", "f02", "f03", "f07", "f10", "f19", "f24"].sort(),
  );
});

test("cerca: filtro macro Tech house esclude l'esplorazione", () => {
  assert.deepEqual(ids(cerca.cerca(brani, "", { macro: [0] }, "artista")).sort(), ["f01", "f02", "f03"].sort());
});

test("perArtista: originali prima dei remix, poi alfabetico", () => {
  assert.deepEqual(ids(cerca.perArtista(brani, cerca.normalizza("DJ Testino"))), ["f03", "f01", "f02"]);
});

test("conteggiMacro: Tech house esclude l'esplorazione di default", () => {
  assert.equal(cerca.conteggiMacro(brani, {}).conteggi[0], 3);
});
