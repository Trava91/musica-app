// memoria.js — scrivere nella memoria del telefono (localStorage) senza che un errore passi in
// silenzio. Se lo spazio è finito o la memoria non è disponibile, la scrittura non riesce: qui lo
// si segna nella diagnostica e si prepara l'avviso per l'utente (lo mostra main.js).
//
// Si usa al posto di localStorage.setItem. Le CHIAVI restano scritte dove vivono (config.js,
// dati/): test/contratti.test.mjs le tiene inchiodate.

import { registra } from "./nucleo/diagnostica.js";
import { eSpazioFinito } from "./nucleo/errori.js";

/**
 * Scrive `valore` sotto `chiave`. true se è stato scritto, false se no (e allora l'errore è già
 * nella diagnostica, con l'avviso). `memoria` è localStorage; nei test una finta.
 * @param {string} chiave
 * @param {string} valore
 * @param {{ setItem: (chiave: string, valore: string) => void }} [memoria]
 */
export function scrivi(chiave, valore, memoria) {
  try {
    (memoria ?? globalThis.localStorage).setItem(chiave, valore);
    return true;
  } catch (err) {
    registra("memoria", err, {
      avviso: eSpazioFinito(err)
        ? "La memoria dell'app sul telefono è piena: non riesco a salvare le impostazioni. Libera spazio."
        : "Non riesco a salvare le impostazioni sul telefono.",
    });
    return false;
  }
}
