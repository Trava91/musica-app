// aggiornamento.js — il service worker (l'app che funziona anche senza rete) e l'avviso "Versione
// nuova pronta". Il service worker nuovo prende il posto del vecchio da solo (sw.js: skipWaiting +
// claim): la pagina già aperta però continua col codice vecchio finché non si ricarica, quindi
// si offre il tasto "Aggiorna".

import { DURATA_AVVISO_AGGIORNAMENTO_MS } from "../config.js";
import { mostraAvviso } from "./base.js";

export function registraServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  // Alla prima installazione il service worker "prende il controllo" senza che ci sia nulla da
  // aggiornare: solo dai cambi successivi (c'era già un controllore) si avvisa.
  let eraControllata = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (eraControllata) {
      mostraAvviso("Versione nuova pronta.", "ok", {
        actionLabel: "Aggiorna",
        onAction: () => window.location.reload(),
        duration: DURATA_AVVISO_AGGIORNAMENTO_MS,
      });
    }
    eraControllata = true;
  });

  navigator.serviceWorker
    .register("sw.js")
    .then((registrazione) => {
      // Un'app installata resta aperta per giorni: ogni volta che si torna a guardarla si
      // controlla se c'è una versione nuova.
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) return;
        registrazione.update().catch(() => {
          /* senza rete non si può controllare: si riproverà al prossimo ritorno */
        });
      });
    })
    .catch(() => {
      /* offline al primo avvio: non è un errore da mostrare */
    });
}
