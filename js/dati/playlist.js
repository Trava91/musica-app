// playlist.js — playlist.json nel repo privato: lettura, scrittura con lock
// ottimistico (rilettura, riapplica la modifica per id, riprova fino a 3 volte
// sul 409), stesso schema di 03-burocrazia/app/js/store.js. Copia in localStorage
// per leggerle anche offline.

import { GitHubApi, ApiError } from "./github.js";
import { leggiConfig, MAX_TENTATIVI_SALVATAGGIO } from "../config.js";
import { scrivi } from "../memoria.js";
import { validaPlaylist } from "../nucleo/valida.js";

const FILE = "playlist.json";
const LS_CACHE = "jukebox.playlist.cache";
const LS_SHA = "jukebox.playlist.sha";
const VUOTO = () => ({ schema: 1, playlist: [] });

function api() {
  const cfg = leggiConfig();
  return new GitHubApi({ owner: cfg.owner, repo: cfg.repo, token: cfg.token });
}

function daCacheLocale() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_CACHE));
    if (v && Array.isArray(v.playlist)) return v;
  } catch {
    /* cache assente o corrotta */
  }
  return VUOTO();
}

// true se la copia è stata scritta (se no l'errore è già nella diagnostica, con l'avviso).
function salvaCacheLocale(dati) {
  return scrivi(LS_CACHE, JSON.stringify(dati));
}

// Con la sorgente "url" (anteprima sul PC) non c'è un repo in cui scrivere: le
// playlist vivono solo in questo browser, nella stessa cache locale.
const soloLocale = () => leggiConfig().tipo !== "github-privato";

// Cosa non andava nell'ultimo playlist.json letto (vedi valida.js): lo mostra Impostazioni → Dati.
let ultimoControllo = { scartate: [], avvisi: [] };
export const controlloPlaylist = () => ultimoControllo;

// Quello che si mostra è l'elenco controllato (le playlist sbagliate non arrivano
// all'interfaccia). Quello che si SCRIVE su GitHub resta quello vero: l'app non
// riscrive mai un file "ripulito", per non perdere dati.
function controlla(dati) {
  const { playlist, scartate, avvisi } = validaPlaylist(dati);
  ultimoControllo = { scartate, avvisi };
  return playlist;
}

// Le playlist attuali. Prova la rete; se il file non esiste ancora (prima
// playlist mai salvata) restituisce un elenco vuoto senza errore; offline
// ripiega sulla cache locale.
export async function carica() {
  if (soloLocale()) return controlla(daCacheLocale());
  try {
    const { data, sha } = await api().getFile(FILE);
    scrivi(LS_SHA, sha);
    salvaCacheLocale(data);
    return controlla(data);
  } catch (err) {
    if (err instanceof ApiError && err.kind === "notfound") {
      salvaCacheLocale(VUOTO());
      localStorage.removeItem(LS_SHA);
      return controlla(VUOTO());
    }
    const cache = daCacheLocale();
    if (err instanceof ApiError && err.kind === "network") return controlla(cache);
    throw err;
  }
}

// Applica `modifica(playlist[]) -> playlist[]` e salva. Su conflitto (409/412,
// qualcun altro ha scritto nel frattempo) rilegge, riapplica la STESSA modifica
// e riprova, fino a MAX_TENTATIVI_SALVATAGGIO.
export async function salva(modifica) {
  if (soloLocale()) {
    const nuovo = { schema: 1, playlist: modifica(daCacheLocale().playlist.slice()) };
    // Qui la copia locale È il salvataggio: se non si scrive, la modifica andrebbe persa in silenzio.
    if (!salvaCacheLocale(nuovo)) {
      throw new ApiError("Lo spazio del telefono è finito: la playlist non è stata salvata.", { kind: "memoria" });
    }
    return controlla(nuovo);
  }
  const gh = api();
  let sha = localStorage.getItem(LS_SHA);
  let attuale = sha ? daCacheLocale() : null;

  for (let tentativo = 0; tentativo < MAX_TENTATIVI_SALVATAGGIO; tentativo++) {
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
      scrivi(LS_SHA, nuovoSha);
      salvaCacheLocale(nuovo);
      return controlla(nuovo);
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
  const slug =
    (nome || "playlist")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "playlist";
  return `${slug}-${Date.now().toString(36)}`;
}
