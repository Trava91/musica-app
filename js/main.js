// main.js — wiring: onboarding del token, primo avvio, impostazioni, service worker.

import {
  leggiConfig, salvaConfig, configPronta, rimuoviToken,
  leggiPreferenzaMotori, leggiPreferenzaNewPipe, salvaPreferenzaNewPipe,
} from "./config.js";
import { GitHubApi, ApiError } from "./api.js";
import * as dati from "./dati.js";
import * as playlist from "./playlist.js";
import * as file from "./file.js";
import { rimappaPlaylist } from "./regole.js";
import { UI, showToast } from "./ui.js";

const $ = (s) => document.querySelector(s);
const PAT_URL = "https://github.com/settings/personal-access-tokens/new";

const ui = new UI();
ui.init();

function show(schermo) {
  $("#onboarding").hidden = schermo !== "onboarding";
  $("#app").hidden = schermo !== "app";
}

function setFeedback(msg, cls = "") {
  const el = $("#onb-feedback");
  el.textContent = msg;
  el.className = "feedback" + (cls ? " " + cls : "");
}

// --- onboarding --------------------------------------------------------------
function fillOnboarding() {
  const cfg = leggiConfig();
  $("#onb-token").value = "";
  $("#onb-owner").value = cfg.owner;
  $("#onb-repo").value = cfg.repo;
  $("#onb-repo-label").textContent = cfg.repo;
  $("#onb-pat-link").href = PAT_URL;
  setFeedback("");
}

async function onOnboardingSubmit(e) {
  e.preventDefault();
  const token = $("#onb-token").value.trim();
  const owner = $("#onb-owner").value.trim() || undefined;
  const repo = $("#onb-repo").value.trim() || undefined;
  if (!token) { setFeedback("Inserisci il token.", "err"); return; }

  $("#onb-submit").disabled = true;
  setFeedback("Verifico il token…");
  // salva PRIMA di verificare: dati.js legge la config da localStorage
  salvaConfig({ tipo: "github-privato", token, owner, repo });
  try {
    const cfg = leggiConfig();
    const api = new GitHubApi({ owner: cfg.owner, repo: cfg.repo, token: cfg.token });
    await api.verify(cfg.file);
  } catch (err) {
    setFeedback(err?.message || "Verifica fallita.", "err");
    $("#onb-submit").disabled = false;
    rimuoviToken();
    return;
  }
  setFeedback("Token valido ✓", "ok");
  $("#onb-submit").disabled = false;
  await bootApp();
}

// Un catalogo nuovo: se degli id sono cambiati, i file sul telefono li seguono.
async function applicaCatalogo(catalogo) {
  ui.setCatalogo(catalogo);
  const idValidi = new Set(catalogo.brani.map((b) => b.id));
  await file.riallinea(catalogo.rinominati, idValidi).catch(() => 0);
  ui.ctx.fileIds = await file.verifica().catch(() => file.ids());
}

// --- avvio dell'app -----------------------------------------------------------
async function bootApp() {
  show("app");
  $("#spinner").hidden = false;
  try {
    ui.ctx.priorita = leggiPreferenzaMotori();
    ui.ctx.usaNewPipe = leggiPreferenzaNewPipe();
    const catalogo = await dati.carica();
    await applicaCatalogo(catalogo);
    const elencoPlaylist = await playlist.carica();
    ui.setPlaylists(elencoPlaylist.map((p) => rimappaPlaylist(p, catalogo.rinominati)));
    ui.aggiornaPillMotore();
    ui.switchTab("cerca");
  } catch (err) {
    showToast(err?.message || "Caricamento fallito.", "err");
    if (err instanceof ApiError && err.kind === "auth") { fillOnboarding(); show("onboarding"); }
  } finally {
    $("#spinner").hidden = true;
  }
}

// --- impostazioni ---------------------------------------------------------------
function wireImpostazioni() {
  $("#imp-aggiorna").addEventListener("click", async () => {
    $("#spinner").hidden = false;
    try {
      const catalogo = await dati.carica({ forza: true });
      await applicaCatalogo(catalogo);
      ui.setPlaylists(ui.playlists.map((p) => rimappaPlaylist(p, catalogo.rinominati)));
      showToast("Dati aggiornati.", "ok");
      await refreshImpostazioni();
      if (ui.tab === "cerca") ui.renderCerca();
    } catch (err) {
      showToast(err?.message || "Aggiornamento fallito.", "err");
    } finally {
      $("#spinner").hidden = true;
    }
  });

  $("#imp-svuota-cache").addEventListener("click", async () => {
    if (!window.confirm("Svuotare la cache dei dati? Verranno riscaricati al prossimo avvio online.")) return;
    await dati.svuotaCache();
    await refreshImpostazioni();
    showToast("Cache svuotata.", "ok");
  });

  $("#imp-newpipe").addEventListener("change", (e) => {
    ui.ctx.usaNewPipe = e.target.checked;
    salvaPreferenzaNewPipe(e.target.checked);
    ui.aggiornaPillMotore();
  });

  $("#imp-cambia-token").addEventListener("click", async () => {
    if (leggiConfig().tipo === "url") {
      // Uscita dall'anteprima: si torna alla sorgente normale (repo privato col token).
      salvaConfig({ tipo: "github-privato" });
      await dati.svuotaCache();
      if (configPronta()) await bootApp();
      else { fillOnboarding(); show("onboarding"); }
      return;
    }
    if (!window.confirm("Rimuovere il token salvato su questo telefono?")) return;
    rimuoviToken();
    fillOnboarding();
    show("onboarding");
  });
}

async function refreshImpostazioni() {
  const info = await dati.infoCache();
  ui.renderImpostazioni(leggiConfig(), info);
}

// La scheda Impostazioni ha dati che arrivano da promesse async (cache, non solo
// dal catalogo già in memoria): la aggiorniamo ogni volta che diventa attiva.
document.querySelector('[data-tab="impostazioni"]').addEventListener("click", refreshImpostazioni);

// --- service worker -------------------------------------------------------------
function registraServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch(() => { /* offline al primo avvio: non è un errore da mostrare */ });
}

// --- avvio -----------------------------------------------------------------------
document.getElementById("onboarding-form").addEventListener("submit", onOnboardingSubmit);
wireImpostazioni();
registraServiceWorker();

// Anteprima senza token: app/?dati=<indirizzo di un catalogo.json>. Per esempio,
// servendo 05-hobby/musica/ in locale: /app/?dati=../app-dati/catalogo.json
const parametri = new URLSearchParams(window.location.search);
if (parametri.get("dati")) {
  const url = new URL(parametri.get("dati"), window.location.href).href;
  salvaConfig({ tipo: "url", url });
  history.replaceState(null, "", window.location.pathname);
}

if (configPronta()) {
  bootApp();
} else {
  fillOnboarding();
  show("onboarding");
}
