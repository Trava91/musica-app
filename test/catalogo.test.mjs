// Test di js/dati/catalogo.js: il caricamento del catalogo (GitHub, indirizzo diretto, cache), con rete,
// Cache Storage e localStorage finti. Nessuna rete vera, nessun dato reale (test/fixture.json).

import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "../js/dati/github.js";
import * as dati from "../js/dati/catalogo.js";
import { ErroreDati } from "../js/nucleo/valida.js";
import { fixture, testoFixture } from "./fixture.mjs";

const NOME_CACHE = "jukebox-dati";
const CHIAVE_CACHE = "http://localhost/cache-dati/catalogo.json"; // in Node non c'è location
const INDIRIZZO = "http://anteprima.test/catalogo.json";

// Dopo che carica() risponde, il salvataggio in cache continua in sottofondo: si lascia girare.
const tick = () => new Promise((fine) => setTimeout(fine, 0));

// ---------------------------------------------------------------- le finte ----

/** Un localStorage finto. */
function memoriaFinta(iniziale = {}) {
  const m = new Map(Object.entries(iniziale));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      m.set(k, String(v));
    },
    removeItem: (k) => {
      m.delete(k);
    },
  };
}

/** Una Cache Storage finta. Con matchBloccato la lettura non risponde mai (come il 01/10/2026). */
function cachesFinte({ matchBloccato = false } = {}) {
  const casse = new Map(); // nome della cache → Map(chiave → testo)
  return {
    casse,
    async open(nome) {
      if (!casse.has(nome)) casse.set(nome, new Map());
      const c = casse.get(nome);
      return {
        match: (chiave) =>
          matchBloccato
            ? new Promise(() => {})
            : Promise.resolve(c.has(chiave) ? new Response(c.get(chiave)) : undefined),
        put: async (chiave, risposta) => {
          c.set(chiave, await risposta.text());
        },
      };
    },
    async delete(nome) {
      return casse.delete(nome);
    },
  };
}
const inCache = (caches) => caches.casse.get(NOME_CACHE)?.get(CHIAVE_CACHE);
async function mettiInCache(caches, testo) {
  await (await caches.open(NOME_CACHE)).put(CHIAVE_CACHE, new Response(testo));
}

/** Un GitHub finto: risponde ai metadati (sha) e al contenuto grezzo, e ricorda cosa gli è stato chiesto. */
function githubFinto({ sha = "sha-1", testo = testoFixture, statoSha = 200, statoRaw = 200, rete = true } = {}) {
  const chiamate = [];
  return {
    chiamate,
    fetch: async (url) => {
      const grezzo = url.includes("grezzo=");
      chiamate.push(grezzo ? "grezzo" : "sha");
      if (!rete) throw new TypeError("Failed to fetch");
      if (grezzo) return new Response(testo, { status: statoRaw });
      return new Response(JSON.stringify({ sha, size: testo.length }), { status: statoSha });
    },
  };
}

const conToken = (extra = {}) => memoriaFinta({ "jukebox.token": "ghp_finto", ...extra });

/** Lancia carica() e restituisce l'errore (o fallisce se non ce n'è). */
async function errore(promessa) {
  try {
    await promessa;
  } catch (err) {
    return err;
  }
  assert.fail("doveva fallire");
}

// ============================================================= GitHub privato ====

test("catalogo nuovo: lo scarica, lo mette in cache e ricorda lo sha", async () => {
  const github = githubFinto({ sha: "S1" });
  const caches = cachesFinte();
  const memoria = conToken();
  const catalogo = await dati.carica({}, { fetch: github.fetch, caches, memoria });
  await tick();

  assert.equal(catalogo.brani.length, fixture.brani.length);
  assert.deepEqual(catalogo.scartati, []);
  assert.equal(inCache(caches), testoFixture);
  assert.equal(memoria.getItem("jukebox.dati.sha"), "S1");
  assert.deepEqual(github.chiamate, ["sha", "grezzo"]);
});

test("catalogo caricato: i brani sono già indicizzati per la ricerca", async () => {
  const catalogo = await dati.carica({}, { fetch: githubFinto().fetch, caches: cachesFinte(), memoria: conToken() });
  assert.equal(catalogo.brani[0]._normA, "dj testino");
  assert.equal(catalogo.costruitoIl, "2000-01-01");
  assert.equal(catalogo.macro.length, 17);
});

test("stesso sha di prima: legge dalla cache e non riscarica", async () => {
  const github = githubFinto({ sha: "S1" });
  const caches = cachesFinte();
  await mettiInCache(caches, testoFixture);
  const memoria = conToken({ "jukebox.dati.sha": "S1" });
  const catalogo = await dati.carica({}, { fetch: github.fetch, caches, memoria });

  assert.equal(catalogo.brani.length, fixture.brani.length);
  assert.deepEqual(github.chiamate, ["sha"]);
});

