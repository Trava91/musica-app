// Test di js/nucleo/comandi.js: il tasto grande, lo spostamento della selezione e cosa parte a fine brano.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Coda } from "../js/nucleo/coda.js";
import * as comandi from "../js/nucleo/comandi.js";

// ================================================================ tastoPrincipale ====

const T = comandi.tastoPrincipale;

test("tasto: brano in corso che suona → pausa", () => {
  assert.equal(T({ motore: "file", selezionato: "a", inCorso: "a", stato: "suona" }).azione, "pausa");
});

test("tasto: brano in corso in pausa → riprendi", () => {
  assert.equal(T({ motore: "file", selezionato: "a", inCorso: "a", stato: "pausa" }).azione, "riprendi");
});

test("tasto: scelto un altro mentre suona → suona questo", () => {
  assert.deepEqual(T({ motore: "file", selezionato: "b", inCorso: "a", stato: "suona" }), {
    azione: "suona",
    icona: "play",
    etichetta: "Suona questo",
  });
});

test("tasto: niente in corso → suona", () => {
  assert.equal(T({ motore: "file", selezionato: "a", inCorso: null, stato: "fermo" }).etichetta, "Suona");
});

test("tasto: motore esterno → apri l'app", () => {
  assert.deepEqual(T({ motore: "newpipe", selezionato: "a", inCorso: null, stato: "fermo" }), {
    azione: "apri",
    icona: "play",
    etichetta: "Manda a NewPipe",
  });
});

test("tasto: niente selezionato", () => {
  assert.equal(T({ motore: null, selezionato: null }).azione, "nessuna");
});

// ================================================== spostaSelezione e dopoFine ====

const tre = [{ id: "a" }, { id: "b" }, { id: "c" }];
const tutti = () => true;

// Questi quattro test condividono la stessa coda e girano in ordine.
describe("spostaSelezione", () => {
  const c = new Coda(tre);

  test("spostaSelezione: avanti", () => {
    assert.equal(comandi.spostaSelezione(c, 1).id, "b");
  });

  test("spostaSelezione: in fondo resta sull'ultimo", () => {
    comandi.spostaSelezione(c, 1);
    assert.equal(comandi.spostaSelezione(c, 1).id, "c");
  });

  test("spostaSelezione: con ripeti ricomincia", () => {
    c.ripeti = "tutti";
    assert.equal(comandi.spostaSelezione(c, 1).id, "a");
  });

  test("spostaSelezione: indietro dal primo con ripeti va all'ultimo", () => {
    assert.equal(comandi.spostaSelezione(c, -1).id, "c");
  });
});

describe("dopoFine", () => {
  // I primi due test guardano la stessa coda.
  const c1 = new Coda(tre);

  test("dopoFine: senza scelte parte il prossimo", () => {
    assert.equal(comandi.dopoFine(c1, "a", tutti).id, "b");
  });

  test("dopoFine: la coda si sposta sul prossimo", () => {
    assert.equal(c1.corrente.id, "b");
  });

  test("dopoFine: parte il brano scelto con ⏭", () => {
    const c = new Coda(tre);
    comandi.spostaSelezione(c, 1);
    comandi.spostaSelezione(c, 1); // mentre suona "a" scelgo "c"
    assert.equal(comandi.dopoFine(c, "a", tutti).id, "c");
  });

  test("dopoFine: salta i brani che il lettore non sa suonare", () => {
    const c = new Coda(tre);
    assert.equal(comandi.dopoFine(c, "a", (b) => b.id !== "b").id, "c");
  });

  test("dopoFine: a fine coda si ferma", () => {
    const c = new Coda(tre);
    c.salta("c");
    assert.equal(comandi.dopoFine(c, "c", tutti), null);
  });

  test("dopoFine: con ripeti tutti ricomincia", () => {
    const c = new Coda(tre, { ripeti: "tutti" });
    c.salta("c");
    assert.equal(comandi.dopoFine(c, "c", tutti).id, "a");
  });

  test("dopoFine: con ripeti uno rifà lo stesso", () => {
    const c = new Coda(tre, { ripeti: "uno" });
    assert.equal(comandi.dopoFine(c, "a", tutti).id, "a");
  });
});
