// Test di js/valida.js: il controllo di catalogo.json e playlist.json in lettura. Dati inventati.

import assert from "node:assert/strict";
import { test } from "node:test";
import { ErroreDati, validaCatalogo, validaPlaylist } from "../js/valida.js";
import { fixture } from "./fixture.mjs";

// Un catalogo minimo e valido: 2 generi, 2 raccolte, un brano.
const brano = (extra = {}) => ({ id: "a1", a: "Artista", t: "Titolo", g: 0, s: [["sp", "x1"]], r: [0], ...extra });
const catalogo = (...brani) => ({
  schema: 1,
  costruito_il: "2000-01-01",
  macro: ["Tech house", "Altro"],
  raccolte: [
    ["Mi piace", "like", "sp"],
    ["Salvati", "mia", "yt"],
  ],
  brani: brani.length ? brani : [brano()],
  rinominati: { vecchio: "a1" },
});
const idDi = (elenco) => elenco.map((b) => b.id);

// ======================================================= errori bloccanti ====

test("validaCatalogo: un file che non è un oggetto è un errore chiaro", () => {
  for (const sbagliato of [null, undefined, 42, "testo", []]) {
    assert.throws(() => validaCatalogo(sbagliato), ErroreDati);
  }
});

test("validaCatalogo: schema diverso da 1 è un errore, e il messaggio dice quale", () => {
  assert.throws(() => validaCatalogo({ ...catalogo(), schema: 2 }), { name: "ErroreDati", message: /schema 2/ });
});

test("validaCatalogo: schema assente è un errore", () => {
  const senza = catalogo();
  delete senza.schema;
  assert.throws(() => validaCatalogo(senza), { name: "ErroreDati", message: /assente/ });
});

test("validaCatalogo: brani, generi o raccolte che non sono elenchi sono un errore", () => {
  assert.throws(() => validaCatalogo({ ...catalogo(), brani: {} }), { message: /brani/ });
  assert.throws(() => validaCatalogo({ ...catalogo(), macro: "Tech house" }), { message: /generi/ });
  assert.throws(() => validaCatalogo({ ...catalogo(), raccolte: null }), { message: /raccolte/ });
});

// ============================================================ catalogo buono ====

test("validaCatalogo: un catalogo a posto passa senza scarti né avvisi", () => {
  const dati = catalogo(brano(), brano({ id: "a2", t: "Altro Titolo" }));
  const { catalogo: ok, scartati, avvisi } = validaCatalogo(dati);
  assert.deepEqual(scartati, []);
  assert.deepEqual(avvisi, []);
  assert.deepEqual(idDi(ok.brani), ["a1", "a2"]);
});

test("validaCatalogo: i brani a posto restano gli stessi oggetti (niente copie inutili)", () => {
  const dati = catalogo(brano(), brano({ id: "a2", t: "Altro Titolo" }));
  const { catalogo: ok } = validaCatalogo(dati);
  assert.equal(ok.brani[0], dati.brani[0]);
  assert.equal(ok.brani[1], dati.brani[1]);
});

test("validaCatalogo: il resto del catalogo (rinominati, data, generi, raccolte) viaggia intatto", () => {
  const dati = catalogo();
  const { catalogo: ok } = validaCatalogo(dati);
  assert.deepEqual(ok.rinominati, { vecchio: "a1" });
  assert.equal(ok.costruito_il, "2000-01-01");
  assert.deepEqual(ok.macro, dati.macro);
  assert.deepEqual(ok.raccolte, dati.raccolte);
});

test("validaCatalogo: non modifica i dati che riceve", () => {
  const dati = catalogo(
    brano({
      g: 9,
      r: [0, 7],
      y: "x",
      s: [
        ["sp", "x1"],
        ["zz", "no"],
      ],
    }),
    { id: "senza-fonti", a: "A", t: "T" },
  );
  const prima = JSON.stringify(dati);
  validaCatalogo(dati);
  assert.equal(JSON.stringify(dati), prima);
});

test("validaCatalogo: la fixture di test passa senza scarti; l'unico avviso è il brano senza artista (f27)", () => {
  const { scartati, avvisi, catalogo: ok } = validaCatalogo(fixture);
  assert.deepEqual(scartati, []);
  assert.deepEqual(avvisi, ["1 brano senza artista"]);
  assert.equal(ok.brani.length, fixture.brani.length);
});

