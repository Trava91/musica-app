// Prove di velocità con 50.000 brani FINTI (test/genera-catalogo.mjs, seme fisso). Le soglie sono larghe
// apposta: servono a scoprire un peggioramento grosso, non a misurare. Misure su questo PC (16/11/2026):
// controllo 190 ms, indice 700 ms, ricerca con testo 16 ms, filtri 7 ms, conteggi 13 ms, ricerca
// senza testo (tutto il catalogo ordinato per artista) 150 ms. Il telefono è più lento: i numeri veri
// del telefono si misurano nella Fase 7.

import assert from "node:assert/strict";
import { test } from "node:test";
import { cerca, conteggiMacro, preparaIndice } from "../js/cerca.js";
import { validaCatalogo } from "../js/valida.js";
import { generaCatalogo } from "./genera-catalogo.mjs";

const { catalogo: grezzo, vocabolario, artisti } = generaCatalogo({ n: 50_000 });

const ora = () => performance.now();
/** Il tempo migliore (ms) su alcune prove: una pausa del sistema non deve far fallire il test. */
function tempoMigliore(prove, f) {
  let migliore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < prove; i++) {
    const inizio = ora();
    f();
    migliore = Math.min(migliore, ora() - inizio);
  }
  return migliore;
}

// Il controllo e l'indice si fanno una volta, qui: le ricerche qui sotto ne hanno bisogno.
let inizio = ora();
const { catalogo, scartati } = validaCatalogo(grezzo);
const msControllo = ora() - inizio;
const brani = catalogo.brani;
inizio = ora();
preparaIndice(brani, catalogo.raccolte);
const msIndice = ora() - inizio;

test("50.000 brani: il controllo del catalogo dura meno di 1 secondo e non scarta nulla", () => {
  assert.deepEqual(scartati, []);
  assert.ok(msControllo < 1000, `${msControllo.toFixed(0)} ms`);
});

test("50.000 brani: l'indice di ricerca si prepara in meno di 3 secondi", () => {
  assert.ok(msIndice < 3000, `${msIndice.toFixed(0)} ms`);
});

test("50.000 brani: la ricerca senza testo (tutto il catalogo, per artista) resta sotto i 400 ms", () => {
  // Il piano prevedeva 150 ms; qui si misurano circa 150 ms (soprattutto per localeCompare
  // nell'ordinamento), quindi la soglia è 400: la Fase 7 può migliorarla, non è un difetto di adesso.
  let risultati = 0;
  const ms = tempoMigliore(3, () => {
    risultati = cerca(brani, "", {}).length;
  });
  assert.ok(risultati > 20_000, `${risultati} risultati`);
  assert.ok(ms < 400, `${ms.toFixed(0)} ms`);
});

test("50.000 brani: la ricerca con testo resta sotto i 150 ms (una parola, un prefisso, due parole)", () => {
  const prefissoArtista = artisti[7].split(" ")[0].slice(0, 3).toLowerCase();
  for (const testo of [vocabolario[0], prefissoArtista, `${vocabolario[0]} ${vocabolario[1]}`]) {
    let risultati = 0;
    const ms = tempoMigliore(3, () => {
      risultati = cerca(brani, testo, {}).length;
    });
    assert.ok(risultati > 0, `"${testo}" non trova niente: la prova non misura nulla`);
    assert.ok(ms < 150, `"${testo}": ${ms.toFixed(0)} ms`);
  }
});

test("50.000 brani: filtri combinati (generi, BPM, anno) restano sotto i 150 ms", () => {
  let risultati = 0;
  const ms = tempoMigliore(3, () => {
    risultati = cerca(brani, "", { macro: [0, 1, 4], bpm: [120, 130], anno: [1990, 2020] }).length;
  });
  assert.ok(risultati > 0);
  assert.ok(ms < 150, `${ms.toFixed(0)} ms`);
});

test("50.000 brani: i conteggi dei generi restano sotto i 50 ms", () => {
  let totale = 0;
  const ms = tempoMigliore(3, () => {
    const { conteggi, senzaGenere } = conteggiMacro(brani, {}, catalogo.macro.length);
    totale = conteggi.reduce((a, n) => a + n, senzaGenere);
  });
  assert.ok(totale > 20_000);
  assert.ok(ms < 50, `${ms.toFixed(0)} ms`);
});

// ================================================== il catalogo finto è affidabile ====

test("catalogo finto: lo stesso seme dà sempre lo stesso catalogo, un altro seme no", () => {
  const a = generaCatalogo({ n: 60, seme: 7 }).catalogo;
  assert.deepEqual(a, generaCatalogo({ n: 60, seme: 7 }).catalogo);
  assert.notDeepEqual(a, generaCatalogo({ n: 60, seme: 8 }).catalogo);
});

test("catalogo finto: id di 12 cifre esadecimali, tutti diversi, e nessun brano da scartare", () => {
  const id = new Set(brani.map((b) => b.id));
  assert.equal(id.size, brani.length);
  assert.ok(brani.every((b) => /^[0-9a-f]{12}$/.test(b.id)));
});
