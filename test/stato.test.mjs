// Test di js/nucleo/stato.js: il contenitore dello stato dell'app (catalogo, playlist, filtri,
// ordine, ctx, scheda), l'indice id → brano e gli avvisi a chi ascolta.

import assert from "node:assert/strict";
import { test } from "node:test";
import { ctxIniziale, FILTRI_DEFAULT, Stato } from "../js/nucleo/stato.js";
import { fixture } from "./fixture.mjs";

test("stato: i valori di partenza", () => {
  const s = new Stato().leggi();
  assert.equal(s.catalogo, null);
  assert.deepEqual(s.voci, []);
  assert.deepEqual(s.playlist, []);
  assert.deepEqual(s.filtri, { soloScelti: true, tipo: "canzoni" });
  assert.equal(s.ordine, undefined);
  assert.equal(s.scheda, null);
  assert.deepEqual(s.ctx, ctxIniziale());
});

test("stato: i filtri di partenza sono una copia (cambiarli non tocca FILTRI_DEFAULT)", () => {
  const s = new Stato();
  assert.notEqual(s.leggi().filtri, FILTRI_DEFAULT);
  assert.ok(Object.isFrozen(FILTRI_DEFAULT));
});

test("stato: col catalogo arrivano l'indice id → brano e le voci di genere", () => {
  const s = new Stato();
  s.cambia({ catalogo: fixture });
  const primo = fixture.brani[0];
  assert.equal(s.brano(primo.id), primo);
  assert.equal(s.brano("id-che-non-esiste"), null);
  assert.ok(s.leggi().voci.length > 0);
  assert.ok(s.leggi().voci.length < fixture.macro.length, "Tech house e Disco raggruppano più generi");
});

test("stato: un catalogo nuovo rifà l'indice (un id sparito non si trova più)", () => {
  const s = new Stato({ catalogo: fixture });
  const via = fixture.brani[0].id;
  s.cambia({ catalogo: { ...fixture, brani: fixture.brani.slice(1) } });
  assert.equal(s.brano(via), null);
  assert.equal(s.brano(fixture.brani[1].id), fixture.brani[1]);
});

test("stato: chi ascolta riceve solo le chiavi davvero cambiate", () => {
  const s = new Stato();
  const visti = [];
  s.ascolta((cambiati) => visti.push(cambiati));
  const playlist = [{ id: "p", nome: "P", tipo: "manuale", brani: [] }];
  s.cambia({ playlist, scheda: "cerca" });
  s.cambia({ playlist, scheda: "cerca" }); // uguali: nessun avviso
  s.cambia({ scheda: "generi" });
  assert.deepEqual(visti, [["playlist", "scheda"], ["scheda"]]);
});

test("stato: cambia restituisce le chiavi cambiate e lascia il resto com'era", () => {
  const s = new Stato();
  const filtri = s.leggi().filtri;
  assert.deepEqual(s.cambia({ ordine: "bpm" }), ["ordine"]);
  assert.equal(s.leggi().filtri, filtri);
  assert.deepEqual(s.cambia({ ordine: "bpm" }), []);
});

test("stato: col catalogo cambiano anche le voci, e chi ascolta lo sa", () => {
  const s = new Stato();
  let visti = [];
  s.ascolta((cambiati) => {
    visti = cambiati;
  });
  s.cambia({ catalogo: fixture });
  assert.deepEqual(visti.sort(), ["catalogo", "voci"]);
});

test("stato: cambiaCtx cambia solo alcuni campi e crea un ctx nuovo", () => {
  const s = new Stato();
  const prima = s.leggi().ctx;
  const fileIds = new Set(["f01"]);
  assert.deepEqual(s.cambiaCtx({ fileIds }), ["ctx"]);
  const dopo = s.leggi().ctx;
  assert.notEqual(dopo, prima);
  assert.equal(dopo.fileIds, fileIds);
  assert.equal(dopo.usaNewPipe, true);
  assert.equal(prima.fileIds.size, 0, "il ctx di prima non si tocca");
});

test("stato: chi ascolta vede già lo stato nuovo", () => {
  const s = new Stato();
  let visto = null;
  s.ascolta((_cambiati, dati) => {
    visto = [dati.scheda, s.leggi().scheda];
  });
  s.cambia({ scheda: "playlist" });
  assert.deepEqual(visto, ["playlist", "playlist"]);
});

test("stato: ascolta restituisce la funzione per smettere", () => {
  const s = new Stato();
  let n = 0;
  const smetti = s.ascolta(() => n++);
  s.cambia({ scheda: "cerca" });
  smetti();
  s.cambia({ scheda: "generi" });
  assert.equal(n, 1);
});
