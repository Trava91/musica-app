// vista-suona.js — la scheda Suona (disco, brano selezionato, comandi, "A seguire") e il mini
// lettore che si vede nelle altre schede. Disegna la fotografia della sessione
// (sessione.stato()) e passa ogni tocco alla sessione: qui non si decide cosa suonare.

import { PROSSIMI_MOSTRATI } from "../config.js";
import { durataFmt, titoloCompleto } from "../nucleo/testo.js";
import { $, esc, NOMI_DOVE, NOMI_ORDINE_PL, SVG_PAUSA, SVG_PLAY, vaiA } from "./base.js";
import { aggiornaEvidenziati, mostraLista, statoVuoto } from "./riga-brano.js";

let prossimiMostrati = PROSSIMI_MOSTRATI; // quanti brani di "A seguire" si vedono ("Mostra altri" ne aggiunge)
let trascinando = false; // il dito sta spostando la posizione nel brano: la barra non si aggiorna

export function collegaSuona(app) {
  const { sessione } = app;
  $("#rip-avanti").addEventListener("click", () => sessione.avanti());
  $("#rip-indietro").addEventListener("click", () => sessione.indietro());
  $("#rip-principale").addEventListener("click", () => sessione.tasto());
  $("#rip-casuale").addEventListener("click", () => sessione.casuale());
  $("#rip-ripeti").addEventListener("click", () => sessione.ripeti());
  $("#rip-in-corso").addEventListener("click", () => {
    const s = sessione.stato();
    if (s.interno) sessione.saltaA(s.inCorso); // torna al brano che si sente
  });
  $("#rip-posizione").addEventListener("input", (e) => {
    trascinando = true;
    $("#rip-tempo").textContent = durataFmt(Number(e.target.value));
  });
  $("#rip-posizione").addEventListener("change", (e) => {
    trascinando = false;
    sessione.cerca(Number(e.target.value));
  });
  $("#prossimi-altri").addEventListener("click", () => {
    prossimiMostrati += PROSSIMI_MOSTRATI;
    disegnaSuona(app);
  });
  $("#mini-apri").addEventListener("click", () => vaiA(app, "riproduzione"));
  $("#mini-pausa").addEventListener("click", () => sessione.alterna());

  sessione.ascolta((e) => {
    if (e.tipo === "coda") {
      if (e.nuova) prossimiMostrati = PROSSIMI_MOSTRATI;
      disegnaSuona(app);
    } else if (e.tipo === "lettore") aggiornaLettore(app);
  });
  app.stato.ascolta((cambiati, s) => {
    if (!cambiati.includes("scheda")) return;
    if (s.scheda === "riproduzione") disegnaSuona(app);
    else aggiornaMini(app);
  });
}

/** Ridisegna tutta la scheda Suona (coda nuova, selezione cambiata, casuale, ripeti...). */
export function disegnaSuona(app) {
  const s = app.sessione.stato();
  const vuoto = $("#riproduzione-vuoto");
  const contenuto = $("#riproduzione-contenuto");
  if (!s.attiva || !s.sorgente) {
    vuoto.hidden = false;
    contenuto.hidden = true;
    aggiornaMini(app, s);
    return;
  }
  vuoto.hidden = true;
  contenuto.hidden = false;

  $("#riproduzione-nome").textContent = s.sorgente.nome;
  $("#riproduzione-piano").textContent =
    s.motore === "file"
      ? `Nel Jukebox · ${s.totale} brani · schermo spento ok${s.saltati && s.sorgente.id !== "lista" ? ` · ${s.saltati} non ancora sul telefono` : ""}`
      : `Si apre ${NOMI_DOVE[s.motore] || "in un'app esterna"} · ${s.totale} brani · un brano alla volta`;

  const sel = app.sessione.branoSelezionato;
  const inizio = Math.max(s.indice, 0);
  if (!sel) {
    $("#etichetta-disco").innerHTML = `<span class="ed-foro"></span>`;
    $("#riproduzione-corrente").innerHTML = statoVuoto({
      testo: "La coda è finita.",
      azione: { etichetta: "Scegli un'altra playlist" },
    });
    $("#riproduzione-corrente [data-azione-vuoto]").addEventListener("click", () => vaiA(app, "playlist"));
    $("#riproduzione-azioni").innerHTML = "";
  } else {
    $("#etichetta-disco").innerHTML = `
        <span class="ed-artista">${esc(sel.a || "")}</span>
        <span class="ed-foro"></span>
        <span class="ed-titolo">${esc(sel.t || "")}</span>
        <span class="ed-anno">45 giri${sel.y ? ` · ${esc(sel.y)}` : ""}</span>`;
    mostraLista(app, $("#riproduzione-corrente"), [sel], { coda: true }, { inizio, grande: true, play: false });
    $("#riproduzione-azioni").innerHTML =
      s.motore !== "file"
        ? `<span class="muted small">Con le app esterne la coda non va avanti da sola: per farlo, tieni la playlist sul telefono.</span>`
        : "";
  }

  $("#rip-casuale").setAttribute("aria-pressed", String(s.casuale));
  const ripeti = $("#rip-ripeti");
  ripeti.setAttribute("aria-pressed", String(s.ripeti !== "no"));
  ripeti.setAttribute("aria-label", `Ripeti: ${s.ripeti}`);
  $("#rip-ripeti-uno").hidden = s.ripeti !== "uno";

  const prossimi = app.sessione.prossimi(prossimiMostrati);
  const altri = $("#prossimi-altri");
  altri.hidden = s.prossimi.length <= prossimi.length;
  if (!altri.hidden)
    altri.textContent = `Mostra altri (${(s.prossimi.length - prossimi.length).toLocaleString("it-IT")})`;
  $("#prossimi-info").textContent = s.casuale ? "ordine casuale" : NOMI_ORDINE_PL[s.sorgente.ordine] || "";
  mostraLista(
    app,
    $("#riproduzione-prossimi"),
    prossimi,
    { coda: true },
    { inizio: inizio + 1, vuoto: "Nessun altro brano in coda." },
  );
  aggiornaLettore(app, s);
}

