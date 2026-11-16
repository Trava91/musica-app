// config.js — da dove arrivano i dati del Jukebox e le preferenze di riproduzione.
//
// Separato dal resto apposta. Due sorgenti:
//   - "github-privato": il repo privato letto col token dell'utente (uso normale);
//   - "url": un catalogo.json raggiungibile a un indirizzo, senza token. Serve per
//     l'anteprima sul PC (app/?dati=../app-dati/catalogo.json) e, un domani, per
//     un'eventuale versione pubblica. In questa modalità le playlist restano solo
//     nel browser (dati/playlist.js non scrive su GitHub).

const LS = {
  tipo: "jukebox.dati.tipo",
  url: "jukebox.dati.url",
  owner: "jukebox.dati.owner",
  repo: "jukebox.dati.repo",
  file: "jukebox.dati.file",
  token: "jukebox.token",
  motori: "jukebox.motori", // ordine di preferenza dei motori di riproduzione
  usaNewPipe: "jukebox.usaNewPipe",
  soloJukebox: "jukebox.soloJukebox",
};

const DEFAULT = {
  tipo: "github-privato",
  owner: "Trava91",
  repo: "musica-dati",
  file: "catalogo.json",
};

import { MOTORI_DEFAULT } from "./nucleo/motori.js";

// --- Tempi e soglie (prima sparsi nei file) -----------------------------------------------------
export const ATTESA_RICERCA_MS = 120; // dopo l'ultimo tasto, prima di rifare la ricerca
export const RIGHE_PER_PAGINA = 100; // risultati mostrati alla volta in Cerca ("Mostra altri" ne aggiunge altrettanti)
export const PROSSIMI_MOSTRATI = 30; // brani di "A seguire" mostrati alla volta
export const RIGHE_MAX_PLAYLIST = 200; // righe mostrate dentro una playlist aperta
export const RIGHE_MAX_AVVISI = 200; // righe dell'elenco "brani ignorati" nelle Impostazioni
export const ATTESA_CACHE_MS = 5000; // quanto aspettare la cache del catalogo prima di proseguire
export const MAX_TENTATIVI_SALVATAGGIO = 3; // se GitHub segnala un conflitto, quante volte riprovare a salvare
export const DURATA_AVVISO_MS = 3200; // quanto resta in vista un avviso
export const DURATA_AVVISO_LUNGO_MS = 7000; // ...e quelli lunghi (importazione dei file)

// Questi vivono nella logica pura (nucleo) ma si guardano da qui, con tutti gli altri.
export { TOLLERANZA_BPM } from "./nucleo/dj.js"; // quanto possono differire i BPM di due brani "in mix" (6%)
export { RAGGRUPPATI } from "./nucleo/generi.js"; // i generi che il Jukebox mostra fusi in un'unica voce
export { SECONDI_PER_RIPARTIRE } from "./nucleo/sessione.js"; // ⏮ oltre questi secondi riparte dall'inizio del brano

// Il numero della versione dell'app: dev'essere lo stesso di "jukebox-vN" in sw.js (lo controlla
// test/contratti.test.mjs). Si alza a ogni pubblicazione, in tutti e due i posti.
export const VERSIONE = 15;

// I tipi di versione di un brano (campo k del catalogo), nell'ordine in cui si mostrano.
export const TIPI_VERSIONE = ["originale", "remix", "edit", "extended", "live", "set"];

export { MOTORI_DEFAULT }; // ordine di default con cui si sceglie chi suona un brano

// `memoria` è dove si leggono le impostazioni: nell'app è localStorage, nei test una finta.
/** @param {{ getItem: (chiave: string) => string | null }} [memoria] */
export function leggiConfig(memoria = localStorage) {
  return {
    tipo: memoria.getItem(LS.tipo) || DEFAULT.tipo,
    url: memoria.getItem(LS.url) || "",
    owner: memoria.getItem(LS.owner) || DEFAULT.owner,
    repo: memoria.getItem(LS.repo) || DEFAULT.repo,
    file: memoria.getItem(LS.file) || DEFAULT.file,
    token: memoria.getItem(LS.token) || "",
  };
}

// Pronta a partire senza onboarding? Con GitHub serve il token, con "url" l'indirizzo.
export function configPronta(cfg = leggiConfig()) {
  return cfg.tipo === "url" ? Boolean(cfg.url) : Boolean(cfg.token);
}

export function salvaConfig({ tipo, url, owner, repo, file, token }) {
  if (tipo !== undefined) localStorage.setItem(LS.tipo, tipo || DEFAULT.tipo);
  if (url !== undefined) localStorage.setItem(LS.url, url);
  if (owner !== undefined) localStorage.setItem(LS.owner, owner || DEFAULT.owner);
  if (repo !== undefined) localStorage.setItem(LS.repo, repo || DEFAULT.repo);
  if (file !== undefined) localStorage.setItem(LS.file, file || DEFAULT.file);
  if (token !== undefined) localStorage.setItem(LS.token, token);
}

export function rimuoviToken() {
  localStorage.removeItem(LS.token);
}

export function leggiPreferenzaMotori() {
  try {
    const v = JSON.parse(localStorage.getItem(LS.motori));
    if (Array.isArray(v) && v.length) return v;
  } catch {
    /* localStorage vuoto o corrotto: usa il default */
  }
  return [...MOTORI_DEFAULT];
}

export function salvaPreferenzaMotori(ordine) {
  localStorage.setItem(LS.motori, JSON.stringify(ordine));
}

// Se usare NewPipe per YouTube/SoundCloud (scelta di Nicolò: sì di default).
export function leggiPreferenzaNewPipe() {
  const v = localStorage.getItem(LS.usaNewPipe);
  return v === null ? true : v === "1";
}

export function salvaPreferenzaNewPipe(on) {
  localStorage.setItem(LS.usaNewPipe, on ? "1" : "0");
}

// "Solo Jukebox": suona solo i brani col file sul telefono, mai le app esterne
// (scelta di Nicolò 03/11/2026: spento di default).
export function leggiPreferenzaSoloJukebox() {
  return localStorage.getItem(LS.soloJukebox) === "1";
}

export function salvaPreferenzaSoloJukebox(on) {
  localStorage.setItem(LS.soloJukebox, on ? "1" : "0");
}
