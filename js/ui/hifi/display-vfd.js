// display-vfd.js — il display a fluorescenza (VFD): numero di traccia e tempo a segmenti, le spie,
// due righe a punti (titolo e artista) che scorrono solo se non ci stanno, e un posto per gli
// indicatori di livello. La versione compatta (per il mini lettore) ha una riga sola e il tempo.
// Solo disegno: cosa mostrare lo decide chi lo usa.
//
//   const d = creaDisplay(contenitore);                    // { compatto: true } per quello piccolo
//   d.testi("Titolo", "Artista");
//   d.cifre({ traccia: 3, tempo: 83, durata: 252 });       // o { traccia: 3, scritta: "IN NEWPIPE" }
//   d.spie({ suona: true, casuale: false });
//   d.avviso("VOLUME", "64");                              // per un attimo al posto dei testi
//   creaLivelli(d.livelli);                                // gli indicatori dentro il display
//
// Per i lettori di schermo: le righe sono testo vero; cifre e spie sono disegni (aria-hidden) e al
// loro posto c'è una frase ("Traccia 3, tempo 1:23"), che non si annuncia da sola a ogni secondo.

import {
  cifreTraccia,
  durataScorrimento,
  FANTASMA_TEMPO,
  FANTASMA_TEMPO_ORE,
  SOGLIA_SCORRIMENTO_PX,
  servonoOre,
  tempoSegmenti,
} from "./calcoli.js";
import { movimentoRidotto, osservaVisibilita, seCambiaMovimento } from "./comune.js";

/** Le spie del display, nell'ordine: [chiave, scritta]. */
export const SPIE_DISPLAY = [
  ["suona", "PLAY"],
  ["pausa", "PAUSA"],
  ["casuale", "CASUALE"],
  ["ripeti", "RIPETI"],
  ["uno", "1"],
  ["file", "FILE"],
];

export const DURATA_AVVISO_DISPLAY_MS = 1600;

const CIFRE = (/** @type {string} */ nome, /** @type {string} */ fantasma) =>
  `<span class="hf-seg" aria-hidden="true" data-${nome}-cifre><span class="hf-seg-spento" data-${nome}-spento>${fantasma}</span><span class="hf-seg-acceso" data-${nome}></span></span>`;

const SCRITTA = `<span class="hf-vfd-scritta" aria-hidden="true" data-scritta hidden></span>`;
const RIGA = (/** @type {string} */ classe) =>
  `<div class="hf-vfd-riga${classe}" data-riga><span class="hf-vfd-scorre"></span></div>`;

function markupCompleto(spie) {
  return `<div class="hf-vfd-riga1">
      <div class="hf-vfd-cifre"><span class="hf-vfd-etichetta" aria-hidden="true">TRACCIA</span>${CIFRE("traccia", "88")}</div>
      <div class="hf-vfd-cifre"><span class="hf-vfd-etichetta" aria-hidden="true">TEMPO</span>${CIFRE("tempo", FANTASMA_TEMPO)}${SCRITTA}</div>
      <ul class="hf-vfd-spie" aria-hidden="true">${spie.map(([chiave, scritta]) => `<li data-spia="${chiave}">${scritta}</li>`).join("")}</ul>
    </div>
    <span class="hf-sr" data-lettura></span>
    ${RIGA(" hf-vfd-titolo")}
    ${RIGA(" hf-vfd-artista")}
    <div class="hf-vfd-livelli" data-livelli></div>`;
}

const MARKUP_COMPATTO = `${RIGA("")}${CIFRE("tempo", FANTASMA_TEMPO)}${SCRITTA}<span class="hf-sr" data-lettura></span>`;

/**
 * Crea un display dentro `contenitore`.
 * @param {Element} contenitore
 * @param {{ compatto?: boolean, etichetta?: string, spie?: string[][] }} [opzioni]
 *   etichetta: il nome per i lettori di schermo; spie: [chiave, scritta] (vedi SPIE_DISPLAY).
 */
