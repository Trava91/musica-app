// azioni-playlist.js — salvare e togliere una playlist, dalle varie schermate (scheda Playlist,
// scheda del brano, costruttore). Scrive con dati/playlist.js e mette l'elenco nuovo nello
// stato: chi lo mostra si ridisegna da solo.

import * as playlist from "../dati/playlist.js";
import { mostraAvviso } from "./base.js";

/** Salva una playlist (nuova o modificata). In caso di errore lo dice e rilancia l'errore. */
export async function salvaPlaylist(app, p) {
  try {
    await playlist.salvaUna(p);
  } catch (err) {
    mostraAvviso(err?.message || "Salvataggio non riuscito.", "err");
    throw err;
  }
  const elenco = app.stato.leggi().playlist;
  const i = elenco.findIndex((x) => x.id === p.id);
  app.stato.cambia({ playlist: i >= 0 ? elenco.map((x, j) => (j === i ? p : x)) : [...elenco, p] });
}

/** Elimina una playlist. In caso di errore lo dice e rilancia l'errore. */
export async function eliminaPlaylist(app, p) {
  try {
    await playlist.elimina(p.id);
  } catch (err) {
    mostraAvviso(err?.message || "Eliminazione non riuscita.", "err");
    throw err;
  }
  app.stato.cambia({ playlist: app.stato.leggi().playlist.filter((x) => x.id !== p.id) });
}

/** Una playlist manuale nuova, col nome chiesto all'utente. null se annulla o se il salvataggio fallisce. */
export async function nuovaManuale(app, { domanda = "Nome della playlist:", brani = [] } = {}) {
  const nome = window.prompt(domanda);
  if (!nome) return null;
  const nuova = { id: playlist.nuovoId(nome), nome, tipo: "manuale", brani };
  try {
    await salvaPlaylist(app, nuova);
  } catch {
    return null; // già detto da salvaPlaylist
  }
  return nuova;
}
