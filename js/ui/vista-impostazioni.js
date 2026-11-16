// vista-impostazioni.js — la scheda Altro (Impostazioni): dati e loro controllo, musica sul
// telefono (importa, togli), riproduzione (Solo Jukebox, NewPipe, ordine dei motori), account.

import {
  configPronta,
  leggiConfig,
  rimuoviToken,
  RIGHE_MAX_AVVISI,
  DURATA_AVVISO_LUNGO_MS,
  salvaConfig,
  salvaPreferenzaMotori,
  salvaPreferenzaNewPipe,
  salvaPreferenzaSoloJukebox,
  VERSIONE,
} from "../config.js";
import * as dati from "../dati/catalogo.js";
import * as file from "../dati/file-audio.js";
import * as playlist from "../dati/playlist.js";
import { registra } from "../nucleo/diagnostica.js";
import { eSpazioFinito } from "../nucleo/errori.js";
import { $, attesa, esc, mostraAvviso, NOMI_MOTORE } from "./base.js";
import { chiediConferma, mostraRiepilogo } from "./dialoghi.js";
import { mostraOnboarding } from "./vista-avvio.js";
import { collegaDiagnostica, disegnaDiagnostica } from "./vista-diagnostica.js";

// Lo stato di Spotify (ctx.spotify, vedi motori.js) detto a parole.
const NOMI_SPOTIFY = {
  premium: "Spotify: Premium collegato.",
  senza: "Spotify: account gratuito, si apre l'app.",
  "da-ricollegare": "Spotify: da ricollegare.",
  "non-configurato": "Spotify: non configurato (arriva con una prossima versione).",
};
const MB = 1048576;
const GB = 1073741824;

export function collegaImpostazioni(app) {
  // La scheda ha dati che arrivano da promesse (la cache, non solo il catalogo in memoria):
  // si aggiorna ogni volta che la si apre.
  $('[data-tab="impostazioni"]').addEventListener("click", () => aggiornaImpostazioni(app));
  collegaDiagnostica();

  $("#imp-aggiorna").addEventListener("click", async () => {
    attesa(true);
    try {
      await app.aggiornaDati();
      mostraAvviso("Dati aggiornati.", "ok");
      await aggiornaImpostazioni(app);
    } catch (err) {
      registra("dati", err);
      mostraAvviso(testoErroreAggiornamento(err), "err");
      await aggiornaImpostazioni(app); // la Diagnostica ha una voce in più
    } finally {
      attesa(false);
    }
  });
  $("#imp-svuota-cache").addEventListener("click", async () => {
    const conferma = await chiediConferma({
      titolo: "Svuotare la cache dei dati?",
      testo: "Verranno riscaricati al prossimo avvio online. Senza rete l'app non partirà.",
      conferma: "Svuota",
      pericolo: true,
    });
    if (!conferma) return;
    await dati.svuotaCache();
    await aggiornaImpostazioni(app);
    mostraAvviso("Cache svuotata.", "ok");
  });

  $("#imp-file-aggiungi").addEventListener("click", () => $("#imp-file-input").click());
  $("#imp-file-input").addEventListener("change", (e) => importaFile(app, e.target));
  $("#imp-file-svuota").addEventListener("click", async () => {
    const conferma = await chiediConferma({
      titolo: "Togliere tutta la musica?",
      testo: "Verranno tolti dal telefono tutti i brani del Jukebox. Per riaverli andranno reimportati.",
      conferma: "Togli tutto",
      pericolo: true,
    });
    if (!conferma) return;
    app.sessione.ferma();
    await file.svuota();
    app.stato.cambiaCtx({ fileIds: file.ids() });
    disegnaFileInfo(app);
    mostraAvviso("Musica tolta dal telefono.", "ok");
  });

  $("#imp-newpipe").addEventListener("change", (e) => {
    app.stato.cambiaCtx({ usaNewPipe: e.target.checked });
    salvaPreferenzaNewPipe(e.target.checked);
  });
  $("#imp-solo-jukebox").addEventListener("change", (e) => {
    app.stato.cambiaCtx({ soloJukebox: e.target.checked });
    salvaPreferenzaSoloJukebox(e.target.checked);
  });
  $("#imp-ordine-motori").addEventListener("click", (e) => {
    const btn = e.target.closest?.("button[data-dir]");
    if (!btn) return;
    const { priorita } = app.stato.leggi().ctx;
    const idx = priorita.indexOf(btn.closest("li").dataset.m);
    const dir = btn.dataset.dir === "su" ? -1 : 1;
    const nuovo = [...priorita];
    [nuovo[idx], nuovo[idx + dir]] = [nuovo[idx + dir], nuovo[idx]];
    app.stato.cambiaCtx({ priorita: nuovo });
    salvaPreferenzaMotori(nuovo);
    disegnaOrdineMotori(app);
  });

  $("#imp-cambia-token").addEventListener("click", async () => {
    if (leggiConfig().tipo === "url") {
      // Uscita dall'anteprima: si torna alla sorgente normale (repo privato col token).
      salvaConfig({ tipo: "github-privato" });
      await dati.svuotaCache();
      if (configPronta()) await app.avvia();
      else mostraOnboarding();
      return;
    }
    const conferma = await chiediConferma({
      titolo: "Cambiare il token?",
      testo: "Il token salvato su questo telefono verrà tolto: ne servirà uno nuovo per leggere i dati.",
      conferma: "Cambia",
    });
    if (!conferma) return;
    rimuoviToken();
    mostraOnboarding();
  });
}

