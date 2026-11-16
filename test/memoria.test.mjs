// Test di js/memoria.js: scrivere nella memoria del telefono senza che un errore passi in silenzio.

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { scrivi } from "../js/memoria.js";
import { azzera, elenco } from "../js/nucleo/diagnostica.js";

beforeEach(() => azzera());

const memoriaPiena = () => ({
  setItem: () => {
    throw Object.assign(new Error("The quota has been exceeded."), { name: "QuotaExceededError" });
  },
});

test("scrivi: scrive e dice true", () => {
  const dati = new Map();
  assert.equal(scrivi("jukebox.prova", "1", { setItem: (k, v) => dati.set(k, v) }), true);
  assert.equal(dati.get("jukebox.prova"), "1");
  assert.deepEqual(elenco(), []);
});

test("scrivi: con la memoria piena dice false e lascia un avviso comprensibile nella diagnostica", () => {
  assert.equal(scrivi("jukebox.prova", "1", memoriaPiena()), false);
  const [voce] = elenco();
  assert.equal(voce.origine, "memoria");
  assert.match(voce.avviso, /memoria dell'app sul telefono è piena.*Libera spazio/);
});

test("scrivi: se la memoria non è disponibile (bloccata) lo dice con un altro avviso", () => {
  const bloccata = {
    setItem: () => {
      throw Object.assign(new Error("denied"), { name: "SecurityError" });
    },
  };
  assert.equal(scrivi("jukebox.prova", "1", bloccata), false);
  assert.match(elenco()[0].avviso, /Non riesco a salvare le impostazioni/);
});

test("scrivi: senza localStorage (come in Node) non lancia errori: false e un avviso", () => {
  assert.equal(scrivi("jukebox.prova", "1"), false);
  assert.equal(elenco().length, 1);
});
