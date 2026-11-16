// vista-cerca.js — la scheda Cerca: campo di ricerca, tasti rapidi (generi, ordine, filtri),
// riepilogo e risultati. Disegna dallo stato e traduce i tocchi in cambi di stato; il ▶ delle
// righe va alla sessione (riga-brano.js). Contiene anche la pillola del motore in uso.

import { ATTESA_RICERCA_MS, RIGHE_PER_PAGINA } from "../config.js";
import * as cercaMod from "../nucleo/cerca.js";
import { vociSelezionate } from "../nucleo/generi.js";
import { FILTRI_DEFAULT } from "../nucleo/stato.js";
import { $, debounce, vaiA } from "./base.js";
import { apriFiltri } from "./foglio-filtri.js";
import { mostraLista } from "./riga-brano.js";

const NOMI_ORDINE = { artista: "artista", recenti: "recenti", bpm: "BPM" };
const GIRO_ORDINE = [undefined, "artista", "recenti", "bpm"];
// Quello che fa ridisegnare i risultati, se la scheda è aperta.
const DIPENDENZE = ["scheda", "catalogo", "filtri", "ordine", "ctx"];

let pagina = RIGHE_PER_PAGINA; // quanti risultati si vedono ("Mostra altri" ne aggiunge)
let totale = { catalogo: null, n: 0 }; // "dischi in raccolta": si conta una volta per catalogo

export function collegaCerca(app) {
  $("#cerca-testo").addEventListener(
    "input",
    debounce(() => {
      pagina = RIGHE_PER_PAGINA;
      disegnaCerca(app);
    }, ATTESA_RICERCA_MS),
  );
  $("#cerca-altri").addEventListener("click", () => {
    pagina += RIGHE_PER_PAGINA;
    disegnaCerca(app);
  });
  $("#cerca-filtri-btn").addEventListener("click", () => apriFiltri(app));
  $("#rapido-generi").addEventListener("click", () => vaiA(app, "generi"));
  $("#rapido-ordine").addEventListener("click", () => {
    const { ordine } = app.stato.leggi();
    app.stato.cambia({ ordine: GIRO_ORDINE[(GIRO_ORDINE.indexOf(ordine) + 1) % GIRO_ORDINE.length] });
  });
  app.stato.ascolta((cambiati, s) => {
    if (cambiati.includes("filtri") || cambiati.includes("ordine")) pagina = RIGHE_PER_PAGINA;
    if (cambiati.includes("ctx")) aggiornaPillMotore(app);
    if (s.scheda === "cerca" && cambiati.some((k) => DIPENDENZE.includes(k))) disegnaCerca(app);
  });
}

// "Togli i filtri": svuota il campo di ricerca e rimette i filtri come all'inizio (l'ordine resta).
function togliFiltri(app) {
  $("#cerca-testo").value = "";
  pagina = RIGHE_PER_PAGINA;
  app.stato.cambia({ filtri: { ...FILTRI_DEFAULT } });
}

function contaFiltriAttivi(f) {
  let n = 0;
  if (f.macro?.length) n++;
  if (f.piattaforme?.length) n++;
  if (f.raccolta !== undefined && f.raccolta !== null) n++;
  if (f.anno) n++;
  if (f.bpm) n++;
  if (f.camelot?.length) n++;
  if (f.soloScelti === false) n++;
  if (f.tipo && f.tipo !== "canzoni") n++;
  return n;
}

export function disegnaCerca(app) {
  const { catalogo, filtri, ordine, voci } = app.stato.leggi();
  if (!catalogo) return;
  const testo = $("#cerca-testo").value;
  const risultati = cercaMod.cerca(catalogo.brani, testo, filtri, ordine);
  const nAttivi = contaFiltriAttivi(filtri);
  $("#cerca-filtri-badge").hidden = nAttivi === 0;
  $("#cerca-filtri-badge").textContent = nAttivi;
  $("#cerca-riepilogo").textContent = `${risultati.length.toLocaleString("it-IT")} dischi`;
  const effettivo = ordine || (testo.trim() ? "rilevanza" : "artista");
  $("#cerca-ordine-testo").textContent =
    effettivo === "rilevanza" ? "per pertinenza" : `ordine per ${NOMI_ORDINE[effettivo]}`;
  $("#rapido-ordine").textContent = `Ordine: ${ordine ? NOMI_ORDINE[ordine] : "auto"}`;
  $("#rapido-ordine").classList.toggle("accesa", !!ordine);
  const vociScelte = vociSelezionate(voci, filtri.macro);
  $("#rapido-generi-testo").textContent =
    vociScelte.length === 1 ? vociScelte[0].nome : vociScelte.length > 1 ? `${vociScelte.length} generi` : "Generi";
  $("#rapido-generi").classList.toggle("accesa", vociScelte.length > 0);
  $("#cerca-filtri-btn").classList.toggle("accesa", nAttivi > 0);
  if (totale.catalogo !== catalogo)
    totale = { catalogo, n: cercaMod.cerca(catalogo.brani, "", { soloScelti: true, tipo: "canzoni" }).length };
  $("#arco-sotto").textContent = `${totale.n.toLocaleString("it-IT")} dischi in raccolta`;
  const mostrati = risultati.slice(0, pagina);
  const nome = testo.trim() ? `Ricerca «${testo.trim()}»` : vociScelte.length === 1 ? vociScelte[0].nome : "Ricerca";
  // Nessun risultato: se c'è un testo o dei filtri si può toglierli con un tocco.
  const restringe = nAttivi > 0 || testo.trim() !== "";
  const vuoto = restringe
    ? {
        testo: testo.trim() ? `Nessun disco per «${testo.trim()}».` : "Nessun disco con questi filtri.",
        azione: { etichetta: "Togli i filtri", fai: () => togliFiltri(app) },
      }
    : "Il catalogo non ha dischi da mostrare.";
  mostraLista(app, $("#cerca-risultati"), mostrati, { lista: risultati, nome }, { vuoto });
  $("#cerca-altri").hidden = risultati.length <= mostrati.length;
}

/** La pillola sotto il titolo: con che cosa suona il Jukebox adesso. */
export function aggiornaPillMotore(app) {
  const p = $("#stato-motore");
  if (!p) return;
  if (!app.android) {
    p.textContent = "Anteprima PC · link web";
    return;
  }
  const { ctx } = app.stato.leggi();
  p.textContent = ctx.soloJukebox
    ? "Solo Jukebox"
    : ctx.spotify === "premium"
      ? "Spotify Premium"
      : ctx.usaNewPipe
        ? "NewPipe attivo"
        : "Spotify gratis";
}
