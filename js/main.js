// main.js — l'avvio del Jukebox: crea i pezzi (stato, lettore, sessione, viste), li collega e
// carica i dati. Non disegna nulla (la pagina la tocca solo js/ui/) e non decide cosa suonare
// (lo fa js/nucleo/sessione.js).

import { Lettore } from "./audio/lettore.js";
import {
  configPronta,
  DURATA_AVVISO_LUNGO_MS,
  leggiPreferenzaMotori,
  leggiPreferenzaNewPipe,
  leggiPreferenzaSoloJukebox,
  salvaConfig,
} from "./config.js";
import * as dati from "./dati/catalogo.js";
import * as file from "./dati/file-audio.js";
import * as playlist from "./dati/playlist.js";
import * as diagnostica from "./nucleo/diagnostica.js";
import { eErroreAccesso, testoErroreAvvio } from "./nucleo/errori.js";
import { rimappaPlaylist } from "./nucleo/regole.js";
import { Sessione } from "./nucleo/sessione.js";
import { Stato } from "./nucleo/stato.js";
import { dataBreve } from "./nucleo/testo.js";
import { registraServiceWorker } from "./ui/aggiornamento.js";
import { apriLink, collegaFinestre, collegaSchede, mostraAvviso, vaiA } from "./ui/base.js";
import { collegaAvvio, mostra, mostraAvvio, mostraOnboarding } from "./ui/vista-avvio.js";
import { collegaCerca } from "./ui/vista-cerca.js";
import { collegaGeneri } from "./ui/vista-generi.js";
import { collegaImpostazioni } from "./ui/vista-impostazioni.js";
import { collegaPlaylist } from "./ui/vista-playlist.js";
import { collegaSuona } from "./ui/vista-suona.js";

// --- la rete di sicurezza ---------------------------------------------------------
// Prima di tutto: un errore imprevisto (anche durante l'avvio) finisce nel registro della
// Diagnostica e, se ha una frase per l'utente, in un avviso.
diagnostica.installaReteDiSicurezza(window);
diagnostica.ascolta((voce) => {
  if (voce.avviso) mostraAvviso(voce.avviso, "err");
});

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
  // Se i file sul telefono non si riescono a riallineare l'app parte lo stesso, con quello che c'è.
  await file.riallinea(catalogo.rinominati, idValidi).catch((err) => {
    diagnostica.registra("file", err);
    return 0;
  });
  stato.cambiaCtx({
    fileIds: await file.verifica().catch((err) => {
      diagnostica.registra("file", err);
      return file.ids();
    }),
  });
}

// L'avvio ha tre stati (vedi mostraAvvio): caricamento, errore (con Riprova) e pronto. Se la rete
// manca ma c'è una copia dei dati, si parte con quella e lo si dice.
async function avviaApp() {
  mostra("app");
  mostraAvvio("caricamento", { testo: "Leggo il catalogo…" });
  try {
    stato.cambiaCtx({
      priorita: leggiPreferenzaMotori(),
      usaNewPipe: leggiPreferenzaNewPipe(),
      soloJukebox: leggiPreferenzaSoloJukebox(),
    });
    const catalogo = await dati.carica();
    mostraAvvio("caricamento", { testo: "Leggo le playlist…" });
    await applicaCatalogo(catalogo);
    const elenco = await playlist.carica();
    stato.cambia({ playlist: elenco.map((p) => rimappaPlaylist(p, catalogo.rinominati)) });
    mostraAvvio("pronto");
    vaiA(app, "cerca");
    if (catalogo.offline) {
      const quando = dataBreve(catalogo.costruitoIl);
      mostraAvviso(`Dati ${quando ? `del ${quando}` : "salvati"}, non aggiornati: rete assente.`, "", {
        duration: DURATA_AVVISO_LUNGO_MS,
      });
    }
  } catch (err) {
    diagnostica.registra("avvio", err);
    mostraAvvio("errore", { testo: testoErroreAvvio(err), accesso: eErroreAccesso(err) });
  }
}

// "Aggiorna dati ora" (Impostazioni): rilegge il catalogo anche se la copia in cache è uguale.
async function aggiornaDati() {
  const catalogo = await dati.carica({ forza: true });
  await applicaCatalogo(catalogo);
  stato.cambia({ playlist: stato.leggi().playlist.map((p) => rimappaPlaylist(p, catalogo.rinominati)) });
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
