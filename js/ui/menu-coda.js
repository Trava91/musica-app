// menu-coda.js — il menu del "+" su ogni riga: «Suona dopo» (subito dopo il brano in corso) o «In
// fondo alla coda». La scelta passa a sessione.accoda, che sa cosa fare anche senza una coda e
// avvisa da sé. Anche la scheda del brano ha i suoi due tasti (foglio-brano.js).

import { sottotitolo, titoloCompleto } from "../nucleo/testo.js";
import { chiediScelta } from "./dialoghi.js";

export async function apriMenuCoda(app, b) {
  const scelta = await chiediScelta({
    titolo: titoloCompleto(b),
    testo: sottotitolo(b),
    scelte: [
      { etichetta: "Suona dopo", valore: "dopo" },
      { etichetta: "In fondo alla coda", valore: "fondo" },
    ],
  });
  if (scelta) app.sessione.accoda(b, { dopoCorrente: scelta === "dopo" });
}