export function creaDisplay(contenitore, { compatto = false, etichetta = "Display", spie = SPIE_DISPLAY } = {}) {
  const radice = document.createElement("div");
  radice.className = compatto ? "hf-vfd hf-compatto" : "hf-vfd";
  radice.setAttribute("role", "group");
  radice.setAttribute("aria-label", etichetta);
  radice.innerHTML = compatto ? MARKUP_COMPATTO : markupCompleto(spie);
  contenitore.append(radice);

  /** @type {(sel: string) => HTMLElement | null} */
  const q = (sel) => radice.querySelector(sel);
  const el = {
    traccia: q("[data-traccia]"),
    tracciaSpento: q("[data-traccia-spento]"),
    tempo: q("[data-tempo]"),
    tempoSpento: q("[data-tempo-spento]"),
    tempoCifre: q("[data-tempo-cifre]"),
    scritta: q("[data-scritta]"),
    lettura: q("[data-lettura]"),
    righe: /** @type {HTMLElement[]} */ ([...radice.querySelectorAll("[data-riga]")]),
    spie: /** @type {HTMLElement[]} */ ([...radice.querySelectorAll("[data-spia]")]),
    livelli: q("[data-livelli]"),
  };

  const st = {
    /** @type {string[]} */ testi: ["", ""],
    /** @type {string[] | null} */ avviso: null,
  };
  let timerAvviso = 0;

  const scrivi = (/** @type {HTMLElement | null} */ e, /** @type {string} */ t) => {
    if (e && e.textContent !== t) e.textContent = t;
  };

  // Una riga che non ci sta scorre avanti e indietro (CSS: hf-lungo); con "riduci movimento" resta
  // ferma e la tagliano i puntini.
  function misura(/** @type {HTMLElement} */ riga) {
    const testo = /** @type {HTMLElement} */ (riga.firstElementChild);
    riga.classList.remove("hf-lungo");
    if (movimentoRidotto()) return;
    void riga.offsetWidth; // così lo scorrimento riparte da capo quando cambia il testo
    const eccesso = testo.offsetWidth - riga.clientWidth;
    if (eccesso > SOGLIA_SCORRIMENTO_PX) {
      riga.style.setProperty("--hf-distanza", `${-(eccesso + 10)}px`);
      riga.style.setProperty("--hf-durata", `${durataScorrimento(eccesso).toFixed(1)}s`);
      riga.classList.add("hf-lungo");
    }
  }

  function misuraTutto() {
    for (const riga of el.righe) misura(riga);
  }

  function scriviRighe() {
    const voluti = st.avviso ?? st.testi;
    const testi = compatto ? [voluti.filter(Boolean).join(" · ")] : voluti;
    el.righe.forEach((riga, i) => {
      const testo = /** @type {HTMLElement} */ (riga.firstElementChild);
      const t = testi[i] ?? "";
      if (testo.textContent === t) return;
      testo.textContent = t;
      misura(riga);
    });
  }

  /** Titolo e artista (nel display compatto stanno sulla stessa riga). */
  function testi(titolo = "", artista = "") {
    st.testi = [String(titolo ?? ""), String(artista ?? "")];
    scriviRighe();
  }

  /**
   * Traccia e tempo. tempo e durata in secondi (la durata decide se servono le ore); al posto del
   * tempo una `scritta` ("IN NEWPIPE"). null = cifre spente.
   * @param {{ traccia?: number | null, tempo?: number | null, durata?: number, scritta?: string | null }} [dati]
   */
  function cifre({ traccia = null, tempo = null, durata = 0, scritta = null } = {}) {
    const n = traccia === null || traccia === undefined ? "" : cifreTraccia(traccia);
    scrivi(el.traccia, n);
    scrivi(el.tracciaSpento, "8".repeat(Math.max(2, n.length)));
    const ore = servonoOre(durata);
    const t = tempo === null || tempo === undefined ? "" : tempoSegmenti(tempo, { ore });
    if (el.tempoCifre) el.tempoCifre.hidden = Boolean(scritta);
    if (el.scritta) el.scritta.hidden = !scritta;
    scrivi(el.scritta, scritta ?? "");
    scrivi(el.tempo, scritta ? "" : t);
    scrivi(el.tempoSpento, ore || t.length > FANTASMA_TEMPO.length ? FANTASMA_TEMPO_ORE : FANTASMA_TEMPO);
    const parti = [];
    if (n) parti.push(`Traccia ${Number(n)}`);
    if (scritta) parti.push(scritta.toLowerCase());
    else if (t) parti.push(`tempo ${t.replace(/^!/, "")}`);
    scrivi(el.lettura, parti.join(", "));
  }

  /** Accende le spie: { suona: true, pausa: false, … } (le chiavi di SPIE_DISPLAY). */
  function accendiSpie(stato = {}) {
    for (const li of el.spie) li.classList.toggle("hf-acceso", Boolean(stato[li.dataset.spia]));
  }

  /** Per un attimo, due righe al posto di titolo e artista ("VOLUME", "64"). */
  function avviso(riga1, riga2 = "", ms = DURATA_AVVISO_DISPLAY_MS) {
    st.avviso = [String(riga1 ?? ""), String(riga2 ?? "")];
    scriviRighe();
    clearTimeout(timerAvviso);
    timerAvviso = window.setTimeout(() => {
      st.avviso = null;
      scriviRighe();
    }, ms);
  }

  // Le righe si rimisurano se cambia la larghezza, quando arriva il carattere a punti (prima la
  // larghezza è quella di riserva) e quando cambia "riduci movimento". Fuori dallo schermo lo
  // scorrimento si ferma.
  const ridimensiona = new ResizeObserver(() => misuraTutto());
  ridimensiona.observe(radice);
  document.fonts?.load('700 20px "Doto"').then(misuraTutto, () => {});
  const smettiMovimento = seCambiaMovimento(misuraTutto);
  const smettiVista = osservaVisibilita(radice, (visibile) => radice.classList.toggle("hf-in-pausa", !visibile));

  return {
    elemento: radice,
    /** Dove montare gli indicatori di livello (null nel display compatto). */
    livelli: el.livelli,
    testi,
    cifre,
    spie: accendiSpie,
    avviso,
    misura: misuraTutto,
    distruggi() {
      clearTimeout(timerAvviso);
      ridimensiona.disconnect();
      smettiMovimento();
      smettiVista();
      radice.remove();
    },
  };
}
