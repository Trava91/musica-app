// Test di js/nucleo/coda.js: scorrimento, salti, ripeti, casuale con seme, brani riproducibili.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Coda } from "../js/nucleo/coda.js";

const q = [{ id: "q1" }, { id: "q2" }, { id: "q3" }];

// Dentro un gruppo i test girano in ordine e la coda si porta dietro la posizione.
describe("scorrimento", () => {
  const coda1 = new Coda(q);

  test("Coda: parte dal primo brano", () => {
    assert.equal(coda1.corrente.id, "q1");
  });

  test("Coda: avanti", () => {
    assert.equal(coda1.avanti().id, "q2");
  });

  test("Coda: avanti ancora", () => {
    assert.equal(coda1.avanti().id, "q3");
  });

  test("Coda: avanti oltre la fine, senza ripetere, dà null", () => {
    assert.equal(coda1.avanti(), null);
  });

  test("Coda: indietro dopo la fine torna all'ultimo brano", () => {
    assert.equal(coda1.indietro().id, "q3");
  });
});

describe("salti", () => {
  const coda2 = new Coda(q);

  test("Coda: salta a un id", () => {
    assert.equal(coda2.salta("q3").id, "q3");
  });

  test("Coda: salta a un id inesistente non cambia posizione", () => {
    assert.equal(coda2.salta("id-inesistente").id, "q3");
  });
});

test("Coda: con ripeti 'tutti' torna al primo", () => {
  const coda3 = new Coda(q, { ripeti: "tutti" });
  coda3.salta("q3");
  assert.equal(coda3.avanti().id, "q1");
});

test("Coda: con ripeti 'uno' resta ferma", () => {
  const coda4 = new Coda(q, { ripeti: "uno" });
  assert.equal(coda4.avanti().id, "q1");
});

test("Coda: casuale con lo stesso seme dà lo stesso ordine", () => {
  const codaA = new Coda(q, { casuale: true, seme: 7 });
  const codaB = new Coda(q, { casuale: true, seme: 7 });
  assert.deepEqual(
    codaA.ordine.map((b) => b.id),
    codaB.ordine.map((b) => b.id),
  );
});

test("Coda: prossimoRiproducibile salta i brani senza file abbinato", () => {
  const conFile = [
    { id: "p1", s: [["yt", "y1"]] },
    { id: "p2", s: [["lo", "file2.mp3"]] },
    { id: "p3", s: [["sp", "s3"]] },
  ];
  const coda5 = new Coda(conFile);
  const disponibili = new Set(["file2.mp3"]);
  const predicato = (b) => b.s.some(([c, r]) => c === "lo" && disponibili.has(r));
  assert.equal(coda5.prossimoRiproducibile(predicato).id, "p2");
});
