// vista-cerca.js — la scheda Cerca: il campo di ricerca nel frontalino, i tasti rapidi (ordine,
// filtri, artisti), la sintonia dei generi (la scala del sintonizzatore) e i risultati nel cassetto,
// con sopra i suggerimenti (artisti e generi) e le etichette dei filtri attivi (suggerimenti.js).
// Disegna dallo stato e traduce i tocchi in cambi di stato; il ▶ delle righe va alla sessione
// (riga-brano.js). Contiene anche la riga con il motore in uso.

import { ATTESA_RICERCA_MS, RIGHE_PER_PAGINA } from "../config.js";
import * as cercaMod from "../nucleo/cerca.js";
import { segna } from "../nucleo/diagnostica.js";
import { passa } from "../nucleo/filtri.js";
import { vociSelezionate } from "../nucleo/generi.js";
import { FILTRI_DEFAULT } from "../nucleo/stato.js";
import { $, debounce } from "./base.js";
import { apriFiltri } from "./foglio-filtri.js";
import { creaScala } from "./hifi/scala.js";
import { aggiungiLista, mostraLista } from "./riga-brano.js";
import { collegaSuggerimenti, disegnaEtichette, disegnaSuggerimenti } from "./suggerimenti.js";
import { vaiAgliArtisti } from "./vista-artisti.js";

const NOMI_ORDINE = { artista: "artista", recenti: "recenti", bpm: "BPM" };
const GIRO_ORDINE = [undefined, "artista", "recenti", "bpm"];
// Quello che fa ridisegnare i risultati, se la scheda è aperta.
const DIPENDENZE = ["scheda", "catalogo", "filtri", "ordine", "ctx"];
const FILTRI_RACCOLTA = { soloScelti: true, tipo: "canzoni" };

let pagina = RIGHE_PER_PAGINA; // quanti risultati si vedono ("Mostra altri" ne aggiunge)
// Cosa c'è sullo schermo: se si torna alla scheda e niente è cambiato non si rifà nulla.
let ultima = null; // { chiave: [catalogo, filtri, ordine, voci, ctx, testo], risultati, mostrati }
/** @type {ReturnType<typeof creaScala> | null} la sintonia dei generi */
let scala = null;
let stazioniDi = null; // il catalogo per cui sono state fatte le stazioni della scala

const numero = (x) => x.toLocaleString("it-IT");

export function collegaCerca(app) {
  $("#cerca-testo").addEventListener(
    "input",
    debounce(() => {
      pagina = RIGHE_PER_PAGINA;
      disegnaCerca(app);
    }, ATTESA_RICERCA_MS),
  );
  $("#cerca-altri").addEventListener("click", () => mostraAltri(app));
  $("#cerca-filtri-btn").addEventListener("click", () => apriFiltri(app));
  $("#rapido-artisti").addEventListener("click", () => vaiAgliArtisti(app));
  collegaSuggerimenti(app);
  $("#rapido-ordine").addEventListener("click", () => {
    const { ordine } = app.stato.leggi();
    app.stato.cambia({ ordine: GIRO_ORDINE[(GIRO_ORDINE.indexOf(ordine) + 1) % GIRO_ORDINE.length] });
  });
  // La sintonia: una stazione per voce di genere (più "Tutti"); sceglierla mette quel genere nei filtri.
  scala = creaScala($("#cerca-scala"), {
    etichetta: "Generi",
    vuota: "Nessun genere",
    onScegli: (st) => {
      const { filtri, voci } = app.stato.leggi();
      const macro = st.id === "tutti" ? [] : [...voci[Number(st.id)].indici];
      app.stato.cambia({ filtri: { ...filtri, macro } });
    },
  });
  app.stato.ascolta((cambiati, s) => {
    if (cambiati.includes("filtri") || cambiati.includes("ordine")) pagina = RIGHE_PER_PAGINA;
    if (cambiati.includes("ctx")) aggiornaPillMotore(app);
    if (cambiati.includes("catalogo") || cambiati.includes("filtri")) disegnaSintonia(app);
    if (s.scheda === "cerca" && cambiati.some((k) => DIPENDENZE.includes(k))) disegnaCerca(app);
  });
}

// ------------------------------------------------------------------- sintonia ----
// Le stazioni: "Tutti" e le voci di genere, le più piene prima (come la pulsantiera dei Generi).
function stazioniGeneri(app) {
  const { catalogo, voci } = app.stato.leggi();
  // I conteggi non dipendono dai filtri: si fanno una volta per catalogo (gli stessi della scheda Generi).
  const { conteggi, senzaGenere } = app.stato.derivato("conteggiMacro", () =>
    cercaMod.conteggiMacro(catalogo.brani, {}, catalogo.macro.length),
  );
  const totale = conteggi.reduce((s, x) => s + x, 0) + senzaGenere;
  const generi = voci
    .map((v, i) => ({ v, i, conta: v.indici.reduce((s, x) => s + conteggi[x], 0) }))
    .sort((a, b) => b.conta - a.conta)
    .map(({ v, i, conta }) => ({
      id: String(i),
      nome: v.nome,
      dettaglio: numero(conta),
      descrizione: `${v.nome}, ${numero(conta)} dischi`,
    }));
  return [
    { id: "tutti", nome: "Tutti", dettaglio: numero(totale), descrizione: `Tutti i generi, ${numero(totale)} dischi` },
    ...generi,
  ];
}

