// valuta.mjs — calcola i brani delle playlist con le STESSE regole dell'app
// (js/regole.js), per strumenti/prepara.py. Così il PC prepara esattamente i
// brani che il telefono mostra.
//
// Uso: node strumenti/valuta.mjs <catalogo.json> <playlist.json>
// Stampa: [{id, nome, telefono, brani: [id, ...]}, ...]

import { readFileSync } from "node:fs";
import { preparaIndice } from "../js/cerca.js";
import { valuta, rimappaPlaylist } from "../js/regole.js";

const [percorsoCatalogo, percorsoPlaylist] = process.argv.slice(2);
const catalogo = JSON.parse(readFileSync(percorsoCatalogo, "utf-8"));
const dati = JSON.parse(readFileSync(percorsoPlaylist, "utf-8"));
preparaIndice(catalogo.brani, catalogo.raccolte);

// Sul PC ogni brano "avrà" il file: così la regola "solo schermo spento" non
// esclude proprio i brani che si stanno preparando.
const ctx = { fileIds: new Set(catalogo.brani.map((b) => b.id)), spotify: "senza", usaNewPipe: true };

const uscita = (dati.playlist || []).map((p) => ({
  id: p.id,
  nome: p.nome,
  telefono: Boolean(p.telefono),
  brani: valuta(rimappaPlaylist(p, catalogo.rinominati), catalogo.brani, ctx).map((b) => b.id),
}));
process.stdout.write(JSON.stringify(uscita));