// =========================================================== brani scartati ====

test("brano scartato: senza id", () => {
  const { catalogo: ok, scartati } = validaCatalogo(catalogo(brano(), brano({ id: undefined })));
  assert.deepEqual(idDi(ok.brani), ["a1"]);
  assert.equal(scartati.length, 1);
  assert.match(scartati[0].motivo, /senza id/);
});

test("brano scartato: id che non è testo", () => {
  const { catalogo: ok, scartati } = validaCatalogo(catalogo(brano(), brano({ id: 123 }), brano({ id: "" })));
  assert.deepEqual(idDi(ok.brani), ["a1"]);
  assert.equal(scartati.length, 2);
});

test("brano scartato: senza fonti, con fonti che non sono un elenco, o con l'elenco vuoto", () => {
  const dati = catalogo(
    brano(),
    brano({ id: "n1", s: undefined }),
    brano({ id: "n2", s: "sp:x" }),
    brano({ id: "n3", s: [] }),
  );
  const { catalogo: ok, scartati } = validaCatalogo(dati);
  assert.deepEqual(idDi(ok.brani), ["a1"]);
  assert.deepEqual(idDi(scartati), ["n1", "n2", "n3"]);
});

test("brano scartato: tutte le fonti malformate", () => {
  const dati = catalogo(brano({ id: "m1", s: [["zz", "x"], ["sp"], ["yt", ""], "yt:abc", ["sc", 5]] }));
  const { catalogo: ok, scartati } = validaCatalogo(dati);
  assert.deepEqual(ok.brani, []);
  assert.match(scartati[0].motivo, /fonte valida/);
});

test("brano scartato: id già visto, si tiene il primo", () => {
  const dati = catalogo(brano({ t: "Primo" }), brano({ t: "Secondo" }));
  const { catalogo: ok, scartati } = validaCatalogo(dati);
  assert.equal(ok.brani.length, 1);
  assert.equal(ok.brani[0].t, "Primo");
  assert.deepEqual(idDi(scartati), ["a1"]);
});

test("brano scartato: un doppione di un brano a sua volta scartato non conta come 'già visto'", () => {
  const dati = catalogo(brano({ s: [] }), brano({ t: "Quello buono" }));
  const { catalogo: ok, scartati } = validaCatalogo(dati);
  assert.equal(ok.brani.length, 1);
  assert.equal(ok.brani[0].t, "Quello buono");
  assert.equal(scartati.length, 1);
});

test("brano scartato: una voce che non è un brano (null, numero, elenco)", () => {
  const { catalogo: ok, scartati } = validaCatalogo(catalogo(brano(), null, 42, ["a"]));
  assert.equal(ok.brani.length, 1);
  assert.equal(scartati.length, 3);
});

// ======================================================= campi corretti ====

test("fonti: quelle malformate si tolgono, le buone restano, il brano si tiene", () => {
  const dati = catalogo(
    brano({
      s: [
        ["sp", "x1"],
        ["zz", "no"],
        ["yt", "y1"],
      ],
    }),
  );
  const { catalogo: ok, scartati, avvisi } = validaCatalogo(dati);
  assert.deepEqual(scartati, []);
  assert.deepEqual(ok.brani[0].s, [
    ["sp", "x1"],
    ["yt", "y1"],
  ]);
  assert.match(avvisi.join("|"), /1 brano con fonti malformate/);
});

test("genere: fuori dall'elenco dei generi viene tolto, il brano si tiene", () => {
  for (const sbagliato of [2, 17, -1, 1.5, "0", null]) {
    const { catalogo: ok, scartati } = validaCatalogo(catalogo(brano({ g: sbagliato })));
    assert.deepEqual(scartati, [], `g = ${JSON.stringify(sbagliato)}`);
    assert.equal(ok.brani.length, 1);
    assert.ok(!("g" in ok.brani[0]), `g = ${JSON.stringify(sbagliato)} doveva sparire`);
  }
});

