// navigazione.js — il tasto «indietro» del telefono (e del browser) e la posizione di ogni scheda.
//
// 1. INDIETRO: ogni scheda nuova e ogni finestra aperta è una voce della cronologia del browser, così
//    «indietro» chiude la finestra o torna alla scheda di prima invece di far uscire dall'app. Cosa è
//    successo lo tiene nucleo/percorso.js (una pila, con la logica pura e i suoi test); qui lo si
//    allinea alla cronologia. Le voci della cronologia sono anonime: contano solo quante sono.
//    history.go() è asincrono (il popstate arriva dopo): finché non è arrivato non si tocca altro.
// 2. POSIZIONE: tornando a una scheda la lista scorre dov'era, e la ricerca resta com'era.

import { Percorso } from "../nucleo/percorso.js";
import { $, $$ } from "./base.js";
import { nascondi } from "./finestre.js";

export function collegaNavigazione(app) {
  const percorso = new Percorso();
  let storica = 0; // quante voci ha messo nella cronologia fin qui (oltre alla prima)
  let inAttesa = false; // è partito un history.go(): si aspetta il popstate
  let ferma = false; // si sta applicando un «indietro» dell'utente: non si tocca la cronologia

  const cronologia = (fn) => {
    try {
      fn();
      return true;
    } catch {
      return false; // niente cronologia (pagina in una cornice, anteprima...): l'app funziona senza «indietro»
    }
  };
  cronologia(() => history.replaceState({ jb: 0 }, ""));

  // Allinea la cronologia alla pila: voci in più si aggiungono, voci in meno si tolgono con un solo go().
  const sincronizza = () => {
    if (inAttesa || ferma) return;
    const diff = percorso.profondita - storica;
    if (diff > 0) {
      for (let i = 1; i <= diff; i++) if (!cronologia(() => history.pushState({ jb: storica + i }, ""))) return;
      storica += diff;
    } else if (diff < 0) {
      inAttesa = cronologia(() => history.go(diff));
    }
  };

  // Una voce tolta dall'utente: la finestra si chiude, la scheda si lascia.
  const applica = ({ tolta, scheda }) => {
    if (tolta.tipo === "finestra") chiudiFinestraDaIndietro(tolta.id);
    else if (scheda) app.stato.cambia({ scheda: scheda.scheda, ...(scheda.extra ? { artista: scheda.extra } : {}) });
  };

  window.addEventListener("popstate", (e) => {
    storica = Number(e.state?.jb) || 0;
    if (inAttesa) {
      inAttesa = false;
      sincronizza(); // nel frattempo può essere cambiato altro
      return;
    }
    // «indietro» (o «avanti», che qui rimbalza: la pila non ha un dopo)
    ferma = true;
    while (percorso.profondita > storica) {
      const r = percorso.indietro();
      if (!r) break;
      applica(r);
    }
    ferma = false;
    sincronizza();
  });

  // --- le schede (e la loro posizione) ---
  // A scorrere non è la pagina ma la colonna delle sezioni (#schermi) o, sul telefono, la scheda Suona.
  const scorre = (scheda) => $(scheda === "riproduzione" ? "#suona" : "#schermi");
  const posizioni = new Map(); // scheda → quanto era scesa la sua colonna
  let chiave = null;
  let ripristino = false; // si sta rimettendo la posizione: gli scroll di assestamento non contano
  // Gli scroll non risalgono: si ascoltano in cattura, su tutta la pagina.
  document.addEventListener(
    "scroll",
    (e) => {
      if (chiave && !ripristino && e.target === scorre(chiave)) posizioni.set(chiave, e.target.scrollTop);
    },
    { capture: true, passive: true },
  );
  app.stato.ascolta((cambiati, s) => {
    if (!s.scheda || !(cambiati.includes("scheda") || cambiati.includes("artista"))) return;
    percorso.vai(s.scheda, s.scheda === "artista" ? s.artista : null);
    sincronizza();
    const nuova = s.scheda === "artista" ? `artista:${s.artista}` : s.scheda;
    if (nuova === chiave) return;
    chiave = nuova;
    const y = posizioni.get(nuova) ?? 0;
    ripristino = true;
    requestAnimationFrame(() => {
      scorre(nuova)?.scrollTo(0, y);
      requestAnimationFrame(() => {
        ripristino = false;
      });
    });
  });

  // --- le finestre: ogni velo che si apre o si chiude (anche dal codice, anche con un tocco fuori) ---
  const osservatore = new MutationObserver((registri) => {
    if (!percorso.scheda) return; // prima che l'app sia partita
    for (const r of registri) {
      const velo = /** @type {HTMLElement} */ (r.target);
      if (velo.hidden) percorso.chiudiFinestra(velo.id);
      else percorso.apriFinestra(velo.id);
    }
    sincronizza();
  });
  for (const velo of $$(".hf-velo")) osservatore.observe(velo, { attributes: true, attributeFilter: ["hidden"] });
}

/** Chiude una finestra come farebbe l'utente: i dialoghi con Esc (così danno la loro risposta), le altre nascondendole. */
function chiudiFinestraDaIndietro(id) {
  const velo = document.getElementById(id);
  if (!velo || velo.hidden) return;
  if (velo.hasAttribute("data-dialogo")) {
    $("#dialogo", velo)?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  } else nascondi(velo);
}
