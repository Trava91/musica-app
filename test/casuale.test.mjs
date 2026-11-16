// Test di js/casuale.js: il generatore casuale ripetibile (stesso seme, stessa sequenza).

import assert from "node:assert/strict";
import { test } from "node:test";
import { mescola, mulberry32 } from "../js/casuale.js";

test("mulberry32: stesso seme, stessa sequenza (valori di sempre)", () => {
  const rand = mulberry32(42);
  assert.deepEqual([rand(), rand(), rand()], [0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
});

test("mulberry32: i numeri stanno in [0, 1)", () => {
  const rand = mulberry32(1);
  for (let i = 0; i < 1000; i++) {
    const n = rand();
    assert.ok(n >= 0 && n < 1);
  }
});

test("mescola: stesso seme, stesso ordine (valore di sempre)", () => {
  assert.deepEqual(mescola([1, 2, 3, 4, 5, 6, 7, 8], 7), [5, 7, 2, 3, 4, 6, 8, 1]);
});

test("mescola: è una permutazione e l'elenco originale non cambia", () => {
  const originale = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const copia = originale.slice();
  const m = mescola(originale, 99);
  assert.deepEqual(originale, copia);
  assert.deepEqual(
    m.slice().sort((a, b) => a - b),
    copia,
  );
});

test("mescola: semi diversi, ordini diversi; elenchi vuoti o di uno restano com'erano", () => {
  const elenco = Array.from({ length: 30 }, (_, i) => i);
  assert.notDeepEqual(mescola(elenco, 1), mescola(elenco, 2));
  assert.deepEqual(mescola([], 1), []);
  assert.deepEqual(mescola([5], 1), [5]);
});
