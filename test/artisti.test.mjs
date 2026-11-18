// Test di js/nucleo/artisti.js: l'elenco A–Z, la pagina di un artista (brani per tipo) e i
// suggerimenti mentre si scrive. Dati inventati (fixture.json).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  artistiDellaLettera,
  braniDiArtista,
  elencoArtisti,
  gruppiDiArtista,
  letteraDi,
  lettereUsate,
  suggerimenti,
} from "../js/nucleo/artisti.js";
import { vociGeneri } from "../js/nucleo/generi.js";
import { brani, fixture, ids } from "./fixture.mjs";

const elenco = elencoArtisti(brani);
const per = (id) => elenco.find((a) => a.id === id);

describe("elencoArtisti", () => {
  test("in ordine alfabetico, col numero dei brani di ognuno", () => {
    const nomi = elenco.map((a) => a.id);
    assert.deepEqual(
      nomi,
      [...nomi].sort((x, y) => x.localeCompare(y, "it")),
    );
    assert.equal(per("dj testino").n, 3);
    assert.equal(per("dj testino").nome, "DJ Testino");
    assert.equal(per("alfa testound").n, 2); // una canzone e una versione extended
  });

  test("i brani senza artista non ci sono; quelli da esplorare non contano", () => {
    assert.equal(per(""), undefined);
    assert.equal(per("esploratore ignoto"), undefined, "ha solo un brano da esplorare (x = 1)");
  });

  test("i set e i live contano come brani dell'artista", () => {
    assert.equal(per("radio immaginaria").n, 1); // un set
    assert.equal(per("concerto finto").n, 1); // un live
  });

  test("ogni artista porta le parole del suo nome (per i suggerimenti)", () => {
    assert.deepEqual(per("esempio and friends").parole, ["esempio", "and", "friends"]);
  });
});

describe("lettere", () => {
  test("letteraDi: A–Z, e # per numeri e simboli", () => {
    assert.equal(letteraDi("dj testino"), "D");
    assert.equal(letteraDi("1975"), "#");
    assert.equal(letteraDi(""), "#");
  });

  test("lettereUsate: solo quelle con artisti, # in fondo", () => {
    const e = [{ id: "zeta" }, { id: "alfa" }, { id: "2pac" }, { id: "alba" }];
    assert.deepEqual(lettereUsate(e), ["A", "Z", "#"]);
  });

  test("artistiDellaLettera: filtra, e senza lettera dà tutti", () => {
    assert.deepEqual(
      artistiDellaLettera(elenco, "A").map((a) => a.id),
      elenco.filter((a) => a.id.startsWith("a")).map((a) => a.id),
    );
    assert.equal(artistiDellaLettera(elenco, "").length, elenco.length);
  });
});

describe("gruppiDiArtista", () => {
  test("i brani raggruppati per tipo nell'ordine originali → remix → … → live → set", () => {
    const g = gruppiDiArtista(brani, "dj testino");
    assert.deepEqual(
      g.map((x) => [x.tipo, x.nome, ids(x.brani)]),
      [
        ["originale", "Originali", ["f03", "f01"]], // dentro il gruppo, per titolo: «Prova Due» prima di «Prova Uno»
        ["remix", "Remix", ["f02"]],
      ],
    );
  });

  test("i gruppi vuoti non ci sono; un artista con un solo tipo ha un solo gruppo", () => {
    assert.deepEqual(
      gruppiDiArtista(brani, "radio immaginaria").map((x) => x.tipo),
      ["set"],
    );
    assert.deepEqual(
      gruppiDiArtista(brani, "alfa testound").map((x) => x.tipo),
      ["originale", "extended"],
    );
  });

  test("un artista che non c'è, o con soli brani da esplorare: nessun gruppo", () => {
    assert.deepEqual(gruppiDiArtista(brani, "nessuno"), []);
    assert.deepEqual(gruppiDiArtista(brani, "esploratore ignoto"), []);
  });

  test("un tipo sconosciuto va in «Altro», in fondo", () => {
    const strano = [
      { id: "z1", a: "X", t: "Uno", k: "mashup", s: [], _normA: "x", _normT: "uno" },
      { id: "z2", a: "X", t: "Due", k: "live", s: [], _normA: "x", _normT: "due" },
    ];
    const g = gruppiDiArtista(strano, "x");
    assert.deepEqual(
      g.map((x) => [x.tipo, x.nome]),
      [
        ["live", "Live"],
        ["altro", "Altro"],
      ],
    );
  });

  test("braniDiArtista: la lista di «Suona tutto», gruppo dopo gruppo", () => {
    const tutti = braniDiArtista(brani, "dj testino");
    assert.equal(tutti.length, 3);
    assert.equal(tutti.at(-1).id, "f02", "il remix viene dopo gli originali");
  });
});

