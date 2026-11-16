// catalogo.js — carica il catalogo (catalogo.json), lo mette in Cache Storage (troppo
// grande per localStorage) e lo tiene aggiornato. Offline legge dalla cache.
// Ogni catalogo viene controllato (valida.js) e ogni brano indicizzato per la ricerca
// da cerca.preparaIndice.
//
// Due sorgenti (vedi config.js):
//   - "github-privato": repo privato col token; si riscarica solo se lo sha cambia;
//   - "url": un indirizzo senza token (anteprima sul PC); si riscarica a ogni avvio online.
//
// Il catalogo si controlla PRIMA di metterlo in cache: un file sbagliato non può
// sovrascrivere la copia buona che fa funzionare l'app senza rete.
//
// Le cose del mondo esterno (fetch, Cache Storage, localStorage) si possono passare da
// fuori nel parametro `dip`: nell'app sono quelle del browser, nei test sono finte
// (test/catalogo.test.mjs).

import { ApiError, GitHubApi } from "./github.js";
import { preparaIndice } from "../nucleo/cerca.js";
import { ATTESA_CACHE_MS, leggiConfig } from "../config.js";
import { registra } from "../nucleo/diagnostica.js";
import { ErroreDati, validaCatalogo } from "../nucleo/valida.js";

const CACHE_NOME = "jukebox-dati";
// Chiave sullo stesso indirizzo dell'app (Cache Storage vuole un URL assoluto).
const CACHE_CHIAVE = new URL("cache-dati/catalogo.json", globalThis.location?.href || "http://localhost/").href;
const LS_SHA = "jukebox.dati.sha";
const NON_E_UN_CATALOGO = "GitHub non ha mandato il catalogo. Riprova tra poco.";

/**
 * Le dipendenze di catalogo.js, tutte facoltative: di default sono quelle del browser.
 * @typedef {object} Dipendenze
 * @property {(url: string, opzioni?: object) => Promise<Response>} [fetch]
 * @property {{ open: (nome: string) => Promise<any>, delete: (nome: string) => Promise<any> } | null} [caches]
 *   Cache Storage; null = non disponibile.
 * @property {{ getItem: (chiave: string) => string | null, setItem: (chiave: string, valore: string) => void, removeItem: (chiave: string) => void }} [memoria]
 *   localStorage.
 * @property {number} [attesaCache] quanti millisecondi aspettare la cache prima di arrendersi.
 */

/** @param {Dipendenze} [dip] */
function risolvi(dip = {}) {
  return {
    fetch: dip.fetch ?? ((url, opzioni) => globalThis.fetch(url, opzioni)),
    caches: "caches" in dip ? dip.caches : globalThis.caches,
    memoria: dip.memoria ?? globalThis.localStorage,
    attesaCache: dip.attesaCache ?? ATTESA_CACHE_MS,
  };
}

// Una promessa che si arrende dopo `ms`: la cache è un di più, non deve mai
// bloccare l'avvio (successo il 01/10/2026: caches.put restava appeso).
function entro(promessa, ms, ripiego) {
  let timer;
  const scaduto = new Promise((ok) => {
    timer = setTimeout(() => ok(ripiego), ms);
  });
  return Promise.race([promessa, scaduto]).finally(() => clearTimeout(timer));
}

async function daCache(d) {
  if (!d.caches) return null;
  try {
    return await entro(
      (async () => {
        const c = await d.caches.open(CACHE_NOME);
        const resp = await c.match(CACHE_CHIAVE);
        const dati = resp ? await resp.json() : null;
        // Una cache senza brani, o di un formato che l'app non conosce, non è un catalogo.
        return Array.isArray(dati?.brani) && dati.schema === 1 ? dati : null;
      })(),
      d.attesaCache,
      null,
    );
  } catch (err) {
    registra("cache", err); // la cache non risponde: si prosegue senza, ma resta nel registro
    return null;
  }
}

// In sottofondo: chi chiama non aspetta. Se fallisce, l'unica conseguenza è che
// offline non ci sarà il catalogo. Restituisce la promessa solo perché i test possano attenderla.
function salvaInCache(testo, d) {
  if (!d.caches) return Promise.resolve();
  return d.caches
    .open(CACHE_NOME)
    .then((c) => c.put(CACHE_CHIAVE, new Response(testo, { headers: { "Content-Type": "application/json" } })))
    .catch((err) => registra("cache", `Copia del catalogo non salvata: ${err?.message || err}`));
}

