// Test di js/nucleo/scorciatoie.js: quale comando fa un tasto, e quando non deve farlo.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { comandoDaTasto } from "../js/nucleo/scorciatoie.js";

const LIBERO = { inCampo: false, suControllo: false, suBottone: false, finestraAperta: false };
const dai = (key, fatti = {}, extra = {}) => comandoDaTasto({ key, ...extra }, { ...LIBERO, ...fatti });

describe("comandoDaTasto", () => {
  test("/ porta alla ricerca, Spazio alterna pausa e riprendi, le frecce cambiano brano", () => {
    assert.equal(dai("/"), "cerca");
    assert.equal(dai(" "), "alterna");
    assert.equal(dai("ArrowRight"), "avanti");
    assert.equal(dai("ArrowLeft"), "indietro");
  });

  test("gli altri tasti non fanno nulla", () => {
    for (const k of ["a", "Enter", "Escape", "ArrowUp", "ArrowDown", "Tab", "1"]) assert.equal(dai(k), null, k);
  });

  test("mai mentre si scrive in un campo", () => {
    for (const k of ["/", " ", "ArrowRight", "ArrowLeft"]) assert.equal(dai(k, { inCampo: true }), null, k);
  });

  test("mai con una finestra aperta", () => {
    for (const k of ["/", " ", "ArrowRight", "ArrowLeft"]) assert.equal(dai(k, { finestraAperta: true }), null, k);
  });

  test("con Ctrl, Alt o Cmd restano le scorciatoie del browser", () => {
    for (const m of ["ctrlKey", "altKey", "metaKey"]) {
      assert.equal(dai("ArrowLeft", {}, { [m]: true }), null, m);
      assert.equal(dai("/", {}, { [m]: true }), null, m);
    }
  });

  test("Spazio su un tasto o una casella è del tasto; lo Spazio tenuto premuto non ripete", () => {
    assert.equal(dai(" ", { suBottone: true }), null);
    assert.equal(dai(" ", { suControllo: true }), null);
    assert.equal(dai(" ", {}, { repeat: true }), null);
  });

  test("le frecce sulla barra, la manopola, la scala o un menu sono loro; su un tasto no", () => {
    assert.equal(dai("ArrowRight", { suControllo: true }), null);
    assert.equal(dai("ArrowLeft", { suControllo: true }), null);
    assert.equal(dai("ArrowRight", { suBottone: true }), "avanti");
  });

  test("/ si può premere anche con Maiusc (sulla tastiera italiana è Maiusc+7)", () => {
    assert.equal(dai("/", {}, { shiftKey: true }), "cerca");
  });
});
