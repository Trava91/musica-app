// vista-suona.js — la schermata Suona: giradischi, display (titolo, artista, traccia, tempo, spie e
// livelli), barra della posizione, comandi (trasporto, casuale, ripeti, scheda del brano, spie,
// manopola del volume) e il cassetto "A seguire". Disegna la fotografia della sessione
// (sessione.stato()) e passa ogni tocco alla sessione: qui non si decide cosa suonare.
// Il mini lettore delle altre schede è in mini-lettore.js.

import { PROSSIMI_MOSTRATI } from "../config.js";
import { durataFmt, sottotitolo, titoloCompleto } from "../nucleo/testo.js";
import {
  $,
  esc,
  mostraAvviso,
  NOMI_DOVE,
  NOMI_ORDINE_PL,
  SCRITTE_DOVE,
  seCambiaLarghezza,
  suonaInVista,
  vaiA,
} from "./base.js";
import { apriFoglioBrano } from "./foglio-brano.js";
import { accendiSpia } from "./hifi/comune.js";
import { creaDisplay } from "./hifi/display-vfd.js";
import { creaGiradischi } from "./hifi/giradischi.js";
import { creaLivelli } from "./hifi/livelli.js";
import { creaManopola } from "./hifi/manopola.js";
import { aggiornaMini, collegaMini } from "./mini-lettore.js";
import { aggiornaEvidenziati, aggiungiLista, mostraLista, statoVuoto } from "./riga-brano.js";

const MODI_RIPETI = { no: ["NO", "no"], tutti: ["TUTTI", "tutta la coda"], uno: ["UNO", "un brano"] };
const SPENTA = "lo decide l'app esterna"; // perché la manopola è spenta (lo sentono i lettori di schermo)

let prossimiMostrati = PROSSIMI_MOSTRATI; // quanti brani di "A seguire" si vedono ("Mostra altri" ne aggiunge)
let trascinando = false; // il dito sta spostando la posizione nel brano: la barra non si aggiorna
/** @type {{ giradischi: any, display: any, livelli: any, manopola: any } | null} i pezzi hi-fi, creati una volta */
let pezzi = null;
let manopolaAccesa = true;

export function collegaSuona(app) {
  const { sessione } = app;
  const display = creaDisplay($("#rip-display"), { etichetta: "Display del Jukebox" });
  pezzi = {
    giradischi: creaGiradischi($("#rip-giradischi")),
    display,
    livelli: creaLivelli(display.livelli),
    manopola: creaManopola($("#rip-manopola"), {
      valore: Math.round(sessione.stato().volume * 100),
      onCambia: (v) => {
        sessione.impostaVolume(v / 100);
        display.avviso("VOLUME", v === 0 ? "MUTO" : String(v));
      },
      onRifiuto: () => mostraAvviso("Il volume lo decide l'app esterna."),
    }),
  };

  $("#rip-avanti").addEventListener("click", () => sessione.avanti());
  $("#rip-indietro").addEventListener("click", () => sessione.indietro());
  $("#rip-principale").addEventListener("click", () => sessione.tasto());
  $("#rip-casuale").addEventListener("click", () => {
    sessione.casuale();
    display.avviso("CASUALE", sessione.stato().casuale ? "ACCESO" : "SPENTO");
  });
  $("#rip-ripeti").addEventListener("click", () => {
    sessione.ripeti();
    display.avviso("RIPETI", MODI_RIPETI[sessione.stato().ripeti][0]);
  });
  $("#rip-scheda").addEventListener("click", () => {
    const b = sessione.branoSelezionato;
    if (b) apriFoglioBrano(app, b, { coda: true });
  });
  $("#rip-in-corso").addEventListener("click", () => {
    const s = sessione.stato();
    if (s.interno) sessione.saltaA(s.inCorso); // torna al brano che si sente
  });
  $("#rip-posizione").addEventListener("input", (e) => {
    trascinando = true;
    $("#rip-tempo").textContent = durataFmt(Number(e.target.value));
    posizioneBarra(e.target);
  });
  $("#rip-posizione").addEventListener("change", (e) => {
    trascinando = false;
    sessione.cerca(Number(e.target.value));
  });
  $("#prossimi-altri").addEventListener("click", () => mostraAltriProssimi(app));

  sessione.ascolta((e) => {
    if (e.tipo === "coda") {
      if (e.nuova) prossimiMostrati = PROSSIMI_MOSTRATI;
      disegnaSuona(app);
    } else if (e.tipo === "lettore" || e.tipo === "volume") aggiornaLettore(app);
  });
  app.stato.ascolta((cambiati) => {
    if (cambiati.includes("scheda")) {
      if (suonaInVista(app)) disegnaSuona(app);
      else aggiornaMini(app);
    } else if (cambiati.includes("ctx")) aggiornaLettore(app); // Solo Jukebox, file sul telefono: spie e display
  });
  seCambiaLarghezza(() => {
    if (suonaInVista(app)) disegnaSuona(app);
    else aggiornaMini(app);
  });
  // La spia "Rete assente".
  window.addEventListener("online", () => aggiornaLettore(app));
  window.addEventListener("offline", () => aggiornaLettore(app));
  collegaMini(app);
}

