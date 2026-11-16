// azioni-playlist.js — salvare e togliere una playlist, dalle varie schermate (scheda Playlist,
// scheda del brano, costruttore). Scrive con dati/playlist.js e mette l'elenco nuovo nello
// stato: chi lo mostra si ridisegna da solo. Ogni scrittura dice com'è andata: "Salvo…" mentre
// lavora, poi "Salvato" oppure l'errore con cosa fare.

import { DURATA_AVVISO_LUNGO_MS, DURATA_AVVISO_SALVATAGGIO_MS } from "../config.js";
import * as playlist from "../dati/playlist.js";
import { registra } from "../nucleo/diagnostica.js";
import { testoErroreScrittura } from "../nucleo/errori.js";
import { mostraAvviso } from "./base.js";
import { chiediTesto } from "./dialoghi.js";

/**
 * Esegue una scrittura mostrando "Salvo…" → esito. In caso di errore lo dice (con cosa fare) e
 * lo rilancia: chi chiama sa che non è andata e non deve fare altro.
 */
async function scrivi(lavoro, { corso, fatto, ripiego }) {
  mostraAvviso(corso, "", { duration: DURATA_AVVISO_SALVATAGGIO_MS });
  try {
    await lavoro();
  } catch (err) {
    registra("playlist", err);
    mostraAvviso(testoErroreScrittura(err, ripiego), "err", { duration: DURATA_AVVISO_LUNGO_MS });
    throw err;
  }
  mostraAvviso(fatto, "ok");
}

/** Salva una playlist (nuova o modificata). In caso di errore lo dice e rilancia l'errore. */
export async function salvaPlaylist(app, p) {
  await scrivi(() => playlist.salvaUna(p), {
    corso: "Salvo…",
    fatto: "Salvato.",
    ripiego: "Salvataggio non riuscito.",
  });
  const elenco = app.stato.leggi().playlist;
  const i = elenco.findIndex((x) => x.id === p.id);
  app.stato.cambia({ playlist: i >= 0 ? elenco.map((x, j) => (j === i ? p : x)) : [...elenco, p] });
}

/** Elimina una playlist. In caso di errore lo dice e rilancia l'errore. */
export async function eliminaPlaylist(app, p) {
  await scrivi(() => playlist.elimina(p.id), {
    corso: "Elimino…",
    fatto: "Eliminata.",
    ripiego: "Eliminazione non riuscita.",
  });
  app.stato.cambia({ playlist: app.stato.leggi().playlist.filter((x) => x.id !== p.id) });
}

/** Una playlist manuale nuova, col nome chiesto all'utente. null se annulla o se il salvataggio fallisce. */
export async function nuovaManuale(app, { titolo = "Nuova playlist", brani = [] } = {}) {
  const nome = await chiediTesto({ titolo, etichetta: "Nome della playlist", conferma: "Crea" });
  if (!nome) return null;
  const nuova = { id: playlist.nuovoId(nome), nome, tipo: "manuale", brani };
  try {
    await salvaPlaylist(app, nuova);
  } catch {
    return null; // già detto da salvaPlaylist
  }
  return nuova;
}
