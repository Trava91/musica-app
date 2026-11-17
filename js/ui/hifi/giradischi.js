// giradischi.js — il giradischi: plinto, piatto, vinile coi solchi, etichetta con titolo e
// artista (spazio previsto per una copertina), braccio. Il disco accelera in 1,2 s e frena in
// 1,5 s: è un'unica animazione di rotazione di cui si regola la velocità, così a regime non gira
// nessuno script. Il braccio scende sul disco quando parte, si alza in pausa, va piano verso il
// centro mentre il brano avanza, torna al primo solco per un disco nuovo e a riposo quando ci si
// ferma. Con "riduci movimento" il disco sta fermo e il braccio cambia posto senza animazione;
// quando il giradischi non si vede, il disco smette di girare.
//
//   const g = creaGiradischi(contenitore);
//   g.imposta({ stato: "suona", avanzamento: 0.4, brano: { id, titolo, artista } });
//   // stato: "suona" | "pausa" | "fermo"; avanzamento da 0 a 1 (posizione / durata)
//
// Le fasi e i tempi del braccio li decide calcoli.transizioneGiradischi.

import {
  angoloBraccio,
  braccioAlzato,
  coloreEtichetta,
  GIRO_MS,
  passoVelocita,
  transizioneGiradischi,
  velocitaDisco,
} from "./calcoli.js";
import { idUnico, movimentoRidotto, osservaVisibilita, seCambiaMovimento } from "./comune.js";

const CURVA = "cubic-bezier(.45,.05,.35,1)"; // il braccio si stacca piano e si posa piano
const SEGUI_MS = 1000; // mentre suona il braccio segue l'avanzamento (arriva circa ogni secondo)
const POSA_MS = 350; // il braccio si posa sul solco
const GIRANO = new Set(["avvio", "suona", "cambio"]);
const COME = { avvio: "in riproduzione", suona: "in riproduzione", cambio: "in riproduzione", pausa: "in pausa" };

function markup(id, lato) {
  return `<div class="hf-pozzo"></div>
    <div class="hf-disco">
      <div class="hf-piatto"></div>
      <div class="hf-vinile"></div>
      <div class="hf-etichetta" aria-hidden="true">
        <span class="hf-et-lato">${lato}</span>
        <span class="hf-et-titolo"></span>
        <span class="hf-et-artista"></span>
        <img class="hf-et-copertina" alt="" hidden>
      </div>
    </div>
    <div class="hf-riflesso"></div>
    <div class="hf-perno"></div>
    <div class="hf-supporto-braccio"></div>
    <div class="hf-base-braccio"></div>
    <div class="hf-braccio" data-su="no">
      <svg class="hf-braccio-forma" viewBox="0 0 8 82" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="${id}-tubo" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stop-color="#7f7d78"/><stop offset="0.45" stop-color="#f6f5f1"/>
            <stop offset="0.7" stop-color="#b6b3ac"/><stop offset="1" stop-color="#6c6a65"/>
          </linearGradient>
          <linearGradient id="${id}-peso" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stop-color="#1c1d20"/><stop offset="0.4" stop-color="#5a5b60"/><stop offset="1" stop-color="#1c1d20"/>
          </linearGradient>
        </defs>
        <rect x="1.3" y="1.5" width="5.4" height="7.6" rx="1.1" fill="url(#${id}-peso)"/>
        <rect x="3.35" y="8.6" width="1.3" height="60.4" rx="0.65" fill="url(#${id}-tubo)"/>
        <circle cx="4" cy="13" r="2.5" fill="url(#${id}-tubo)" stroke="#4b4a47" stroke-width="0.25"/>
        <g transform="rotate(18 4 68)">
          <rect x="2.6" y="67.2" width="2.8" height="8.8" rx="0.6" fill="#2b2c30"/>
          <rect x="2.95" y="73.2" width="2.1" height="3.2" rx="0.3" fill="#0f0f11"/>
          <path d="M5.3 68.6 L7.6 67.4" stroke="#c8c5be" stroke-width="0.6" stroke-linecap="round"/>
        </g>
      </svg>
    </div>`;
}

