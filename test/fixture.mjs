// Catalogo inventato di test (test/fixture.json), già indicizzato. Nessun dato reale.
// Ogni file di test gira in un processo suo, quindi l'indice si prepara una volta per file.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { preparaIndice } from "../js/nucleo/cerca.js";

const cartella = dirname(fileURLToPath(import.meta.url));

/** Il testo grezzo di fixture.json, come lo manderebbe GitHub. */
export const testoFixture = readFileSync(join(cartella, "fixture.json"), "utf-8");

export const fixture = JSON.parse(testoFixture);
preparaIndice(fixture.brani, fixture.raccolte);

export const brani = fixture.brani;

/** Gli id di un elenco di brani. */
export const ids = (elenco) => elenco.map((b) => b.id);
