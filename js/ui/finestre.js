// finestre.js — il comportamento comune delle finestre a comparsa (i veli .hf-velo: scheda del brano,
// Filtri, costruttore, domande…). Aprire e chiudere una finestra passa SEMPRE da qui (mostra e
// nascondi), così succedono tutte e quattro le cose che servono a chi usa la tastiera o uno
// screen reader:
//   1. il fuoco entra nella finestra (i dialoghi lo mettono da soli sul loro primo tasto);
//   2. dietro la finestra tutto è inerte: il fuoco non può uscirne e chi legge lo schermo non ci va;
//   3. Tab gira dentro la finestra, Esc la chiude (i dialoghi gestiscono Esc da soli: danno una risposta);
//   4. alla chiusura il fuoco torna al tasto che l'aveva aperta.
// Con più finestre una sopra l'altra (un dialogo sopra la scheda del brano) è attiva solo l'ultima.

/** @type {Map<HTMLElement, Element | null>} velo → chi aveva il fuoco quando si è aperto */
const aperte = new Map();

const veli = () => [...document.querySelectorAll(".hf-velo")];

// Solo l'ultima finestra aperta (e nulla dietro): inert toglie il resto da Tab e dallo screen reader.
function aggiornaInerzia() {
  const cima = veli()
    .filter((v) => !v.hidden)
    .at(-1);
  document.getElementById("app")?.toggleAttribute("inert", Boolean(cima));
  for (const v of veli()) v.toggleAttribute("inert", Boolean(cima) && v !== cima);
}

/** Apre una finestra: il fuoco ci entra, dietro tutto diventa inerte. */
export function mostra(velo) {
  if (!velo.hidden) return;
  aperte.set(velo, document.activeElement);
  velo.hidden = false;
  aggiornaInerzia();
  if (!velo.hasAttribute("data-dialogo")) {
    // Il fuoco va sulla finestra stessa (senza anello: è programmatico): chi legge lo schermo sente il
    // titolo, e il primo Tab arriva sul primo controllo.
    const finestra = /** @type {HTMLElement | null} */ (velo.querySelector(".hf-finestra"));
    if (finestra) {
      finestra.tabIndex = -1;
      finestra.focus({ preventScroll: true });
    }
  }
}

/** Chiude una finestra: il fuoco torna dov'era (se quel tasto c'è ancora). */
export function nascondi(velo) {
  if (velo.hidden) return;
  velo.hidden = true;
  aggiornaInerzia();
  const prima = aperte.get(velo);
  aperte.delete(velo);
  if (prima instanceof HTMLElement && prima.isConnected) prima.focus({ preventScroll: true });
}

// Quello che si raggiunge con Tab dentro una finestra.
const FOCALIZZABILI = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';
function focalizzabili(radice) {
  return [...radice.querySelectorAll(FOCALIZZABILI)].filter(
    (el) => !el.disabled && !el.closest("[hidden]") && el.getClientRects().length > 0,
  );
}

/** Esc e Tab con una finestra aperta. Da chiamare una volta all'avvio. */
export function collegaTastieraFinestre() {
  document.addEventListener("keydown", (e) => {
    const cima = veli()
      .filter((v) => !v.hidden)
      .at(-1);
    if (!cima || e.defaultPrevented) return;
    if (e.key === "Escape" && !cima.hasAttribute("data-dialogo")) {
      e.preventDefault();
      nascondi(cima);
      return;
    }
    if (e.key !== "Tab") return;
    const finestra = cima.querySelector(".hf-finestra");
    const fuochi = finestra ? focalizzabili(finestra) : [];
    if (!finestra || !fuochi.length) {
      e.preventDefault();
      return;
    }
    const attivo = document.activeElement;
    const fuori = !finestra.contains(attivo) || attivo === finestra;
    if (e.shiftKey && (fuori || attivo === fuochi[0])) {
      e.preventDefault();
      fuochi.at(-1)?.focus();
    } else if (!e.shiftKey && (fuori ? attivo !== finestra : attivo === fuochi.at(-1))) {
      e.preventDefault();
      fuochi[0].focus();
    }
  });
}