test("stesso sha ma con forza: riscarica lo stesso", async () => {
  const github = githubFinto({ sha: "S1" });
  const caches = cachesFinte();
  await mettiInCache(caches, "{}");
  const memoria = conToken({ "jukebox.dati.sha": "S1" });
  const catalogo = await dati.carica({ forza: true }, { fetch: github.fetch, caches, memoria });
  await tick();

  assert.equal(catalogo.brani.length, fixture.brani.length);
  assert.deepEqual(github.chiamate, ["sha", "grezzo"]);
  assert.equal(inCache(caches), testoFixture);
});

test("sha cambiato: riscarica e aggiorna cache e sha", async () => {
  const github = githubFinto({ sha: "S2" });
  const caches = cachesFinte();
  await mettiInCache(caches, "{}");
  const memoria = conToken({ "jukebox.dati.sha": "S1" });
  await dati.carica({}, { fetch: github.fetch, caches, memoria });
  await tick();

  assert.equal(inCache(caches), testoFixture);
  assert.equal(memoria.getItem("jukebox.dati.sha"), "S2");
});

test("rete assente con un catalogo in cache: usa la cache", async () => {
  const caches = cachesFinte();
  await mettiInCache(caches, testoFixture);
  const catalogo = await dati.carica(
    {},
    { fetch: githubFinto({ rete: false }).fetch, caches, memoria: conToken({ "jukebox.dati.sha": "S1" }) },
  );
  assert.equal(catalogo.brani.length, fixture.brani.length);
});

test("rete assente e nessuna cache: errore 'Nessuna connessione…'", async () => {
  const err = await errore(
    dati.carica({}, { fetch: githubFinto({ rete: false }).fetch, caches: cachesFinte(), memoria: conToken() }),
  );
  assert.ok(err instanceof ApiError);
  assert.equal(err.kind, "network");
  assert.match(err.message, /Nessuna connessione/);
});

test("token rifiutato (401): errore di tipo auth, anche se in cache c'è un catalogo", async () => {
  const caches = cachesFinte();
  await mettiInCache(caches, testoFixture);
  const err = await errore(
    dati.carica({}, { fetch: githubFinto({ statoSha: 401 }).fetch, caches, memoria: conToken() }),
  );
  assert.ok(err instanceof ApiError);
  assert.equal(err.kind, "auth");
});

test("senza token: errore di tipo auth, senza chiamare la rete", async () => {
  const github = githubFinto();
  const err = await errore(dati.carica({}, { fetch: github.fetch, caches: cachesFinte(), memoria: memoriaFinta() }));
  assert.equal(err.kind, "auth");
  assert.deepEqual(github.chiamate, []);
});

test("risposta che non è un catalogo (una pagina di testo): errore chiaro, la cache buona resta", async () => {
  const caches = cachesFinte();
  await mettiInCache(caches, testoFixture);
  const memoria = conToken({ "jukebox.dati.sha": "S0" });
  const err = await errore(
    dati.carica({}, { fetch: githubFinto({ sha: "S9", testo: "<html>Bad gateway</html>" }).fetch, caches, memoria }),
  );
  await tick();

  assert.ok(err instanceof ApiError);
  assert.match(err.message, /non ha mandato il catalogo/);
  assert.equal(inCache(caches), testoFixture);
  assert.equal(memoria.getItem("jukebox.dati.sha"), "S0");
});

test("risposta JSON che non è un catalogo (senza brani): lo stesso errore chiaro", async () => {
  const err = await errore(
    dati.carica(
      {},
      {
        fetch: githubFinto({ testo: JSON.stringify({ message: "Not Found" }) }).fetch,
        caches: cachesFinte(),
        memoria: conToken(),
      },
    ),
  );
  assert.match(err.message, /non ha mandato il catalogo/);
});

test("catalogo di un formato sconosciuto: errore chiaro, e la cache buona non viene toccata", async () => {
  const caches = cachesFinte();
  await mettiInCache(caches, testoFixture);
  const memoria = conToken({ "jukebox.dati.sha": "S0" });
  const nuovo = JSON.stringify({ ...fixture, schema: 2, brani: [] });
  const err = await errore(dati.carica({}, { fetch: githubFinto({ sha: "S9", testo: nuovo }).fetch, caches, memoria }));
  await tick();

  assert.ok(err instanceof ErroreDati);
  assert.match(err.message, /schema 2/);
  assert.equal(inCache(caches), testoFixture);
  assert.equal(memoria.getItem("jukebox.dati.sha"), "S0");
});

test("brani sbagliati nel catalogo: l'app parte, li ignora e li elenca", async () => {
  const sbagliato = JSON.parse(testoFixture);
  delete sbagliato.brani[3].s; // un brano senza fonti
  sbagliato.brani[5].g = 99; // un genere che non esiste
  const testo = JSON.stringify(sbagliato);
  const caches = cachesFinte();
  const catalogo = await dati.carica({}, { fetch: githubFinto({ testo }).fetch, caches, memoria: conToken() });
  await tick();

  assert.equal(catalogo.brani.length, fixture.brani.length - 1);
  assert.deepEqual(
    catalogo.scartati.map((s) => s.id),
    ["f04"],
  );
  assert.ok(catalogo.avvisi.some((a) => a.includes("genere")));
  assert.ok(!("g" in catalogo.brani.find((b) => b.id === "f06")));
  // Il file messo in cache è quello vero: l'app non riscrive mai una copia "ripulita".
  assert.equal(inCache(caches), testo);
});

