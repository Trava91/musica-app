// Test di js/nucleo/cerca.js: ricerca, filtri, conteggi. Dati inventati (test/fixture.json).

import assert from "node:assert/strict";
import { test } from "node:test";
import * as cerca from "../js/nucleo/cerca.js";
import { brani, fixture, ids } from "./fixture.mjs";
import { normalizza } from "../js/nucleo/testo.js";

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
  assert.deepEqual(ids(cerca.perArtista(brani, normalizza("DJ Testino"))), ["f03", "f01", "f02"]);
});

test("conteggiMacro: Tech house esclude l'esplorazione di default", () => {
  assert.equal(cerca.conteggiMacro(brani, {}, fixture.macro.length).conteggi[0], 3);
});

// ============================================================== conteggiMacro ====
// Il numero di generi lo decide il catalogo (catalogo.macro.length), non il codice.

// I brani che passano i filtri di default: tutti tranne i set e l'esplorazione.
const contati = brani.filter((b) => b.k !== "set" && b.x !== 1);

test("conteggiMacro: con i 17 generi del catalogo ogni brano finisce in un genere o in 'senza genere'", () => {
  const { conteggi, senzaGenere } = cerca.conteggiMacro(brani, {}, 17);
  assert.equal(conteggi.length, 17);
  assert.equal(conteggi.reduce((a, n) => a + n, 0) + senzaGenere, contati.length);
  assert.equal(senzaGenere, 1); // f28
  assert.equal(conteggi[16], 3); // "Altro": f11, f12, f13
});

test("conteggiMacro: con soli 3 generi l'elenco è lungo 3 e i brani di altri generi non si perdono", () => {
  const { conteggi, senzaGenere } = cerca.conteggiMacro(brani, {}, 3);
  assert.equal(conteggi.length, 3);
  assert.deepEqual(conteggi, [3, 3, 0]);
  // Gli indici 3 e oltre non esistono in questo catalogo da 3 generi: finiscono in 'senza genere'.
  assert.equal(conteggi.reduce((a, n) => a + n, 0) + senzaGenere, contati.length);
  assert.ok(senzaGenere > 1);
});

test("conteggiMacro: con 20 generi l'elenco è lungo 20 (prima era fisso a 17)", () => {
  const { conteggi, senzaGenere } = cerca.conteggiMacro(brani, {}, 20);
  assert.equal(conteggi.length, 20);
  assert.deepEqual(conteggi.slice(17), [0, 0, 0]);
  assert.equal(conteggi.reduce((a, n) => a + n, 0) + senzaGenere, contati.length);
});

test("conteggiMacro: i conteggi rispettano gli altri filtri ma non quello sul genere stesso", () => {
  const { conteggi } = cerca.conteggiMacro(brani, { macro: [0], bpm: [120, 130] }, 17);
  assert.equal(conteggi[0], 3); // il filtro "macro" è ignorato
  assert.equal(conteggi[1], 3); // f10, f19, f24 hanno BPM tra 120 e 130
  assert.equal(conteggi[4], 1); // f07
  assert.equal(conteggi[6], 0); // f04 ha 118 BPM: fuori
});

test("conteggiMacro: senza il numero dei generi è un errore, non un risultato sbagliato", () => {
  assert.throws(() => cerca.conteggiMacro(brani, {}), TypeError);
  assert.throws(() => cerca.conteggiMacro(brani, {}, undefined), TypeError);
  assert.throws(() => cerca.conteggiMacro(brani, {}, -1), TypeError);
  assert.throws(() => cerca.conteggiMacro(brani, {}, "17"), TypeError);
});
