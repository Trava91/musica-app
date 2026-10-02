// config.js — da dove arrivano i dati del Jukebox e le preferenze di riproduzione.
//
// Separato dal resto apposta. Due sorgenti:
//   - "github-privato": il repo privato letto col token dell'utente (uso normale);
//   - "url": un catalogo.json raggiungibile a un indirizzo, senza token. Serve per
//     l'anteprima sul PC (app/?dati=../app-dati/catalogo.json) e, un domani, per
//     un'eventuale versione pubblica. In questa modalità le playlist restano solo
//     nel browser (playlist.js non scrive su GitHub).

const LS = {
  tipo: "jukebox.dati.tipo",
  url: "jukebox.dati.url",
  owner: "jukebox.dati.owner",
  repo: "jukebox.dati.repo",
  file: "jukebox.dati.file",
  token: "jukebox.token",
  motori: "jukebox.motori", // ordine di preferenza dei motori di riproduzione
  usaNewPipe: "jukebox.usaNewPipe",
};

const DEFAULT = {
  tipo: "github-privato",
  owner: "Trava91",
  repo: "musica-dati",
  file: "catalogo.json",
};

// Ordine di default con cui motori.js sceglie chi suona un brano (scelta 3 del piano).
export const MOTORI_DEFAULT = ["file", "spotify-premium", "newpipe", "spotify-app", "web"];

export function leggiConfig() {
  return {
    tipo: localStorage.getItem(LS.tipo) || DEFAULT.tipo,
    url: localStorage.getItem(LS.url) || "",
    owner: localStorage.getItem(LS.owner) || DEFAULT.owner,
    repo: localStorage.getItem(LS.repo) || DEFAULT.repo,
    file: localStorage.getItem(LS.file) || DEFAULT.file,
    token: localStorage.getItem(LS.token) || "",
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

export function haToken() {
  return Boolean(localStorage.getItem(LS.token));
}

export function rimuoviToken() {
  localStorage.removeItem(LS.token);
}

export function leggiPreferenzaMotori() {
  try {
    const v = JSON.parse(localStorage.getItem(LS.motori));
    if (Array.isArray(v) && v.length) return v;
  } catch { /* localStorage vuoto o corrotto: usa il default */ }
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
