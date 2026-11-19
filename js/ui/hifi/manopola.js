// manopola.js — la manopola (il volume, ma va bene per qualunque valore): role="slider". Si gira
// col dito o col mouse in cerchio, con la rotella, con le frecce, Pagina su/giù, Inizio e Fine.
// Spenta (aria-disabled) non si gira: con le app esterne il volume lo decide l'app.
//
//   const m = creaManopola(contenitore, { valore: 62, onCambia: (v) => sessione.impostaVolume(v / 100) });
//   m.imposta(40);                        // da fuori (non chiama onCambia)
//   m.spegni("lo decide l'app esterna");  // m.spegni(null) la riaccende
//
// I conti (angoli, passi dei tasti) stanno in calcoli.js.

import { angoloManopola, angoloPuntatore, differenzaAngolo, giraManopola, limita, valoreDaTasto } from "./calcoli.js";

const NS = "http://www.w3.org/2000/svg";
const TACCHE = 11; // una ogni 27°: minimo, massimo e quella di mezzo più lunghe

/**
 * Crea una manopola dentro `contenitore`.
 * @param {Element} contenitore
 * @param {{ valore?: number, min?: number, max?: number, passo?: number, passoGrande?: number,
 *   etichetta?: string, testoValore?: (v: number) => string, dimensione?: number,
 *   onCambia?: (v: number) => void, onRifiuto?: () => void }} [opzioni]
 *   testoValore: come leggere il valore ai lettori di schermo; dimensione: il diametro in px;
 *   onCambia: il valore nuovo (intero) quando la gira l'utente; onRifiuto: ha provato a girarla da spenta.
 */
export function creaManopola(
  contenitore,
  {
    valore = 50,
    min = 0,
    max = 100,
    passo = 1,
    passoGrande = 10,
    etichetta = "Volume",
    testoValore = (v) => (v === min ? "muto" : `${v} per cento`),
    dimensione,
    onCambia,
    onRifiuto,
  } = {},
) {
  const zona = document.createElement("div");
  zona.className = "hf-manopola-zona";
  zona.innerHTML = `<svg class="hf-manopola-quadrante" viewBox="-50 -50 100 100" aria-hidden="true" focusable="false"></svg>
    <div class="hf-manopola" role="slider" tabindex="0">
      <div class="hf-manopola-faccia"></div>
      <div class="hf-manopola-rotore"><div class="hf-zigrinatura"></div><div class="hf-tacca"></div></div>
    </div>`;
  if (dimensione) zona.style.setProperty("--hf-manopola-d", `${dimensione}px`);
  const quadrante = /** @type {SVGSVGElement} */ (zona.querySelector("svg"));
  const manopola = /** @type {HTMLElement} */ (zona.querySelector(".hf-manopola"));
  const rotore = /** @type {HTMLElement} */ (zona.querySelector(".hf-manopola-rotore"));
  manopola.setAttribute("aria-label", etichetta);
  manopola.setAttribute("aria-valuemin", String(min));
  manopola.setAttribute("aria-valuemax", String(max));

  // Il quadrante: le tacche attorno, da -135° a +135°.
  for (let k = 0; k < TACCHE; k++) {
    const a = (angoloManopola(min + ((max - min) * k) / (TACCHE - 1), min, max) * Math.PI) / 180;
    const lunga = k % 5 === 0;
    const linea = document.createElementNS(NS, "line");
    const [r1, r2] = [44, lunga ? 49.5 : 48];
    linea.setAttribute("x1", (r1 * Math.sin(a)).toFixed(2));
    linea.setAttribute("y1", (-r1 * Math.cos(a)).toFixed(2));
    linea.setAttribute("x2", (r2 * Math.sin(a)).toFixed(2));
    linea.setAttribute("y2", (-r2 * Math.cos(a)).toFixed(2));
    linea.setAttribute("stroke", "currentColor");
    linea.setAttribute("stroke-width", lunga ? "1.6" : "1.1");
    linea.setAttribute("stroke-linecap", "round");
    quadrante.append(linea);
  }
  contenitore.append(zona);

  let attuale = limita(Math.round(valore), min, max);
  let motivoSpenta = "";
  /** @type {{ a: number, v: number } | null} */
  let trascina = null;

  function mostra() {
    rotore.style.transform = `rotate(${angoloManopola(attuale, min, max).toFixed(1)}deg)`;
    manopola.setAttribute("aria-valuenow", String(attuale));
    manopola.setAttribute("aria-valuetext", motivoSpenta || testoValore(attuale));
  }

  function cambia(v) {
    const n = limita(Math.round(v), min, max);
    if (n === attuale) return;
    attuale = n;
    mostra();
    onCambia?.(n);
  }

  const angoloDito = (/** @type {PointerEvent} */ e) => {
    const r = manopola.getBoundingClientRect();
    return angoloPuntatore(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  };

  manopola.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (motivoSpenta) {
      onRifiuto?.();
      return;
    }
    manopola.setPointerCapture(e.pointerId);
    manopola.focus({ preventScroll: true });
    trascina = { a: angoloDito(e), v: attuale };
  });
  manopola.addEventListener("pointermove", (e) => {
    if (!trascina) return;
    const a = angoloDito(e);
    trascina.v = giraManopola(trascina.v, differenzaAngolo(trascina.a, a), min, max);
    trascina.a = a;
    cambia(trascina.v);
  });
  const lascia = () => {
    trascina = null;
  };
  manopola.addEventListener("pointerup", lascia);
  manopola.addEventListener("pointercancel", lascia);
  manopola.addEventListener("lostpointercapture", lascia);
  manopola.addEventListener(
    "wheel",
    (e) => {
      if (motivoSpenta) return; // spenta: la rotella fa scorrere la pagina, come sempre
      e.preventDefault();
      cambia(attuale + (e.deltaY < 0 ? 2 * passo : -2 * passo));
    },
    { passive: false },
  );
  manopola.addEventListener("keydown", (e) => {
    const v = valoreDaTasto(e.key, attuale, { min, max, passo, passoGrande });
    if (v === null) return;
    e.preventDefault();
    if (motivoSpenta) onRifiuto?.();
    else cambia(v);
  });

  mostra();

  return {
    elemento: zona,
    get valore() {
      return attuale;
    },
    /** Il valore deciso da fuori (non chiama onCambia). */
    imposta(v) {
      const n = limita(Math.round(v), min, max);
      if (n === attuale) return;
      attuale = n;
      mostra();
    },
    /** Spegne la manopola, con il motivo che sentono i lettori di schermo; null la riaccende. */
    spegni(motivo) {
      motivoSpenta = motivo ? String(motivo) : "";
      if (motivoSpenta) manopola.setAttribute("aria-disabled", "true");
      else manopola.removeAttribute("aria-disabled");
      zona.classList.toggle("hf-spenta", Boolean(motivoSpenta));
      trascina = null;
      mostra();
    },
    distruggi() {
      zona.remove();
    },
  };
}