describe("suggerimenti", () => {
  const voci = vociGeneri(fixture.macro);
  const sugg = (testo) => suggerimenti(fixture, testo, { artisti: elenco, voci });

  test("sotto le 2 lettere (o vuoto): niente", () => {
    assert.deepEqual(sugg(""), { artisti: [], generi: [] });
    assert.deepEqual(sugg("d"), { artisti: [], generi: [] });
    assert.deepEqual(sugg("  "), { artisti: [], generi: [] });
  });

  test("gli artisti il cui nome inizia (anche in una parola) come si scrive", () => {
    // a parità di grado, prima i più forniti: dj testino 3 brani, alfa testound 2, fratelli testone 1
    assert.deepEqual(
      sugg("test").artisti.map((a) => a.id),
      ["dj testino", "alfa testound", "fratelli testone"],
    );
    assert.deepEqual(
      sugg("dj te").artisti.map((a) => a.id),
      ["dj testino"],
    );
  });

  test("più parole: tutte devono corrispondere", () => {
    assert.deepEqual(
      sugg("esempio fri").artisti.map((a) => a.id),
      ["esempio and friends"],
    );
    assert.deepEqual(sugg("esempio zzz").artisti, []);
  });

  test("maiuscole, accenti e simboli non contano", () => {
    assert.deepEqual(
      sugg("CAFÉ").artisti.map((a) => a.id),
      ["cafe finzione"],
    );
    assert.deepEqual(
      sugg("esempio &").artisti.map((a) => a.id),
      ["esempio and friends"],
    );
  });

  test("il nome identico viene prima di quelli che iniziano così", () => {
    const e = [
      { id: "mia band", nome: "Mia Band", n: 50, parole: ["mia", "band"] },
      { id: "mia", nome: "Mia", n: 1, parole: ["mia"] },
      { id: "mia mia", nome: "Mia Mia", n: 9, parole: ["mia", "mia"] },
    ];
    const r = suggerimenti(fixture, "mia", { artisti: e, voci });
    assert.deepEqual(
      r.artisti.map((a) => a.id),
      ["mia", "mia band", "mia mia"],
    );
  });

  test("al massimo 5 artisti e 3 generi", () => {
    const molti = Array.from({ length: 12 }, (_, i) => ({
      id: `band ${i}`,
      nome: `Band ${i}`,
      n: i,
      parole: ["band", String(i)],
    }));
    const r = suggerimenti(fixture, "band", { artisti: molti, voci });
    assert.equal(r.artisti.length, 5);
    assert.deepEqual(
      r.artisti.map((a) => a.n),
      [11, 10, 9, 8, 7],
    );
  });

  test("i generi: le voci il cui nome corrisponde (house e techno stanno sotto «Tech house»)", () => {
    assert.deepEqual(
      sugg("house").generi.map((v) => v.nome),
      ["Tech house"],
    );
    assert.deepEqual(
      sugg("rap").generi.map((v) => v.nome),
      ["Rap italiano"],
    );
    assert.deepEqual(
      sugg("ro").generi.map((v) => v.nome),
      ["Rock, garage e psichedelia", "Swing e rock'n'roll"],
    );
    assert.equal(sugg("e").generi.length, 0, "una lettera sola non basta");
    assert.deepEqual(sugg("zzzz"), { artisti: [], generi: [] });
  });

  test("senza l'elenco pronto lo costruisce dal catalogo", () => {
    assert.deepEqual(
      suggerimenti(fixture, "dj te").artisti.map((a) => a.id),
      ["dj testino"],
    );
  });
});
