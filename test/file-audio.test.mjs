// Test di js/dati/file-audio.js: il nome dei file preparati dal PC (<id>.<estensione>) e le copie doppie di Android.

import assert from "node:assert/strict";
import { test } from "node:test";
import { idDaNome, importa } from "../js/dati/file-audio.js";
import { azzera, elenco } from "../js/nucleo/diagnostica.js";

test("idDaNome: nome preparato dal PC", () => {
  assert.equal(idDaNome("c9412dc07ba6.m4a"), "c9412dc07ba6");
});

test("idDaNome: copia doppia di Android", () => {
  assert.equal(idDaNome("C9412DC07BA6 (1).m4a"), "c9412dc07ba6");
});

test("idDaNome: file qualunque", () => {
  assert.equal(idDaNome("Dan Black - Laka Laka.mp3"), null);
});

test("idDaNome: id troppo lungo", () => {
  assert.equal(idDaNome("c9412dc07ba6ff.m4a"), null);
});

// ------------------------------------------------------------------ importazione ----

/** Un file finto come quelli del selettore. */
const finto = (nome, size = 100) => ({ name: nome, size, type: "audio/mpeg" });
const ID = (n) => String(n).padStart(12, "a");
// L'elenco dei file del telefono vive nel modulo e passa da un test all'altro: ogni test ha i suoi id.
globalThis.localStorage = /** @type {any} */ ({ getItem: () => null, setItem: () => {} });

/** Una Cache Storage finta in cui `put` può fallire per certi nomi o dopo N file. */
function conCache({ pieneDopo = Infinity, rottiPerId = [] } = {}) {
  const messi = [];
  globalThis.caches = /** @type {any} */ ({
    open: async () => ({
      put: async (chiave) => {
        const id = String(chiave).split("/audio/").pop();
        if (rottiPerId.includes(id)) throw new Error("scrittura rifiutata");
        if (messi.length >= pieneDopo) throw Object.assign(new Error("quota"), { name: "QuotaExceededError" });
        messi.push(id);
      },
    }),
  });
  return messi;
}

test("importa: copia i file riconosciuti e mette da parte quelli che non lo sono", async () => {
  const messi = conCache();
  const validi = new Set([ID(1), ID(2)]);
  const esito = await importa([finto(`${ID(1)}.mp3`), finto("canzone qualunque.mp3"), finto(`${ID(2)}.m4a`)], validi);
  assert.deepEqual(messi, [ID(1), ID(2)]);
  assert.equal(esito.aggiunti, 2);
  assert.deepEqual(esito.sconosciuti, ["canzone qualunque.mp3"]);
  assert.deepEqual(esito.falliti, []);
  assert.equal(esito.spazioFinito, false);
});

test("importa: un file che non si riesce a copiare non ferma gli altri e finisce tra i falliti", async () => {
  azzera();
  const messi = conCache({ rottiPerId: [ID(12)] });
  const validi = new Set([ID(11), ID(12), ID(13)]);
  const esito = await importa([finto(`${ID(11)}.mp3`), finto(`${ID(12)}.mp3`), finto(`${ID(13)}.mp3`)], validi);
  assert.deepEqual(messi, [ID(11), ID(13)]);
  assert.deepEqual(esito.falliti, [`${ID(12)}.mp3`]);
  assert.match(elenco()[0].testo, /scrittura rifiutata/);
});

test("importa: quando lo spazio finisce ci si ferma e si dice quanti file non sono stati copiati", async () => {
  const messi = conCache({ pieneDopo: 2 });
  const nomi = [21, 22, 23, 24, 25].map((n) => `${ID(n)}.mp3`);
  const esito = await importa(
    nomi.map((n) => finto(n)),
    new Set([21, 22, 23, 24, 25].map(ID)),
  );
  assert.equal(messi.length, 2);
  assert.equal(esito.aggiunti, 2);
  assert.equal(esito.spazioFinito, true);
  assert.equal(esito.nonCopiati, 3, "il terzo (che ha fatto finire lo spazio) e i due dopo");
});
