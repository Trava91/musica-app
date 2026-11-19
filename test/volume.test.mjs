// Test di js/nucleo/volume.js: i limiti del volume e la curva della manopola.

import assert from "node:assert/strict";
import { test } from "node:test";
import { curvaVolume, limitaVolume, VOLUME_DEFAULT } from "../js/nucleo/volume.js";

test("limitaVolume: tra 0 e 1, e il default (pieno) per un dato che non è un numero", () => {
  assert.equal(VOLUME_DEFAULT, 1);
  assert.equal(limitaVolume(0.62), 0.62);
  assert.equal(limitaVolume(0), 0);
  assert.equal(limitaVolume(1), 1);
  assert.equal(limitaVolume(1.5), 1);
  assert.equal(limitaVolume(-0.2), 0);
  for (const sbagliato of [Number.NaN, Number.POSITIVE_INFINITY, undefined, null, "0.5"]) {
    assert.equal(limitaVolume(sbagliato), VOLUME_DEFAULT, `con ${String(sbagliato)}`);
  }
});

test("curvaVolume: come un potenziometro, metà manopola = un quarto dell'ampiezza (−12 dB)", () => {
  assert.equal(curvaVolume(0), 0);
  assert.equal(curvaVolume(1), 1);
  assert.equal(curvaVolume(0.5), 0.25);
  assert.ok(Math.abs(20 * Math.log10(curvaVolume(0.5)) + 12.04) < 0.01);
  assert.equal(curvaVolume(2), 1, "oltre il massimo resta al massimo");
});

test("curvaVolume: sale sempre (girando la manopola non si abbassa mai)", () => {
  let prima = -1;
  for (let i = 0; i <= 100; i++) {
    const v = curvaVolume(i / 100);
    assert.ok(v > prima, `a ${i}`);
    prima = v;
  }
});