test("cache che non risponde entro il tempo massimo: si prosegue e si scarica", async () => {
  const github = githubFinto({ sha: "S1" });
  const memoria = conToken({ "jukebox.dati.sha": "S1" });
  const caches = cachesFinte({ matchBloccato: true });
  const prima = Date.now();
  const catalogo = await dati.carica({}, { fetch: github.fetch, caches, memoria, attesaCache: 30 });

  assert.equal(catalogo.brani.length, fixture.brani.length);
  assert.deepEqual(github.chiamate, ["sha", "grezzo"]);
  assert.ok(Date.now() - prima < 3000, "doveva arrendersi dopo 30 ms, non aspettare");
});

test("senza Cache Storage nel browser: funziona lo stesso, solo senza copia offline", async () => {
  const catalogo = await dati.carica({}, { fetch: githubFinto().fetch, caches: null, memoria: conToken() });
  assert.equal(catalogo.brani.length, fixture.brani.length);
});

// ================================================== indirizzo diretto (anteprima) ====

const anteprima = (extra = {}) => memoriaFinta({ "jukebox.dati.tipo": "url", "jukebox.dati.url": INDIRIZZO, ...extra });
const serverFinto = (corpo, status = 200) => ({
  fetch: async () => new Response(corpo, { status }),
});

test("anteprima: scarica dall'indirizzo e mette in cache", async () => {
  const caches = cachesFinte();
  const catalogo = await dati.carica({}, { fetch: serverFinto(testoFixture).fetch, caches, memoria: anteprima() });
  await tick();
  assert.equal(catalogo.brani.length, fixture.brani.length);
  assert.equal(inCache(caches), testoFixture);
});

test("anteprima: indirizzo non trovato e nessuna cache → errore 'notfound'", async () => {
  const err = await errore(
    dati.carica({}, { fetch: serverFinto("", 404).fetch, caches: cachesFinte(), memoria: anteprima() }),
  );
  assert.ok(err instanceof ApiError);
  assert.equal(err.kind, "notfound");
});

test("anteprima: indirizzo non raggiungibile ma catalogo in cache → usa la cache", async () => {
  const caches = cachesFinte();
  await mettiInCache(caches, testoFixture);
  const rotto = {
    fetch: async () => {
      throw new TypeError("Failed to fetch");
    },
  };
  const catalogo = await dati.carica({}, { fetch: rotto.fetch, caches, memoria: anteprima() });
  assert.equal(catalogo.brani.length, fixture.brani.length);
});

test("anteprima: file che non è un catalogo leggibile → errore chiaro, non un ripiego muto sulla cache", async () => {
  const caches = cachesFinte();
  await mettiInCache(caches, testoFixture);
  const nuovo = JSON.stringify({ ...fixture, schema: 7 });
  const err = await errore(dati.carica({}, { fetch: serverFinto(nuovo).fetch, caches, memoria: anteprima() }));
  assert.ok(err instanceof ErroreDati);
  assert.equal(inCache(caches), testoFixture);
});

test("anteprima: testo che non è nemmeno JSON e nessuna cache → 'Impossibile leggere il file dati'", async () => {
  const err = await errore(
    dati.carica({}, { fetch: serverFinto("non json").fetch, caches: cachesFinte(), memoria: anteprima() }),
  );
  assert.match(err.message, /Impossibile leggere/);
});

// ===================================================== informazioni sulla cache ====

test("infoCache: dice quanti brani ci sono in cache, o niente se è vuota", async () => {
  const caches = cachesFinte();
  assert.equal(await dati.infoCache({ caches }), null);
  await mettiInCache(caches, testoFixture);
  assert.deepEqual(await dati.infoCache({ caches }), { brani: fixture.brani.length, costruitoIl: "2000-01-01" });
});

test("infoCache: una cache rovinata (non JSON, o di un altro formato) vale come vuota", async () => {
  const caches = cachesFinte();
  await mettiInCache(caches, "non json");
  assert.equal(await dati.infoCache({ caches }), null);
  await mettiInCache(caches, JSON.stringify({ ...fixture, schema: 2 }));
  assert.equal(await dati.infoCache({ caches }), null);
});

test("svuotaCache: toglie la copia del catalogo e lo sha ricordato", async () => {
  const caches = cachesFinte();
  await mettiInCache(caches, testoFixture);
  const memoria = conToken({ "jukebox.dati.sha": "S1" });
  await dati.svuotaCache({ caches, memoria });
  assert.equal(inCache(caches), undefined);
  assert.equal(memoria.getItem("jukebox.dati.sha"), null);
});
