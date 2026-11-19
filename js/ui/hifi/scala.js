// scala.js — la scala del sintonizzatore: una fila di "stazioni" su un vetro retroilluminato.
// Le stazioni sono generiche, {id, nome, dettaglio, descrizione?}: oggi i generi e le playlist,
// domani le stanze della social radio. role="radiogroup": si sceglie toccando, con le frecce,
// Pagina su/giù, Inizio e Fine; l'indice rosso va sulla stazione scelta e la scala scorre per
// tenerla al centro. Col dito la scala si fa scorrere liberamente.
//
//   const s = creaScala(contenitore, { etichetta: "Generi", stazioni, scelta: "swing", onScegli: (st) => … });
//   s.stazioni(nuove, "rock");   // un elenco nuovo (e quella scelta)
//   s.imposta("pop");            // la scelta decisa da fuori (non chiama onScegli)

import { indiceDaTasto } from "./calcoli.js";
import { movimentoRidotto } from "./comune.js";

/**
 * @typedef {{ id: string, nome: string, dettaglio?: string, descrizione?: string }} Stazione
 *   descrizione: cosa sentono i lettori di schermo (di default "nome dettaglio"; deve contenere la scritta visibile).
 */

/**
 * Crea una scala dentro `contenitore`.
 * @param {Element} contenitore
 * @param {{ stazioni?: Stazione[], scelta?: string | null, etichetta?: string, vuota?: string,
 *   onScegli?: (stazione: Stazione) => void }} [opzioni]
 *   etichetta: il nome del gruppo per i lettori di schermo; vuota: la scritta se non ci sono stazioni.
 */
export function creaScala(
  contenitore,
  { stazioni = [], scelta = null, etichetta = "Stazioni", vuota = "Nessuna stazione", onScegli } = {},
) {
  const vetro = document.createElement("div");
  vetro.className = "hf-scala";
  const nastro = document.createElement("div");
  nastro.className = "hf-scala-nastro";
  nastro.setAttribute("role", "radiogroup");
  nastro.setAttribute("aria-label", etichetta);
  const indice = document.createElement("div");
  indice.className = "hf-scala-indice";
  indice.setAttribute("aria-hidden", "true");
  vetro.append(nastro);
  contenitore.append(vetro);

  /** @type {Stazione[]} */
  let elenco = [];
  /** @type {HTMLButtonElement[]} */
  let tasti = [];
  let scelto = -1;

  function disegna(lista, idScelto) {
    elenco = (lista ?? []).map((s) => ({
      id: String(s.id),
      nome: String(s.nome ?? ""),
      dettaglio: s.dettaglio === undefined || s.dettaglio === null ? "" : String(s.dettaglio),
      descrizione: s.descrizione,
    }));
    tasti = elenco.map((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "hf-stazione";
      b.setAttribute("role", "radio");
      b.dataset.id = s.id;
      // Il nome contiene la scritta visibile («nome dettaglio», in quest'ordine): chi comanda a voce dice quella.
      b.setAttribute("aria-label", s.descrizione || (s.dettaglio ? `${s.nome} ${s.dettaglio}` : s.nome));
      const nome = document.createElement("span");
      nome.className = "hf-st-nome";
      nome.textContent = s.nome;
      b.append(nome);
      if (s.dettaglio) {
        b.append(" "); // uno spazio fra le due scritte: il testo visibile è «nome dettaglio»
        const dettaglio = document.createElement("span");
        dettaglio.className = "hf-st-dettaglio";
        dettaglio.textContent = s.dettaglio;
        b.append(dettaglio);
      }
      return b;
    });
    if (elenco.length) nastro.replaceChildren(indice, ...tasti);
    else {
      const p = document.createElement("p");
      p.className = "hf-scala-vuota";
      p.textContent = vuota;
      nastro.replaceChildren(p);
    }
    scelto = elenco.findIndex((s) => s.id === String(idScelto));
    segna();
    posiziona(false);
  }

  // Una sola stazione si raggiunge col tasto Tab (quella scelta, o la prima): tra le altre ci si
  // muove con le frecce, come in un gruppo di pulsanti di scelta.
  function segna() {
    const conFuoco = Math.max(scelto, 0);
    tasti.forEach((b, k) => {
      b.setAttribute("aria-checked", String(k === scelto));
      b.tabIndex = k === conFuoco ? 0 : -1;
    });
  }

  function posiziona(liscio) {
    const b = tasti[scelto];
    indice.hidden = !b;
    if (!b) return;
    const x = b.offsetLeft + b.offsetWidth / 2;
    indice.style.setProperty("--hf-x", `${x}px`);
    vetro.scrollTo({ left: x - vetro.clientWidth / 2, behavior: liscio && !movimentoRidotto() ? "smooth" : "auto" });
  }

  function scegli(i, { fuoco = false, avvisa = true, liscio = true } = {}) {
    if (i < 0 || i >= elenco.length) return;
    const cambiata = i !== scelto;
    scelto = i;
    segna();
    if (fuoco) tasti[i].focus({ preventScroll: true });
    posiziona(liscio);
    if (cambiata && avvisa) onScegli?.({ ...elenco[i] });
  }

  nastro.addEventListener("click", (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest?.(".hf-stazione");
    if (b) scegli(tasti.indexOf(/** @type {HTMLButtonElement} */ (b)));
  });
  nastro.addEventListener("keydown", (e) => {
    const i = indiceDaTasto(e.key, scelto, elenco.length);
    if (i === null) return;
    e.preventDefault();
    scegli(i, { fuoco: true });
  });

  // Se cambia la larghezza (rotazione del telefono, finestra del PC) l'indice torna al suo posto.
  const ridimensiona = new ResizeObserver(() => posiziona(false));
  ridimensiona.observe(vetro);
  disegna(stazioni, scelta);

  return {
    elemento: vetro,
    /** Un elenco nuovo di stazioni, con quella scelta (id, o null). */
    stazioni: disegna,
    /**
     * La stazione scelta decisa da fuori (non chiama onScegli). Un id che non c'è (o null) toglie la
     * scelta: nessuna stazione sintonizzata, l'indice sparisce.
     */
    imposta(id, { liscio = true } = {}) {
      const i = elenco.findIndex((s) => s.id === String(id));
      if (i >= 0) {
        scegli(i, { avvisa: false, liscio });
        return;
      }
      scelto = -1;
      segna();
      posiziona(false);
    },
    get scelta() {
      return elenco[scelto]?.id ?? null;
    },
    distruggi() {
      ridimensiona.disconnect();
      vetro.remove();
    },
  };
}
