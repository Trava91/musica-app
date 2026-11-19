// componenti.js — la pagina dei componenti hi-fi (anteprima/componenti.html). Monta i pezzi veri
// di ../js/ui/hifi/ con dati inventati, in tutti gli stati, e fa muovere quelli da provare.
// Nessun dato dell'app; l'unico suono è l'accordo di prova della manopola (solo se lo si chiede).

import { curvaVolume } from "../js/nucleo/volume.js";
import { misuraContrasti } from "../js/ui/hifi/calcoli.js";
import { accendiSpia, forzaMovimentoRidotto } from "../js/ui/hifi/comune.js";
import { creaDisplay } from "../js/ui/hifi/display-vfd.js";
import { creaGiradischi } from "../js/ui/hifi/giradischi.js";
import { creaLivelli } from "../js/ui/hifi/livelli.js";
import { creaManopola } from "../js/ui/hifi/manopola.js";
import { creaScala } from "../js/ui/hifi/scala.js";

const $ = (sel, radice = document) => radice.querySelector(sel);
const $$ = (sel, radice = document) => [...radice.querySelectorAll(sel)];
const numero = (n) => n.toLocaleString("it-IT");

// =================================================================== dati inventati ====

const BRANI = [
  { id: "a1b2c3d4e5f6", titolo: "Notte sul lungomare", artista: "I Cavalieri del Vento", durata: 252 },
  { id: "b2c3d4e5f6a1", titolo: "Perché sì", artista: "Orchestra Bàlsamo", durata: 185 },
  {
    id: "c3d4e5f6a1b2",
    titolo: "Città di vetro (versione estesa dal vivo al Teatro Comunale)",
    artista: "Èlia Moretti & Quartetto Notturno",
    durata: 468,
  },
  { id: "d4e5f6a1b2c3", titolo: "Swing all'alba", artista: "Big Band dell'Ufficio Tecnico", durata: 171 },
  { id: "e5f6a1b2c3d4", titolo: "Café Ottanta", artista: "Duo Lumière", durata: 320 },
  { id: "f6a1b2c3d4e5", titolo: "Verde acqua", artista: "Marta Ferri", durata: 217 },
  { id: "0a1b2c3d4e5f", titolo: "Ritorno a casa", artista: "I Ripetitori", durata: 284 },
  { id: "1b2c3d4e5f6a", titolo: "Ultimo giro", artista: "Trio Bassa Fedeltà", durata: 362 },
];

const GENERI = [
  ["house", "House", 1204],
  ["tech-house", "Tech house", 862],
  ["disco", "Disco", 734],
  ["funk", "Funk", 412],
  ["soul", "Soul", 389],
  ["jazz", "Jazz", 298],
  ["swing", "Swing", 431],
  ["rock", "Rock", 1019],
  ["pop", "Pop", 1433],
  ["hip-hop", "Hip hop", 276],
  ["latin", "Latin", 198],
  ["elettronica", "Elettronica", 655],
  ["ambient", "Ambient", 143],
].map(([id, nome, n]) => ({ id, nome, dettaglio: numero(n), descrizione: `${nome}, ${numero(n)} brani` }));

const PLAYLIST = [
  ["domenica", "Domenica mattina", 48],
  ["swing", "Swing per ballare", 94],
  ["notte", "Techno di notte", 61],
  ["viaggio", "Viaggio in macchina", 127],
].map(([id, nome, n]) => ({ id, nome, dettaglio: numero(n), descrizione: `${nome}, ${numero(n)} brani` }));

const discoDi = (b) => ({ id: b.id, titolo: b.titolo, artista: b.artista });

// ======================================================== comandi della pagina ====

let moltiplicatore = 1; // "tempo finto ×12"
$("#pz-veloce").addEventListener("change", (e) => {
  moltiplicatore = e.target.checked ? 12 : 1;
});
$("#pz-riduci").addEventListener("change", (e) => forzaMovimentoRidotto(e.target.checked));

// ========================================================================= avviso ====

const avvisoVero = $("#pz-avviso");
let timerAvviso = 0;

