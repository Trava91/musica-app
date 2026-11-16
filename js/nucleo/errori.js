// errori.js — gli errori detti a parole, con cosa fare. Logica pura: riconosce gli errori da
// come sono fatti (il campo `kind` di ApiError, il nome di QuotaExceededError), senza importarne
// il codice, così resta separata da dati/.

/** L'errore è "il token non va" (scaduto, sbagliato o senza permessi). */
export function eErroreAccesso(err) {
  return err?.kind === "auth";
}

/** Lo spazio del telefono è finito (Cache Storage o localStorage). */
export function eSpazioFinito(err) {
  return err?.name === "QuotaExceededError" || err?.code === 22 || err?.code === 1014;
}

/** Il messaggio da mostrare quando il Jukebox non riesce a leggere i dati all'avvio. */
export function testoErroreAvvio(err) {
  if (eErroreAccesso(err)) return `${err.message} Controlla il token: puoi cambiarlo qui sotto.`;
  if (err?.kind === "network") return `${err.message || "Rete assente."} Riprova quando torna la connessione.`;
  return err?.message || "Non riesco a caricare i dati.";
}

/**
 * Perché un salvataggio (o una cancellazione) di playlist non è andato a buon fine, e cosa fare.
 * @param {any} err
 * @param {string} [ripiego]  la frase se non si capisce la causa
 */
export function testoErroreScrittura(err, ripiego = "Salvataggio non riuscito.") {
  if (eSpazioFinito(err)) return "Lo spazio del telefono è finito: libera spazio e riprova.";
  if (err?.kind === "network")
    return "Rete assente: la modifica non è stata salvata. Riprova quando torna la connessione.";
  if (eErroreAccesso(err))
    return "Il token è scaduto o non può scrivere: cambialo da Altro → Cambia token, poi riprova.";
  if (err?.kind === "conflict") {
    return "Le playlist sono cambiate altrove nello stesso momento: riprova tra poco.";
  }
  return err?.message ? `${ripiego} ${err.message}` : ripiego;
}
