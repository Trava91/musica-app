// Contratti: le "chiavi" che l'app già installata sul telefono ha in memoria. Se cambiano, il telefono
// perde il token, i file audio importati e le impostazioni (e va reimportato tutto): per questo ogni
// valore di questa tabella è inchiodato qui. Cambiarne uno è una scelta, non una svista: in quel caso si
// aggiorna questo test insieme al codice, sapendo cosa si rompe sul telefono.
//
// Vale anche la regola dell'origine condivisa: l'app burocrazia vive sullo stesso indirizzo
// (trava91.github.io), quindi qui dentro MAI localStorage.clear() e MAI chiavi senza prefisso "jukebox.".

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const radice = join(dirname(fileURLToPath(import.meta.url)), "..");
const leggi = (percorso) => readFileSync(join(radice, percorso), "utf-8");

/** Tutti i file sotto una cartella, come percorsi relativi con "/" (in ordine). */
function elencaFile(cartella) {
  const trovati = [];
  for (const voce of readdirSync(join(radice, cartella), { withFileTypes: true })) {
    const percorso = `${cartella}/${voce.name}`;
    if (voce.isDirectory()) trovati.push(...elencaFile(percorso));
    else trovati.push(percorso);
  }
  return trovati.sort();
}

// Il codice dell'app (js/**/*.js) senza le righe di solo commento: così un nome citato in un commento
// non basta a far passare il test se dal codice è sparito.
const codice = elencaFile("js")
  .filter((f) => f.endsWith(".js"))
  .map((f) => ({
    file: f,
    righe: leggi(f)
      .split("\n")
      .filter((r) => !/^\s*(\/\/|\/\*|\*)/.test(r)),
  }));
const testoCodice = codice.flatMap((c) => c.righe).join("\n");

// ================================================================ localStorage ====

const CHIAVI_LOCALSTORAGE = [
  "jukebox.token",
  "jukebox.dati.tipo",
  "jukebox.dati.url",
  "jukebox.dati.owner",
  "jukebox.dati.repo",
  "jukebox.dati.file",
  "jukebox.dati.sha",
  "jukebox.motori",
  "jukebox.usaNewPipe",
  "jukebox.soloJukebox",
  "jukebox.file.indice",
  "jukebox.playlist.cache",
  "jukebox.playlist.sha",
];

test("localStorage: le chiavi sono esattamente quelle di sempre", () => {
  const trovate = [...new Set([...testoCodice.matchAll(/"(jukebox\.[A-Za-z.]+)"/g)].map((m) => m[1]))].sort();
  assert.deepEqual(trovate, [...CHIAVI_LOCALSTORAGE].sort());
});

test("localStorage: ogni chiave scritta per esteso ha il prefisso jukebox.", () => {
  const senzaPrefisso = [
    ...testoCodice.matchAll(/(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*"([^"]+)"/g),
  ]
    .map((m) => m[1])
    .filter((chiave) => !chiave.startsWith("jukebox."));
  assert.deepEqual(senzaPrefisso, []);
});

test("localStorage: nessun clear() (l'origine è condivisa con l'app burocrazia)", () => {
  assert.doesNotMatch(testoCodice, /(?:localStorage|sessionStorage)\s*\.\s*clear\s*\(/);
});

// ============================================================== Cache Storage ====

test("Cache Storage: archivio audio e copia del catalogo con gli stessi nomi e chiavi", () => {
  assert.ok(testoCodice.includes('"jukebox-audio"'), 'cache audio: nome "jukebox-audio"');
  assert.ok(testoCodice.includes("audio/${id}"), "cache audio: chiave audio/<id>");
  assert.ok(testoCodice.includes('"jukebox-dati"'), 'cache dati: nome "jukebox-dati"');
  assert.ok(testoCodice.includes('"cache-dati/catalogo.json"'), "cache dati: chiave cache-dati/catalogo.json");
});

// ============================================================= service worker ====

const sw = leggi("sw.js");

test("sw.js: la cache dell'app si chiama jukebox-vN", () => {
  assert.match(sw, /const CACHE = "jukebox-v\d+"/);
});

test("sw.js: la pulizia cancella solo i nomi che iniziano per jukebox-v", () => {
  assert.ok(sw.includes('k.startsWith("jukebox-v")'));
  // ...e le altre cache non devono iniziare così, o la pulizia si porterebbe via anche loro.
  assert.ok(!"jukebox-audio".startsWith("jukebox-v"));
  assert.ok(!"jukebox-dati".startsWith("jukebox-v"));
});

/** Gli elementi dell'elenco SHELL di sw.js. */
function leggiShell() {
  const blocco = /const SHELL = \[([\s\S]*?)\];/.exec(sw);
  assert.ok(blocco, "sw.js: non trovo l'elenco SHELL");
  return [...blocco[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

test("sw.js: ogni file di js/, css/, fonts/ e icons/ sta nell'elenco SHELL (altrimenti offline non parte)", () => {
  const shell = new Set(leggiShell());
  const suDisco = [
    ...elencaFile("js").filter((f) => f.endsWith(".js")),
    ...elencaFile("css"),
    ...elencaFile("fonts").filter((f) => !f.endsWith(".md")),
    ...elencaFile("icons"),
  ];
  assert.deepEqual(
    suDisco.filter((f) => !shell.has(f)),
    [],
    "file non elencati in SHELL",
  );
  for (const necessario of ["./", "index.html", "manifest.webmanifest"]) {
    assert.ok(shell.has(necessario), `SHELL senza ${necessario}`);
  }
});

test("sw.js: ogni voce di SHELL esiste davvero (un file mancante blocca l'installazione)", () => {
  const suDisco = new Set([
    "index.html",
    "manifest.webmanifest",
    ...elencaFile("js"),
    ...elencaFile("css"),
    ...elencaFile("fonts"),
    ...elencaFile("icons"),
  ]);
  assert.deepEqual(
    leggiShell().filter((voce) => voce !== "./" && !suDisco.has(voce)),
    [],
    "voci di SHELL senza file",
  );
});

// ================================================================== manifest ====

test("manifest: start_url e scope restano ./", () => {
  const manifest = JSON.parse(leggi("manifest.webmanifest"));
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
});

// =============================================================== valuta.mjs ====

// strumenti/valuta.mjs lo usa prepara.py (skill /archivio-musica): se cambia la forma dell'uscita,
// l'archivio smette di sapere quali brani preparare.
test("valuta.mjs: stampa [{id, nome, telefono, brani}] per ogni playlist", () => {
  const cartella = mkdtempSync(join(tmpdir(), "jukebox-valuta-"));
  const playlist = join(cartella, "playlist.json");
  writeFileSync(
    playlist,
    JSON.stringify({
      schema: 1,
      playlist: [
        { id: "m1", nome: "A mano", tipo: "manuale", brani: ["f05", "f01"], telefono: true },
        { id: "i1", nome: "Coi filtri", tipo: "intelligente", regole: { macro: [0] }, ordine: "artista" },
      ],
    }),
  );
  const uscita = JSON.parse(
    execFileSync(process.execPath, [
      join(radice, "strumenti", "valuta.mjs"),
      join(radice, "test", "fixture.json"),
      playlist,
    ]).toString(),
  );
  assert.deepEqual(uscita, [
    { id: "m1", nome: "A mano", telefono: true, brani: ["f05", "f01"] },
    // Per artista e poi per titolo: "Prova Due" (f03) viene prima di "Prova Uno" (f01, f02).
    { id: "i1", nome: "Coi filtri", telefono: false, brani: ["f03", "f01", "f02"] },
  ]);
});
