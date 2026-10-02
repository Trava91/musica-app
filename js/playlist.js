// playlist.js — playlist.json nel repo privato: lettura, scrittura con lock
// ottimistico (rilettura, riapplica la modifica per id, riprova fino a 3 volte
// sul 409), stesso schema di 03-burocrazia/app/js/store.js. Copia in localStorage
// per leggerle anche offline.

import { GitHubApi, ApiError } from "./api.js";
import { leggiConfig } from "./config.js";

const FILE = "playlist.json";
const LS_CACHE = "jukebox.playlist.cache";
const LS_SHA = "jukebox.playlist.sha";
const MAX_TENTATIVI = 3;
const VUOTO = () => ({ schema: 1, playlist: [] });

function api() {
  const cfg = leggiConfig();
  return new GitHubApi({ owner: cfg.owner, repo: cfg.repo, token: cfg.token });
}

function daCacheLocale() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_CACHE));
    if (v && Array.isArray(v.playlist)) return v;
  } catch { /* cache assente o corrotta */ }
  return VUOTO();
}

function salvaCacheLocale(dati) {
  localStorage.setItem(LS_CACHE, JSON.stringify(dati));
}

// Con la sorgente "url" (anteprima sul PC) non c'è un repo in cui scrivere: le
// playlist vivono solo in questo browser, nella stessa cache locale.
const soloLocale = () => leggiConfig().tipo !== "github-privato";

// Le playlist attuali. Prova la rete; se il file non esiste ancora (prima
// playlist mai salvata) restituisce un elenco vuoto senza errore; offline
// ripiega sulla cache locale.
export async function carica() {
  if (soloLocale()) return daCacheLocale().playlist;
  try {
    const { data, sha } = await api().getFile(FILE);
    localStorage.setItem(LS_SHA, sha);
    salvaCacheLocale(data);
    return data.playlist;
  } catch (err) {
    if (err instanceof ApiError && err.kind === "notfound") {
      salvaCacheLocale(VUOTO());
      localStorage.removeItem(LS_SHA);
      return [];
    }
    const cache = daCacheLocale();
    if (err instanceof ApiError && err.kind === "network") return cache.playlist;
    throw err;
  }
}

// Applica `modifica(playlist[]) -> playlist[]` e salva. Su conflitto (409/412,
// qualcun altro ha scritto nel frattempo) rilegge, riapplica la STESSA modifica
// e riprova, fino a MAX_TENTATIVI.
export async function salva(modifica) {
  if (soloLocale()) {
    const nuovo = { schema: 1, playlist: modifica(daCacheLocale().playlist.slice()) };
    salvaCacheLocale(nuovo);
    return nuovo.playlist;
  }
  const gh = api();
  let sha = localStorage.getItem(LS_SHA);
  let attuale = sha ? daCacheLocale() : null;

  for (let tentativo = 0; tentativo < MAX_TENTATIVI; tentativo++) {
    if (!attuale) {
      try {
        const r = await gh.getFile(FILE);
        attuale = r.data;
        sha = r.sha;
      } catch (err) {
        if (err instanceof ApiError && err.kind === "notfound") {
          attuale = VUOTO();
          sha = null;
        } else {
          throw err;
        }
      }
    }
    const nuovo = { schema: 1, playlist: modifica(attuale.playlist.slice()) };
    try {
      const nuovoSha = await gh.putFile(FILE, nuovo, sha, "playlist: aggiornamento dal Jukebox");
      localStorage.setItem(LS_SHA, nuovoSha);
      salvaCacheLocale(nuovo);
      return nuovo.playlist;
    } catch (err) {
      if (err instanceof ApiError && err.conflict) {
        attuale = null; // forza la rilettura al giro successivo
        continue;
      }
      throw err;
    }
  }
  throw new ApiError("Troppi conflitti di scrittura ravvicinati: riprova tra poco.", { kind: "conflict" });
}

export function salvaUna(playlistObj) {
  return salva((elenco) => {
    const i = elenco.findIndex((p) => p.id === playlistObj.id);
    if (i >= 0) elenco[i] = playlistObj;
    else elenco.push(playlistObj);
    return elenco;
  });
}

export function elimina(id) {
  return salva((elenco) => elenco.filter((p) => p.id !== id));
}

// Un id leggibile e improbabile da ripetere, per una nuova playlist.
export function nuovoId(nome) {
  const slug = (nome || "playlist")
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "playlist";
  return `${slug}-${Date.now().toString(36)}`;
}
