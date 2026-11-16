// Un catalogo FINTO, con la stessa forma di catalogo.json (contratto v1) e un seme fisso: lo stesso
// seme dà sempre lo stesso catalogo. Serve alle prove di velocità (test/prestazioni.test.mjs: 50.000
// brani) e alla prova nel browser (test/browser/prova.py: 200 brani). Nessun dato reale: artisti e
// titoli sono parole inventate.
//
// Da riga di comando:  node test/genera-catalogo.mjs [quanti brani] [seme]  → stampa il JSON.

import { pathToFileURL } from "node:url";

const MACRO = [
  "Tech house",
  "Deep e melodic",
  "Disco e funky house",
  "Chicago e acid",
  "Techno",
  "Minimal",
  "Disco, funk e soul",
  "Elettronica varia",
  "Hip hop USA",
  "Rap italiano",
  "Reggae, dub e ska",
  "Rock, garage e psichedelia",
  "Swing e rock'n'roll",
  "Jazz e blues",
  "Brasile, latin e Africa",
  "Cantautori e pop italiano",
  "Altro",
];
const TIPI = ["originale", "originale", "originale", "remix", "edit", "extended", "live"];
const CAMELOT = ["1A", "2A", "3A", "4A", "5A", "6A", "7A", "8A", "9A", "10A", "11A", "12A", "8B", "9B", "5B"];
const SILLABE =
  "ba be bi bo bu ca ce ci co cu da de di do du fa fe fi fo fu ga ge gi go la le li lo lu ma me mi mo mu na ne ni no nu pa pe pi po pu ra re ri ro ru sa se si so su ta te ti to tu va ve vi vo za ze zi zo".split(
    " ",
  );
const ALFABETO = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// Generatore pseudo-casuale con seme (mulberry32): stesso seme, stessa sequenza.
function mulberry32(seme) {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {{ n?: number, seme?: number }} [opzioni] n: quanti brani; seme: per ripetere lo stesso catalogo.
 * @returns {{ catalogo: any, vocabolario: string[], artisti: string[] }} il catalogo (come catalogo.json) e,
 *   a parte, le parole e gli artisti inventati usati (per scegliere cosa cercare nelle prove).
 */
export function generaCatalogo({ n = 50_000, seme = 20261114 } = {}) {
  const rand = mulberry32(seme);
  const intero = (max) => Math.floor(rand() * max);
  const scegli = (elenco) => elenco[intero(elenco.length)];
  const forse = (probabilita) => rand() < probabilita;
  const parola = (min, max) => {
    let s = "";
    for (let i = min + intero(max - min + 1); i > 0; i--) s += scegli(SILLABE);
    return s;
  };
  const maiuscola = (p) => p[0].toUpperCase() + p.slice(1);
  const casuale = (lunghezza) => Array.from({ length: lunghezza }, () => scegli([...ALFABETO])).join("");

  const vocabolario = Array.from({ length: 800 }, () => parola(2, 4));
  const artisti = Array.from(
    { length: Math.max(20, Math.round(n / 12)) },
    () => `${maiuscola(scegli(vocabolario))} ${maiuscola(scegli(vocabolario))}`,
  );
  const raccolte = Array.from({ length: 137 }, (_, i) => [
    `Raccolta ${i + 1}`,
    scegli(["mia", "like", "seguita"]),
    scegli(["sp", "yt", "sc", "lo"]),
  ]);

  const brani = [];
  for (let i = 0; i < n; i++) {
    const tipo = scegli(TIPI);
    const brano = {
      id: (0x100000000000 + i).toString(16), // 12 cifre esadecimali, come gli id veri
      o: `o-${i}`,
      a: scegli(artisti),
      t: Array.from({ length: 1 + intero(3) }, () => maiuscola(scegli(vocabolario))).join(" "),
      k: tipo,
    };
    if (tipo !== "originale") brano.v = `${maiuscola(scegli(vocabolario))} ${tipo}`;
    if (forse(0.05)) brano.f = `${maiuscola(scegli(vocabolario))} ${maiuscola(scegli(vocabolario))}`;
    if (forse(0.87)) brano.g = intero(MACRO.length);
    if (forse(0.3)) brano.gf = `${scegli(vocabolario)}, ${scegli(vocabolario)}`;
    if (forse(0.7)) brano.y = 1970 + intero(57);
    if (forse(0.4)) brano.d = 120 + intero(420);
    if (forse(0.6)) {
      brano.b = 80 + intero(80) + (forse(0.5) ? 0.5 : 0);
      brano.c = scegli(CAMELOT);
      brano.e = Math.round(rand() * 100) / 100;
    }
    if (forse(0.42)) brano.x = 1;
    const fonti = [];
    if (forse(0.6)) fonti.push(["sp", casuale(22)]);
    if (forse(0.5)) fonti.push(["yt", casuale(11)]);
    if (forse(0.15)) fonti.push(["sc", `https://soundcloud.com/${scegli(vocabolario)}/${scegli(vocabolario)}`]);
    if (!fonti.length) fonti.push(["yt", casuale(11)]);
    brano.s = fonti;
    brano.r = Array.from({ length: 1 + intero(4) }, () => intero(raccolte.length));
    if (forse(0.8)) brano.q = `20${20 + intero(7)}-0${1 + intero(9)}-1${intero(10)}`;
    brani.push(brano);
  }

  const catalogo = { schema: 1, costruito_il: "2000-01-01", macro: MACRO, raccolte, brani, rinominati: {} };
  return { catalogo, vocabolario, artisti };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const n = Number(process.argv[2] ?? 200);
  const seme = Number(process.argv[3] ?? 1);
  process.stdout.write(JSON.stringify(generaCatalogo({ n, seme }).catalogo));
}
