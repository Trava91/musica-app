// Test di js/nucleo/motori.js: quale motore suona un brano e il piano di riproduzione di una lista.

import assert from "node:assert/strict";
import { test } from "node:test";
import * as motori from "../js/nucleo/motori.js";

const bFile = { id: "m1", s: [["lo", "percorso/uno.mp3"]] };
const bSp = { id: "m2", s: [["sp", "spX"]] };
const bYt = { id: "m3", s: [["yt", "ytX"]] };
const bMulti = {
  id: "m4",
  s: [
    ["sp", "spY"],
    ["yt", "ytY"],
  ],
};

test("motoreBrano: il file sul telefono vince su tutto", () => {
  assert.equal(motori.motoreBrano(bFile, { fileIds: new Set(["m1"]), spotify: "premium" }).motore, "file");
});

test("motoreBrano: il file vale per id anche se il brano non era un file locale", () => {
  assert.deepEqual(motori.motoreBrano(bSp, { fileIds: new Set(["m2"]) }).fonte, ["file", "m2"]);
});

test("motoreBrano: con Premium suona da Spotify", () => {
  assert.equal(motori.motoreBrano(bMulti, { spotify: "premium" }).motore, "spotify-premium");
});

test("motoreBrano: senza Premium, un brano solo YouTube va a NewPipe", () => {
  assert.equal(motori.motoreBrano(bYt, { spotify: "senza" }).motore, "newpipe");
});

test("motoreBrano: senza Premium, un brano solo Spotify apre l'app gratis", () => {
  assert.equal(motori.motoreBrano(bSp, { spotify: "senza" }).motore, "spotify-app");
});

test("motoreBrano: senza NewPipe, un brano YouTube va sul web", () => {
  assert.equal(motori.motoreBrano(bYt, { spotify: "senza", usaNewPipe: false }).motore, "web");
});

// ============================================================ pianoRiproduzione ====

const piano = motori.pianoRiproduzione([bFile, bSp, bYt, bMulti], { fileIds: new Set(["m1"]), spotify: "senza" });
const contaMotore = (m) => piano.gruppi.find((g) => g.motore === m)?.n || 0;

test("pianoRiproduzione: conteggio file", () => {
  assert.equal(contaMotore("file"), 1);
});

test("pianoRiproduzione: conteggio newpipe (yt singolo + multi senza premium)", () => {
  assert.equal(contaMotore("newpipe"), 2);
});

test("pianoRiproduzione: conteggio spotify-app", () => {
  assert.equal(contaMotore("spotify-app"), 1);
});

test("pianoRiproduzione: il consigliato è l'unico motore continuo", () => {
  assert.equal(piano.consigliato, "file");
});

test("pianoRiproduzione: nessun brano escluso", () => {
  assert.equal(piano.esclusi.length, 0);
});

// ================================================================ Solo Jukebox ====

const solo = { fileIds: new Set(["m1"]), spotify: "premium", soloJukebox: true };
const pianoSolo = motori.pianoRiproduzione([bFile, bSp, bYt, bMulti], solo);

test("motoreBrano: Solo Jukebox, il file suona", () => {
  assert.equal(motori.motoreBrano(bFile, solo).motore, "file");
});

test("motoreBrano: Solo Jukebox, senza file nessun motore (niente app esterne)", () => {
  assert.equal(motori.motoreBrano(bMulti, solo).motore, null);
});

test("pianoRiproduzione: Solo Jukebox, solo il gruppo file", () => {
  assert.deepEqual(
    pianoSolo.gruppi.map((g) => g.motore),
    ["file"],
  );
});

test("pianoRiproduzione: Solo Jukebox, gli altri sono esclusi", () => {
  assert.equal(pianoSolo.esclusi.length, 3);
});
