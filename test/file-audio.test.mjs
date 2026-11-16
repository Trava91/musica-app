// Test di js/dati/file-audio.js: il nome dei file preparati dal PC (<id>.<estensione>) e le copie doppie di Android.

import assert from "node:assert/strict";
import { test } from "node:test";
import { idDaNome } from "../js/dati/file-audio.js";

test("idDaNome: nome preparato dal PC", () => {
  assert.equal(idDaNome("c9412dc07ba6.m4a"), "c9412dc07ba6");
});

test("idDaNome: copia doppia di Android", () => {
  assert.equal(idDaNome("C9412DC07BA6 (1).m4a"), "c9412dc07ba6");
});

test("idDaNome: file qualunque", () => {
  assert.equal(idDaNome("Dan Black - Laka Laka.mp3"), null);
});

test("idDaNome: id troppo lungo", () => {
  assert.equal(idDaNome("c9412dc07ba6ff.m4a"), null);
});