/**
 * Crea un giradischi dentro `contenitore`.
 * @param {Element} contenitore
 * @param {{ lato?: string }} [opzioni] lato: la scritta piccola in alto sull'etichetta.
 */
export function creaGiradischi(contenitore, { lato = "LATO A · 33⅓" } = {}) {
  const radice = document.createElement("div");
  radice.className = "hf-giradischi";
  radice.setAttribute("role", "img");
  radice.innerHTML = markup(idUnico("hf-gd"), lato);
  contenitore.append(radice);

  /** @type {(sel: string) => HTMLElement} */
  const q = (sel) => /** @type {HTMLElement} */ (radice.querySelector(sel));
  const el = {
    disco: q(".hf-disco"),
    braccio: q(".hf-braccio"),
    etichetta: q(".hf-etichetta"),
    titolo: q(".hf-et-titolo"),
    artista: q(".hf-et-artista"),
    copertina: /** @type {HTMLImageElement} */ (q(".hf-et-copertina")),
  };

  const st = {
    fase: "fermo",
    stato: "fermo",
    avanzamento: 0,
    /** @type {{ id?: string, titolo?: string, artista?: string, copertina?: string } | null} */
    brano: null,
    primo: true, // la prima chiamata a imposta va dritta allo stato giusto, senza animazioni
    visibile: false,
  };
  let attesa = 0;
  /** @type {(() => void) | null} il braccio da posare sul solco alla fine dell'attesa */
  let posaInAttesa = null;

  // ------------------------------------------------------------ la rotazione ----
  /** @type {Animation | null} */
  let giro = null;
  let spinta = 0; // da 0 (fermo) a 1 (33⅓): sale e scende piano
  let obiettivo = 0;
  let raf = 0;
  let ultimo = 0;

  function impostaGiro(v, { subito = false } = {}) {
    obiettivo = v;
    if (movimentoRidotto()) {
      spinta = 0;
      cancelAnimationFrame(raf);
      raf = 0;
      giro?.cancel();
      giro = null;
      return;
    }
    if (!giro) {
      giro = el.disco.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
        duration: GIRO_MS,
        iterations: Number.POSITIVE_INFINITY,
      });
      giro.pause();
    }
    if (subito) spinta = v;
    if (!raf) {
      ultimo = performance.now();
      raf = requestAnimationFrame(passoGiro);
    }
  }

  function passoGiro(ora) {
    const dt = Math.min(0.1, (ora - ultimo) / 1000);
    ultimo = ora;
    spinta = passoVelocita(spinta, obiettivo, dt);
    const velocita = velocitaDisco(spinta);
    if (giro && velocita > 0) {
      giro.playbackRate = velocita;
      if (giro.playState !== "running" && st.visibile) giro.play();
    }
    if (spinta === obiettivo) {
      raf = 0;
      if (spinta === 0) giro?.pause();
      return;
    }
    raf = requestAnimationFrame(passoGiro);
  }

  // --------------------------------------------------------------- il braccio ----
  function disegnaBraccio(ms, curva = "linear") {
    const su = braccioAlzato(st.fase);
    el.braccio.style.transition = movimentoRidotto() || st.primo || !ms ? "none" : `transform ${ms}ms ${curva}`;
    el.braccio.style.transform = `rotate(${angoloBraccio(st.fase, st.avanzamento).toFixed(2)}deg) scale(${su ? 1.02 : 1})`;
    el.braccio.dataset.su = su ? "si" : "no";
  }

  // ---------------------------------------------------- etichetta e descrizione ----
  function disegnaEtichetta() {
    const b = st.brano;
    const { carta, inchiostro } = coloreEtichetta(b?.id ?? "");
    el.etichetta.style.setProperty("--hf-carta", carta);
    el.etichetta.style.setProperty("--hf-inchiostro", inchiostro);
    el.titolo.textContent = b?.titolo ?? "";
    el.artista.textContent = b?.artista ?? "";
    if (b?.copertina) el.copertina.src = b.copertina;
    else el.copertina.removeAttribute("src");
    el.copertina.hidden = !b?.copertina;
  }

  function descrivi() {
    const come = COME[st.fase] ?? "fermo";
    const b = st.brano;
    const disco = b?.titolo ? `«${b.titolo}»${b.artista ? ` di ${b.artista}` : ""}` : "nessun disco";
    radice.setAttribute("aria-label", `Giradischi: ${disco}, ${come}`);
  }

  // -------------------------------------------------------------------- imposta ----
  /**
   * Quello che deve fare adesso. Si può chiamare spesso (a ogni secondo per l'avanzamento):
   * le animazioni partono solo quando cambia lo stato o il disco.
   * @param {{ stato?: string, avanzamento?: number, brano?: { id?: string, titolo?: string, artista?: string, copertina?: string } | null }} [dati]
   */
  function imposta({ stato = st.stato, avanzamento = st.avanzamento, brano = st.brano } = {}) {
    const nuovoBrano = (brano?.id ?? null) !== (st.brano?.id ?? null);
    const cambiaEtichetta =
      nuovoBrano ||
      brano?.titolo !== st.brano?.titolo ||
      brano?.artista !== st.brano?.artista ||
      brano?.copertina !== st.brano?.copertina;
    st.stato = stato;
    st.avanzamento = Number.isFinite(avanzamento) ? avanzamento : 0;
    st.brano = brano ? { ...brano } : null;
    if (cambiaEtichetta) disegnaEtichetta();

    if (st.primo) {
      st.fase = stato === "suona" || stato === "pausa" ? stato : "fermo";
      impostaGiro(st.fase === "suona" ? 1 : 0, { subito: true });
      disegnaBraccio(0);
      st.primo = false;
      descrivi();
      return;
    }

    const t = transizioneGiradischi(st.fase, stato, nuovoBrano);
    if (t) {
      clearTimeout(attesa);
      posaInAttesa = null;
      st.fase = t.fase;
      impostaGiro(GIRANO.has(st.fase) ? 1 : 0);
      disegnaBraccio(t.braccioMs, t.curva ? CURVA : "linear");
      if (t.poi) {
        const poi = t.poi;
        posaInAttesa = () => {
          posaInAttesa = null;
          attesa = 0;
          st.fase = poi;
          disegnaBraccio(POSA_MS);
          descrivi();
        };
        if (movimentoRidotto()) posaInAttesa();
        else attesa = window.setTimeout(posaInAttesa, t.dopoMs);
      }
    } else if (st.fase === "suona" || st.fase === "pausa") {
      disegnaBraccio(SEGUI_MS); // il braccio segue il brano (o uno spostamento della posizione)
    }
    descrivi();
  }

  // "Riduci movimento" cambia: un braccio in viaggio si posa subito; rotazione e transizioni
  // spariscono (o tornano).
  function riallinea() {
    if (movimentoRidotto() && posaInAttesa) {
      clearTimeout(attesa);
      posaInAttesa();
    }
    impostaGiro(GIRANO.has(st.fase) ? 1 : 0, { subito: true });
    disegnaBraccio(0);
  }

  const smettiMovimento = seCambiaMovimento(riallinea);
  const smettiVista = osservaVisibilita(radice, (visibile) => {
    st.visibile = visibile;
    if (!giro) return;
    if (visibile && spinta > 0) giro.play();
    else giro.pause();
  });
  // Fermo e senza disco finché qualcuno non dice cosa fare.
  disegnaEtichetta();
  disegnaBraccio(0);
  descrivi();

  return {
    elemento: radice,
    imposta,
    /** La fase di adesso: "fermo" | "avvio" | "suona" | "pausa" | "cambio" (per le prove). */
    get fase() {
      return st.fase;
    },
    distruggi() {
      clearTimeout(attesa);
      cancelAnimationFrame(raf);
      giro?.cancel();
      smettiMovimento();
      smettiVista();
      radice.remove();
    },
  };
}