/** L'avviso vero in fondo alla finestra. tipo: "neutro" | "ok" | "errore". */
function avviso(testo, tipo = "neutro", { azione = null } = {}) {
  clearTimeout(timerAvviso);
  avvisoVero.hidden = true; // così l'entrata riparte da capo
  avvisoVero.className = `hf-avviso${tipo === "ok" ? " hf-ok" : tipo === "errore" ? " hf-errore" : ""}`;
  avvisoVero.setAttribute("role", tipo === "errore" ? "alert" : "status");
  const pezzi = [];
  if (tipo !== "neutro") {
    const led = document.createElement("span");
    led.className = tipo === "ok" ? "hf-led hf-acceso" : "hf-led hf-arancio hf-acceso";
    pezzi.push(led);
  }
  const t = document.createElement("span");
  t.className = "hf-avviso-testo";
  t.textContent = testo;
  pezzi.push(t);
  if (azione) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hf-tasto";
    b.textContent = azione;
    b.addEventListener("click", () => {
      avvisoVero.hidden = true;
      clearTimeout(timerAvviso);
    });
    pezzi.push(b);
  }
  avvisoVero.replaceChildren(...pezzi);
  void avvisoVero.offsetWidth;
  avvisoVero.hidden = false;
  timerAvviso = window.setTimeout(() => {
    avvisoVero.hidden = true;
  }, 3200);
}

const AVVISI = {
  neutro: () => avviso("Dati del 24/10/2026, non aggiornati: rete assente."),
  ok: () => avviso("Salvato.", "ok"),
  errore: () => avviso("Non riesco a suonare «Notte sul lungomare»: passo al prossimo.", "errore"),
  azione: () => avviso("Versione nuova pronta.", "neutro", { azione: "Aggiorna" }),
};
for (const b of $$("[data-avviso]")) b.addEventListener("click", () => AVVISI[b.dataset.avviso]());

// ======================================================================== insieme ====
// La schermata Suona montata coi pezzi, con un tempo finto (niente audio).

