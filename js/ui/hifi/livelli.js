// livelli.js — gli indicatori di livello: due canali di segmenti ambra, gli ultimi tre rossi.
// Simulati, non misurati (scelta 7 del piano: misurare l'audio vero può fermare la musica a
// schermo spento): si muovono in modo credibile solo mentre suona, solo se si vedono e mai con
// "riduci movimento". Seguono il volume della manopola, come l'uscita di un amplificatore.
//
//   const l = creaLivelli(display.livelli);
//   l.imposta({ suona: true, volume: 0.62 });

import {
  aggiornaPicco,
  cadutaLivello,
  livelloSimulato,
  PASSO_LIVELLI_MS,
  SEGMENTI_LIVELLO,
  segmentiAccesi,
} from "./calcoli.js";
import { movimentoRidotto, osservaVisibilita, seCambiaMovimento } from "./comune.js";

const SCALA = ["−20", "−10", "−6", "−3", "0", "+3"];
const ROSSI = 3; // gli ultimi segmenti: la saturazione

/**
 * Crea gli indicatori dentro `contenitore` (di solito il posto apposta di un display).
 * @param {Element} contenitore
 * @param {{ segmenti?: number, canali?: string[], scala?: boolean }} [opzioni]
 */
export function creaLivelli(contenitore, { segmenti = SEGMENTI_LIVELLO, canali = ["L", "R"], scala = true } = {}) {
  const radice = document.createElement("div");
  radice.className = "hf-livelli";
  radice.setAttribute("aria-hidden", "true"); // un disegno: lo stato vero lo dicono i tasti
  radice.style.setProperty("--hf-segmenti", String(segmenti));

  const barre = canali.map((nome) => {
    const etichetta = document.createElement("span");
    etichetta.className = "hf-liv-nome";
    etichetta.textContent = nome;
    const barra = document.createElement("span");
    barra.className = "hf-liv-barra";
    const pezzi = Array.from({ length: segmenti }, (_, i) => {
      const s = document.createElement("span");
      s.className = i >= segmenti - ROSSI ? "hf-liv-seg hf-rosso" : "hf-liv-seg";
      return s;
    });
    barra.append(...pezzi);
    radice.append(etichetta, barra);
    return pezzi;
  });
  if (scala) {
    const riga = document.createElement("span");
    riga.className = "hf-liv-scala";
    for (const t of SCALA) {
      const x = document.createElement("span");
      x.textContent = t;
      riga.append(x);
    }
    radice.append(riga);
  }
  contenitore.append(radice);

  const st = { suona: false, volume: 1, visibile: false };
  const mostrato = canali.map(() => 0);
  let picchi = canali.map(() => ({ n: 0, t: 0 }));
  const disegnati = canali.map(() => -1); // per non toccare la pagina se non cambia nulla
  let timer = 0;

  function disegna(c, n, picco) {
    const chiave = n * 100 + picco;
    if (disegnati[c] === chiave) return;
    disegnati[c] = chiave;
    barre[c].forEach((s, i) => {
      s.classList.toggle("hf-on", i < n || (picco > 0 && i === picco - 1));
    });
  }

  function passo() {
    const ora = performance.now() / 1000;
    for (let c = 0; c < canali.length; c++) {
      mostrato[c] = cadutaLivello(mostrato[c], livelloSimulato(ora, c, st.volume, Math.random()));
      const n = segmentiAccesi(mostrato[c], segmenti);
      picchi[c] = aggiornaPicco(picchi[c], n, ora);
      disegna(c, n, picchi[c].n);
    }
  }

  function aggiorna() {
    const vivi = st.suona && st.visibile && !movimentoRidotto();
    if (vivi) {
      if (!timer) timer = window.setInterval(passo, PASSO_LIVELLI_MS);
      return;
    }
    clearInterval(timer);
    timer = 0;
    mostrato.fill(0);
    picchi = canali.map(() => ({ n: 0, t: 0 }));
    for (let c = 0; c < canali.length; c++) disegna(c, 0, 0);
  }

  const smettiVista = osservaVisibilita(radice, (visibile) => {
    st.visibile = visibile;
    aggiorna();
  });
  const smettiMovimento = seCambiaMovimento(aggiorna);
  aggiorna();

  return {
    elemento: radice,
    /** suona: si muovono; volume: da 0 a 1 (la manopola). */
    imposta({ suona = st.suona, volume = st.volume } = {}) {
      st.suona = Boolean(suona);
      st.volume = Number.isFinite(volume) ? volume : st.volume;
      aggiorna();
    },
    /** Si stanno muovendo adesso (per le prove). */
    get attivi() {
      return timer !== 0;
    },
    distruggi() {
      clearInterval(timer);
      smettiVista();
      smettiMovimento();
      radice.remove();
    },
  };
}
