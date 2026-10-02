// motori.js — decide CHI suona ogni brano, e come si organizza una playlist tra
// più motori di riproduzione. Logica pura: nessun accesso a rete, DOM o Media
// Session (quello è lettore.js/spotify.js, dalla M2/M5 in poi).
//
// ctx descrive lo stato del telefono in questo momento:
//   { fileIds: Set<string>   id dei brani che hanno il file audio sul telefono (M2, file.js)
//     spotify: "premium" | "senza" | "non-configurato" | "da-ricollegare"  (M5)
//     usaNewPipe: bool       impostazione dell'utente (default true)
//     priorita: string[] }   ordine dei motori, da config.leggiPreferenzaMotori()

import { MOTORI_DEFAULT } from "./config.js";

// I motori che suonano SENZA che il Jukebox resti in primo piano (schermo spento
// compreso). Sono l'unica scelta sensata per una playlist "solo schermo spento".
export const MOTORI_CONTINUI = new Set(["file", "spotify-premium"]);

function fonte(brano, codice) {
  return brano.s.find(([c]) => c === codice);
}

/**
 * Sceglie il motore che suona `brano` adesso, secondo l'ordine di priorità
 * (ctx.priorita, o il default della scelta 3 del piano) e cosa è davvero
 * disponibile in questo momento. { motore: null } solo se il brano non ha
 * nessuna fonte utilizzabile (non dovrebbe capitare: ne ha sempre almeno una).
 */
export function motoreBrano(brano, ctx = {}) {
  const priorita = ctx.priorita?.length ? ctx.priorita : MOTORI_DEFAULT;
  for (const motore of priorita) {
    if (motore === "file") {
      if (ctx.fileIds?.has(brano.id)) return { motore, fonte: ["file", brano.id] };
    } else if (motore === "spotify-premium") {
      const f = fonte(brano, "sp");
      if (f && ctx.spotify === "premium") return { motore, fonte: f };
    } else if (motore === "newpipe") {
      if (ctx.usaNewPipe === false) continue;
      const f = fonte(brano, "yt") || fonte(brano, "sc");
      if (f) return { motore, fonte: f };
    } else if (motore === "spotify-app") {
      const f = fonte(brano, "sp");
      if (f) return { motore, fonte: f };
    } else if (motore === "web") {
      const f = brano.s.find(([c]) => c !== "lo"); // qualunque fonte con un indirizzo web
      if (f) return { motore, fonte: f };
    }
  }
  return { motore: null, fonte: null };
}

/**
 * Il "piano di riproduzione" di una playlist: quanti brani coprirebbe ciascun
 * motore e quale conviene avviare. Una playlist suona con UN SOLO motore alla
 * volta (scelta 4 del piano): a schermo spento il Jukebox non può aprire
 * un'altra app quando il motore cambia, quindi mischiarli fermerebbe la coda.
 */
export function pianoRiproduzione(elenco, ctx = {}) {
  const perMotore = new Map();
  const sceltoPerBrano = new Map();
  for (const b of elenco) {
    const { motore, fonte: f } = motoreBrano(b, ctx);
    sceltoPerBrano.set(b.id, motore);
    if (!motore) continue;
    if (!perMotore.has(motore)) perMotore.set(motore, { motore, n: 0, continuo: MOTORI_CONTINUI.has(motore), brani: [] });
    const g = perMotore.get(motore);
    g.n++;
    g.brani.push({ brano: b, fonte: f });
  }
  const gruppi = [...perMotore.values()].sort((a, b) => b.n - a.n);
  const continui = gruppi.filter((g) => g.continuo);
  const consigliato = (continui[0] || gruppi[0] || null)?.motore || null;
  const esclusi = elenco.filter((b) => !sceltoPerBrano.get(b.id));
  return { gruppi, consigliato, esclusi };
}