(function insieme() {
  const giradischi = creaGiradischi($("#pz-insieme-giradischi"));
  const display = creaDisplay($("#pz-insieme-display"), { etichetta: "Display" });
  const livelli = creaLivelli(display.livelli);
  const st = {
    ordine: BRANI.map((_, i) => i),
    pos: 0,
    t: 37,
    stato: "pausa",
    casuale: false,
    ripeti: "no",
    volume: 62,
  };
  const brano = () => BRANI[st.ordine[st.pos]];
  const el = {
    suona: $("#pz-suona"),
    casuale: $("#pz-casuale"),
    ripeti: $("#pz-ripeti"),
    ledGiri: $("#pz-led-giri"),
    spiaSuona: $('#pz-insieme-spie [data-spia="suona"]'),
    spiaCoda: $('#pz-insieme-spie [data-spia="coda"]'),
    cassetto: $("#pz-insieme-cassetto"),
    conta: $("#pz-insieme-conta"),
    posizione: $("#pz-posizione"),
    annuncio: $("#pz-annuncio"),
  };
  let spostando = false;
  let chiaveCassetto = "";

  creaManopola($("#pz-insieme-manopola"), {
    valore: st.volume,
    onCambia: (v) => {
      st.volume = v;
      display.avviso("VOLUME", v === 0 ? "MUTO" : String(v));
      disegna();
    },
  });
  creaScala($("#pz-insieme-scala"), {
    etichetta: "Generi",
    stazioni: GENERI,
    scelta: "swing",
    onScegli: (s) => display.avviso(`SINTONIA ${s.nome.toUpperCase()}`, `${s.dettaglio} BRANI`),
  });

  function prossimi(n = 5) {
    const fuori = [];
    for (let k = 1; fuori.length < n && k <= st.ordine.length; k++) {
      let p = st.pos + k;
      if (p >= st.ordine.length) {
        if (st.ripeti !== "tutti") break;
        p %= st.ordine.length;
        if (p === st.pos) break;
      }
      fuori.push(p);
    }
    return fuori;
  }

  function disegnaCassetto() {
    const lista = prossimi();
    const chiave = `${st.ordine.join(",")}|${st.pos}|${st.ripeti}`;
    if (chiave === chiaveCassetto) return;
    chiaveCassetto = chiave;
    const fuoco = el.cassetto.contains(document.activeElement)
      ? $$(".hf-vano-corpo", el.cassetto).indexOf(document.activeElement)
      : -1;
    const righe = lista.map((p, k) => {
      const b = BRANI[st.ordine[p]];
      const li = document.createElement("li");
      li.className = "hf-vano";
      const num = document.createElement("span");
      num.className = "hf-vano-num";
      num.setAttribute("aria-hidden", "true");
      num.textContent = String(k + 1);
      const corpo = document.createElement("button");
      corpo.type = "button";
      corpo.className = "hf-vano-corpo";
      corpo.dataset.pos = String(p);
      corpo.setAttribute("aria-label", `Suona ora ${b.titolo} di ${b.artista}`);
      const titolo = document.createElement("span");
      titolo.className = "hf-vano-titolo";
      titolo.textContent = b.titolo;
      const artista = document.createElement("span");
      artista.className = "hf-vano-artista";
      artista.textContent = b.artista;
      corpo.append(titolo, artista);
      const dati = document.createElement("span");
      dati.className = "hf-vano-dati";
      const durata = document.createElement("span");
      durata.className = "hf-vano-durata";
      durata.textContent = `${Math.floor(b.durata / 60)}:${String(b.durata % 60).padStart(2, "0")}`;
      dati.append(durata);
      li.append(num, corpo, dati);
      return li;
    });
    for (let k = lista.length; k < 5; k++) {
      const li = document.createElement("li");
      li.className = "hf-vano hf-vuoto";
      li.setAttribute("aria-hidden", "true");
      const num = document.createElement("span");
      num.className = "hf-vano-num";
      num.textContent = String(k + 1);
      const testo = document.createElement("span");
      const artista = document.createElement("span");
      artista.className = "hf-vano-artista";
      artista.textContent = "Vano vuoto";
      testo.append(artista);
      li.append(num, testo);
      righe.push(li);
    }
    el.cassetto.replaceChildren(...righe);
    el.conta.textContent = lista.length ? `${st.ordine.length - st.pos - 1} brani in coda` : "Coda finita";
    if (fuoco >= 0) ($$(".hf-vano-corpo", el.cassetto)[fuoco] ?? el.suona).focus();
  }

  const MODI = { no: ["NO", "no"], tutti: ["TUTTI", "tutta la coda"], uno: ["UNO", "un brano"] };

  function disegna() {
    const b = brano();
    const suona = st.stato === "suona";
    giradischi.imposta({ stato: st.stato, avanzamento: st.t / b.durata, brano: discoDi(b) });
    display.testi(b.titolo, b.artista);
    display.cifre({ traccia: st.ordine[st.pos] + 1, tempo: st.t, durata: b.durata });
    display.spie({
      suona,
      pausa: st.stato === "pausa",
      casuale: st.casuale,
      ripeti: st.ripeti !== "no",
      uno: st.ripeti === "uno",
      file: true,
    });
    livelli.imposta({ suona, volume: st.volume / 100 });
    el.suona.dataset.stato = suona ? "pausa" : "suona";
    el.suona.setAttribute("aria-label", suona ? "Pausa" : "Riproduci");
    el.casuale.setAttribute("aria-pressed", String(st.casuale));
    $(".hf-led", el.casuale).classList.toggle("hf-acceso", st.casuale);
    el.ripeti.setAttribute("aria-label", `Ripeti: ${MODI[st.ripeti][1]}`);
    $(".hf-tasto-modo", el.ripeti).textContent = MODI[st.ripeti][0];
    $(".hf-led", el.ripeti).classList.toggle("hf-acceso", st.ripeti !== "no");
    el.ledGiri.classList.toggle("hf-acceso", suona);
    accendiSpia(el.spiaSuona, suona);
    accendiSpia(el.spiaCoda, prossimi().length > 0);
    if (!spostando) el.posizione.value = String(Math.round((st.t / b.durata) * 1000));
    disegnaCassetto();
  }

  function vai(pos, { annuncia = true } = {}) {
    st.pos = pos;
    st.t = 0;
    disegna();
    if (annuncia) el.annuncio.textContent = `Traccia ${st.ordine[pos] + 1}: ${brano().titolo}, ${brano().artista}`;
  }

  function ferma() {
    st.stato = "fermo";
    st.pos = 0;
    st.t = 0;
    disegna();
    el.annuncio.textContent = "Fermo";
  }

  function fineBrano() {
    if (st.ripeti === "uno") return vai(st.pos, { annuncia: false });
    if (st.pos + 1 < st.ordine.length) return vai(st.pos + 1);
    if (st.ripeti === "tutti") return vai(0);
    ferma();
  }

  el.suona.addEventListener("click", () => {
    st.stato = st.stato === "suona" ? "pausa" : "suona";
    disegna();
  });
  $("#pz-avanti").addEventListener("click", () => vai((st.pos + 1) % st.ordine.length));
  $("#pz-indietro").addEventListener("click", () => {
    if (st.t > 4) vai(st.pos, { annuncia: false });
    else vai((st.pos - 1 + st.ordine.length) % st.ordine.length);
  });
  $("#pz-ferma").addEventListener("click", ferma);
  el.casuale.addEventListener("click", () => {
    const corrente = st.ordine[st.pos];
    st.casuale = !st.casuale;
    if (st.casuale) {
      const altri = st.ordine.filter((i) => i !== corrente);
      for (let i = altri.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [altri[i], altri[j]] = [altri[j], altri[i]];
      }
      st.ordine = [corrente, ...altri];
      st.pos = 0;
    } else {
      st.ordine = BRANI.map((_, i) => i);
      st.pos = corrente;
    }
    disegna();
    display.avviso("CASUALE", st.casuale ? "ACCESO" : "SPENTO");
  });
  el.ripeti.addEventListener("click", () => {
    st.ripeti = { no: "tutti", tutti: "uno", uno: "no" }[st.ripeti];
    disegna();
    display.avviso("RIPETI", MODI[st.ripeti][0]);
  });
  el.cassetto.addEventListener("click", (e) => {
    const corpo = e.target.closest(".hf-vano-corpo");
    if (corpo) vai(Number(corpo.dataset.pos));
  });
  el.posizione.addEventListener("input", () => {
    spostando = true;
    st.t = (Number(el.posizione.value) / 1000) * brano().durata;
    disegna();
  });
  el.posizione.addEventListener("change", () => {
    spostando = false;
  });

  setInterval(() => {
    if (st.stato !== "suona") return;
    st.t += 0.25 * moltiplicatore;
    if (st.t >= brano().durata) fineBrano();
    else disegna();
  }, 250);

  disegna();
})();

