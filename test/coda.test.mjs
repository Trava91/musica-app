// Test di js/nucleo/coda.js: scorrimento, salti, ripeti, casuale con seme, brani riproducibili,
// le voci (chi ha messo un brano e quando), "metti in coda" e "togli".

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

// ================================================================ voci ====

const ids = (coda) => coda.ordine.map((b) => b.id);
const cinque = () => [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }];

test("voci: ogni brano ricorda chi l'ha messo e quando (oggi sempre 'io')", () => {
  const c = new Coda(q, { quando: 1000 });
  assert.deepEqual(
    c.voci.map((v) => [v.brano.id, v.da, v.quando]),
    [
      ["q1", "io", 1000],
      ["q2", "io", 1000],
      ["q3", "io", 1000],
    ],
  );
  assert.equal(c.voceCorrente.brano.id, "q1");
});

test("voci: ordine resta l'elenco dei brani, anche col casuale", () => {
  const c = new Coda(cinque(), { casuale: true, seme: 3 });
  assert.deepEqual(
    c.ordine,
    c.voci.map((v) => v.brano),
  );
  c.impostaCasuale(false);
  assert.deepEqual(ids(c), ["a", "b", "c", "d", "e"]);
});

test("voci: il casuale mescola come prima (stesso seme, stesso ordine dei soli brani)", async () => {
  const { mescola } = await import("../js/nucleo/casuale.js");
  const c = new Coda(cinque(), { casuale: true, seme: 11 });
  assert.deepEqual(
    ids(c),
    mescola(cinque(), 11).map((b) => b.id),
  );
});

// ================================================================ accoda ====

describe("accoda", () => {
  test("in fondo alla coda, con chi e quando", () => {
    const c = new Coda(cinque());
    assert.equal(c.accoda({ id: "x" }, { da: "ospite", quando: 5 }), true);
    assert.deepEqual(ids(c), ["a", "b", "c", "d", "e", "x"]);
    assert.deepEqual(c.voci.at(-1), { brano: { id: "x" }, da: "ospite", quando: 5 });
    assert.equal(c.corrente.id, "a", "il brano corrente non cambia");
  });

  test("subito dopo il corrente", () => {
    const c = new Coda(cinque());
    c.salta("b");
    c.accoda({ id: "x" }, { dopoCorrente: true });
    assert.deepEqual(ids(c), ["a", "b", "x", "c", "d", "e"]);
    assert.equal(c.corrente.id, "b");
    assert.deepEqual(
      c.prossimi.map((b) => b.id),
      ["x", "c", "d", "e"],
    );
  });

  test("un brano già più avanti si sposta, non si raddoppia", () => {
    const c = new Coda(cinque());
    c.accoda({ id: "d" }, { dopoCorrente: true });
    assert.deepEqual(ids(c), ["a", "d", "b", "c", "e"]);
  });

  test("un brano già passato si sposta senza cambiare il corrente", () => {
    const c = new Coda(cinque());
    c.salta("c");
    c.accoda({ id: "a" });
    assert.deepEqual(ids(c), ["b", "c", "d", "e", "a"]);
    assert.equal(c.corrente.id, "c");
  });

  test("il brano corrente non si accoda", () => {
    const c = new Coda(cinque());
    assert.equal(c.accoda({ id: "a" }), false);
    assert.deepEqual(ids(c), ["a", "b", "c", "d", "e"]);
  });

  test("in una coda vuota il brano accodato diventa il corrente", () => {
    const c = new Coda([]);
    c.accoda({ id: "x" });
    assert.equal(c.corrente.id, "x");
  });

  test("a coda finita il brano accodato è il prossimo a suonare", () => {
    const c = new Coda([{ id: "a" }]);
    assert.equal(c.avanti(), null);
    c.accoda({ id: "x" });
    assert.equal(c.corrente.id, "x");
  });

  test("col casuale: togliendo il casuale l'accodato resta dopo il brano su cui era stato messo", () => {
    const c = new Coda(cinque(), { casuale: true, seme: 5 });
    c.salta("c");
    c.accoda({ id: "x" }, { dopoCorrente: true });
    assert.equal(c.prossimi[0].id, "x");
    c.impostaCasuale(false);
    assert.deepEqual(ids(c), ["a", "b", "c", "x", "d", "e"]);
    assert.equal(c.corrente.id, "c");
  });
});

// ================================================================= togli ====

describe("togli", () => {
  test("un brano dei prossimi", () => {
    const c = new Coda(cinque());
    c.salta("b");
    assert.equal(c.togli("d"), true);
    assert.deepEqual(ids(c), ["a", "b", "c", "e"]);
    assert.equal(c.corrente.id, "b");
  });

  test("un brano già passato: il corrente resta lo stesso", () => {
    const c = new Coda(cinque());
    c.salta("c");
    c.togli("a");
    assert.equal(c.corrente.id, "c");
    assert.equal(c.indice, 1);
  });

  test("il corrente: diventa corrente quello che veniva dopo", () => {
    const c = new Coda(cinque());
    c.salta("b");
    c.togli("b");
    assert.equal(c.corrente.id, "c");
  });

  test("l'ultimo, quando è il corrente: la coda è finita", () => {
    const c = new Coda(cinque());
    c.salta("e");
    c.togli("e");
    assert.equal(c.corrente, null);
    assert.deepEqual(c.prossimi, []);
  });

  test("l'unico brano: la coda è vuota", () => {
    const c = new Coda([{ id: "a" }]);
    c.togli("a");
    assert.equal(c.indice, -1);
    assert.equal(c.corrente, null);
  });

  test("un brano che non c'è: false, niente cambia", () => {
    const c = new Coda(cinque());
    assert.equal(c.togli("zz"), false);
    assert.deepEqual(ids(c), ["a", "b", "c", "d", "e"]);
  });

  test("tolto, non torna togliendo il casuale", () => {
    const c = new Coda(cinque(), { casuale: true, seme: 9 });
    c.togli("c");
    c.impostaCasuale(false);
    assert.deepEqual(ids(c), ["a", "b", "d", "e"]);
  });
});
