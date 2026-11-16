// Test di js/nucleo/testo.js: normalizzazione per la ricerca, titolo con versione, artista con feat., durata.

import assert from "node:assert/strict";
import { test } from "node:test";
import { dataBreve, durataFmt, normalizza, sottotitolo, titoloCompleto } from "../js/nucleo/testo.js";

test("normalizza: accenti", () => {
  assert.equal(normalizza("Ünïcode Tëst"), "unicode test");
});

test("normalizza: e commerciale", () => {
  assert.equal(normalizza("Rock & Roll"), "rock and roll");
});

test("normalizza: punteggiatura", () => {
  assert.equal(normalizza("Prova, Uno! (Remix)"), "prova uno remix");
});

test("normalizza: testo mancante o vuoto → stringa vuota", () => {
  assert.equal(normalizza(undefined), "");
  assert.equal(normalizza("   "), "");
});

test("titoloCompleto: titolo, titolo con versione, senza titolo", () => {
  assert.equal(titoloCompleto({ t: "Prova" }), "Prova");
  assert.equal(titoloCompleto({ t: "Prova", v: "Club Mix" }), "Prova (Club Mix)");
  assert.equal(titoloCompleto({}), "(senza titolo)");
  assert.equal(titoloCompleto({ v: "Radio Edit" }), "(senza titolo) (Radio Edit)");
});

test("sottotitolo: artista, con ospite, senza artista", () => {
  assert.equal(sottotitolo({ a: "DJ Testino" }), "DJ Testino");
  assert.equal(sottotitolo({ a: "DJ Testino", f: "Ospite" }), "DJ Testino feat. Ospite");
  assert.equal(sottotitolo({}), "(artista sconosciuto)");
});

test("durataFmt: minuti e secondi, secondi a due cifre, dato mancante", () => {
  assert.equal(durataFmt(0), "0:00");
  assert.equal(durataFmt(65), "1:05");
  assert.equal(durataFmt(undefined), "");
});

test("dataBreve: una data ISO diventa gg/mm/aaaa (anche con l'ora), il resto resta com'è", () => {
  assert.equal(dataBreve("2026-10-24"), "24/10/2026");
  assert.equal(dataBreve("2026-10-24T08:30:00"), "24/10/2026");
  assert.equal(dataBreve("ieri"), "ieri");
  assert.equal(dataBreve(undefined), "");
});
