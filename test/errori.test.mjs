// Test di js/nucleo/errori.js: gli errori detti a parole, con cosa fare.

import assert from "node:assert/strict";
import { test } from "node:test";
import { eErroreAccesso, eSpazioFinito, testoErroreAvvio, testoErroreScrittura } from "../js/nucleo/errori.js";

const conKind = (kind, message = "m") => Object.assign(new Error(message), { kind });
const spazio = () => Object.assign(new Error("quota"), { name: "QuotaExceededError" });

test("eErroreAccesso: solo l'errore di tipo auth", () => {
  assert.equal(eErroreAccesso(conKind("auth")), true);
  assert.equal(eErroreAccesso(conKind("network")), false);
  assert.equal(eErroreAccesso(null), false);
});

test("eSpazioFinito: QuotaExceededError e i codici dei browser vecchi", () => {
  assert.equal(eSpazioFinito(spazio()), true);
  assert.equal(eSpazioFinito({ code: 22 }), true);
  assert.equal(eSpazioFinito({ code: 1014 }), true);
  assert.equal(eSpazioFinito(new Error("altro")), false);
  assert.equal(eSpazioFinito(undefined), false);
});

test("testoErroreScrittura: rete assente, token, conflitto, spazio: ognuno dice cosa fare", () => {
  assert.match(testoErroreScrittura(conKind("network")), /Rete assente.*non è stata salvata.*Riprova/);
  assert.match(testoErroreScrittura(conKind("auth")), /Cambia token/);
  assert.match(testoErroreScrittura(conKind("conflict")), /cambiate altrove.*riprova/);
  assert.match(testoErroreScrittura(spazio()), /spazio del telefono è finito.*libera spazio/);
});

test("testoErroreScrittura: un errore sconosciuto riporta il suo messaggio dopo la frase di ripiego", () => {
  assert.equal(
    testoErroreScrittura(new Error("boom"), "Eliminazione non riuscita."),
    "Eliminazione non riuscita. boom",
  );
  assert.equal(testoErroreScrittura(new Error("")), "Salvataggio non riuscito.");
  assert.equal(testoErroreScrittura(undefined), "Salvataggio non riuscito.");
});

test("testoErroreAvvio: accesso, rete e il resto", () => {
  assert.equal(
    testoErroreAvvio(conKind("auth", "Token errato o scaduto.")),
    "Token errato o scaduto. Controlla il token: puoi cambiarlo qui sotto.",
  );
  assert.equal(
    testoErroreAvvio(conKind("network", "Nessuna connessione.")),
    "Nessuna connessione. Riprova quando torna la connessione.",
  );
  assert.equal(testoErroreAvvio(new Error("Il catalogo non è un file valido.")), "Il catalogo non è un file valido.");
  assert.equal(testoErroreAvvio(undefined), "Non riesco a caricare i dati.");
});