// La stazione sintonizzata: "tutti" senza generi nei filtri, la voce se i filtri sono esattamente
// quella, nessuna (null) se nei Filtri ne sono stati scelti più d'uno.
function stazioneScelta(app) {
  const { filtri, voci } = app.stato.leggi();
  const scelti = filtri.macro || [];
  if (!scelti.length) return "tutti";
  const i = voci.findIndex((v) => v.indici.length === scelti.length && v.indici.every((x) => scelti.includes(x)));
  return i >= 0 ? String(i) : null;
}

function disegnaSintonia(app) {
  const { catalogo, filtri, voci } = app.stato.leggi();
  if (!catalogo || !scala) return;
  const scelta = stazioneScelta(app);
  if (stazioniDi !== catalogo) {
    stazioniDi = catalogo;
    scala.stazioni(stazioniGeneri(app), scelta);
  } else scala.imposta(scelta);
  const nomi = vociSelezionate(voci, filtri.macro).map((v) => v.nome);
  $("#cerca-sintonia").textContent =
    scelta === "tutti" ? "Tutti i generi" : nomi.length === 1 ? `Sintonizzato: ${nomi[0]}` : `${nomi.length} generi`;
}

// ------------------------------------------------------------------- risultati ----
// "Mostra altri": le righe nuove si aggiungono in fondo, senza rifare la ricerca né ridisegnare le altre.
function mostraAltri(app) {
  if (!ultima) return;
  const inizio = performance.now();
  const da = ultima.mostrati;
  pagina = da + RIGHE_PER_PAGINA;
  const nuove = ultima.risultati.slice(da, pagina);
  aggiungiLista(app, $("#cerca-risultati"), nuove, da);
  ultima.mostrati = da + nuove.length;
  $("#cerca-altri").hidden = ultima.risultati.length <= ultima.mostrati;
  segna("disegno", performance.now() - inizio, `${nuove.length} righe aggiunte`);
}

// "Togli i filtri": svuota il campo di ricerca e rimette i filtri come all'inizio (l'ordine resta).
function togliFiltri(app) {
  $("#cerca-testo").value = "";
  pagina = RIGHE_PER_PAGINA;
  app.stato.cambia({ filtri: { ...FILTRI_DEFAULT } });
}

export function disegnaCerca(app) {
  const { catalogo, filtri, ordine, voci } = app.stato.leggi();
  if (!catalogo) return;
  const testo = $("#cerca-testo").value;
  const chiave = [catalogo, filtri, ordine, voci, app.stato.leggi().ctx, testo];
  if (ultima?.chiave.every((x, i) => x === chiave[i])) return; // niente è cambiato dall'ultima volta
  const inizioRicerca = performance.now();
  const risultati = cercaMod.cerca(catalogo.brani, testo, filtri, ordine);
  segna(
    "ricerca",
    performance.now() - inizioRicerca,
    `${numero(risultati.length)} risultati, ${testo.trim() ? "con testo" : "senza testo"}`,
  );
  const nAttivi = disegnaEtichette(app, filtri);
  disegnaSuggerimenti(app, testo);
  const badge = $("#cerca-filtri-badge");
  badge.hidden = nAttivi === 0;
  badge.textContent = String(nAttivi);
  const filtriBtn = $("#cerca-filtri-btn");
  filtriBtn.setAttribute("aria-label", nAttivi ? `Filtri: ${nAttivi} attivi` : "Filtri");
  $(".hf-led", filtriBtn).classList.toggle("hf-acceso", nAttivi > 0);
  $("#cerca-riepilogo").textContent = `${numero(risultati.length)} dischi`;
  const effettivo = ordine || (testo.trim() ? "rilevanza" : "artista");
  $("#cerca-ordine-testo").textContent = effettivo === "rilevanza" ? "per pertinenza" : `per ${NOMI_ORDINE[effettivo]}`;
  $("#rapido-ordine-testo").textContent = `Ordine: ${ordine ? NOMI_ORDINE[ordine] : "auto"}`;
  $("#rapido-ordine .hf-led").classList.toggle("hf-acceso", Boolean(ordine));
  // "Dischi in raccolta": le canzoni scelte, contate una volta per catalogo (senza ordinarle).
  const inRaccolta = app.stato.derivato("totaleRaccolta", () =>
    catalogo.brani.reduce((n, b) => n + (passa(b, FILTRI_RACCOLTA) ? 1 : 0), 0),
  );
  $("#arco-sotto").textContent = `${numero(inRaccolta)} dischi in raccolta`;
  const vociScelte = vociSelezionate(voci, filtri.macro);
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
  const inizioDisegno = performance.now();
  mostraLista(app, $("#cerca-risultati"), mostrati, { lista: risultati, nome }, { vuoto });
  segna("disegno", performance.now() - inizioDisegno, `${mostrati.length} righe`);
  $("#cerca-altri").hidden = risultati.length <= mostrati.length;
  ultima = { chiave, risultati, mostrati: mostrati.length };
}

/** La riga sotto la ricerca: con che cosa suona il Jukebox adesso. */
export function aggiornaPillMotore(app) {
  const p = $("#stato-motore");
  if (!p) return;
  if (!app.android) {
    p.textContent = "Anteprima PC · i brani si aprono sul web";
    return;
  }
  const { ctx } = app.stato.leggi();
  p.textContent = ctx.soloJukebox
    ? "Solo Jukebox: suonano solo i brani sul telefono"
    : ctx.spotify === "premium"
      ? "Spotify Premium collegato"
      : ctx.usaNewPipe
        ? "NewPipe attivo per YouTube e SoundCloud"
        : "Spotify gratis per i brani senza file";
}
