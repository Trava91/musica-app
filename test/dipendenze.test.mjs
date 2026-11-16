// Regola delle dipendenze del Jukebox: la logica pura (js/nucleo/) non sa nulla di schermo, rete o
// memoria del browser, e non importa da fuori di sé. Così lo stesso codice della coda e delle regole
// potrà girare anche su un server (la futura social radio). E solo js/ui/ tocca la pagina.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const radice = join(dirname(fileURLToPath(import.meta.url)), "..");

/** I file .js sotto una cartella dell'app (percorsi relativi con "/"). */
function elencaJs(cartella) {
  const trovati = [];
  for (const voce of readdirSync(join(radice, cartella), { withFileTypes: true })) {
    const percorso = `${cartella}/${voce.name}`;
    if (voce.isDirectory()) trovati.push(...elencaJs(percorso));
    else if (voce.name.endsWith(".js")) trovati.push(percorso);
  }
  return trovati.sort();
}

/** Il codice di un file senza i commenti (di riga, di blocco e le righe di JSDoc). */
function codiceSenzaCommenti(percorso) {
  return readFileSync(join(radice, percorso), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((riga) => riga.replace(/(^|\s)\/\/.*$/, ""))
    .join("\n");
}

/** Tutti i percorsi che un file importa o riesporta (import ... from "x", export ... from "x", import("x")). */
function importati(codice) {
  return [...codice.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)"([^"]+)"/g)].map((m) => m[1]);
}

/** Dove punta un import relativo, come percorso dalla radice dell'app (null se non è relativo). */
function risolvi(daFile, specificatore) {
  if (!specificatore.startsWith(".")) return null;
  const parti = [...daFile.split("/").slice(0, -1)];
  for (const p of specificatore.split("/")) {
    if (p === "..") parti.pop();
    else if (p !== ".") parti.push(p);
  }
  return parti.join("/");
}

const nucleo = elencaJs("js/nucleo");

test("nucleo/: c'è la logica pura da controllare", () => {
  assert.ok(nucleo.length >= 10, `file trovati in js/nucleo: ${nucleo.length}`);
});

test("nucleo/: importa solo da nucleo/ (mai da dati/, audio/, ui/, config.js, main.js)", () => {
  for (const file of nucleo) {
    for (const spec of importati(codiceSenzaCommenti(file))) {
      const dove = risolvi(file, spec);
      assert.ok(dove !== null, `${file} importa un pacchetto esterno: ${spec}`);
      assert.ok(dove.startsWith("js/nucleo/"), `${file} importa da fuori di nucleo/: ${spec}`);
    }
  }
});

test("nucleo/: non usa lo schermo, la rete né la memoria del browser", () => {
  /** @type {[string, RegExp][]} */
  const vietati = [
    ["document", /\bdocument\b/],
    ["window", /\bwindow\b/],
    ["navigator", /\bnavigator\b/],
    ["localStorage", /\blocalStorage\b/],
    ["sessionStorage", /\bsessionStorage\b/],
    ["indexedDB", /\bindexedDB\b/],
    ["fetch", /\bfetch\s*\(/],
    ["XMLHttpRequest", /\bXMLHttpRequest\b/],
    ["caches", /\bcaches\b/],
    ["Audio", /\bnew\s+Audio\b/],
  ];
  for (const file of nucleo) {
    const codice = codiceSenzaCommenti(file);
    for (const [nome, regex] of vietati) {
      assert.ok(!regex.test(codice), `${file} usa ${nome}: la logica pura non lo può fare`);
    }
  }
});

test("dati/ e audio/ non importano da ui/; solo ui/ tocca la pagina (document, window)", () => {
  for (const file of [...elencaJs("js/dati"), ...elencaJs("js/audio")]) {
    const codice = codiceSenzaCommenti(file);
    for (const spec of importati(codice)) {
      const dove = risolvi(file, spec);
      assert.ok(!dove?.startsWith("js/ui/"), `${file} importa dall'interfaccia: ${spec}`);
    }
    assert.ok(!/\bdocument\b/.test(codice), `${file} usa document: solo js/ui/ disegna la pagina`);
  }
});

test("main.js e config.js non toccano la pagina: la disegna solo js/ui/", () => {
  for (const file of ["js/main.js", "js/config.js"]) {
    assert.ok(!/\bdocument\b/.test(codiceSenzaCommenti(file)), `${file} usa document: va spostato in js/ui/`);
  }
});

test("ui/: nessuna vista decide cosa suonare (lettore, coda e comandi solo attraverso la sessione)", () => {
  const cervello = ["js/audio/lettore.js", "js/nucleo/coda.js", "js/nucleo/comandi.js"];
  const viste = elencaJs("js/ui");
  assert.ok(viste.length >= 10, `file trovati in js/ui: ${viste.length}`);
  for (const file of viste) {
    for (const spec of importati(codiceSenzaCommenti(file))) {
      const dove = `${risolvi(file, spec)}`;
      assert.ok(!cervello.includes(dove), `${file} importa ${spec}: deve passare da app.sessione`);
    }
  }
});

test("la sessione e lo stato vivono nella logica pura", () => {
  assert.ok(nucleo.includes("js/nucleo/sessione.js"));
  assert.ok(nucleo.includes("js/nucleo/stato.js"));
});

test("il controllo si accorge di una violazione (prova su codice finto)", () => {
  assert.deepEqual(importati('import { a } from "../dati/x.js";\nexport { b } from "./y.js";'), [
    "../dati/x.js",
    "./y.js",
  ]);
  assert.equal(risolvi("js/nucleo/a.js", "../dati/x.js"), "js/dati/x.js");
  assert.equal(risolvi("js/nucleo/a.js", "./b.js"), "js/nucleo/b.js");
  assert.equal(risolvi("js/nucleo/a.js", "node:fs"), null);
});
