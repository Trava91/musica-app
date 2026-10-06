// ui.js — rendering e stato dell'interfaccia del Jukebox. Tutta la manipolazione
// DOM vive qui; la logica pura sta in cerca/regole/dj/motori/link/coda.js.

import * as cercaMod from "./cerca.js";
import * as regole from "./regole.js";
import * as motori from "./motori.js";
import * as link from "./link.js";
import { Coda } from "./coda.js";
import * as generi from "./generi.js";
import * as file from "./file.js";
import * as comandi from "./comandi.js";
import { Lettore } from "./lettore.js";
import * as playlist from "./playlist.js";
import { salvaPreferenzaMotori } from "./config.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const NOMI_MOTORE = {
  file: "Nel Jukebox (file)",
  "spotify-premium": "Con Spotify",
  newpipe: "Con NewPipe",
  "spotify-app": "Apri in Spotify",
  web: "Apri sul web",
};
// Dove suona il brano, per il mini lettore e la scheda Suona.
const NOMI_DOVE = { file: "nel Jukebox", "spotify-premium": "in Spotify", newpipe: "in NewPipe", "spotify-app": "in Spotify", web: "sul web" };
const NOMI_TIPO = { originale: "originale", remix: "remix", edit: "edit", extended: "extended", live: "live", set: "set" };
const NOMI_PIATT = { sp: "Spotify", yt: "YouTube", sc: "SoundCloud", lo: "File sul telefono" };
const SIGLA_PIATT = { sp: "SP", yt: "YT", sc: "SC", lo: "FILE" };
const NOMI_ORDINE_CERCA = { artista: "artista", recenti: "recenti", bpm: "BPM" };
const NOMI_ORDINE_PL = { artista: "per artista", casuale: "casuale", "bpm-su": "BPM crescente", "bpm-giu": "BPM decrescente", armonico: "percorso armonico", recenti: "recenti" };
const SVG_PLAY = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>`;
const SVG_PAUSA = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>`;
const ICONA_PNG = new URL("icons/icon-512.png", document.baseURI).href;

// Codice di selezione come sui jukebox (A1…A9, B1…): solo decorativo, dipende
// dalla posizione nella lista mostrata.
function codiceSelezione(i) {
  return String.fromCharCode(65 + (Math.floor(i / 9) % 26)) + ((i % 9) + 1);
}
// Colore della fascia dell'artista: fisso per voce di genere (vedi generi.js),
// così la lista "suona" a colori e tutta la Tech house ha lo stesso colore.
function classeFascia(voce) {
  return voce < 0 ? "f-neutra" : ["f-rosso", "f-blu", "f-ambra"][voce % 3];
}