// "Mostra altri" di "A seguire": le righe nuove si aggiungono in fondo, le altre non si ridisegnano.
function mostraAltriProssimi(app) {
  const s = app.sessione.stato();
  const da = prossimiMostrati;
  prossimiMostrati += PROSSIMI_MOSTRATI;
  const mostrati = app.sessione.prossimi(prossimiMostrati);
  aggiungiLista(app, $("#riproduzione-prossimi"), mostrati.slice(da), Math.max(s.indice, 0) + 1 + da);
  aggiornaAltri(s, mostrati.length);
}

// Il tasto "Mostra altri (N)" sotto "A seguire": quanti brani restano fuori.
function aggiornaAltri(s, mostrati) {
  const altri = $("#prossimi-altri");
  altri.hidden = s.prossimi.length <= mostrati;
  if (!altri.hidden) altri.textContent = `Mostra altri (${(s.prossimi.length - mostrati).toLocaleString("it-IT")})`;
}

// La parte della barra già suonata, in ciano (la scala la legge da --hf-pos).
function posizioneBarra(input) {
  const max = Number(input.max) || 1;
  input.style.setProperty("--hf-pos", `${((Number(input.value) / max) * 100).toFixed(1)}%`);
}

/** Ridisegna tutta la schermata Suona (coda nuova, selezione cambiata, casuale, ripeti...). */
export function disegnaSuona(app) {
  const s = app.sessione.stato();
  const attiva = Boolean(s.attiva && s.sorgente);
  const sel = app.sessione.branoSelezionato;

  $("#riproduzione-nome").textContent = attiva ? s.sorgente.nome : "Nessuna coda";
  $("#riproduzione-piano").textContent = !attiva
    ? "Avvia una playlist dalla scheda Playlist, oppure tocca ▶ su un disco."
    : s.motore === "file"
      ? `Nel Jukebox · ${s.totale} brani · schermo spento ok${s.saltati && s.sorgente.id !== "lista" ? ` · ${s.saltati} non ancora sul telefono` : ""}`
      : `Si apre ${NOMI_DOVE[s.motore] || "in un'app esterna"} · ${s.totale} brani · un brano alla volta`;
  const azioni = $("#riproduzione-azioni");
  azioni.hidden = !attiva || s.motore === "file";
  azioni.textContent = "Con le app esterne la coda non va avanti da sola: per farlo, tieni la playlist sul telefono.";

  // La coda è finita: lo dice e offre di sceglierne un'altra.
  const finita = $("#riproduzione-corrente");
  finita.hidden = !attiva || Boolean(sel);
  if (!finita.hidden) {
    finita.innerHTML = statoVuoto(
      { testo: "La coda è finita.", azione: { etichetta: "Scegli un'altra playlist" } },
      "div",
    );
    $("[data-azione-vuoto]", finita).addEventListener("click", () => vaiA(app, "playlist"));
  }

  const casuale = $("#rip-casuale");
  casuale.setAttribute("aria-pressed", String(s.casuale));
  $(".hf-led", casuale).classList.toggle("hf-acceso", s.casuale);
  const ripeti = $("#rip-ripeti");
  const [scritta, detto] = MODI_RIPETI[s.ripeti] ?? MODI_RIPETI.no;
  ripeti.setAttribute("aria-label", `Ripeti: ${detto}`);
  $("#rip-ripeti-modo").textContent = scritta;
  $(".hf-led", ripeti).classList.toggle("hf-acceso", s.ripeti !== "no");
  for (const id of ["#rip-indietro", "#rip-avanti", "#rip-casuale", "#rip-ripeti"]) $(id).disabled = !attiva;
  $("#rip-scheda").disabled = !sel;

  const prossimi = app.sessione.prossimi(prossimiMostrati);
  aggiornaAltri(s, prossimi.length);
  $("#prossimi-info").textContent = !attiva
    ? ""
    : s.casuale
      ? "ordine casuale"
      : NOMI_ORDINE_PL[s.sorgente.ordine] || `${s.prossimi.length.toLocaleString("it-IT")} brani`;
  mostraLista(
    app,
    $("#riproduzione-prossimi"),
    prossimi,
    { coda: true },
    {
      inizio: Math.max(s.indice, 0) + 1,
      vuoto: attiva
        ? "Nessun altro brano in coda."
        : {
            testo: "Nessun brano in coda.",
            azione: { etichetta: "Scegli una playlist", fai: () => vaiA(app, "playlist") },
          },
    },
  );
  aggiornaLettore(app, s);
}

