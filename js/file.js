// file.js — l'audio dei brani salvato sul telefono, per suonarli dentro il
// Jukebox (anche a schermo spento). Ogni file è un brano del catalogo: il nome
// del file comincia con l'id del brano (lo prepara strumenti/prepara.py sul PC).
//
// Sta in Cache Storage ("jukebox-audio", chiave audio/<id>) e non in OPFS: è
// supportato ovunque su Chrome Android ed è la stessa meccanica della cache del
// catalogo. Un indice in localStorage (id → [byte, estensione]) dice subito cosa
// c'è, senza aprire la cache a ogni avvio.

const CACHE = "jukebox-audio";
const LS = "jukebox.file.indice";
const chiave = (id) => new URL(`audio/${id}`, globalThis.location?.href || "http://localhost/").href;
const MIME = { m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", mp3: "audio/mpeg", webm: "audio/webm", opus: "audio/ogg", ogg: "audio/ogg", flac: "audio/flac", wav: "audio/wav" };

let indice = leggiIndice();

function leggiIndice() {
  try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; }
}
function salvaIndice() {
  localStorage.setItem(LS, JSON.stringify(indice));
}

// Gli id dei brani che hanno il file sul telefono (per motori.js: ctx.fileIds).
export function ids() {
  return new Set(Object.keys(indice));
}

export function byte(idDaContare) {
  const elenco = idDaContare ? [...idDaContare].filter((id) => indice[id]) : Object.keys(indice);
  return elenco.reduce((s, id) => s + (indice[id][0] || 0), 0);
}

// Riallinea l'indice a ciò che c'è davvero in cache (per es. se Android ha
// cancellato i dati del sito, o se l'indice è andato perso).
export async function verifica() {
  if (!("caches" in globalThis)) return ids();
  const c = await caches.open(CACHE);
  const presenti = new Set((await c.keys()).map((r) => decodeURIComponent(r.url.split("/audio/").pop())));
  let cambiato = false;
  for (const id of Object.keys(indice)) {
    if (!presenti.has(id)) { delete indice[id]; cambiato = true; }
  }
  for (const id of presenti) {
    if (!indice[id]) { indice[id] = [0, ""]; cambiato = true; }
  }
  if (cambiato) salvaIndice();
  return ids();
}

// L'id del brano dal nome del file: "c9412dc07ba6.m4a", anche "c9412dc07ba6 (1).m4a".
export function idDaNome(nome) {
  const m = /^([0-9a-f]{12})(?![0-9a-z])/i.exec(nome.trim());
  return m ? m[1].toLowerCase() : null;
}

/**
 * Copia nel Jukebox i file scelti dal selettore. idValidi: Set degli id del
 * catalogo. avanzamento(fatti, totale) viene chiamato dopo ogni file.
 * Restituisce {aggiunti, gia, sconosciuti: [nomi]}.
 */
export async function importa(files, idValidi, avanzamento) {
  const esito = { aggiunti: 0, gia: 0, sconosciuti: [] };
  // Chiede ad Android di non cancellare questi dati quando lo spazio scarseggia.
  navigator.storage?.persist?.().catch(() => {});
  const c = await caches.open(CACHE);
  let fatti = 0;
  for (const f of files) {
    fatti++;
    const id = idDaNome(f.name);
    if (!id || !idValidi.has(id)) {
      esito.sconosciuti.push(f.name);
    } else if (indice[id]?.[0] === f.size) {
      esito.gia++;
    } else {
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      await c.put(chiave(id), new Response(f, { headers: { "Content-Type": f.type || MIME[ext] || "audio/mpeg" } }));
      indice[id] = [f.size, ext];
      salvaIndice(); // a ogni file: se l'importazione si interrompe, quelli fatti restano
      esito.aggiunti++;
    }
    avanzamento?.(fatti, files.length);
  }
  return esito;
}

// Un indirizzo blob: da dare all'<audio>. Chi lo usa lo revoca quando cambia brano.
export async function url(id) {
  const c = await caches.open(CACHE);
  const r = await c.match(chiave(id));
  return r ? URL.createObjectURL(await r.blob()) : null;
}

export async function rimuovi(idDaTogliere) {
  const c = await caches.open(CACHE);
  for (const id of idDaTogliere) {
    await c.delete(chiave(id));
    delete indice[id];
  }
  salvaIndice();
}

export async function svuota() {
  if ("caches" in globalThis) await caches.delete(CACHE);
  indice = {};
  salvaIndice();
}
