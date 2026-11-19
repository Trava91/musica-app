// vista-avvio.js — il primo avvio: la schermata del token (onboarding) e il passaggio tra
// onboarding e app. Verifica il token con GitHub e, se va, chiede a main.js di avviare l'app.

import { leggiConfig, rimuoviToken, salvaConfig } from "../config.js";
import { GitHubApi } from "../dati/github.js";
import { $ } from "./base.js";

const PAT_URL = "https://github.com/settings/personal-access-tokens/new";

/** Mostra l'app o la schermata del token. */
export function mostra(schermo) {
  $("#onboarding").hidden = schermo !== "onboarding";
  $("#app").hidden = schermo !== "app";
}

/** La riga sotto il token: cls "" (neutra), "ok" (LED verde) o "err" (LED arancio). */
function messaggio(msg, cls = "") {
  const el = $("#onb-feedback");
  el.textContent = msg;
  el.className = `hf-esito${cls === "ok" ? " hf-ok" : cls === "err" ? " hf-errore" : ""}`;
}

/** La schermata del token, coi campi già riempiti dalla configurazione salvata. */
export function mostraOnboarding() {
  const cfg = leggiConfig();
  $("#onb-token").value = "";
  $("#onb-owner").value = cfg.owner;
  $("#onb-repo").value = cfg.repo;
  $("#onb-repo-label").textContent = cfg.repo;
  $("#onb-pat-link").href = PAT_URL;
  messaggio("");
  mostra("onboarding");
}

/**
 * I tre stati dell'avvio, al posto della rotella sola: "caricamento" (con la frase di cosa si sta
 * leggendo), "errore" (la frase + Riprova, e Cambia token se il problema è l'accesso) e "pronto"
 * (le schede dell'app).
 * @param {"caricamento" | "errore" | "pronto"} stato
 * @param {{ testo?: string, accesso?: boolean }} [opzioni]  accesso = l'errore è il token
 */
export function mostraAvvio(stato, { testo = "", accesso = false } = {}) {
  const pronto = stato === "pronto";
  $("#avvio").hidden = pronto;
  $("#schermi").hidden = !pronto;
  $("#suona").hidden = !pronto;
  $(".hf-barra").hidden = !pronto;
  $("#avvio-ruota").hidden = stato !== "caricamento";
  $("#avvio-testo").textContent = testo;
  $("#avvio-testo").classList.toggle("hf-errore", stato === "errore");
  $("#avvio-azioni").hidden = stato !== "errore";
  $("#avvio-token").hidden = !accesso;
  if (stato === "errore") $("#avvio-riprova").focus();
}

export function collegaAvvio(app) {
  $("#onboarding-form").addEventListener("submit", (e) => inviaToken(app, e));
  $("#avvio-riprova").addEventListener("click", () => app.avvia());
  $("#avvio-token").addEventListener("click", () => mostraOnboarding());
}

async function inviaToken(app, e) {
  e.preventDefault();
  const token = $("#onb-token").value.trim();
  const owner = $("#onb-owner").value.trim() || undefined;
  const repo = $("#onb-repo").value.trim() || undefined;
  if (!token) {
    messaggio("Inserisci il token.", "err");
    return;
  }

  $("#onb-submit").disabled = true;
  messaggio("Verifico il token…");
  // salva PRIMA di verificare: dati/catalogo.js legge la config da localStorage
  salvaConfig({ tipo: "github-privato", token, owner, repo });
  try {
    const cfg = leggiConfig();
    const api = new GitHubApi({ owner: cfg.owner, repo: cfg.repo, token: cfg.token });
    await api.verify(cfg.file);
  } catch (err) {
    messaggio(err?.message || "Verifica fallita.", "err");
    $("#onb-submit").disabled = false;
    rimuoviToken();
    return;
  }
  messaggio("Token valido", "ok");
  $("#onb-submit").disabled = false;
  await app.avvia();
}
