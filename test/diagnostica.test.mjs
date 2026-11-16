// Test di js/nucleo/diagnostica.js: il registro degli errori e la rete di sicurezza generale.

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  ascolta,
  azzera,
  azzeraMisure,
  descrivi,
  elenco,
  installaReteDiSicurezza,
  MAX_ERRORI,
  misure,
  registra,
  rigaVoce,
  segna,
  testoMisure,
  testoPerCopia,
} from "../js/nucleo/diagnostica.js";

beforeEach(() => {
  azzera();
  azzeraMisure();
});

test("descrivi: un Error, un testo, il nulla e un oggetto", () => {
  assert.equal(descrivi(new TypeError("non va")), "TypeError: non va");
  assert.equal(descrivi(new Error("")), "Error");
  assert.equal(descrivi("già un testo"), "già un testo");
  assert.equal(descrivi(undefined), "errore sconosciuto");
  assert.equal(descrivi({ codice: 7 }), '{"codice":7}');
});

test("descrivi: un oggetto con riferimenti circolari non fa saltare nulla", () => {
  const a = {};
  a.io = a;
  assert.equal(typeof descrivi(a), "string");
});

test("descrivi: un testo lungo si taglia a 300 caratteri", () => {
  const lungo = descrivi("x".repeat(1000));
  assert.ok(lungo.length <= 300);
  assert.ok(lungo.endsWith("…"));
});

test("registra: la voce ha ora, origine e testo, e l'elenco parte dalla più recente", () => {
  registra("audio", "primo");
  const v = registra("pagina", new Error("secondo"));
  assert.equal(v.origine, "pagina");
  assert.equal(v.testo, "Error: secondo");
  assert.equal(v.avviso, null);
  assert.ok(Math.abs(v.quando - Date.now()) < 5000);
  assert.deepEqual(
    elenco().map((x) => x.testo),
    ["Error: secondo", "primo"],
  );
});

test("registra: si tengono solo gli ultimi MAX_ERRORI", () => {
  for (let i = 0; i < MAX_ERRORI + 5; i++) registra("prova", `errore ${i}`);
  const voci = elenco();
  assert.equal(voci.length, MAX_ERRORI);
  assert.equal(voci[0].testo, `errore ${MAX_ERRORI + 4}`, "il più recente resta");
  assert.equal(voci.at(-1).testo, "errore 5", "i più vecchi sono usciti");
});

test("ascolta: chi ascolta riceve ogni voce, e può smettere", () => {
  const viste = [];
  const smetti = ascolta((v) => viste.push(v.testo));
  registra("a", "uno", { avviso: "frase per l'utente" });
  smetti();
  registra("a", "due");
  assert.deepEqual(viste, ["uno"]);
  assert.equal(elenco()[1].avviso, "frase per l'utente");
});

test("testoPerCopia: una riga per voce, con l'origine, la più recente per prima; vuoto se non c'è nulla", () => {
  assert.equal(testoPerCopia(), "");
  registra("audio", "vecchio");
  registra("memoria", "nuovo");
  const righe = testoPerCopia().split("\n");
  assert.equal(righe.length, 2);
  assert.match(righe[0], /^\d\d\/\d\d \d\d:\d\d:\d\d \[memoria\] nuovo$/);
  assert.match(righe[1], /\[audio\] vecchio$/);
  assert.equal(rigaVoce({ quando: 0, origine: "x", testo: "t", avviso: null }).endsWith("[x] t"), true);
});

// ------------------------------------------------------- la rete di sicurezza ----

/** Un finto `window`: si "lanciano" gli eventi a mano. */
function bersaglioFinto() {
  const ascoltatori = {};
  return {
    addEventListener: (tipo, fn) => {
      ascoltatori[tipo] = fn;
    },
    lancia: (tipo, evento) => ascoltatori[tipo](evento),
  };
}

test("rete di sicurezza: un errore della pagina finisce nel registro con una frase per l'utente", () => {
  const b = bersaglioFinto();
  installaReteDiSicurezza(b);
  b.lancia("error", { error: new RangeError("fuori misura"), message: "x" });
  const [v] = elenco();
  assert.equal(v.origine, "pagina");
  assert.equal(v.testo, "RangeError: fuori misura");
  assert.equal(v.avviso, "Qualcosa non ha funzionato: RangeError: fuori misura");
});

test("rete di sicurezza: una promessa respinta che nessuno ha raccolto viene registrata", () => {
  const b = bersaglioFinto();
  installaReteDiSicurezza(b);
  b.lancia("unhandledrejection", { reason: new Error("rete caduta") });
  assert.equal(elenco()[0].origine, "promessa");
  assert.match(elenco()[0].avviso, /rete caduta/);
});

test("rete di sicurezza: se l'evento ha solo un messaggio (errore di un altro dominio) si usa quello", () => {
  const b = bersaglioFinto();
  installaReteDiSicurezza(b);
  b.lancia("error", { error: null, message: "Script error." });
  assert.equal(elenco()[0].testo, "Script error.");
});

test("rete di sicurezza: lo stesso errore a raffica dà un avviso solo ogni 5 secondi", () => {
  const b = bersaglioFinto();
  let ora = 1000;
  installaReteDiSicurezza(b, () => ora);
  const lancia = () => b.lancia("error", { error: new Error("ciclo") });
  lancia();
  ora += 1000;
  lancia();
  ora += 1000;
  lancia();
  assert.equal(elenco().length, 3, "tutti restano nel registro");
  assert.equal(elenco().filter((v) => v.avviso).length, 1, "ma l'avviso è uno");
  ora += 6000;
  lancia();
  assert.equal(elenco().filter((v) => v.avviso).length, 2, "dopo 5 secondi se ne può dare un altro");
});

test("rete di sicurezza: gli errori di ResizeObserver (innocui) non contano", () => {
  const b = bersaglioFinto();
  installaReteDiSicurezza(b);
  b.lancia("error", { error: null, message: "ResizeObserver loop completed with undelivered notifications." });
  assert.equal(elenco().length, 0);
});

// ------------------------------------------------------------------------- misure ----

test("segna: si tiene l'ultima misura di ogni cosa, nell'ordine in cui sono comparse", () => {
  segna("indice", 120.4, "14.416 brani");
  segna("ricerca", 8);
  segna("indice", 95.2);
  assert.deepEqual(misure(), [
    { nome: "indice", ms: 95.2, nota: "" },
    { nome: "ricerca", ms: 8, nota: "" },
  ]);
});

test("testoMisure: una riga per misura, con l'etichetta, i millisecondi arrotondati e la nota", () => {
  assert.equal(testoMisure(), "");
  segna("indice", 120.4, "14.416 brani");
  segna("ricerca", 8.6);
  assert.equal(testoMisure({ indice: "Indice di ricerca" }), "Indice di ricerca: 120 ms (14.416 brani)\nricerca: 9 ms");
});