// Controlla il catalogo (lancia ErroreDati se è illeggibile) e lo indicizza. `scartati` e
// `avvisi` dicono cosa non andava nei dati: li mostra Impostazioni → Dati. `offline` = è la
// copia in cache perché la rete non c'era: chi avvia l'app lo dice all'utente.
function preparaCatalogo(dati, offline = false) {
  const { catalogo, scartati, avvisi } = validaCatalogo(dati);
  preparaIndice(catalogo.brani, catalogo.raccolte);
  // rinominati: id vecchio → id nuovo (vedi strumenti/esporta.py), per i file e le playlist salvati.
  return {
    brani: catalogo.brani,
    macro: catalogo.macro,
    raccolte: catalogo.raccolte,
    costruitoIl: catalogo.costruito_il,
    rinominati: catalogo.rinominati || {},
    scartati,
    avvisi,
    offline,
  };
}

// Sorgente "url": niente token né sha. Online scarica, offline ripiega sulla cache.
async function caricaDaUrl(cfg, d) {
  try {
    const resp = await d.fetch(cfg.url, { cache: "no-store" });
    if (!resp.ok) {
      throw new ApiError(`File dati non trovato (${resp.status}): ${cfg.url}`, {
        status: resp.status,
        kind: "notfound",
      });
    }
    const testo = await resp.text();
    const catalogo = preparaCatalogo(JSON.parse(testo));
    salvaInCache(testo, d);
    return catalogo;
  } catch (err) {
    if (err instanceof ErroreDati) throw err; // il file c'è ma non è un catalogo: non si copre con la cache
    const dallaCache = await daCache(d);
    if (dallaCache) return preparaCatalogo(dallaCache, true);
    throw err instanceof ApiError ? err : new ApiError("Impossibile leggere il file dati.", { kind: "network" });
  }
}

// Sorgente "github-privato": confronta lo sha remoto con quello noto e riscarica
// solo se è cambiato (o se forza).
async function caricaDaGitHub(cfg, forza, d) {
  if (!cfg.token) throw new ApiError("Token mancante.", { kind: "auth" });
  const gh = new GitHubApi({ owner: cfg.owner, repo: cfg.repo, token: cfg.token, fetch: d.fetch });

  let shaRemoto = null;
  let online = true;
  try {
    ({ sha: shaRemoto } = await gh.getSha(cfg.file));
  } catch (err) {
    if (err instanceof ApiError && err.kind === "auth") throw err; // token da correggere: non c'è ripiego
    online = false;
  }

  const shaNoto = d.memoria.getItem(LS_SHA);
  const dallaCache = online && !forza && shaRemoto === shaNoto ? await daCache(d) : null;
  if (dallaCache) return preparaCatalogo(dallaCache);

  if (online) {
    const testo = await gh.getRaw(cfg.file, { json: false });
    let dati = null;
    try {
      dati = JSON.parse(testo);
    } catch {
      /* non è JSON: lo dice l'errore qui sotto */
    }
    if (!Array.isArray(dati?.brani)) throw new ApiError(NON_E_UN_CATALOGO, { kind: "generic" });
    const catalogo = preparaCatalogo(dati); // se è illeggibile lancia prima di toccare cache e sha
    salvaInCache(testo, d);
    d.memoria.setItem(LS_SHA, shaRemoto);
    return catalogo;
  }

  const offline = await daCache(d);
  if (offline) return preparaCatalogo(offline, true);
  throw new ApiError("Nessuna connessione e nessun catalogo salvato sul telefono.", { kind: "network" });
}

/**
 * Carica il catalogo. Con forza:true riscarica anche se lo sha non è cambiato
 * (pulsante "Aggiorna dati ora"). Restituisce {brani, macro, raccolte, costruitoIl,
 * rinominati, scartati, avvisi, offline} con brani già controllati e passati da preparaIndice
 * (offline = vero se la rete non c'era e questa è la copia salvata).
 * @param {{ forza?: boolean }} [opzioni]
 * @param {Dipendenze} [dip] le dipendenze, vedi in cima al file.
 */
export async function carica({ forza = false } = {}, dip = {}) {
  const d = risolvi(dip);
  const cfg = leggiConfig(d.memoria);
  return cfg.tipo === "url" ? caricaDaUrl(cfg, d) : caricaDaGitHub(cfg, forza, d);
}

// Per la schermata Impostazioni: cosa c'è in cache adesso, senza contattare la rete.
export async function infoCache(dip = {}) {
  const dati = await daCache(risolvi(dip));
  return dati ? { brani: dati.brani.length, costruitoIl: dati.costruito_il } : null;
}

export async function svuotaCache(dip = {}) {
  const d = risolvi(dip);
  if (d.caches) await d.caches.delete(CACHE_NOME);
  d.memoria.removeItem(LS_SHA);
}
