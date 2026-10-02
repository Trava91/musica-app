// dati.js — carica il catalogo (catalogo.json), lo mette in Cache Storage (troppo
// grande per localStorage) e lo tiene aggiornato. Offline legge dalla cache.
// Ogni brano viene indicizzato per la ricerca da cerca.preparaIndice.
//
// Due sorgenti (vedi config.js):
//   - "github-privato": repo privato col token; si riscarica solo se lo sha cambia;
//   - "url": un indirizzo senza token (anteprima sul PC); si riscarica a ogni avvio online.

import { GitHubApi, ApiError } from "./api.js";
import { leggiConfig } from "./config.js";
import { preparaIndice } from "./cerca.js";

const CACHE_NOME = "jukebox-dati";
// Chiave sullo stesso indirizzo dell'app (Cache Storage vuole un URL assoluto).
const CACHE_CHIAVE = new URL("cache-dati/catalogo.json", globalThis.location?.href || "http://localhost/").href;
const LS_SHA = "jukebox.dati.sha";

// Una promessa che si arrende dopo `ms`: la cache è un di più, non deve mai
// bloccare l'avvio (successo il 01/10/2026: caches.put restava appeso).
function entro(promessa, ms, ripiego) {
  return Promise.race([promessa, new Promise((ok) => setTimeout(() => ok(ripiego), ms))]);
}

async function daCache() {
  if (!("caches" in globalThis)) return null;
  try {
    return await entro((async () => {
      const c = await caches.open(CACHE_NOME);
      const resp = await c.match(CACHE_CHIAVE);
      return resp ? resp.json() : null;
    })(), 5000, null);
  } catch {
    return null;
  }
}

// In sottofondo: chi chiama non aspetta. Se fallisce, l'unica conseguenza è che
// offline non ci sarà il catalogo.
function salvaInCache(testo) {
  if (!("caches" in globalThis)) return;
  caches.open(CACHE_NOME)
    .then((c) => c.put(CACHE_CHIAVE, new Response(testo, { headers: { "Content-Type": "application/json" } })))
    .catch((err) => console.warn("Cache del catalogo non salvata:", err));
}

function preparaCatalogo(dati) {
  preparaIndice(dati.brani, dati.raccolte);
  return { brani: dati.brani, macro: dati.macro, raccolte: dati.raccolte, costruitoIl: dati.costruito_il };
}

// Sorgente "url": niente token né sha. Online scarica, offline ripiega sulla cache.
async function caricaDaUrl(cfg) {
  try {
    const resp = await fetch(cfg.url, { cache: "no-store" });
    if (!resp.ok) {
      throw new ApiError(`File dati non trovato (${resp.status}): ${cfg.url}`, { status: resp.status, kind: "notfound" });
    }
    const testo = await resp.text();
    await salvaInCache(testo);
    return preparaCatalogo(JSON.parse(testo));
  } catch (err) {
    const dallaCache = await daCache();
    if (dallaCache) return preparaCatalogo(dallaCache);
    throw err instanceof ApiError ? err : new ApiError("Impossibile leggere il file dati.", { kind: "network" });
  }
}

// Sorgente "github-privato": confronta lo sha remoto con quello noto e riscarica
// solo se è cambiato (o se forza).
async function caricaDaGitHub(cfg, forza) {
  if (!cfg.token) throw new ApiError("Token mancante.", { kind: "auth" });
  const gh = new GitHubApi({ owner: cfg.owner, repo: cfg.repo, token: cfg.token });

  let shaRemoto = null;
  let online = true;
  try {
    ({ sha: shaRemoto } = await gh.getSha(cfg.file));
  } catch (err) {
    if (err instanceof ApiError && err.kind === "auth") throw err; // token da correggere: non c'è ripiego
    online = false;
  }

  const shaNoto = localStorage.getItem(LS_SHA);
  const dallaCache = online && !forza && shaRemoto === shaNoto ? await daCache() : null;
  if (dallaCache) return preparaCatalogo(dallaCache);

  if (online) {
    const testo = await gh.getRaw(cfg.file, { json: false });
    await salvaInCache(testo);
    localStorage.setItem(LS_SHA, shaRemoto);
    return preparaCatalogo(JSON.parse(testo));
  }

  const offline = await daCache();
  if (offline) return preparaCatalogo(offline);
  throw new ApiError("Nessuna connessione e nessun catalogo salvato sul telefono.", { kind: "network" });
}

/**
 * Carica il catalogo. Con forza:true riscarica anche se lo sha non è cambiato
 * (pulsante "Aggiorna dati ora"). Restituisce {brani, macro, raccolte, costruitoIl}
 * con brani già passati da preparaIndice.
 */
export async function carica({ forza = false } = {}) {
  const cfg = leggiConfig();
  return cfg.tipo === "url" ? caricaDaUrl(cfg) : caricaDaGitHub(cfg, forza);
}

// Per la schermata Impostazioni: cosa c'è in cache adesso, senza contattare la rete.
export async function infoCache() {
  const dati = await daCache();
  return dati ? { brani: dati.brani.length, costruitoIl: dati.costruito_il } : null;
}

export async function svuotaCache() {
  if ("caches" in globalThis) await caches.delete(CACHE_NOME);
  localStorage.removeItem(LS_SHA);
}