// ======================================================================== gettoni ====

const COLORI = [
  "--hf-alluminio-luce",
  "--hf-champagne",
  "--hf-alluminio",
  "--hf-alluminio-scuro",
  "--hf-grafite-luce",
  "--hf-grafite",
  "--hf-grafite-scura",
  "--hf-rack",
  "--hf-serigrafia",
  "--hf-serigrafia-tenue",
  "--hf-serigrafia-chiara",
  "--hf-tasto-scuro",
  "--hf-tasto-grafite-luce",
  "--hf-pericolo",
  "--hf-vetro-luce",
  "--hf-vetro",
  "--hf-vfd",
  "--hf-vfd-tenue",
  "--hf-ambra",
  "--hf-ambra-tenue",
  "--hf-ambra-rossa",
  "--hf-led-verde",
  "--hf-led-arancio",
  "--hf-led-ghiera",
  "--hf-scala-vetro",
  "--hf-scala-testo",
  "--hf-scala-acceso",
  "--hf-scala-numeri",
  "--hf-scala-indice",
  "--hf-fuoco",
];

(function gettoni() {
  const stile = getComputedStyle(document.documentElement);
  const valore = (nome) => stile.getPropertyValue(nome).trim();

  const contrasti = $("#pz-contrasti");
  for (const m of misuraContrasti(valore)) {
    const li = document.createElement("li");
    li.dataset.contrasto = m.regge ? "regge" : "no";
    const saggio = document.createElement("span");
    saggio.className = "pz-saggio";
    saggio.style.background = m.sfondo;
    saggio.style.color = m.colore;
    saggio.textContent = m.minimo >= 4.5 ? "Aa" : "●";
    saggio.setAttribute("aria-hidden", "true");
    const uso = document.createElement("span");
    uso.className = "pz-uso";
    uso.textContent = m.uso;
    const misura = document.createElement("span");
    misura.className = `pz-misura ${m.regge ? "pz-regge" : "pz-non-regge"}`;
    const rapporto = m.rapporto.toFixed(2).replace(".", ",");
    const minimo = String(m.minimo).replace(".", ",");
    misura.textContent = m.regge ? `${rapporto}:1 ✓` : `${rapporto}:1 ✗ (serve ${minimo})`;
    misura.title = `minimo ${minimo}:1`;
    li.append(saggio, uso, misura);
    contrasti.append(li);
  }

  const campioni = $("#pz-campioni");
  for (const nome of COLORI) {
    const riga = document.createElement("div");
    riga.className = "pz-campione";
    const colore = document.createElement("span");
    colore.className = "pz-colore";
    colore.style.background = `var(${nome})`;
    const testo = document.createElement("span");
    const n = document.createElement("code");
    n.textContent = nome;
    const v = document.createElement("code");
    v.textContent = valore(nome);
    testo.append(n, v);
    riga.append(colore, testo);
    campioni.append(riga);
  }
})();