test("genere: un indice valido resta", () => {
  assert.equal(validaCatalogo(catalogo(brano({ g: 1 }))).catalogo.brani[0].g, 1);
});

test("raccolte: gli indici fuori dall'elenco si tolgono, gli altri restano", () => {
  const { catalogo: ok, avvisi } = validaCatalogo(catalogo(brano({ r: [0, 5, 1, -1, "0"] })));
  assert.deepEqual(ok.brani[0].r, [0, 1]);
  assert.match(avvisi.join("|"), /raccolte che non esistono/);
});

test("raccolte: se mancano diventano una lista vuota (senza avviso)", () => {
  const { catalogo: ok, avvisi } = validaCatalogo(catalogo(brano({ r: undefined })));
  assert.deepEqual(ok.brani[0].r, []);
  assert.deepEqual(avvisi, []);
});

test("raccolte: se non sono un elenco diventano una lista vuota, con avviso", () => {
  const { catalogo: ok, avvisi } = validaCatalogo(catalogo(brano({ r: "0" })));
  assert.deepEqual(ok.brani[0].r, []);
  assert.equal(avvisi.length, 1);
});

test("anno, durata, bpm ed energia non numerici si tolgono (uno per uno)", () => {
  for (const campo of ["y", "d", "b", "e"]) {
    const { catalogo: ok, scartati, avvisi } = validaCatalogo(catalogo(brano({ [campo]: "tanti" })));
    assert.deepEqual(scartati, [], campo);
    assert.ok(!(campo in ok.brani[0]), `${campo} doveva sparire`);
    assert.equal(avvisi.length, 1, campo);
  }
});

test("anno, durata, bpm ed energia validi restano com'erano", () => {
  const b = brano({ y: 1994, d: 215, b: 124.5, e: 0.7 });
  const { catalogo: ok, avvisi } = validaCatalogo(catalogo(b));
  assert.equal(ok.brani[0], b);
  assert.deepEqual(avvisi, []);
});

test("un numero non finito (NaN, Infinity) non è un valore valido", () => {
  const { catalogo: ok } = validaCatalogo(catalogo(brano({ b: Number.NaN, e: Number.POSITIVE_INFINITY })));
  assert.ok(!("b" in ok.brani[0]));
  assert.ok(!("e" in ok.brani[0]));
});

// ============================================================ solo avvisi ====

test("senza titolo o senza artista: il brano si tiene e si conta", () => {
  const dati = catalogo(
    brano({ id: "s1", t: undefined }),
    brano({ id: "s2", t: "   " }),
    brano({ id: "s3", a: undefined, t: "Titolo tre" }),
    brano({ id: "s4", a: "" }),
  );
  const { catalogo: ok, scartati, avvisi } = validaCatalogo(dati);
  assert.deepEqual(scartati, []);
  assert.equal(ok.brani.length, 4);
  assert.ok(avvisi.includes("2 brani senza titolo"), avvisi.join("|"));
  assert.ok(avvisi.includes("2 brani senza artista"), avvisi.join("|"));
});

test("coppie artista + titolo + versione ripetute: si tengono entrambe e si contano", () => {
  const dati = catalogo(
    brano({ id: "r1", a: "Dj Prova", t: "Brano" }),
    brano({ id: "r2", a: "DJ PROVA", t: "brano" }), // stessa coppia, maiuscole diverse
    brano({ id: "r3", a: "Dj Prova", t: "Brano", v: "Remix" }), // la versione è diversa: non è ripetuta
    brano({ id: "r4", a: "Altro", t: "Brano" }),
  );
  const { catalogo: ok, avvisi } = validaCatalogo(dati);
  assert.equal(ok.brani.length, 4);
  assert.deepEqual(avvisi, ["1 coppia artista + titolo + versione ripetuta"]);
});

test("più di una coppia ripetuta: l'avviso è al plurale", () => {
  const dati = catalogo(
    brano({ id: "r1", a: "A", t: "Uno" }),
    brano({ id: "r2", a: "A", t: "Uno" }),
    brano({ id: "r3", a: "B", t: "Due" }),
    brano({ id: "r4", a: "B", t: "Due" }),
  );
  assert.deepEqual(validaCatalogo(dati).avvisi, ["2 coppie artista + titolo + versione ripetute"]);
});