// Il display: titolo e artista del brano che si vede, la traccia nella coda e il tempo (o dove suona,
// con un'app esterna), le spie.
function disegnaDisplay(app, s, sel, vedoInCorso) {
  const d = pezzi.display;
  const { ctx } = app.stato.leggi();
  if (!sel) {
    d.testi(s.attiva ? "CODA FINITA" : "NESSUN DISCO", s.attiva ? "Scegli un'altra playlist" : "Scegli una playlist");
    d.cifre({});
  } else {
    d.testi(titoloCompleto(sel), sottotitolo(sel));
    const scritta = s.motore && s.motore !== "file" ? SCRITTE_DOVE[s.motore] || "APP ESTERNA" : null;
    if (scritta) d.cifre({ traccia: s.indice + 1, scritta });
    else
      d.cifre({
        traccia: s.indice + 1,
        tempo: vedoInCorso ? s.posizione : 0,
        durata: vedoInCorso ? s.durata : sel.d || 0,
      });
  }
  d.spie({
    suona: s.interno && s.lettore === "suona",
    pausa: s.interno && s.lettore === "pausa",
    casuale: s.casuale,
    ripeti: s.ripeti !== "no",
    uno: s.ripeti === "uno",
    file: Boolean(sel && ctx.fileIds?.has(sel.id)),
  });
}

// Aggiornamento leggero (ogni secondo mentre suona): giradischi, display, livelli, manopola, tasto
// grande, barra della posizione, spie, mini lettore, righe evidenziate.
function aggiornaLettore(app, s = app.sessione.stato()) {
  if (pezzi && suonaInVista(app)) {
    const sel = app.sessione.branoSelezionato;
    // Il giradischi, la barra e il tempo sono del brano che si vede: girano solo se è quello che si sente.
    const vedoInCorso = s.interno && s.selezionato === s.inCorso;
    const suona = s.lettore === "suona";
    pezzi.giradischi.imposta({
      stato: vedoInCorso ? s.lettore : "fermo",
      avanzamento: vedoInCorso && s.durata ? s.posizione / s.durata : 0,
      brano: sel ? { id: sel.id, titolo: titoloCompleto(sel), artista: sottotitolo(sel) } : null,
    });
    $("#rip-led-giri").classList.toggle("hf-acceso", vedoInCorso && suona);
    disegnaDisplay(app, s, sel, vedoInCorso);
    pezzi.livelli.imposta({ suona: s.interno && suona, volume: s.volume });
    pezzi.manopola.imposta(Math.round(s.volume * 100));
    if (s.volumeAttivo !== manopolaAccesa) {
      manopolaAccesa = s.volumeAttivo;
      pezzi.manopola.spegni(manopolaAccesa ? null : SPENTA);
    }

    const t = s.tasto;
    const principale = $("#rip-principale");
    principale.disabled = t.azione === "nessuna";
    principale.dataset.stato = t.icona === "pausa" ? "pausa" : "suona";
    principale.setAttribute("aria-label", t.etichetta || "Suona");
    $("#rip-principale-testo").textContent = t.etichetta || "Play/Pausa";

    $("#rip-avanzamento").hidden = !vedoInCorso; // la barra è del brano che si vede
    if (vedoInCorso && !trascinando) {
      const pos = $("#rip-posizione");
      pos.max = String(Math.round(s.durata) || 1);
      pos.value = String(Math.round(s.posizione));
      posizioneBarra(pos);
      $("#rip-tempo").textContent = durataFmt(s.posizione);
      $("#rip-durata").textContent = durataFmt(s.durata);
    }
    const altro = $("#rip-in-corso");
    altro.hidden = !s.interno || vedoInCorso;
    if (!altro.hidden) {
      const resta = s.durata ? ` (ancora ${durataFmt(Math.max(0, s.durata - s.posizione))})` : "";
      altro.innerHTML = `${suona ? "Sta suonando" : "In pausa"}: <b>${esc(titoloCompleto(app.sessione.branoInCorso))}</b>${resta} · tocca per tornarci`;
    }

    const { ctx } = app.stato.leggi();
    accendiSpia($('#rip-spie [data-spia="suona"]'), s.interno && suona);
    accendiSpia($('#rip-spie [data-spia="coda"]'), s.prossimi.length > 0);
    accendiSpia($('#rip-spie [data-spia="solo"]'), Boolean(ctx.soloJukebox));
    accendiSpia($('#rip-spie [data-spia="rete"]'), navigator.onLine === false);
  }
  aggiornaMini(app, s);
  aggiornaEvidenziati(app, s);
}