/** Rilegge la cache e ridisegna la scheda. */
export async function aggiornaImpostazioni(app) {
  const info = await dati.infoCache();
  disegnaImpostazioni(app, leggiConfig(), info);
}

function disegnaImpostazioni(app, cfg, infoCache) {
  const { ctx } = app.stato.leggi();
  $("#imp-repo").textContent = cfg.tipo === "url" ? `file locale (${cfg.url}) — anteprima` : `${cfg.owner}/${cfg.repo}`;
  $("#imp-cambia-token").textContent = cfg.tipo === "url" ? "Esci dall'anteprima (usa GitHub)" : "Cambia token";
  $("#imp-dati-info").textContent = infoCache
    ? `${infoCache.brani.toLocaleString("it-IT")} brani in cache, costruito il ${infoCache.costruitoIl || "?"}`
    : "Nessun dato in cache.";
  disegnaControlloDati(app);
  $("#imp-versione").textContent = `Jukebox — versione ${VERSIONE}`;
  $("#imp-spotify-stato").textContent = NOMI_SPOTIFY[ctx.spotify] || NOMI_SPOTIFY["non-configurato"];
  disegnaFileInfo(app);
  $("#imp-newpipe").checked = ctx.usaNewPipe !== false;
  $("#imp-solo-jukebox").checked = ctx.soloJukebox;
  disegnaOrdineMotori(app);
  disegnaDiagnostica();
}

// Perché "Aggiorna dati ora" non ha funzionato, e cosa fare.
function testoErroreAggiornamento(err) {
  if (err?.kind === "network")
    return "Rete assente: i dati restano quelli di prima. Riprova quando torna la connessione.";
  if (err?.kind === "auth") return `${err.message} Cambia il token da qui sotto.`;
  return err?.message || "Aggiornamento fallito.";
}

// Cosa non andava nei dati appena letti (vedi valida.js): brani lasciati fuori perché
// incompleti, playlist ignorate, correzioni fatte in memoria. I file non si toccano mai.
function disegnaControlloDati(app) {
  const el = $("#imp-dati-controllo");
  const { catalogo } = app.stato.leggi();
  const scartati = catalogo?.scartati || [];
  const { scartate, avvisi: avvisiPlaylist } = playlist.controlloPlaylist();
  const avvisi = [...(catalogo?.avvisi || []), ...avvisiPlaylist];

  const elenco = (righe) => {
    const voci = righe.slice(0, RIGHE_MAX_AVVISI).map((r) => `<li>${esc(r)}</li>`);
    if (righe.length > RIGHE_MAX_AVVISI) voci.push(`<li>…e altri ${righe.length - RIGHE_MAX_AVVISI}</li>`);
    return `<ul>${voci.join("")}</ul>`;
  };
  const blocco = (titolo, righe) =>
    righe.length ? `<details><summary>${esc(titolo)}</summary>${elenco(righe)}</details>` : "";
  const voce = (s) => `${s.id ?? "(senza id)"} — ${s.motivo}`;

  el.innerHTML =
    blocco(
      scartati.length === 1
        ? "1 brano ignorato perché incompleto"
        : `${scartati.length} brani ignorati perché incompleti`,
      scartati.map(voce),
    ) +
    blocco(
      scartate.length === 1
        ? "1 playlist ignorata perché incompleta"
        : `${scartate.length} playlist ignorate perché incomplete`,
      scartate.map(voce),
    ) +
    blocco(`Segnalazioni sui dati (${avvisi.length})`, avvisi);
  el.hidden = !el.innerHTML;
}