// Aggiornamento leggero (ogni secondo mentre suona): tasto grande, disco, barra, mini lettore,
// righe evidenziate.
function aggiornaLettore(app, s = app.sessione.stato()) {
  if (app.stato.leggi().scheda === "riproduzione" && s.attiva) {
    const t = s.tasto;
    const principale = $("#rip-principale");
    principale.disabled = t.azione === "nessuna";
    principale.innerHTML = t.icona === "pausa" ? SVG_PAUSA : SVG_PLAY;
    principale.setAttribute("aria-label", t.etichetta || "Suona");
    $("#rip-principale-testo").textContent = t.etichetta;

    const vedoInCorso = s.interno && s.selezionato === s.inCorso;
    $("#rip-avanzamento").hidden = !vedoInCorso; // la barra è del brano che si vede: se ne guardi un altro, sparisce
    if (s.interno && !trascinando) {
      const pos = $("#rip-posizione");
      pos.max = String(Math.round(s.durata) || 1);
      pos.value = String(Math.round(s.posizione));
      $("#rip-tempo").textContent = durataFmt(s.posizione);
      $("#rip-durata").textContent = durataFmt(s.durata);
    }
    $("#disco").classList.toggle("gira", s.lettore === "suona" && vedoInCorso);
    $("#etichetta-disco").classList.toggle("in-attesa", s.interno && !vedoInCorso);
    const inCorso = $("#rip-in-corso");
    inCorso.hidden = !s.interno || vedoInCorso;
    if (!inCorso.hidden) {
      const resta = s.durata ? ` (ancora ${durataFmt(Math.max(0, s.durata - s.posizione))})` : "";
      inCorso.innerHTML = `${s.lettore === "suona" ? "Sta suonando" : "In pausa"}: <b>${esc(titoloCompleto(app.sessione.branoInCorso))}</b>${resta} · tocca per tornarci`;
    }
  }
  aggiornaMini(app, s);
  aggiornaEvidenziati(app, s);
}

// Barra "sta suonando" sopra i tasti: visibile se c'è una coda, tranne nella schermata Suona
// (dove sarebbe un doppione). Mostra quello che si SENTE, altrimenti il brano selezionato.
function aggiornaMini(app, s = app.sessione.stato()) {
  const mini = $("#mini-lettore");
  const brano = app.sessione.branoAttuale;
  mini.hidden = !brano || app.stato.leggi().scheda === "riproduzione";
  if (mini.hidden) return;
  $("#mini-titolo").textContent = titoloCompleto(brano);
  $("#mini-sotto").textContent = [brano.a, s.motoreAttuale ? NOMI_DOVE[s.motoreAttuale] : ""]
    .filter(Boolean)
    .join(" · ");
  $("#mini-apri").setAttribute("aria-label", `${titoloCompleto(brano)}: apri la schermata Suona`);
  $("#mini-disco").classList.toggle("gira", s.lettore === "suona");
  const pausa = $("#mini-pausa");
  pausa.hidden = !s.interno;
  pausa.innerHTML = s.lettore === "suona" ? SVG_PAUSA : SVG_PLAY;
  pausa.setAttribute("aria-label", s.lettore === "suona" ? "Pausa" : "Riprendi");
}