test("due brani senza titolo né artista non si contano come coppia ripetuta", () => {
  const dati = catalogo(
    brano({ id: "v1", a: undefined, t: undefined }),
    brano({ id: "v2", a: undefined, t: undefined }),
  );
  assert.ok(!validaCatalogo(dati).avvisi.some((a) => a.includes("ripetut")));
});

// ================================================================ playlist ====

const manuale = (extra = {}) => ({ id: "p1", nome: "A mano", tipo: "manuale", brani: ["a1"], ...extra });
const intelligente = (extra = {}) => ({
  id: "p2",
  nome: "Coi filtri",
  tipo: "intelligente",
  regole: { macro: [0] },
  ordine: "artista",
  ...extra,
});

test("validaPlaylist: playlist a posto passano senza scarti né avvisi, e restano gli stessi oggetti", () => {
  const dati = { schema: 1, playlist: [manuale(), intelligente()] };
  const { playlist, scartate, avvisi } = validaPlaylist(dati);
  assert.deepEqual(scartate, []);
  assert.deepEqual(avvisi, []);
  assert.equal(playlist[0], dati.playlist[0]);
  assert.equal(playlist[1], dati.playlist[1]);
});

test("validaPlaylist: senza id, senza nome, o con un tipo che non esiste → scartata", () => {
  const dati = {
    schema: 1,
    playlist: [
      manuale(),
      manuale({ id: undefined }),
      manuale({ id: "n1", nome: undefined }),
      manuale({ id: "n2", nome: "  " }),
      manuale({ id: "n3", tipo: "magica" }),
      42,
    ],
  };
  const { playlist, scartate } = validaPlaylist(dati);
  assert.deepEqual(idDi(playlist), ["p1"]);
  assert.equal(scartate.length, 5);
  assert.deepEqual(
    scartate.map((s) => s.id),
    [null, "n1", "n2", "n3", null],
  );
});

test("validaPlaylist: id doppio, si tiene la prima", () => {
  const dati = { schema: 1, playlist: [manuale({ nome: "Prima" }), manuale({ nome: "Seconda" })] };
  const { playlist, scartate } = validaPlaylist(dati);
  assert.equal(playlist.length, 1);
  assert.equal(playlist[0].nome, "Prima");
  assert.deepEqual(idDi(scartate), ["p1"]);
});

test("validaPlaylist: una manuale senza l'elenco dei brani ne ha uno vuoto (era il crash di 'Aggiungi a playlist')", () => {
  const { playlist, avvisi } = validaPlaylist({ schema: 1, playlist: [manuale({ brani: undefined })] });
  assert.deepEqual(playlist[0].brani, []);
  assert.equal(avvisi.length, 1);
});

test("validaPlaylist: una intelligente senza regole ne ha un oggetto vuoto", () => {
  for (const sbagliate of [undefined, null, "macro", []]) {
    const { playlist } = validaPlaylist({ schema: 1, playlist: [intelligente({ regole: sbagliate })] });
    assert.deepEqual(playlist[0].regole, {}, JSON.stringify(sbagliate));
  }
});

test("validaPlaylist: non modifica i dati che riceve", () => {
  const dati = { schema: 1, playlist: [manuale({ brani: undefined }), intelligente({ regole: null })] };
  const prima = JSON.stringify(dati);
  validaPlaylist(dati);
  assert.equal(JSON.stringify(dati), prima);
});

test("validaPlaylist: un file senza elenco vale 'nessuna playlist', con un avviso e senza errori", () => {
  for (const vuoto of [{}, { schema: 1 }, { schema: 1, playlist: "x" }, null, undefined]) {
    const { playlist, scartate, avvisi } = validaPlaylist(vuoto);
    assert.deepEqual(playlist, []);
    assert.deepEqual(scartate, []);
    assert.equal(avvisi.length, 1);
  }
});

test("validaPlaylist: un formato diverso si legge lo stesso, con un avviso", () => {
  const { playlist, avvisi } = validaPlaylist({ schema: 2, playlist: [manuale()] });
  assert.equal(playlist.length, 1);
  assert.match(avvisi[0], /schema 2/);
});