// ==================================================================== tasti e LED ====

for (const b of $$('[data-prova="casuale"]')) {
  b.addEventListener("click", () => {
    const acceso = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(acceso));
    $(".hf-led", b).classList.toggle("hf-acceso", acceso);
  });
}
for (const b of $$('[data-prova="ripeti"]')) {
  const giro = { no: ["tutti", "TUTTI", "tutta la coda"], tutti: ["uno", "UNO", "un brano"], uno: ["no", "NO", "no"] };
  let modo = "no";
  b.addEventListener("click", () => {
    const [nuovo, scritta, detto] = giro[modo];
    modo = nuovo;
    $(".hf-tasto-modo", b).textContent = scritta;
    b.setAttribute("aria-label", `Ripeti: ${detto}`);
    $(".hf-led", b).classList.toggle("hf-acceso", modo !== "no");
  });
}

// ======================================================================== display ====

const PROVE_DISPLAY = {
  suona(d) {
    d.testi(BRANI[0].titolo, BRANI[0].artista);
    d.cifre({ traccia: 3, tempo: 83, durata: BRANI[0].durata });
    d.spie({ suona: true, file: true });
    creaLivelli(d.livelli).imposta({ suona: true, volume: 0.62 });
  },
  lungo(d) {
    d.testi(BRANI[2].titolo, BRANI[2].artista);
    d.cifre({ traccia: 7, tempo: 251, durata: BRANI[2].durata });
    d.spie({ suona: true, casuale: true, file: true });
    creaLivelli(d.livelli).imposta({ suona: true, volume: 0.62 });
  },
  pausa(d) {
    d.testi(BRANI[3].titolo, BRANI[3].artista);
    d.cifre({ traccia: 12, tempo: 64, durata: BRANI[3].durata });
    d.spie({ pausa: true, ripeti: true, file: true });
    creaLivelli(d.livelli).imposta({ suona: false });
  },
  esterna(d) {
    d.testi(BRANI[5].titolo, BRANI[5].artista);
    d.cifre({ traccia: 4, scritta: "IN NEWPIPE" });
    d.spie({ suona: true });
  },
  set(d) {
    d.testi("Set del sabato (due ore)", "Dal vivo al circolo");
    d.cifre({ traccia: 1, tempo: 3725, durata: 7200 });
    d.spie({ suona: true, file: true });
  },
  vuoto(d) {
    d.testi("NESSUN DISCO", "Scegli una playlist");
    d.cifre({});
    d.spie({});
  },
  avviso(d) {
    d.testi(BRANI[4].titolo, BRANI[4].artista);
    d.cifre({ traccia: 2, tempo: 141, durata: BRANI[4].durata });
    d.spie({ suona: true, file: true });
    $("#pz-mostra-avviso-display").addEventListener("click", () => d.avviso("VOLUME", "64"));
  },
};

for (const posto of $$(".pz-frontale-display[data-display]")) {
  PROVE_DISPLAY[posto.dataset.display](creaDisplay(posto));
}
{
  const corto = creaDisplay($('[data-display="compatto"]'), { compatto: true, etichetta: "Mini lettore" });
  corto.testi(BRANI[1].titolo, BRANI[1].artista);
  corto.cifre({ tempo: 47, durata: BRANI[1].durata });
  const lungo = creaDisplay($('[data-display="compatto-lungo"]'), { compatto: true, etichetta: "Mini lettore" });
  lungo.testi(BRANI[2].titolo, BRANI[2].artista);
  lungo.cifre({ scritta: "IN SPOTIFY" });
}

// ======================================================================== livelli ====

const PROVE_LIVELLI = {
  forte: { suona: true, volume: 0.8 },
  piano: { suona: true, volume: 0.25 },
  pausa: { suona: false },
};
for (const posto of $$("[data-prova-livelli]")) {
  creaLivelli(posto).imposta(PROVE_LIVELLI[posto.dataset.provaLivelli]);
}

// ======================================================================= manopola ====

