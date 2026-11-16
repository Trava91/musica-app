// Test di js/dj.js: compatibilità di chiave (Camelot) e BPM, percorso armonico.

import assert from "node:assert/strict";
import { test } from "node:test";
import * as dj from "../js/dj.js";

test("livelloChiave 8A-8A (uguale)", () => {
  assert.equal(dj.livelloChiave("8A", "8A"), 3);
});

test("livelloChiave 8A-9A (adiacente)", () => {
  assert.equal(dj.livelloChiave("8A", "9A"), 2);
});

test("livelloChiave 12A-1A (adiacente, giro dell'orologio)", () => {
  assert.equal(dj.livelloChiave("12A", "1A"), 2);
});

test("livelloChiave 8A-8B (relativa)", () => {
  assert.equal(dj.livelloChiave("8A", "8B"), 2);
});

test("livelloChiave 8A-10A (+2)", () => {
  assert.equal(dj.livelloChiave("8A", "10A"), 1);
});

test("livelloChiave 8A-9B (diagonale)", () => {
  assert.equal(dj.livelloChiave("8A", "9B"), 1);
});

test("livelloChiave 8A-3A (nessuna relazione)", () => {
  assert.equal(dj.livelloChiave("8A", "3A"), 0);
});

test("scartoBpm 128→125 ≈ 0.023", () => {
  assert.ok(Math.abs(dj.scartoBpm(128, 125) - 0.0234375) < 1e-6);
});

test("scartoBpm 128→64 incompatibile senza metà/doppio", () => {
  assert.ok(dj.scartoBpm(128, 64) > dj.TOLLERANZA_BPM);
});

test("scartoBpm 128→64 compatibile con metà/doppio", () => {
  assert.ok(dj.scartoBpm(128, 64, { metaDoppio: true }) <= dj.TOLLERANZA_BPM);
});

test("scartoBpm 128→136 oltre la soglia", () => {
  assert.ok(dj.scartoBpm(128, 136) > dj.TOLLERANZA_BPM);
});

// ============================================================ percorsoArmonico ====

const catena = [
  { id: "c1", _normA: "catena", _normT: "uno", b: 120, c: "8A" },
  { id: "c2", _normA: "catena", _normT: "due", b: 122, c: "8A" },
  { id: "c3", _normA: "catena", _normT: "tre", b: 124, c: "9A" },
  { id: "c4", _normA: "catena", _normT: "quattro", b: 126, c: "9B" },
  { id: "c5", _normA: "catena", _normT: "senza dati b" },
  { id: "c6", _normA: "catena", _normT: "senza dati a" },
];
const percorso = dj.percorsoArmonico(catena);
const conDati = percorso.filter((b) => b.b !== undefined);
const senzaDati = percorso.filter((b) => b.b === undefined);

test("percorsoArmonico: nessun brano perso", () => {
  assert.deepEqual(percorso.map((b) => b.id).sort(), ["c1", "c2", "c3", "c4", "c5", "c6"].sort());
});

test("percorsoArmonico: i brani con dati vengono prima di quelli senza", () => {
  assert.ok(
    Math.max(...conDati.map((b) => percorso.indexOf(b))) < Math.min(...senzaDati.map((b) => percorso.indexOf(b))),
  );
});

test("percorsoArmonico: passi consecutivi compatibili (dati costruiti apposta)", () => {
  let compatibili = true;
  for (let i = 1; i < conDati.length; i++) {
    if (
      dj.scartoBpm(conDati[i - 1].b, conDati[i].b) > dj.TOLLERANZA_BPM ||
      dj.livelloChiave(conDati[i - 1].c, conDati[i].c) < 1
    ) {
      compatibili = false;
    }
  }
  assert.ok(compatibili);
});

test("percorsoArmonico: i brani senza dati vanno in coda in ordine alfabetico", () => {
  assert.deepEqual(
    senzaDati.map((b) => b.id),
    ["c6", "c5"],
  );
});
