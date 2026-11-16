// main.js — l'avvio del Jukebox: crea i pezzi (stato, lettore, sessione, viste), li collega e
// carica i dati. Non disegna nulla (la pagina la tocca solo js/ui/) e non decide cosa suonare
// (lo fa js/nucleo/sessione.js).

import { Lettore } from "./audio/lettore.js";
import {
  configPronta,
  leggiPreferenzaMotori,
  leggiPreferenzaNewPipe,
  leggiPreferenzaSoloJukebox,
  salvaConfig,
} from "./config.js";
import * as dati from "./dati/catalogo.js";
import * as file from "./dati/file-audio.js";
import { ApiError } from "./dati/github.js";
import * as playlist from "./dati/playlist.js";
import { rimappaPlaylist } from "./nucleo/regole.js";
import { Sessione } from "./nucleo/sessione.js";
import { Stato } from "./nucleo/stato.js";
import { apriLink, attesa, collegaFinestre, collegaSchede, mostraAvviso, vaiA } from "./ui/base.js";
import { collegaAvvio, mostra, mostraOnboarding } from "./ui/vista-avvio.js";
import { collegaCerca } from "./ui/vista-cerca.js";
import { collegaGeneri } from "./ui/vista-generi.js";
import { collegaImpostazioni } from "./ui/vista-impostazioni.js";
import { collegaPlaylist } from "./ui/vista-playlist.js";
import { collegaSuona } from "./ui/vista-suona.js";

// --- i pezzi ----------------------------------------------------------------------
const stato = new Stato();
const sessione = new Sessione({
  lettore: new Lettore(),
  apri: apriLink,
  ctx: () => stato.leggi().ctx,
  // Sul telefono Android i link aprono NewPipe e Spotify; sul PC (anteprima) il web.
  android: /Android/i.test(navigator.userAgent),
  icona: new URL("../icons/icon-512.png", import.meta.url).href, // per la schermata di blocco
});
sessione.ascolta((e) => {
  if (e.tipo === "avviso") mostraAvviso(e.testo, e.gravita);
});

const app = { stato, sessione, android: sessione.android, avvia: avviaApp, aggiornaDati };

// L'ordine conta: prima le schede (mostrano la sezione giusta), poi le viste che ci disegnano.
collegaSchede(app);
collegaFinestre();
collegaAvvio(app);
collegaCerca(app);
collegaGeneri(app);
collegaPlaylist(app);
collegaSuona(app);
collegaImpostazioni(app);

// --- i dati ------------------------------------------------------------------------
// Un catalogo nuovo: se degli id sono cambiati, i file sul telefono li seguono.
async function applicaCatalogo(catalogo) {
  stato.cambia({ catalogo });
  const idValidi = new Set(catalogo.brani.map((b) => b.id));
  await file.riallinea(catalogo.rinominati, idValidi).catch(() => 0);
  stato.cambiaCtx({ fileIds: await file.verifica().catch(() => file.ids()) });
}

async function avviaApp() {
  mostra("app");
  attesa(true);
  try {
    stato.cambiaCtx({
      priorita: leggiPreferenzaMotori(),
      usaNewPipe: leggiPreferenzaNewPipe(),
      soloJukebox: leggiPreferenzaSoloJukebox(),
    });
    const catalogo = await dati.carica();
    await applicaCatalogo(catalogo);
    const elenco = await playlist.carica();
    stato.cambia({ playlist: elenco.map((p) => rimappaPlaylist(p, catalogo.rinominati)) });
    vaiA(app, "cerca");
  } catch (err) {
    mostraAvviso(err?.message || "Caricamento fallito.", "err");
    if (err instanceof ApiError && err.kind === "auth") mostraOnboarding();
  } finally {
    attesa(false);
  }
}

// "Aggiorna dati ora" (Impostazioni): rilegge il catalogo anche se la copia in cache è uguale.
async function aggiornaDati() {
  const catalogo = await dati.carica({ forza: true });
  await applicaCatalogo(catalogo);
  stato.cambia({ playlist: stato.leggi().playlist.map((p) => rimappaPlaylist(p, catalogo.rinominati)) });
}

// --- service worker ----------------------------------------------------------------
function registraServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch(() => {
    /* offline al primo avvio: non è un errore da mostrare */
  });
}

// --- avvio -------------------------------------------------------------------------
registraServiceWorker();

// Anteprima senza token: app/?dati=<indirizzo di un catalogo.json>. Per esempio,
// servendo 05-hobby/musica/ in locale: /app/?dati=../app-dati/catalogo.json
const parametri = new URLSearchParams(window.location.search);
if (parametri.get("dati")) {
  const url = new URL(parametri.get("dati"), window.location.href).href;
  salvaConfig({ tipo: "url", url });
  history.replaceState(null, "", window.location.pathname);
}

if (configPronta()) avviaApp();
else mostraOnboarding();