(function manopole() {
  const lettura = creaDisplay($("#pz-manopola-display"), { compatto: true, etichetta: "Volume" });
  const rifiuto = () => avviso("Il volume lo decide l'app esterna.");
  let audio = null;

  function mostra(v) {
    const db = 20 * Math.log10(curvaVolume(v / 100));
    lettura.testi(v === 0 ? "MUTO" : `VOLUME ${v}`, "");
    lettura.cifre({
      scritta: v === 0 ? "−∞ dB" : `${db > -0.05 ? "0" : db.toFixed(1).replace(".", ",").replace("-", "−")} dB`,
    });
    if (audio) audio.volume = curvaVolume(v / 100);
  }

  const vera = creaManopola($("#pz-manopola-vera"), { valore: 62, onCambia: mostra, onRifiuto: rifiuto });
  mostra(vera.valore);

  const ascolta = $("#pz-ascolta");
  ascolta.addEventListener("click", () => {
    const acceso = ascolta.getAttribute("aria-pressed") !== "true";
    if (acceso && !audio) {
      audio = new Audio(URL.createObjectURL(accordoWav()));
      audio.loop = true;
    }
    if (!audio) return;
    audio.volume = curvaVolume(vera.valore / 100);
    if (acceso) audio.play().catch(() => avviso("Il browser non ha fatto partire l'audio: riprova.", "errore"));
    else audio.pause();
    ascolta.setAttribute("aria-pressed", String(acceso));
    ascolta.textContent = acceso ? "Ferma" : "Ascolta";
  });

  const esterna = $("#pz-esterna");
  esterna.addEventListener("click", () => {
    const fuori = esterna.getAttribute("aria-pressed") !== "true";
    esterna.setAttribute("aria-pressed", String(fuori));
    vera.spegni(fuori ? "lo decide l'app esterna" : null);
    lettura.testi(fuori ? "IN NEWPIPE" : `VOLUME ${vera.valore}`, "");
    if (fuori && audio && !audio.paused) ascolta.click();
    ascolta.disabled = fuori;
    if (!fuori) mostra(vera.valore);
  });

  const fuoco = creaManopola($("#pz-manopola-fuoco"), { valore: 40, dimensione: 84, etichetta: "Volume (a fuoco)" });
  $(".hf-manopola", fuoco.elemento).classList.add("hf-forza-fuoco");
  const spenta = creaManopola($("#pz-manopola-spenta"), {
    valore: 75,
    dimensione: 84,
    etichetta: "Volume (spenta)",
    onRifiuto: rifiuto,
  });
  spenta.spegni("lo decide l'app esterna");
})();