function disegnaOrdineMotori(app) {
  const { priorita } = app.stato.leggi().ctx;
  $("#imp-ordine-motori").innerHTML = priorita
    .map(
      (m, i) => `
      <li data-m="${esc(m)}">
        <span>${esc(NOMI_MOTORE[m] || m)}</span>
        <span class="frecce">
          <button data-dir="su" ${i === 0 ? "disabled" : ""} aria-label="Sposta su">↑</button>
          <button data-dir="giu" ${i === priorita.length - 1 ? "disabled" : ""} aria-label="Sposta giù">↓</button>
        </span>
      </li>`,
    )
    .join("");
}

// ------------------------------------------------------------ musica sul telefono ----
async function importaFile(app, input) {
  const files = [...(input.files || [])];
  input.value = "";
  if (!files.length) return;
  const stato = $("#imp-file-avanzamento");
  const idValidi = new Set(app.stato.leggi().catalogo.brani.map((b) => b.id));
  try {
    const esito = await file.importa(files, idValidi, (fatti, tot) => {
      stato.textContent = `Copio nel Jukebox: ${fatti} di ${tot}…`;
    });
    stato.textContent = "";
    const aggiunti = `${esito.aggiunti} brani aggiunti${esito.gia ? `, ${esito.gia} c'erano già` : ""}.`;
    if (!esito.sconosciuti.length && !esito.falliti.length && !esito.spazioFinito) {
      mostraAvviso(`${aggiunti} Ora puoi cancellare la cartella Download/Jukebox.`, "ok", {
        duration: DURATA_AVVISO_LUNGO_MS,
      });
    } else {
      // Qualcosa non è andato: un riepilogo con i nomi, da leggere con calma.
      await mostraRiepilogo({
        titolo: esito.spazioFinito ? "Spazio finito" : "Importazione finita",
        righe: [
          aggiunti,
          esito.spazioFinito
            ? `Lo spazio del telefono è finito: ${esito.nonCopiati} file non sono stati copiati. Libera spazio e riprova.`
            : "",
          esito.sconosciuti.length
            ? "Alcuni file non sono brani del catalogo: il nome deve cominciare con l'id del brano (12 cifre), come li prepara il PC."
            : "",
          esito.falliti.length ? "Alcuni file non si sono riusciti a copiare." : "",
        ].filter(Boolean),
        elencoTitolo: "File da controllare",
        elenco: [
          ...esito.sconosciuti.map((n) => `${n}: non riconosciuto`),
          ...esito.falliti.map((n) => `${n}: copia non riuscita`),
        ],
      });
    }
  } catch (err) {
    registra("file", err);
    mostraAvviso(
      eSpazioFinito(err)
        ? "Spazio finito sul telefono: libera spazio e riprova."
        : err?.message || "Importazione non riuscita.",
      "err",
      { duration: DURATA_AVVISO_LUNGO_MS },
    );
  }
  stato.textContent = "";
  app.stato.cambiaCtx({ fileIds: file.ids() });
  disegnaFileInfo(app);
}

async function disegnaFileInfo(app) {
  const n = app.stato.leggi().ctx.fileIds.size;
  const mb = (file.byte() / MB).toFixed(0);
  let libero = "";
  try {
    const st = await navigator.storage?.estimate?.();
    if (st?.quota) libero = ` · spazio ancora disponibile: ${((st.quota - st.usage) / GB).toFixed(1)} GB`;
  } catch {
    /* stima non disponibile */
  }
  $("#imp-file-info").textContent = n
    ? `${n.toLocaleString("it-IT")} brani sul telefono (${mb} MB)${libero}`
    : `Nessun brano sul telefono${libero}. Tocca «Aggiungi file dal telefono» per importare quelli che ha preparato il PC.`;
  $("#imp-file-svuota").hidden = !n;
}
