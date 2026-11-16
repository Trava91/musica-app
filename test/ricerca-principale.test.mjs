// La ricerca vista da chi la usa: per titolo, per artista, per genere (testo e filtro), con accenti e
// maiuscole, senza risultati, per pertinenza. Nomi leggibili apposta: se uno fallisce si capisce cosa
// ha smesso di funzionare. Dati inventati (test/fixture.json), compresi i casi limite: un brano senza
// artista (f27), uno senza genere (f28), uno con più fonti (f29).

import assert from "node:assert/strict";
import { test } from "node:test";
import { cerca } from "../js/nucleo/cerca.js";
import { brani, ids } from "./fixture.mjs";

const trova = (testo, filtri, ordine) => ids(cerca(brani, testo, filtri, ordine));

// ================================================================= per testo ====

test("per titolo: scrivere il titolo trova il brano", () => {
  assert.deepEqual(trova("Rima Finta"), ["f23"]);
});

test("per titolo: bastano le prime lettere delle parole", () => {
  assert.deepEqual(trova("rim fin"), ["f23"]);
});

test("per artista: scrivere l'artista trova tutti i suoi brani", () => {
  assert.deepEqual(trova("Testino").sort(), ["f01", "f02", "f03"]);
});

test("per artista e titolo insieme: ogni parola restringe la ricerca", () => {
  assert.deepEqual(trova("testino due"), ["f03"]);
});

test("per genere (testo): i generi fini del brano si cercano come parole", () => {
  assert.deepEqual(trova("bossa"), ["f29"]);
});

test("per raccolta: anche il nome della raccolta in cui sta il brano si cerca", () => {
  assert.deepEqual(trova("Raccolta SoundCloud"), ["f04", "f29", "f22"]);
});

// ========================================================== per genere (filtro) ====

test("per genere (filtro): solo i brani di quel genere, in ordine di artista", () => {
  assert.deepEqual(trova("", { macro: [8] }), ["f14", "f23"]);
});

test("per genere (filtro) e testo insieme: valgono tutti e due", () => {
  assert.deepEqual(trova("esempio", { macro: [8] }), ["f23"]);
});

test("per più generi insieme: basta uno dei due", () => {
  assert.deepEqual(trova("", { macro: [8, 10] }).sort(), ["f14", "f21", "f23"]);
});

// ====================================================== accenti e maiuscole ====

test("le maiuscole non contano", () => {
  assert.deepEqual(trova("CAFE FINZIONE"), ["f05"]);
});

test("gli accenti non contano, né quando si scrive né nel catalogo", () => {
  assert.deepEqual(trova("café"), ["f05"]);
  assert.deepEqual(trova("cafe"), ["f05"]);
  assert.deepEqual(trova("ÜNÏCODE tëst"), ["f05"]);
  assert.deepEqual(trova("unicode test"), ["f05"]);
});

test("la punteggiatura non conta", () => {
  assert.deepEqual(trova("Esempio & Friends"), ["f04"]);
  assert.deepEqual(trova("esempio, friends!"), ["f04"]);
});

// ======================================================== nessun risultato ====

test("senza risultati: una parola che non c'è dà una lista vuota", () => {
  assert.deepEqual(trova("zzzzqqq"), []);
});

test("senza risultati: basta una parola sbagliata per escludere il brano", () => {
  assert.deepEqual(trova("testino zzzzqqq"), []);
});

test("senza risultati: filtri che non si incontrano mai danno una lista vuota", () => {
  assert.deepEqual(trova("", { macro: [3], bpm: [1, 2] }), []);
});

test("il testo vuoto non è un errore: dà tutto ciò che passa i filtri di default", () => {
  const predefiniti = trova("", {});
  assert.equal(predefiniti.length, brani.length - 2);
  assert.ok(!predefiniti.includes("f06")); // i set restano fuori di default
  assert.ok(!predefiniti.includes("f08")); // e l'esplorazione pure
});

test("senza l'oggetto dei filtri non si esclude niente, nemmeno set ed esplorazione", () => {
  assert.equal(trova("").length, brani.length);
});

// ===================================================== ordine per pertinenza ====

test("pertinenza: il titolo esatto viene prima di chi ha solo le parole", () => {
  assert.deepEqual(trova("prova uno"), ["f01", "f02"]);
});

test("pertinenza: l'artista che inizia con la parola viene prima di chi la ha solo tra i generi", () => {
  // f25 si chiama "Samba Immaginaria"; f29 ha "samba" solo nei generi fini.
  assert.deepEqual(trova("samba"), ["f25", "f29"]);
});

test("pertinenza: l'artista esatto batte il titolo, il titolo batte il resto", () => {
  assert.deepEqual(trova("esempio completo"), ["f11", "f13", "f12"]);
});

// =============================================================== casi limite ====

test("un brano senza artista si trova dal titolo", () => {
  assert.deepEqual(trova("titolo senza artista"), ["f27"]);
});

test("un brano senza artista va in fondo all'ordine per artista", () => {
  assert.equal(trova("", {}, "artista").at(-1), "f27");
});

test("un brano senza genere si trova e non rompe i filtri sul genere", () => {
  assert.deepEqual(trova("brano neutro"), ["f28"]);
  assert.ok(!trova("", { macro: [0, 1, 2, 3] }).includes("f28"));
});

test("un brano con più fonti compare una volta sola, e il filtro per piattaforma lo trova su ognuna", () => {
  assert.deepEqual(trova("tre piattaforme"), ["f29"]);
  assert.ok(trova("", { piattaforme: ["sp"] }).includes("f29"));
  assert.ok(trova("", { piattaforme: ["yt"] }).includes("f29"));
  assert.deepEqual(trova("", { piattaforme: ["sc"] }), ["f04", "f29", "f22"]);
  assert.deepEqual(trova("", { piattaforme: ["lo"] }), ["f07"]);
});