/** Un accordo morbido di due secondi (la maggiore), con attacco e rilascio per non fare clic. */
function accordoWav(secondi = 2, campioni = 22050) {
  const n = secondi * campioni;
  const buffer = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buffer);
  const testo = (da, s) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(da + i, s.charCodeAt(i));
  };
  testo(0, "RIFF");
  dv.setUint32(4, 36 + n * 2, true);
  testo(8, "WAVE");
  testo(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, campioni, true);
  dv.setUint32(28, campioni * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  testo(36, "data");
  dv.setUint32(40, n * 2, true);
  const note = [220, 277.18, 329.63];
  const dati = new Int16Array(buffer, 44, n);
  for (let i = 0; i < n; i++) {
    const t = i / campioni;
    const inviluppo = Math.min(1, t / 0.08, (secondi - t) / 0.08);
    let v = 0;
    for (const f of note) v += Math.sin(2 * Math.PI * f * t);
    dati[i] = Math.round((v / note.length) * 0.4 * inviluppo * 32767);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

// ========================================================================== scala ====

{
  const dettaglio = $("#pz-scala-generi-dettaglio");
  const scrivi = (s) => {
    dettaglio.textContent = `Sintonizzato: ${s.nome} · ${s.dettaglio} brani`;
  };
  creaScala($("#pz-scala-generi"), { etichetta: "Generi", stazioni: GENERI, scelta: "swing", onScegli: scrivi });
  scrivi(GENERI.find((g) => g.id === "swing"));
  creaScala($("#pz-scala-playlist"), { etichetta: "Playlist", stazioni: PLAYLIST, scelta: "swing" });
  creaScala($("#pz-scala-vuota"), { etichetta: "Stanze", stazioni: [], vuota: "Nessuna stanza aperta" });
}

// ===================================================================== giradischi ====

{
  const PROVE = {
    fermo: { brano: BRANI[6], avanzamento: 0, scritta: "Fermo" },
    suona: { brano: BRANI[0], avanzamento: 0.35, scritta: "In riproduzione" },
    pausa: { brano: BRANI[2], avanzamento: 0.6, scritta: "In pausa" },
  };
  for (const posto of $$("[data-giradischi]")) {
    const stato = posto.dataset.giradischi;
    const prova = PROVE[stato];
    const targhetta = document.createElement("div");
    targhetta.className = "hf-targhetta";
    const marchio = document.createElement("span");
    marchio.className = "hf-marchio";
    marchio.textContent = "Jukebox";
    const dettaglio = document.createElement("span");
    dettaglio.className = "hf-dettaglio";
    dettaglio.textContent = prova.scritta;
    targhetta.append(marchio, dettaglio);
    posto.append(targhetta);
    creaGiradischi(posto).imposta({ stato, avanzamento: prova.avanzamento, brano: discoDi(prova.brano) });
  }
}

// ======================================================================= cassetto ====

{
  const esito = $("#pz-esito-cassetto");
  for (const lista of $$("[data-cassetto]")) {
    lista.addEventListener("click", (e) => {
      const tasto = e.target.closest("[data-esito]");
      if (tasto) esito.textContent = tasto.dataset.esito;
    });
  }
}

// ======================================================================= finestra ====

(function finestre() {
  const velo = $("#pz-velo");
  const finestra = $(".hf-finestra", velo);
  const titolo = $("#pz-finestra-titolo");
  const corpo = $("#pz-finestra-corpo");
  const azioni = $("#pz-finestra-azioni");
  const esito = $("#pz-esito-finestra");
  let daDove = null;
  let conferma = null;

  function chiudi(testo) {
    velo.hidden = true;
    esito.textContent = testo;
    daDove?.focus();
  }

  function tasto(testo, classe, fai) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = classe;
    b.textContent = testo;
    b.addEventListener("click", fai);
    return b;
  }

  function apri({ testoTitolo, pezzi, principale, pericolo = false, conCampo = false }) {
    daDove = document.activeElement;
    titolo.textContent = testoTitolo;
    corpo.replaceChildren(...pezzi);
    const campo = conCampo ? $(".hf-campo", corpo) : null;
    conferma = () => chiudi(campo ? `Creata: «${campo.value.trim() || "senza nome"}»` : `${principale}: fatto`);
    azioni.replaceChildren(
      tasto("Annulla", "hf-tasto", () => chiudi("Annullato")),
      tasto(principale, pericolo ? "hf-tasto hf-pericolo" : "hf-tasto hf-principale", () => conferma()),
    );
    velo.hidden = false;
    (campo ?? $(".hf-tasto:last-child", azioni)).focus();
    campo?.select();
  }

  velo.addEventListener("click", (e) => {
    if (e.target === velo) chiudi("Chiusa con un tocco fuori");
  });
  $("[data-chiudi]", velo).addEventListener("click", () => chiudi("Chiusa con ✕"));
  velo.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      chiudi("Chiusa con Esc");
    } else if (e.key === "Enter" && e.target.classList.contains("hf-campo")) {
      e.preventDefault();
      conferma?.();
    } else if (e.key === "Tab") {
      // Il fuoco resta dentro la finestra.
      const dentro = $$("button, input", finestra).filter((x) => !x.disabled);
      const [primo, ultimo] = [dentro[0], dentro[dentro.length - 1]];
      if (e.shiftKey && document.activeElement === primo) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primo.focus();
      }
    }
  });

  $("#pz-apri-testo").addEventListener("click", () => {
    const etichetta = document.createElement("label");
    etichetta.className = "hf-etichetta-campo";
    etichetta.htmlFor = "pz-campo-finestra";
    etichetta.textContent = "Nome della playlist";
    const campo = document.createElement("input");
    campo.className = "hf-campo";
    campo.id = "pz-campo-finestra";
    campo.type = "text";
    campo.autocomplete = "off";
    campo.value = "Swing per ballare";
    apri({ testoTitolo: "Nuova playlist", pezzi: [etichetta, campo], principale: "Crea", conCampo: true });
  });
  $("#pz-apri-conferma").addEventListener("click", () => {
    const p = document.createElement("p");
    p.textContent = "«Swing per ballare» sparisce da tutti e due i telefoni. I brani restano nel catalogo.";
    apri({ testoTitolo: "Eliminare la playlist?", pezzi: [p], principale: "Elimina", pericolo: true });
  });
})();