let toastTimer = null;
export function showToast(msg, type = "", opts = {}) {
  const t = $("#toast");
  clearTimeout(toastTimer);
  t.innerHTML = "";
  const span = document.createElement("span");
  span.textContent = msg;
  t.appendChild(span);
  if (opts.actionLabel) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = opts.actionLabel;
    btn.addEventListener("click", () => {
      t.hidden = true;
      clearTimeout(toastTimer);
      opts.onAction?.();
    });
    t.appendChild(btn);
  }
  t.className = "toast" + (type ? " " + type : "");
  t.hidden = false;
  toastTimer = setTimeout(() => { t.hidden = true; }, opts.duration || 3200);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function titoloCompleto(b) {
  let t = b.t || "(senza titolo)";
  if (b.v) t += ` (${b.v})`;
  return t;
}
function sottotitolo(b) {
  let s = b.a || "(artista sconosciuto)";
  if (b.f) s += ` feat. ${b.f}`;
  return s;
}
function durataFmt(sec) {
  if (sec === undefined) return "";
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Sul telefono Android i link intent:// aprono NewPipe/Spotify; sul PC (anteprima)
// non esistono, quindi link.linkApertura restituisce il link web.
const ANDROID = /Android/i.test(navigator.userAgent);

function apriLink(url) {
  if (!url) return;
  if (url.startsWith("intent://")) window.location.href = url;
  else window.open(url, "_blank", "noopener");
}

export class UI {
  constructor() {
    this.catalogo = null; // {brani, macro, raccolte, costruitoIl}
    this.playlists = [];
    this.tab = "cerca";
    this.filtri = { soloScelti: true, tipo: "canzoni" };
    this.ordineRisultati = undefined;
    this.paginaRisultati = 100;
    this.ctx = { fileIds: new Set(), spotify: "non-configurato", usaNewPipe: true, priorita: [] };
    this.coda = null;
    this.playlistAttiva = null;
    this.esterno = null;    // ultimo brano mandato a un'app esterna (NewPipe, Spotify)
    this.motoreCoda = null; // il motore con cui suona la coda attuale ("file" = lettore interno)
    this.prossimiMostrati = 30; // quanti brani di "A seguire" si vedono (cresce con "Mostra altri")
    this.lettore = new Lettore({
      onFine: (b) => this.fineBrano(b),
      onStato: () => this.aggiornaStatoLettore(),
      onComando: (c) => this.comandoBlocco(c),
    });
  }

  init() {
    $$(".tab").forEach((btn) => btn.addEventListener("click", () => this.switchTab(btn.dataset.tab)));
    $("#cerca-testo").addEventListener("input", debounce(() => { this.paginaRisultati = 100; this.renderCerca(); }, 120));
    $("#cerca-altri").addEventListener("click", () => { this.paginaRisultati += 100; this.renderCerca(); });
    $("#cerca-filtri-btn").addEventListener("click", () => this.apriFiltri());
    $("#rapido-generi").addEventListener("click", () => this.switchTab("generi"));
    $("#rapido-ordine").addEventListener("click", () => {
      const giro = [undefined, "artista", "recenti", "bpm"];
      this.ordineRisultati = giro[(giro.indexOf(this.ordineRisultati) + 1) % giro.length];
      this.paginaRisultati = 100;
      this.renderCerca();
    });
    $("#pl-nuova-intelligente").addEventListener("click", () => this.apriCostruttore(null));
    $("#pl-nuova-manuale").addEventListener("click", () => this.creaManualeVuota());
    // ⏮ ⏭ spostano solo la selezione: il brano scelto parte col tasto grande o a fine brano.
    $("#rip-avanti").addEventListener("click", () => { if (this.coda) { comandi.spostaSelezione(this.coda, 1); this.renderRiproduzione(); } });
    $("#rip-indietro").addEventListener("click", () => { if (this.coda) { comandi.spostaSelezione(this.coda, -1); this.renderRiproduzione(); } });
    $("#rip-principale").addEventListener("click", () => this.premiTastoGrande());
    $("#rip-in-corso").addEventListener("click", () => {
      if (this.coda && this.lettore.brano) { this.coda.salta(this.lettore.brano.id); this.renderRiproduzione(); }
    });
    $("#rip-posizione").addEventListener("input", (e) => { this.trascinando = true; $("#rip-tempo").textContent = durataFmt(Number(e.target.value)); });
    $("#rip-posizione").addEventListener("change", (e) => { this.trascinando = false; this.lettore.cerca(Number(e.target.value)); });
    $("#mini-pausa").addEventListener("click", () => {
      if (this.lettore.stato === "suona") this.lettore.pausa(); else this.lettore.riprendi();
    });
    $("#imp-file-aggiungi").addEventListener("click", () => $("#imp-file-input").click());
    $("#imp-file-input").addEventListener("change", (e) => this.importaFile(e.target));
    $("#imp-file-svuota").addEventListener("click", async () => {
      if (!window.confirm("Togliere dal telefono tutta la musica del Jukebox? Per riaverla andrà reimportata.")) return;
      this.lettore.ferma();
      await file.svuota();
      this.ctx.fileIds = file.ids();
      this.renderFileInfo();
      showToast("Musica tolta dal telefono.", "ok");
    });
    $("#rip-casuale").addEventListener("click", () => {
      if (!this.coda) return;
      this.coda.impostaCasuale(!this.coda.casuale);
      this.renderRiproduzione();
    });
    $("#rip-ripeti").addEventListener("click", () => {
      if (!this.coda) return;
      const giro = ["no", "tutti", "uno"];
      this.coda.ripeti = giro[(giro.indexOf(this.coda.ripeti) + 1) % giro.length];
      this.renderRiproduzione();
    });
    $("#mini-apri").addEventListener("click", () => this.switchTab("riproduzione"));
    $("#prossimi-altri").addEventListener("click", () => { this.prossimiMostrati += 30; this.renderRiproduzione(); });
    $$(".overlay").forEach((ov) => ov.addEventListener("click", (e) => { if (e.target === ov) ov.hidden = true; }));
  }

  switchTab(tab) {
    this.tab = tab;
    $$(".tab").forEach((b) => b.classList.toggle("attivo", b.dataset.tab === tab));
    $$(".schermo").forEach((s) => { s.hidden = s.dataset.schermo !== tab; });
    if (tab === "cerca") this.renderCerca();
    if (tab === "generi") this.renderGeneri();
    if (tab === "playlist") this.renderPlaylist();
    if (tab === "riproduzione") this.renderRiproduzione();
    this.aggiornaMiniLettore();
  }

  // Barra "sta suonando" sopra i tasti: visibile se c'è una coda, tranne nella
  // schermata In riproduzione (dove sarebbe un doppione). Mostra quello che si
  // SENTE (il lettore interno), altrimenti il brano selezionato della coda.
  aggiornaMiniLettore() {
    const mini = $("#mini-lettore");
    const brano = this.lettore.brano || this.coda?.corrente;
    mini.hidden = !brano || this.tab === "riproduzione";
    if (mini.hidden) return;
    const interno = !!this.lettore.brano;
    const motore = interno ? "file" : motori.motoreBrano(brano, this.ctx).motore;
    $("#mini-titolo").textContent = titoloCompleto(brano);
    $("#mini-sotto").textContent = [brano.a, motore ? NOMI_DOVE[motore] : ""].filter(Boolean).join(" · ");
    $("#mini-apri").setAttribute("aria-label", `${titoloCompleto(brano)}: apri la schermata Suona`);
    $("#mini-disco").classList.toggle("gira", this.lettore.stato === "suona");
    const pausa = $("#mini-pausa");
    pausa.hidden = !interno;
    pausa.innerHTML = this.lettore.stato === "suona" ? SVG_PAUSA : SVG_PLAY;
    pausa.setAttribute("aria-label", this.lettore.stato === "suona" ? "Pausa" : "Riprendi");
  }

  setCatalogo(catalogo) {
    this.catalogo = catalogo;
    this.voci = generi.vociGeneri(catalogo.macro);
    this._totaleScelti = null;
  }

  // Nome del genere come lo mostra il jukebox (house e techno → "Tech house").
  nomeGenere(g) {
    const v = generi.voceDi(this.voci, g);
    return v < 0 ? "" : this.voci[v].nome;
  }

  // Chip delle voci di genere per i pannelli (filtri e costruttore): il valore è
  // la posizione della voce; selezionata se tutti i suoi indici sono nella lista.
  chipGeneri(indici) {
    const scelte = new Set(generi.vociSelezionate(this.voci, indici).map((v) => v.nome));
    return this.voci.map((v, i) => `<label class="chip"><input type="checkbox" data-campo="macro" value="${i}" ${scelte.has(v.nome) ? "checked" : ""}><span>${esc(v.nome)}</span></label>`).join("");
  }
  leggiChipGeneri(el) {
    return $$('input[data-campo="macro"]:checked', el).flatMap((i) => this.voci[Number(i.value)].indici);
  }
  setPlaylists(elenco) { this.playlists = elenco; }

  aggiornaPillMotore() {
    const p = $("#stato-motore");
    if (!p) return;
    if (!ANDROID) { p.textContent = "Anteprima PC · link web"; return; }
    p.textContent = this.ctx.spotify === "premium" ? "Spotify Premium"
      : this.ctx.usaNewPipe ? "NewPipe attivo" : "Spotify gratis";
  }

  // ---------------- Cerca ----------------
  renderCerca() {
    if (!this.catalogo) return;
    const testo = $("#cerca-testo").value;
    const risultati = cercaMod.cerca(this.catalogo.brani, testo, this.filtri, this.ordineRisultati);
    const nAttivi = this.contaFiltriAttivi();
    $("#cerca-filtri-badge").hidden = nAttivi === 0;
    $("#cerca-filtri-badge").textContent = nAttivi;
    $("#cerca-riepilogo").textContent = `${risultati.length.toLocaleString("it-IT")} dischi`;
    const effettivo = this.ordineRisultati || (testo.trim() ? "rilevanza" : "artista");
    $("#cerca-ordine-testo").textContent = effettivo === "rilevanza" ? "per pertinenza" : `ordine per ${NOMI_ORDINE_CERCA[effettivo]}`;
    $("#rapido-ordine").textContent = `Ordine: ${this.ordineRisultati ? NOMI_ORDINE_CERCA[this.ordineRisultati] : "auto"}`;
    $("#rapido-ordine").classList.toggle("accesa", !!this.ordineRisultati);
    const vociScelte = generi.vociSelezionate(this.voci, this.filtri.macro);
    $("#rapido-generi-testo").textContent = vociScelte.length === 1 ? vociScelte[0].nome : vociScelte.length > 1 ? `${vociScelte.length} generi` : "Generi";
    $("#rapido-generi").classList.toggle("accesa", vociScelte.length > 0);
    $("#cerca-filtri-btn").classList.toggle("accesa", nAttivi > 0);
    if (!this._totaleScelti) this._totaleScelti = cercaMod.cerca(this.catalogo.brani, "", { soloScelti: true, tipo: "canzoni" }).length;
    $("#arco-sotto").textContent = `${this._totaleScelti.toLocaleString("it-IT")} dischi in raccolta`;
    const mostrati = risultati.slice(0, this.paginaRisultati);
    $("#cerca-risultati").innerHTML = mostrati.map((b, i) => this.rigaBrano(b, i)).join("");
    const nomeRicerca = testo.trim() ? `Ricerca «${testo.trim()}»` : vociScelte.length === 1 ? vociScelte[0].nome : "Ricerca";
    this.agganciaClicRighe($("#cerca-risultati"), mostrati, { lista: risultati, nome: nomeRicerca });
    $("#cerca-altri").hidden = risultati.length <= mostrati.length;
  }

  contaFiltriAttivi() {
    let n = 0;
    const f = this.filtri;
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

  // Targhetta del brano: codice di selezione, titolo a macchina, fascia con
  // l'artista, riga di dati. Il corpo apre la scheda, il tasto tondo suona.
  rigaBrano(b, i = 0, { grande = false, play = true } = {}) {
    const piatt = [...new Set(b.s.map(([c]) => SIGLA_PIATT[c] || c))].join(" ");
    const meta = [
      b.b ? `${Math.round(b.b)} BPM` : "", b.c || "",
      this.nomeGenere(b.g), b.y || "", piatt,
    ].filter(Boolean).join(" · ");
    const inCorso = b.id === this.idInCorso();
    return `<div class="striscia${grande ? " grande" : ""}${inCorso ? " in-corso" : ""}" data-id="${esc(b.id)}">
      <button class="striscia-corpo" type="button" aria-label="${esc(titoloCompleto(b) + " di " + (b.a || "artista sconosciuto"))}: apri la scheda">
        <span class="striscia-codice" aria-hidden="true">${codiceSelezione(i)}</span>
        <span class="striscia-testo">
          <span class="striscia-titolo">${esc(titoloCompleto(b))}</span>
          <span class="striscia-fascia ${classeFascia(generi.voceDi(this.voci, b.g))}">${esc(sottotitolo(b))}</span>
          <span class="striscia-meta">${esc(meta)}</span>
        </span>
      </button>
      ${play ? `<button class="striscia-play" type="button" aria-label="${inCorso ? this.etichettaInCorso() : "Suona " + esc(titoloCompleto(b))}">${inCorso ? this.iconaInCorso() : SVG_PLAY}</button>` : ""}
    </div>`;
  }

  // contesto: {lista, nome} = la lista da cui suonare ("suona da qui"), oppure
  // {coda: true} per le righe della coda attuale (lì ▶ salta a quel brano).
  agganciaClicRighe(container, elenco, contesto = {}) {
    $$(".striscia", container).forEach((el) => {
      const brano = () => elenco.find((x) => x.id === el.dataset.id) || this.trovaBranoId(el.dataset.id);
      $(".striscia-corpo", el)?.addEventListener("click", () => { const b = brano(); if (b) this.apriFoglioBrano(b, contesto); });
      $(".striscia-play", el)?.addEventListener("click", () => { const b = brano(); if (b) this.tastoRiga(b, contesto.coda ? null : (contesto.lista || elenco), contesto.nome); });
    });
  }

  // ---------------- Cosa sta suonando, ovunque ----------------
  // Il brano che si sente: quello del lettore interno, o l'ultimo mandato a un'app esterna.
  idInCorso() { return this.lettore.brano?.id || this.esterno?.id || null; }

  iconaInCorso() {
    if (this.lettore.brano && this.lettore.stato !== "suona") return SVG_PLAY;
    return `<span class="eq${this.lettore.brano ? " attivo" : ""}" aria-hidden="true"><i></i><i></i><i></i></span>`;
  }

  etichettaInCorso() {
    if (!this.lettore.brano) return "Riapri nell'app esterna";
    return this.lettore.stato === "suona" ? "Pausa" : "Riprendi";
  }

  // Aggiorna l'evidenziazione in tutte le liste visibili senza ridisegnarle.
  aggiornaEvidenziati() {
    const id = this.idInCorso();
    const chiave = `${id}|${this.lettore.stato}`;
    if (chiave === this._evidenziati) return;
    this._evidenziati = chiave;
    $$(".striscia").forEach((el) => {
      const on = el.dataset.id === id;
      el.classList.toggle("in-corso", on);
      const btn = $(".striscia-play", el);
      if (!btn) return;
      btn.innerHTML = on ? this.iconaInCorso() : SVG_PLAY;
      if (on) btn.setAttribute("aria-label", this.etichettaInCorso());
    });
  }

  // ▶ di una riga. Sul brano in corso: pausa / riprendi. Su un brano della coda:
  // salta lì. Altrove: suona da quel brano in poi la lista in cui sta.
  tastoRiga(b, lista, nome) {
    if (b.id === this.idInCorso()) {
      if (!this.lettore.brano) { const { motore, fonte } = motori.motoreBrano(b, this.ctx); this.apriConMotore(motore, fonte); return; }
      if (this.lettore.stato === "suona") this.lettore.pausa(); else this.lettore.riprendi();
      return;
    }
    if (!lista) { // riga della coda attuale
      this.coda.salta(b.id);
      this.premiTastoGrande();
      return;
    }
    this.suonaDaLista(lista, b, nome || "Brano singolo");
  }

  // Suona `b` e poi il resto di `lista` (come le app di musica). Resta nella
  // schermata in cui sei: cosa suona lo dicono il mini lettore e la scheda Suona.
  suonaDaLista(lista, b, nome) {
    const { motore } = motori.motoreBrano(b, this.ctx);
    if (!motore) { showToast("Nessuna fonte disponibile per questo brano.", "err"); return; }
    const brani = motore === "file" ? lista.filter((x) => this.ctx.fileIds.has(x.id)) : lista;
    this.avviaCoda({ id: "lista", nome }, brani, motore, { da: b, saltati: lista.length - brani.length });
    if (motore !== "file") this.premiTastoGrande(); // apre l'app esterna sul brano
  }

  trovaBranoId(id) { return this.catalogo?.brani.find((b) => b.id === id); }

  // ---------------- Generi ----------------
  renderGeneri() {
    if (!this.catalogo) return;
    const { conteggi, senzaGenere } = cercaMod.conteggiMacro(this.catalogo.brani, {});
    const scelti = this.filtri.macro || [];
    const n = (x) => x.toLocaleString("it-IT");
    // Tasti in ordine di quantità, come una pulsantiera: i generi più pieni in alto.
    // Acceso = il filtro attivo è esattamente quella voce.
    const ordine = this.voci
      .map((v, i) => ({ nome: v.nome, i, conta: v.indici.reduce((s, x) => s + conteggi[x], 0), acceso: v.indici.length === scelti.length && v.indici.every((x) => scelti.includes(x)) }))
      .sort((a, b) => b.conta - a.conta);
    const tasto = (g, pos) => `<button class="tasto-genere${g.acceso ? " acceso" : ""}" type="button" data-idx="${g.i}" aria-pressed="${g.acceso}">
        <span class="tasto-nome">${esc(g.nome)}</span>
        <span class="tasto-sotto"><span class="codice-mini">${codiceSelezione(pos)}</span>${n(g.conta)} dischi</span>
      </button>`;
    const totale = conteggi.reduce((s, x) => s + x, 0) + senzaGenere;
    $("#generi-lista").innerHTML =
      `<button class="tasto-genere largo${scelti.length ? "" : " acceso"}" type="button" data-idx="tutti" aria-pressed="${!scelti.length}">
        <span class="tasto-nome">Tutti i generi</span>
        <span class="tasto-sotto">${n(totale)} dischi${senzaGenere ? ` · ${n(senzaGenere)} ancora senza genere` : ""}</span>
      </button>` + ordine.map(tasto).join("");
    $$(".tasto-genere", $("#generi-lista")).forEach((el) => {
      el.addEventListener("click", () => {
        this.filtri = { ...this.filtri, macro: el.dataset.idx === "tutti" ? [] : [...this.voci[Number(el.dataset.idx)].indici] };
        this.paginaRisultati = 100;
        this.switchTab("cerca");
      });
    });
  }

  // ---------------- Foglio brano ----------------
  apriFoglioBrano(b, contesto = {}) {
    const overlay = $("#foglio-overlay");
    const el = $("#foglio-brano");
    const { motore } = motori.motoreBrano(b, this.ctx);
    const fontiRighe = b.s.map(([cod, rif]) => {
      const azione = cod === "lo"
        ? `<span class="muted small">${esc(rif)}</span>`
        : `<button class="btn-secondary btn-apri" data-cod="${esc(cod)}" data-rif="${esc(rif)}">Apri</button>`;
      return `<div class="riga-fonte"><span><span class="sigla-piatt">${esc(SIGLA_PIATT[cod] || cod)}</span>${esc(NOMI_PIATT[cod] || cod)}</span>${azione}</div>`;
    }).join("");
    const altriArtista = cercaMod.perArtista(this.catalogo.brani, b._normA).filter((x) => x.id !== b.id).slice(0, 8);

    el.innerHTML = `
      <div class="foglio-intestazione">
        <h2>${esc(titoloCompleto(b))}</h2>
        <button class="foglio-chiudi" id="foglio-chiudi">✕</button>
      </div>
      <div class="campi-brano">
        <div>${esc(sottotitolo(b))}</div>
        ${b.g !== undefined ? `<div class="muted small">${esc(this.nomeGenere(b.g))}${b.gf ? " — " + esc(b.gf) : ""}</div>` : ""}
        <div class="muted small">${[b.y, durataFmt(b.d), b.b ? Math.round(b.b) + " bpm" : "", b.c, b.e !== undefined ? "energia " + b.e.toFixed(2) : ""].filter(Boolean).join(" · ")}</div>
      </div>
      <div class="azioni-riga">
        <button class="btn-primary" id="foglio-suona">▶ Suona${motore ? " (" + esc(NOMI_MOTORE[motore] || motore) + ")" : ""}</button>
        <button class="btn-secondary" id="foglio-aggiungi">+ Playlist</button>
      </div>
      <div class="foglio-sezione"><h3>Dove si trova</h3>${fontiRighe}</div>
      ${altriArtista.length ? `<div class="foglio-sezione"><h3>Altri di ${esc(b.a)}</h3><div class="lista" id="foglio-altri-artista"></div></div>` : ""}
    `;
    $("#foglio-chiudi").addEventListener("click", () => { overlay.hidden = true; });
    $("#foglio-suona").addEventListener("click", () => {
      $("#foglio-overlay").hidden = true;
      if (contesto.coda) this.tastoRiga(b, null);
      else this.suonaDaLista(contesto.lista || [b], b, contesto.nome || "Brano singolo");
    });
    $("#foglio-aggiungi").addEventListener("click", () => this.apriAggiungiAPlaylist(b));
    $$(".btn-apri", el).forEach((btn) => btn.addEventListener("click", () => {
      const fonte = [btn.dataset.cod, btn.dataset.rif];
      const motore = fonte[0] === "sp" ? "spotify-app"
        : (fonte[0] === "yt" || fonte[0] === "sc") && this.ctx.usaNewPipe !== false ? "newpipe" : "web";
      apriLink(link.linkApertura(motore, fonte, { android: ANDROID }));
    }));
    if (altriArtista.length) {
      $("#foglio-altri-artista").innerHTML = altriArtista.map((x, i) => this.rigaBrano(x, i)).join("");
      this.agganciaClicRighe($("#foglio-altri-artista"), altriArtista, { lista: altriArtista, nome: `Brani di ${b.a}` });
    }
    overlay.hidden = false;
  }

  // Apre un brano in un'app esterna (NewPipe, Spotify, web) e lo segna come "in
  // corso": il lettore interno si ferma, così non suonano due cose insieme.
  apriConMotore(motore, fonte) {
    if (motore === "file") return;
    const b = this.coda?.corrente;
    this.lettore.ferma();
    this.esterno = b || null;
    if (this.coda) this.renderRiproduzione(); else this.aggiornaStatoLettore();
    apriLink(link.linkApertura(motore, fonte, { android: ANDROID }));
  }

  // ---------------- Aggiungi a playlist ----------------
  apriAggiungiAPlaylist(b) {
    const overlay = $("#aggiungi-overlay");
    const el = $("#aggiungi-a-playlist");
    const manuali = this.playlists.filter((p) => p.tipo === "manuale");
    el.innerHTML = `
      <div class="foglio-intestazione"><h2>Aggiungi a…</h2><button class="foglio-chiudi" id="agg-chiudi">✕</button></div>
      ${manuali.length
        ? `<div class="lista">${manuali.map((p) => `<button class="riga" data-id="${esc(p.id)}"><div class="riga-testo"><div class="riga-titolo">${esc(p.nome)}</div><div class="riga-sotto">${(p.brani || []).length} brani</div></div></button>`).join("")}</div>`
        : `<p class="muted">Non hai ancora playlist manuali.</p>`}
      <button class="btn-secondary btn-blocco" id="agg-nuova">+ Nuova playlist manuale con questo brano</button>
    `;
    $("#agg-chiudi").addEventListener("click", () => { overlay.hidden = true; });
    $$(".riga", el).forEach((r) => r.addEventListener("click", async () => {
      const p = manuali.find((x) => x.id === r.dataset.id);
      if (!p.brani.includes(b.id)) p.brani.push(b.id);
      await this.salvaPlaylistSingola(p);
      showToast(`Aggiunto a "${p.nome}".`, "ok");
      overlay.hidden = true;
    }));
    $("#agg-nuova").addEventListener("click", async () => {
      overlay.hidden = true;
      const nome = window.prompt("Nome della nuova playlist:");
      if (!nome) return;
      const nuova = { id: playlist.nuovoId(nome), nome, tipo: "manuale", brani: [b.id] };
      await this.salvaPlaylistSingola(nuova);
      showToast(`Playlist "${nome}" creata.`, "ok");
    });
    overlay.hidden = false;
  }

  async salvaPlaylistSingola(p) {
    try {
      await playlist.salvaUna(p);
      const i = this.playlists.findIndex((x) => x.id === p.id);
      if (i >= 0) this.playlists[i] = p; else this.playlists.push(p);
    } catch (err) {
      showToast(err?.message || "Salvataggio non riuscito.", "err");
      throw err;
    }
  }

  creaManualeVuota() {
    const nome = window.prompt("Nome della playlist:");
    if (!nome) return;
    const nuova = { id: playlist.nuovoId(nome), nome, tipo: "manuale", brani: [] };
    this.salvaPlaylistSingola(nuova).then(() => { this.renderPlaylist(); showToast("Playlist creata.", "ok"); }).catch(() => {});
  }

  // ---------------- Playlist ----------------
  renderPlaylist() {
    if (!this.catalogo) return;
    const n = this.playlists.length;
    $("#playlist-sotto").textContent = n ? `${n} playlist · quelle coi filtri si aggiornano da sole` : "";
    const fasce = ["f-rosso", "f-blu", "f-ambra"];
    $("#playlist-lista").innerHTML = this.playlists.map((p, i) => {
      const elenco = regole.valuta(p, this.catalogo.brani, this.ctx);
      const piano = motori.pianoRiproduzione(elenco, this.ctx);
      const consigliato = piano.consigliato ? NOMI_MOTORE[piano.consigliato].toLowerCase() : "nessuna fonte disponibile";
      const etichette = this.riassuntoRegole(p).map((t) => `<span class="etichetta-regola">${esc(t)}</span>`).join("");
      return `<div class="cartellino" data-id="${esc(p.id)}">
        <button class="cartellino-testa ${fasce[i % 3]}" type="button" aria-label="Apri la playlist ${esc(p.nome)}">
          <span class="codice-mini">P${i + 1}</span><span>${esc(p.nome)}</span>
        </button>
        ${etichette ? `<div class="cartellino-regole">${etichette}</div>` : ""}
        <div class="cartellino-piede">
          <span>${elenco.length ? `${elenco.length.toLocaleString("it-IT")} dischi · ${esc(consigliato)}${p.telefono ? ` · ${elenco.filter((b) => this.ctx.fileIds.has(b.id)).length} sul telefono` : ""}` : "Vuota · aggiungi dischi dalla ricerca"}</span>
          ${elenco.length ? `<button class="play-neon" type="button" aria-label="Avvia ${esc(p.nome)}">${SVG_PLAY}</button>` : ""}
        </div>
      </div>`;
    }).join("") || `<p class="vuoto muted">Nessuna playlist ancora. Creane una con i pulsanti qui sopra.</p>`;
    $$(".cartellino", $("#playlist-lista")).forEach((el) => {
      const p = this.playlists.find((x) => x.id === el.dataset.id);
      $(".cartellino-testa", el).addEventListener("click", () => this.apriDettaglioPlaylist(p));
      $(".play-neon", el)?.addEventListener("click", () => {
        const elenco = regole.valuta(p, this.catalogo.brani, this.ctx);
        this.avviaPlaylist(p, elenco, motori.pianoRiproduzione(elenco, this.ctx));
      });
    });
  }

  // Le regole di una playlist in poche etichette leggibili (per il cartellino).
  riassuntoRegole(p) {
    if (p.tipo === "manuale") return ["scelti a mano"];
    const r = p.regole || {};
    const intervallo = (x, unita = "") => x ? `${x[0] ?? "…"}–${x[1] ?? "…"}${unita}` : "";
    const t = [
      ...generi.vociSelezionate(this.voci, r.macro).map((v) => v.nome),
      ...(r.piattaforme || []).map((c) => NOMI_PIATT[c] || c),
      ...(r.tipi || []),
      r.testo ? `"${r.testo}"` : "",
      intervallo(r.bpm, " BPM"), intervallo(r.anno),
      r.camelot?.length ? r.camelot.join(" ") : "",
      r.artisti?.length ? `${r.artisti.length} artisti` : "",
      r.soloSchermoSpento ? "schermo spento" : "",
      NOMI_ORDINE_PL[p.ordine] || "",
      p.limite ? `max ${p.limite}` : "",
    ].filter(Boolean);
    return t;
  }

  apriDettaglioPlaylist(p) {
    const overlay = $("#foglio-overlay");
    const el = $("#foglio-brano");
    const elenco = regole.valuta(p, this.catalogo.brani, this.ctx);
    const piano = motori.pianoRiproduzione(elenco, this.ctx);
    const righePiano = piano.gruppi.map((g) => `${esc(NOMI_MOTORE[g.motore] || g.motore)}: ${g.n}${g.continuo ? " (schermo spento)" : ""}`).join(" · ");
    const pronti = elenco.filter((b) => this.ctx.fileIds.has(b.id)).length;
    el.innerHTML = `
      <div class="foglio-intestazione"><h2>${esc(p.nome)}</h2><button class="foglio-chiudi" id="foglio-chiudi">✕</button></div>
      <p class="muted small">${elenco.length} brani. ${righePiano || "Nessuna fonte disponibile"}${piano.esclusi.length ? ` · esclusi: ${piano.esclusi.length}` : ""}</p>
      <div class="riquadro">
        <label class="switch"><input id="pl-telefono" type="checkbox" ${p.telefono ? "checked" : ""}> Tieni questa playlist sul telefono</label>
        <p class="muted small">${pronti} di ${elenco.length} brani già sul telefono (${(file.byte(elenco.map((b) => b.id)) / 1048576).toFixed(0)} MB).
          ${p.telefono && pronti < elenco.length ? "Gli altri li prepara il PC: chiedi a Claude di preparare le playlist per il telefono." : ""}</p>
        ${pronti ? `<button class="btn-secondary" id="pl-libera">Libera spazio</button>` : ""}
      </div>
      <div class="azioni-riga">
        <button class="btn-primary" id="pl-avvia">▶ Avvia${piano.consigliato ? " con " + esc(NOMI_MOTORE[piano.consigliato] || piano.consigliato) : ""}</button>
        ${p.tipo === "intelligente" ? `<button class="btn-secondary" id="pl-modifica">Modifica</button><button class="btn-secondary" id="pl-congela">Congela</button>` : ""}
        <button class="btn-secondary" id="pl-duplica">Duplica</button>
        <button class="btn-danger" id="pl-elimina">Elimina</button>
      </div>
      <div class="foglio-sezione"><h3>Brani</h3><div class="lista" id="pl-elenco"></div></div>
    `;
    $("#foglio-chiudi").addEventListener("click", () => { overlay.hidden = true; });
    $("#pl-avvia").addEventListener("click", () => { overlay.hidden = true; this.avviaPlaylist(p, elenco, piano); });
    $("#pl-telefono").addEventListener("change", async (e) => {
      const aggiornata = { ...p };
      if (e.target.checked) aggiornata.telefono = true; else delete aggiornata.telefono;
      try {
        await this.salvaPlaylistSingola(aggiornata);
        p = aggiornata;
        showToast(e.target.checked ? "Segnata per il telefono: il PC la preparerà." : "Non più segnata per il telefono.", "ok");
        this.renderPlaylist();
      } catch { e.target.checked = !e.target.checked; }
    });
    $("#pl-libera")?.addEventListener("click", async () => {
      // Toglie i file di questa playlist che non servono ad altre playlist tenute sul telefono.
      const altre = new Set(this.playlists.filter((x) => x.id !== p.id && x.telefono)
        .flatMap((x) => regole.valuta(x, this.catalogo.brani, this.ctx).map((b) => b.id)));
      const via = elenco.map((b) => b.id).filter((id) => this.ctx.fileIds.has(id) && !altre.has(id) && id !== this.lettore.brano?.id);
      if (!via.length) { showToast("Questi brani servono anche ad altre playlist sul telefono.", ""); return; }
      if (!window.confirm(`Togliere dal telefono ${via.length} brani (${(file.byte(via) / 1048576).toFixed(0)} MB)?`)) return;
      await file.rimuovi(via);
      this.ctx.fileIds = file.ids();
      overlay.hidden = true; this.renderPlaylist();
      showToast(`${via.length} brani tolti dal telefono.`, "ok");
    });
    if (p.tipo === "intelligente") {
      $("#pl-modifica").addEventListener("click", () => { overlay.hidden = true; this.apriCostruttore(p); });
      $("#pl-congela").addEventListener("click", async () => {
        const congelata = { id: playlist.nuovoId(p.nome + " congelata"), nome: p.nome + " (congelata)", tipo: "manuale", brani: elenco.map((b) => b.id) };
        try {
          await this.salvaPlaylistSingola(congelata);
          showToast("Copia congelata creata.", "ok");
          overlay.hidden = true; this.renderPlaylist();
        } catch { /* già segnalato dal toast in salvaPlaylistSingola */ }
      });
    }
    $("#pl-duplica").addEventListener("click", async () => {
      const copia = { ...p, id: playlist.nuovoId(p.nome + " copia"), nome: p.nome + " (copia)" };
      try {
        await this.salvaPlaylistSingola(copia);
        showToast("Playlist duplicata.", "ok");
        overlay.hidden = true; this.renderPlaylist();
      } catch { /* già segnalato */ }
    });
    $("#pl-elimina").addEventListener("click", async () => {
      if (!window.confirm(`Eliminare "${p.nome}"? Non si può annullare.`)) return;
      try {
        await playlist.elimina(p.id);
        this.playlists = this.playlists.filter((x) => x.id !== p.id);
        overlay.hidden = true; this.renderPlaylist();
        showToast("Playlist eliminata.", "ok");
      } catch (err) { showToast(err?.message || "Eliminazione non riuscita.", "err"); }
    });
    $("#pl-elenco").innerHTML = elenco.slice(0, 200).map((b, i) => this.rigaBrano(b, i)).join("");
    this.agganciaClicRighe($("#pl-elenco"), elenco, { lista: elenco, nome: p.nome });
    overlay.hidden = false;
  }

  // ---------------- Costruttore playlist ----------------
  apriCostruttore(pEsistente) {
    const overlay = $("#costruttore-overlay");
    const el = $("#costruttore");
    const p = pEsistente ? JSON.parse(JSON.stringify(pEsistente)) : {
      id: null, nome: "", tipo: "intelligente",
      regole: { soloScelti: true, tipi: [], macro: [], piattaforme: [], raccolte: [], artisti: [], escludiArtisti: [] },
      ordine: "artista", seme: Math.floor(Math.random() * 1e9), limite: null,
    };
    const piattChip = (cod, nome) => `<label class="chip"><input type="checkbox" data-campo="piattaforme" value="${cod}" ${p.regole.piattaforme?.includes(cod) ? "checked" : ""}><span>${esc(nome)}</span></label>`;
    const tipoChip = (k, nome) => `<label class="chip"><input type="checkbox" data-campo="tipi" value="${k}" ${p.regole.tipi?.includes(k) ? "checked" : ""}><span>${esc(nome)}</span></label>`;

    el.innerHTML = `
      <div class="foglio-intestazione"><h2>${pEsistente ? "Modifica playlist" : "Nuova playlist intelligente"}</h2><button class="foglio-chiudi" id="cost-chiudi">✕</button></div>

      <div class="campo-riga"><label for="cost-nome">Nome</label><input id="cost-nome" type="text" value="${esc(p.nome)}" placeholder="Es. Tech house per correre"></div>

      <div class="campo-riga"><span class="etichetta">Generi</span><div class="chips" id="cost-macro">${this.chipGeneri(p.regole.macro)}</div></div>

      <div class="campo-riga"><span class="etichetta">Piattaforme</span><div class="chips">${piattChip("sp", "Spotify")}${piattChip("yt", "YouTube")}${piattChip("sc", "SoundCloud")}${piattChip("lo", "File")}</div></div>

      <div class="campo-riga"><span class="etichetta">Tipo di versione (vuoto = tutte tranne i set)</span><div class="chips">${["originale", "remix", "edit", "extended", "live", "set"].map((k) => tipoChip(k, NOMI_TIPO[k])).join("")}</div></div>

      <div class="campo-riga"><label for="cost-testo">Testo libero</label><input id="cost-testo" type="text" value="${esc(p.regole.testo || "")}" placeholder="Cerca dentro artista, titolo, generi…"></div>

      <div class="campo-riga"><span class="etichetta">BPM</span><div class="doppio-range"><input id="cost-bpm-min" type="number" placeholder="min" value="${p.regole.bpm?.[0] ?? ""}"><span>–</span><input id="cost-bpm-max" type="number" placeholder="max" value="${p.regole.bpm?.[1] ?? ""}"></div></div>

      <div class="campo-riga"><span class="etichetta">Anno</span><div class="doppio-range"><input id="cost-anno-min" type="number" placeholder="min" value="${p.regole.anno?.[0] ?? ""}"><span>–</span><input id="cost-anno-max" type="number" placeholder="max" value="${p.regole.anno?.[1] ?? ""}"></div></div>

      <div class="campo-riga"><span class="etichetta">Energia (0–1)</span><div class="doppio-range"><input id="cost-en-min" type="number" step="0.05" min="0" max="1" placeholder="min" value="${p.regole.energia?.[0] ?? ""}"><span>–</span><input id="cost-en-max" type="number" step="0.05" min="0" max="1" placeholder="max" value="${p.regole.energia?.[1] ?? ""}"></div></div>

      <div class="campo-riga"><label for="cost-camelot">Tonalità Camelot (es. 8A, 8B)</label><input id="cost-camelot" type="text" value="${esc((p.regole.camelot || []).join(", "))}" placeholder="separate da virgola"></div>

      <div class="campo-riga"><label for="cost-artisti">Solo questi artisti (uno per riga)</label><textarea id="cost-artisti" rows="2" placeholder="Un artista per riga">${esc((p.regole.artisti || []).join("\n"))}</textarea></div>
      <div class="campo-riga"><label for="cost-escludi">Escludi questi artisti (uno per riga)</label><textarea id="cost-escludi" rows="2" placeholder="Un artista per riga">${esc((p.regole.escludiArtisti || []).join("\n"))}</textarea></div>

      <div class="campo-riga"><label class="switch"><input id="cost-solo-scelti" type="checkbox" ${p.regole.soloScelti !== false ? "checked" : ""}> Solo brani scelti da te (escludi l'esplorazione)</label></div>
      <div class="campo-riga"><label class="switch"><input id="cost-solo-schermo" type="checkbox" ${p.regole.soloSchermoSpento ? "checked" : ""}> Solo brani ascoltabili a schermo spento</label></div>

      <div class="campo-riga">
        <label for="cost-ordine">Ordine</label>
        <select id="cost-ordine">
          <option value="artista" ${p.ordine === "artista" ? "selected" : ""}>Artista</option>
          <option value="casuale" ${p.ordine === "casuale" ? "selected" : ""}>Casuale</option>
          <option value="bpm-su" ${p.ordine === "bpm-su" ? "selected" : ""}>BPM crescente</option>
          <option value="bpm-giu" ${p.ordine === "bpm-giu" ? "selected" : ""}>BPM decrescente</option>
          <option value="armonico" ${p.ordine === "armonico" ? "selected" : ""}>Percorso armonico</option>
          <option value="recenti" ${p.ordine === "recenti" ? "selected" : ""}>Aggiunti di recente</option>
        </select>
      </div>
      <div class="campo-riga"><label for="cost-limite">Limite di brani (vuoto = nessuno)</label><input id="cost-limite" type="number" min="1" value="${p.limite ?? ""}"></div>

      <div class="conteggio-live" id="cost-conteggio">…</div>
      <div class="azioni-riga">
        <button class="btn-primary" id="cost-salva">Salva</button>
        <button class="btn-secondary" id="cost-annulla">Annulla</button>
      </div>
    `;

    const leggiRegoleForm = () => {
      const num = (id) => { const v = $(id, el).value; return v === "" ? undefined : Number(v); };
      const range = (min, max) => (min === undefined && max === undefined) ? undefined : [min, max];
      const righe = (id) => $(id, el).value.split("\n").map((s) => s.trim()).filter(Boolean).map((s) => cercaMod.normalizza(s));
      return {
        soloScelti: $("#cost-solo-scelti", el).checked,
        soloSchermoSpento: $("#cost-solo-schermo", el).checked,
        macro: this.leggiChipGeneri(el),
        piattaforme: $$('input[data-campo="piattaforme"]:checked', el).map((i) => i.value),
        tipi: $$('input[data-campo="tipi"]:checked', el).map((i) => i.value),
        testo: $("#cost-testo", el).value.trim() || undefined,
        bpm: range(num("#cost-bpm-min"), num("#cost-bpm-max")),
        anno: range(num("#cost-anno-min"), num("#cost-anno-max")),
        energia: range(num("#cost-en-min"), num("#cost-en-max")),
        camelot: $("#cost-camelot", el).value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
        artisti: righe("#cost-artisti"),
        escludiArtisti: righe("#cost-escludi"),
      };
    };

    const aggiornaConteggio = () => {
      const n = regole.conta(leggiRegoleForm(), this.catalogo.brani, this.ctx);
      $("#cost-conteggio").textContent = `${n.toLocaleString("it-IT")} brani`;
    };
    $$("input, select, textarea", el).forEach((campo) => campo.addEventListener("input", aggiornaConteggio));
    aggiornaConteggio();

    $("#cost-chiudi").addEventListener("click", () => { overlay.hidden = true; });
    $("#cost-annulla").addEventListener("click", () => { overlay.hidden = true; });
    $("#cost-salva").addEventListener("click", async () => {
      const nome = $("#cost-nome", el).value.trim();
      if (!nome) { showToast("Dai un nome alla playlist.", "err"); return; }
      const nuova = {
        id: p.id || playlist.nuovoId(nome), nome, tipo: "intelligente",
        regole: leggiRegoleForm(),
        ordine: $("#cost-ordine", el).value,
        seme: p.seme,
        limite: $("#cost-limite", el).value ? Number($("#cost-limite", el).value) : null,
      };
      try {
        await this.salvaPlaylistSingola(nuova);
        overlay.hidden = true;
        this.renderPlaylist();
        showToast("Playlist salvata.", "ok");
      } catch { /* già segnalato */ }
    });

    overlay.hidden = false;
  }

  // ---------------- Filtri (Cerca) ----------------
  apriFiltri() {
    const overlay = $("#filtri-overlay");
    const el = $("#filtri-pannello");
    const f = this.filtri;
    const piattChip = (cod, nome) => `<label class="chip"><input type="checkbox" data-campo="piattaforme" value="${cod}" ${f.piattaforme?.includes(cod) ? "checked" : ""}><span>${esc(nome)}</span></label>`;
    const opzRaccolta = this.catalogo.raccolte
      .map((r, i) => `<option value="${i}" ${f.raccolta === i ? "selected" : ""}>${esc(r[0])} (${esc(NOMI_PIATT[r[2]] || r[2])})</option>`)
      .join("");

    el.innerHTML = `
      <div class="foglio-intestazione"><h2>Filtri</h2><button class="foglio-chiudi" id="filt-chiudi">✕</button></div>
      <div class="campo-riga"><span class="etichetta">Generi</span><div class="chips">${this.chipGeneri(f.macro)}</div></div>
      <div class="campo-riga"><span class="etichetta">Piattaforme</span><div class="chips">${piattChip("sp", "Spotify")}${piattChip("yt", "YouTube")}${piattChip("sc", "SoundCloud")}${piattChip("lo", "File")}</div></div>
      <div class="campo-riga"><label for="filt-raccolta">Raccolta</label><select id="filt-raccolta"><option value="">Tutte</option>${opzRaccolta}</select></div>
      <div class="campo-riga"><span class="etichetta">Tipo</span>
        <select id="filt-tipo">
          <option value="canzoni" ${(!f.tipo || f.tipo === "canzoni") ? "selected" : ""}>Canzoni</option>
          <option value="set" ${f.tipo === "set" ? "selected" : ""}>Set e mix</option>
          <option value="tutti" ${f.tipo === "tutti" ? "selected" : ""}>Tutti</option>
        </select>
      </div>
      <div class="campo-riga"><span class="etichetta">BPM</span><div class="doppio-range"><input id="filt-bpm-min" type="number" placeholder="min" value="${f.bpm?.[0] ?? ""}"><span>–</span><input id="filt-bpm-max" type="number" placeholder="max" value="${f.bpm?.[1] ?? ""}"></div></div>
      <div class="campo-riga"><span class="etichetta">Anno</span><div class="doppio-range"><input id="filt-anno-min" type="number" placeholder="min" value="${f.anno?.[0] ?? ""}"><span>–</span><input id="filt-anno-max" type="number" placeholder="max" value="${f.anno?.[1] ?? ""}"></div></div>
      <div class="campo-riga"><label for="filt-camelot">Tonalità (es. 8A, 8B)</label><input id="filt-camelot" type="text" value="${esc((f.camelot || []).join(", "))}"></div>
      <div class="campo-riga"><label class="switch"><input id="filt-solo-scelti" type="checkbox" ${f.soloScelti !== false ? "checked" : ""}> Solo brani scelti da te</label></div>
      <div class="campo-riga">
        <label for="filt-ordine">Ordine</label>
        <select id="filt-ordine">
          <option value="">Automatico</option>
          <option value="artista" ${this.ordineRisultati === "artista" ? "selected" : ""}>Artista</option>
          <option value="recenti" ${this.ordineRisultati === "recenti" ? "selected" : ""}>Recenti</option>
          <option value="bpm" ${this.ordineRisultati === "bpm" ? "selected" : ""}>BPM</option>
        </select>
      </div>
      <div class="azioni-riga">
        <button class="btn-primary" id="filt-applica">Applica</button>
        <button class="btn-secondary" id="filt-azzera">Azzera</button>
      </div>
    `;
    $("#filt-chiudi").addEventListener("click", () => { overlay.hidden = true; });
    $("#filt-applica").addEventListener("click", () => {
      const num = (id) => { const v = $(id, el).value; return v === "" ? undefined : Number(v); };
      const range = (min, max) => (min === undefined && max === undefined) ? undefined : [min, max];
      this.filtri = {
        soloScelti: $("#filt-solo-scelti", el).checked,
        tipo: $("#filt-tipo", el).value,
        macro: this.leggiChipGeneri(el),
        piattaforme: $$('input[data-campo="piattaforme"]:checked', el).map((i) => i.value),
        raccolta: $("#filt-raccolta", el).value === "" ? undefined : Number($("#filt-raccolta", el).value),
        bpm: range(num("#filt-bpm-min"), num("#filt-bpm-max")),
        anno: range(num("#filt-anno-min"), num("#filt-anno-max")),
        camelot: $("#filt-camelot", el).value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
      };
      this.ordineRisultati = $("#filt-ordine", el).value || undefined;
      this.paginaRisultati = 100;
      overlay.hidden = true;
      this.renderCerca();
    });
    $("#filt-azzera").addEventListener("click", () => {
      this.filtri = { soloScelti: true, tipo: "canzoni" };
      this.ordineRisultati = undefined;
      overlay.hidden = true;
      this.paginaRisultati = 100;
      this.renderCerca();
    });
    overlay.hidden = false;
  }

  // ---------------- In riproduzione ----------------
  // Avvia una coda. Col motore "file" la suona il Jukebox (anche a schermo spento)
  // e contiene solo i brani che hanno il file; con gli altri motori il tasto
  // grande apre l'app esterna, un brano alla volta.
  avviaPlaylist(p, elenco, piano) {
    if (!elenco.length) { showToast("Playlist vuota.", "err"); return; }
    const motore = piano.consigliato;
    const brani = motore === "file" ? elenco.filter((b) => this.ctx.fileIds.has(b.id)) : elenco;
    this.avviaCoda(p, brani, motore, { saltati: elenco.length - brani.length });
    this.switchTab("riproduzione");
    if (motore !== "file") showToast(`"${p.nome}" pronta: premi il tasto grande per aprire il primo brano.`, "");
  }

  // La coda che suona adesso: da una playlist, dalla ricerca, da un artista...
  // Col motore "file" parte subito nel lettore interno.
  avviaCoda(p, brani, motore, { da = null, saltati = 0 } = {}) {
    this.motoreCoda = motore;
    this.playlistAttiva = p;
    this.coda = new Coda(brani, { ripeti: "no" });
    if (da) this.coda.salta(da.id);
    this.prossimiMostrati = 30;
    this.saltati = saltati;
    this.lettore.ferma();
    this.esterno = null;
    if (motore === "file") this.suonaBrano(this.coda.corrente);
    else this.aggiornaStatoLettore();
  }

  puoSuonare(b) { return this.ctx.fileIds.has(b.id); }

  async suonaBrano(b) {
    if (!b) return;
    try {
      await this.lettore.suona(b, { album: this.playlistAttiva?.nome || "Jukebox", icona: ICONA_PNG });
    } catch (err) {
      if (err?.name === "NotAllowedError") {
        // Il browser vuole un tocco prima di far partire l'audio.
        showToast("Premi ▶ per far partire la musica.", "");
      } else {
        // Per es. il file è stato tolto nel frattempo: si prova col prossimo.
        showToast(err?.message || "Non riesco a suonare questo brano.", "err");
        const prossimo = comandi.dopoFine(this.coda, b.id, (x) => x.id !== b.id && this.puoSuonare(x));
        if (prossimo) return this.suonaBrano(prossimo);
      }
    }
    this.renderRiproduzione();
  }

  fineBrano(b) {
    if (!this.coda || this.motoreCoda !== "file") return;
    const prossimo = comandi.dopoFine(this.coda, b?.id, (x) => this.puoSuonare(x));
    if (prossimo) this.suonaBrano(prossimo);
    else { this.lettore.ferma(); this.renderRiproduzione(); }
  }

  // Tasti precedente/successivo della schermata di blocco o delle cuffie: lì ci
  // si aspetta che il brano cambi subito.
  comandoBlocco(c) {
    if (!this.coda || this.motoreCoda !== "file") return;
    if (c === "indietro" && this.lettore.posizione > 4) { this.lettore.cerca(0); return; }
    const b = comandi.spostaSelezione(this.coda, c === "avanti" ? 1 : -1);
    if (b) this.suonaBrano(b);
  }

  statoTasto() {
    const sel = this.coda?.corrente;
    if (!sel) return { azione: "nessuna", icona: "play", etichetta: "" };
    const { motore } = motori.motoreBrano(sel, this.ctx);
    return comandi.tastoPrincipale({ motore, selezionato: sel.id, inCorso: this.lettore.brano?.id || null, stato: this.lettore.stato });
  }

  premiTastoGrande() {
    const sel = this.coda?.corrente;
    const t = this.statoTasto();
    if (t.azione === "pausa") this.lettore.pausa();
    else if (t.azione === "riprendi") this.lettore.riprendi();
    else if (t.azione === "suona") this.suonaBrano(sel);
    else if (t.azione === "apri") {
      const { motore, fonte } = motori.motoreBrano(sel, this.ctx);
      this.apriConMotore(motore, fonte);
    }
  }

  // Aggiornamento leggero (ogni secondo mentre suona): tasto, disco, barra, mini lettore.
  aggiornaStatoLettore() {
    if (this.tab === "riproduzione" && this.coda) {
      const t = this.statoTasto();
      const principale = $("#rip-principale");
      principale.disabled = t.azione === "nessuna";
      principale.innerHTML = t.icona === "pausa" ? SVG_PAUSA : SVG_PLAY;
      principale.setAttribute("aria-label", t.etichetta || "Suona");
      $("#rip-principale-testo").textContent = t.etichetta;

      const l = this.lettore;
      const vedoInCorso = !!l.brano && this.coda.corrente?.id === l.brano.id;
      $("#rip-avanzamento").hidden = !vedoInCorso; // la barra è del brano che si vede: se ne guardi un altro, sparisce
      if (l.brano && !this.trascinando) {
        const pos = $("#rip-posizione");
        pos.max = String(Math.round(l.durata) || 1);
        pos.value = String(Math.round(l.posizione));
        $("#rip-tempo").textContent = durataFmt(l.posizione);
        $("#rip-durata").textContent = durataFmt(l.durata);
      }
      $("#disco").classList.toggle("gira", l.stato === "suona" && vedoInCorso);
      $("#etichetta-disco").classList.toggle("in-attesa", !!l.brano && !vedoInCorso);
      const inCorso = $("#rip-in-corso");
      inCorso.hidden = !l.brano || vedoInCorso;
      if (!inCorso.hidden) {
        const resta = l.durata ? ` (ancora ${durataFmt(Math.max(0, l.durata - l.posizione))})` : "";
        inCorso.innerHTML = `${l.stato === "suona" ? "Sta suonando" : "In pausa"}: <b>${esc(titoloCompleto(l.brano))}</b>${resta} · tocca per tornarci`;
      }
    }
    this.aggiornaMiniLettore();
    this.aggiornaEvidenziati();
  }

  renderRiproduzione() {
    const vuoto = $("#riproduzione-vuoto");
    const contenuto = $("#riproduzione-contenuto");
    if (!this.coda || !this.playlistAttiva) { vuoto.hidden = false; contenuto.hidden = true; this.aggiornaMiniLettore(); return; }
    vuoto.hidden = true; contenuto.hidden = false;

    $("#riproduzione-nome").textContent = this.playlistAttiva.nome;
    $("#riproduzione-piano").textContent = this.motoreCoda === "file"
      ? `Nel Jukebox · ${this.coda.ordine.length} brani · schermo spento ok${this.saltati && this.playlistAttiva.id !== "lista" ? ` · ${this.saltati} non ancora sul telefono` : ""}`
      : `Si apre ${NOMI_DOVE[this.motoreCoda] || "in un'app esterna"} · ${this.coda.ordine.length} brani · un brano alla volta`;

    const sel = this.coda.corrente;
    if (!sel) {
      $("#etichetta-disco").innerHTML = `<span class="ed-foro"></span>`;
      $("#riproduzione-corrente").innerHTML = `<p class="vuoto muted">Coda finita.</p>`;
      $("#riproduzione-azioni").innerHTML = "";
    } else {
      $("#etichetta-disco").innerHTML = `
        <span class="ed-artista">${esc(sel.a || "")}</span>
        <span class="ed-foro"></span>
        <span class="ed-titolo">${esc(sel.t || "")}</span>
        <span class="ed-anno">45 giri${sel.y ? " · " + esc(sel.y) : ""}</span>`;
      $("#riproduzione-corrente").innerHTML = this.rigaBrano(sel, Math.max(this.coda.indice, 0), { grande: true, play: false });
      this.agganciaClicRighe($("#riproduzione-corrente"), [sel], { coda: true });
      $("#riproduzione-azioni").innerHTML = this.motoreCoda !== "file"
        ? `<span class="muted small">Con le app esterne la coda non va avanti da sola: per farlo, tieni la playlist sul telefono.</span>` : "";
    }

    $("#rip-casuale").setAttribute("aria-pressed", String(!!this.coda.casuale));
    const ripeti = $("#rip-ripeti");
    ripeti.setAttribute("aria-pressed", String(this.coda.ripeti !== "no"));
    ripeti.setAttribute("aria-label", `Ripeti: ${this.coda.ripeti}`);
    $("#rip-ripeti-uno").hidden = this.coda.ripeti !== "uno";

    const tutti = this.coda.prossimi;
    const prossimi = tutti.slice(0, this.prossimiMostrati);
    const altri = $("#prossimi-altri");
    altri.hidden = tutti.length <= prossimi.length;
    if (!altri.hidden) altri.textContent = `Mostra altri (${(tutti.length - prossimi.length).toLocaleString("it-IT")})`;
    $("#prossimi-info").textContent = this.coda.casuale ? "ordine casuale" : (NOMI_ORDINE_PL[this.playlistAttiva.ordine] || "");
    $("#riproduzione-prossimi").innerHTML = prossimi.map((b, i) => this.rigaBrano(b, (Math.max(this.coda.indice, 0)) + i + 1)).join("")
      || `<p class="vuoto muted">Nessun altro brano in coda.</p>`;
    this.agganciaClicRighe($("#riproduzione-prossimi"), prossimi, { coda: true });
    this.aggiornaStatoLettore();
  }

  // ---------------- Musica sul telefono ----------------
  async importaFile(input) {
    const files = [...(input.files || [])];
    input.value = "";
    if (!files.length) return;
    const stato = $("#imp-file-avanzamento");
    const idValidi = new Set(this.catalogo.brani.map((b) => b.id));
    try {
      const esito = await file.importa(files, idValidi, (fatti, tot) => { stato.textContent = `Copio nel Jukebox: ${fatti} di ${tot}…`; });
      showToast(`${esito.aggiunti} brani aggiunti${esito.gia ? `, ${esito.gia} c'erano già` : ""}${esito.sconosciuti.length ? `, ${esito.sconosciuti.length} file non riconosciuti` : ""}. Ora puoi cancellare la cartella Download/Jukebox.`, "ok", { duration: 7000 });
    } catch (err) {
      showToast(err?.name === "QuotaExceededError" ? "Spazio finito sul telefono: libera spazio e riprova." : (err?.message || "Importazione non riuscita."), "err", { duration: 7000 });
    }
    stato.textContent = "";
    this.ctx.fileIds = file.ids();
    this.renderFileInfo();
  }

  async renderFileInfo() {
    const n = this.ctx.fileIds.size;
    const mb = (file.byte() / 1048576).toFixed(0);
    let libero = "";
    try {
      const st = await navigator.storage?.estimate?.();
      if (st?.quota) libero = ` · spazio ancora disponibile: ${((st.quota - st.usage) / 1073741824).toFixed(1)} GB`;
    } catch { /* stima non disponibile */ }
    $("#imp-file-info").textContent = n ? `${n.toLocaleString("it-IT")} brani sul telefono (${mb} MB)${libero}` : `Nessun brano sul telefono${libero}`;
    $("#imp-file-svuota").hidden = !n;
  }

  // ---------------- Impostazioni ----------------
  renderImpostazioni(cfg, infoCache) {
    $("#imp-repo").textContent = cfg.tipo === "url" ? `file locale (${cfg.url}) — anteprima` : `${cfg.owner}/${cfg.repo}`;
    $("#imp-cambia-token").textContent = cfg.tipo === "url" ? "Esci dall'anteprima (usa GitHub)" : "Cambia token";
    $("#imp-dati-info").textContent = infoCache
      ? `${infoCache.brani.toLocaleString("it-IT")} brani in cache, costruito il ${infoCache.costruitoIl || "?"}`
      : "Nessun dato in cache.";
    $("#imp-versione").textContent = "Jukebox — versione M2";
    this.renderFileInfo();
    $("#imp-newpipe").checked = this.ctx.usaNewPipe !== false;
    this.renderOrdineMotori();
  }

  renderOrdineMotori() {
    const lista = $("#imp-ordine-motori");
    lista.innerHTML = this.ctx.priorita.map((m, i) => `
      <li data-m="${esc(m)}">
        <span>${esc(NOMI_MOTORE[m] || m)}</span>
        <span class="frecce">
          <button data-dir="su" ${i === 0 ? "disabled" : ""} aria-label="Sposta su">↑</button>
          <button data-dir="giu" ${i === this.ctx.priorita.length - 1 ? "disabled" : ""} aria-label="Sposta giù">↓</button>
        </span>
      </li>`).join("");
    $$("button[data-dir]", lista).forEach((btn) => btn.addEventListener("click", () => {
      const li = btn.closest("li");
      const idx = this.ctx.priorita.indexOf(li.dataset.m);
      const dir = btn.dataset.dir === "su" ? -1 : 1;
      const nuovo = [...this.ctx.priorita];
      [nuovo[idx], nuovo[idx + dir]] = [nuovo[idx + dir], nuovo[idx]];
      this.ctx.priorita = nuovo;
      salvaPreferenzaMotori(nuovo);
      this.renderOrdineMotori();
    }));
  }
}
