// Test di js/nucleo/percorso.js: la pila delle schede visitate e delle finestre aperte, per il
// tasto «indietro» del telefono.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Percorso } from "../js/nucleo/percorso.js";

describe("Percorso", () => {
  test("la prima scheda è dove si parte: non si torna indietro da lì", () => {
    const p = new Percorso();
    p.vai("cerca");
    assert.equal(p.profondita, 0);
    assert.equal(p.indietro(), null);
    assert.deepEqual(p.scheda, { tipo: "scheda", scheda: "cerca", extra: null });
  });

  test("ogni scheda nuova si aggiunge; indietro torna alla scheda di prima", () => {
    const p = new Percorso();
    p.vai("cerca");
    p.vai("generi");
    p.vai("playlist");
    assert.equal(p.profondita, 2);
    assert.deepEqual(p.indietro()?.scheda, { scheda: "generi", extra: null });
    assert.deepEqual(p.indietro()?.scheda, { scheda: "cerca", extra: null });
    assert.equal(p.indietro(), null);
  });

  test("la stessa scheda due volte di fila non aggiunge nulla", () => {
    const p = new Percorso();
    p.vai("cerca");
    p.vai("cerca");
    assert.equal(p.profondita, 0);
  });

  test("tornare a una scheda già visitata taglia la strada: niente giri", () => {
    const p = new Percorso();
    p.vai("cerca");
    p.vai("generi");
    p.vai("playlist");
    p.vai("cerca");
    assert.equal(p.profondita, 0);
    p.vai("generi");
    assert.equal(p.profondita, 1);
  });

  test("la pagina di un artista ha una voce per artista", () => {
    const p = new Percorso();
    p.vai("cerca");
    p.vai("artista", "dj testino");
    p.vai("artista", "alfa testound");
    assert.equal(p.profondita, 2);
    assert.deepEqual(p.indietro()?.scheda, { scheda: "artista", extra: "dj testino" });
    p.vai("artista", "dj testino"); // già in cima: nulla
    assert.equal(p.profondita, 1);
  });

  test("una finestra aperta è una voce: indietro la chiude, la scheda resta", () => {
    const p = new Percorso();
    p.vai("cerca");
    p.apriFinestra("foglio-overlay");
    assert.equal(p.profondita, 1);
    const r = p.indietro();
    assert.deepEqual(r?.tolta, { tipo: "finestra", id: "foglio-overlay" });
    assert.deepEqual(r?.scheda, { scheda: "cerca", extra: null });
    assert.equal(p.profondita, 0);
  });

  test("finestra sopra finestra: indietro toglie prima l'ultima", () => {
    const p = new Percorso();
    p.vai("cerca");
    p.apriFinestra("foglio-overlay");
    p.apriFinestra("aggiungi-overlay");
    assert.deepEqual(p.indietro()?.tolta, { tipo: "finestra", id: "aggiungi-overlay" });
    assert.deepEqual(p.indietro()?.tolta, { tipo: "finestra", id: "foglio-overlay" });
  });

  test("una finestra chiusa dal codice esce dalla pila (anche se non è l'ultima)", () => {
    const p = new Percorso();
    p.vai("cerca");
    p.apriFinestra("foglio-overlay");
    p.apriFinestra("aggiungi-overlay");
    assert.equal(p.chiudiFinestra("foglio-overlay"), true);
    assert.equal(p.profondita, 1);
    assert.deepEqual(p.indietro()?.tolta, { tipo: "finestra", id: "aggiungi-overlay" });
    assert.equal(p.chiudiFinestra("foglio-overlay"), false, "non risultava più aperta");
  });

  test("una finestra già aperta non si aggiunge due volte", () => {
    const p = new Percorso();
    p.vai("cerca");
    p.apriFinestra("foglio-overlay");
    p.apriFinestra("foglio-overlay");
    assert.equal(p.profondita, 1);
  });

  test("scheda aperta con una finestra sopra: indietro chiude la finestra, poi torna alla scheda di prima", () => {
    const p = new Percorso();
    p.vai("cerca");
    p.vai("generi");
    p.apriFinestra("foglio-overlay");
    assert.deepEqual(p.indietro()?.scheda, { scheda: "generi", extra: null });
    assert.deepEqual(p.indietro()?.scheda, { scheda: "cerca", extra: null });
  });

  test("cambiare scheda con una finestra ancora nella pila: tornare indietro la fa sparire", () => {
    const p = new Percorso();
    p.vai("cerca");
    p.apriFinestra("costruttore-overlay");
    p.vai("playlist");
    p.vai("cerca"); // torna a una scheda già vista: le voci sopra spariscono, finestra compresa
    assert.equal(p.profondita, 0);
  });
});
