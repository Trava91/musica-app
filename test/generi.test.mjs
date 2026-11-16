// Test di js/generi.js: i generi raggruppati nelle voci mostrate dal Jukebox.

import assert from "node:assert/strict";
import { test } from "node:test";
import * as generi from "../js/generi.js";

const MACRO = [
  "Tech house",
  "Deep e melodic",
  "Disco e funky house",
  "Chicago e acid",
  "Techno",
  "Minimal",
  "Disco, funk e soul",
  "Jazz e blues",
];
const voci = generi.vociGeneri(MACRO);

test("vociGeneri: house/techno in una voce, disco in un'altra", () => {
  assert.deepEqual(
    voci.map((v) => v.nome),
    ["Tech house", "Disco", "Jazz e blues"],
  );
});

test("vociGeneri: la voce Disco unisce disco house e disco/funk/soul", () => {
  assert.deepEqual(voci[1].indici, [2, 6]);
});

test("vociGeneri: la voce Tech house tiene tutti i suoi indici", () => {
  assert.deepEqual(voci[0].indici, [0, 1, 3, 4, 5]);
});

test("voceDi: Techno sta nella voce Tech house", () => {
  assert.equal(generi.voceDi(voci, 4), 0);
});

test("voceDi: genere mancante", () => {
  assert.equal(generi.voceDi(voci, undefined), -1);
});

test("vociSelezionate: solo le voci complete", () => {
  assert.deepEqual(
    generi.vociSelezionate(voci, [0, 1, 3, 4, 5, 7]).map((v) => v.nome),
    ["Tech house", "Jazz e blues"],
  );
});

test("vociSelezionate: voce parziale esclusa", () => {
  assert.equal(generi.vociSelezionate(voci, [4]).length, 0);
});

test("vociGeneri: catalogo senza i membri del gruppo", () => {
  assert.deepEqual(
    generi.vociGeneri(["Rock"]).map((v) => v.nome),
    ["Rock"],
  );
});
