// Test di js/nucleo/etichette-filtri.js: i filtri attivi come etichette, e il modo di toglierli.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { etichetteFiltri, senzaFiltro } from "../js/nucleo/etichette-filtri.js";
import { vociGeneri } from "../js/nucleo/generi.js";
import { FILTRI_DEFAULT } from "../js/nucleo/stato.js";
import { fixture } from "./fixture.mjs";

const voci = vociGeneri(fixture.macro);
const catalogo = { voci, raccolte: fixture.raccolte };
const testi = (filtri) => etichetteFiltri(filtri, catalogo).map((e) => e.testo);
const chiavi = (filtri) => etichetteFiltri(filtri, catalogo).map((e) => e.chiave);

describe("etichetteFiltri", () => {
  test("i filtri di partenza non hanno etichette", () => {
    assert.deepEqual(etichetteFiltri(FILTRI_DEFAULT, catalogo), []);
    assert.deepEqual(etichetteFiltri({}, catalogo), []);
    assert.deepEqual(etichetteFiltri(undefined), []);
  });

  test("generi: il nome della voce (un gruppo è una voce sola)", () => {
    const tech = voci.find((v) => v.nome === "Tech house");
    assert.deepEqual(testi({ ...FILTRI_DEFAULT, macro: tech.indici }), ["Tech house"]);
    assert.deepEqual(testi({ ...FILTRI_DEFAULT, macro: [8, 9] }), ["Hip hop USA, Rap italiano"]);
  });

  test("generi che non fanno una voce intera: si dice quanti", () => {
    assert.deepEqual(testi({ ...FILTRI_DEFAULT, macro: [0] }), ["1 generi"]);
  });

  test("piattaforme, raccolta, tonalità", () => {
    assert.deepEqual(testi({ ...FILTRI_DEFAULT, piattaforme: ["yt", "lo"] }), ["YouTube, File"]);
    assert.deepEqual(testi({ ...FILTRI_DEFAULT, raccolta: 0 }), [fixture.raccolte[0][0]]);
    assert.deepEqual(testi({ ...FILTRI_DEFAULT, raccolta: 99 }), ["Raccolta 99"]);
    assert.deepEqual(testi({ ...FILTRI_DEFAULT, camelot: ["8A", "8B"] }), ["Tonalità 8A, 8B"]);
    assert.deepEqual(testi({ ...FILTRI_DEFAULT, camelot: "8A" }), ["Tonalità 8A"]);
    assert.deepEqual(testi({ ...FILTRI_DEFAULT, camelot: [] }), []);
  });

  test("anno e BPM: intervallo, o un estremo solo", () => {
    assert.deepEqual(testi({ ...FILTRI_DEFAULT, anno: [1990, 1999] }), ["Anno 1990–1999"]);
    assert.deepEqual(testi({ ...FILTRI_DEFAULT, bpm: [120, undefined] }), ["BPM da 120"]);
    assert.deepEqual(testi({ ...FILTRI_DEFAULT, bpm: [undefined, 128] }), ["BPM fino a 128"]);
    assert.deepEqual(testi({ ...FILTRI_DEFAULT, bpm: [undefined, undefined] }), []);
  });

  test("solo scelti spento e tipo diverso da «canzoni»", () => {
    assert.deepEqual(testi({ soloScelti: false, tipo: "canzoni" }), ["Anche i non scelti"]);
    assert.deepEqual(testi({ soloScelti: true, tipo: "set" }), ["Solo set e mix"]);
    assert.deepEqual(testi({ soloScelti: true, tipo: "tutti" }), ["Canzoni e set"]);
  });

  test("più filtri insieme: nell'ordine in cui si leggono", () => {
    const f = { soloScelti: false, tipo: "set", macro: [8], bpm: [100, 110], anno: [2000, 2010], piattaforme: ["sp"] };
    assert.deepEqual(chiavi(f), ["macro", "piattaforme", "anno", "bpm", "soloScelti", "tipo"]);
  });
});

describe("senzaFiltro", () => {
  const tutti = {
    soloScelti: false,
    tipo: "set",
    macro: [8],
    piattaforme: ["sp"],
    raccolta: 1,
    anno: [2000, 2010],
    bpm: [100, 110],
    camelot: ["8A"],
  };

  test("ogni etichetta, tolta, sparisce e le altre restano", () => {
    for (const { chiave } of etichetteFiltri(tutti, catalogo)) {
      const dopo = etichetteFiltri(senzaFiltro(tutti, chiave), catalogo).map((e) => e.chiave);
      assert.deepEqual(
        dopo,
        chiavi(tutti).filter((c) => c !== chiave),
        chiave,
      );
    }
  });

  test("toglierle tutte riporta ai filtri di partenza (nessuna etichetta)", () => {
    let f = tutti;
    for (const { chiave } of etichetteFiltri(tutti, catalogo)) f = senzaFiltro(f, chiave);
    assert.deepEqual(etichetteFiltri(f, catalogo), []);
  });

  test("non cambia l'oggetto di partenza", () => {
    const f = { ...tutti };
    senzaFiltro(f, "macro");
    assert.deepEqual(f, tutti);
  });
});
