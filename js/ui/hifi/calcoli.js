// calcoli.js — i conti dei componenti hi-fi, senza la pagina: angoli e tasti della manopola, tasti
// della scala, velocità del piatto e mosse del braccio, livelli simulati, tempo sul display, colori
// delle etichette dei dischi e contrasti dei colori dello stile. Si provano in test/hifi.test.mjs;
// gli altri file di questa cartella li usano per disegnare.

import { durataFmt } from "../../nucleo/testo.js";

/** @param {number} v @param {number} min @param {number} max */
export const limita = (v, min, max) => Math.max(min, Math.min(max, v));

const due = (/** @type {number} */ n) => String(n).padStart(2, "0");

// ======================================================================= manopola ====
// Come un potenziometro: 270° di corsa, da -135° (minimo, in basso a sinistra) a +135° (massimo).

export const CORSA_MANOPOLA = 270;

/**
 * L'angolo della tacca per un valore: 0 = in alto, positivo in senso orario.
 * @param {number} valore @param {number} min @param {number} max
 */
export function angoloManopola(valore, min, max) {
  return -CORSA_MANOPOLA / 2 + (CORSA_MANOPOLA * (limita(valore, min, max) - min)) / (max - min);
}

/**
 * Dove sta il dito attorno al centro della manopola (dx, dy in pixel dal centro): 0 = in alto,
 * positivo in senso orario, da -180 a 180.
 * @param {number} dx @param {number} dy
 */
export function angoloPuntatore(dx, dy) {
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

/**
 * Di quanto ha girato il dito passando da `da` ad `a` (gradi): il verso più corto, da -180 a 180.
 * Così passare "dietro" la manopola (da 179° a -179°) è un passo di 2°, non un giro intero.
 * @param {number} da @param {number} a
 */
export function differenzaAngolo(da, a) {
  let d = a - da;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * Il valore dopo aver girato la manopola di `gradi`.
 * @param {number} valore @param {number} gradi @param {number} min @param {number} max
 */
export function giraManopola(valore, gradi, min, max) {
  return limita(valore + (gradi * (max - min)) / CORSA_MANOPOLA, min, max);
}

/**
 * Il valore dopo un tasto (frecce ±passo, Pagina su/giù ±passoGrande, Inizio/Fine), o null se il
 * tasto non riguarda la manopola.
 * @param {string} tasto @param {number} valore
 * @param {{ min: number, max: number, passo?: number, passoGrande?: number }} limiti
 */
export function valoreDaTasto(tasto, valore, { min, max, passo = 1, passoGrande = 10 }) {
  /** @type {Record<string, number>} */
  const passi = {
    ArrowUp: passo,
    ArrowRight: passo,
    ArrowDown: -passo,
    ArrowLeft: -passo,
    PageUp: passoGrande,
    PageDown: -passoGrande,
  };
  if (Object.hasOwn(passi, tasto)) return limita(valore + passi[tasto], min, max);
  if (tasto === "Home") return min;
  if (tasto === "End") return max;
  return null;
}

// ======================================================== scala del sintonizzatore ====

/**
 * La stazione scelta dopo un tasto (frecce ±1, Pagina ±salto, Inizio/Fine), o null se il tasto
 * non riguarda la scala. `indice` -1 = nessuna scelta ancora.
 * @param {string} tasto @param {number} indice @param {number} n @param {number} [salto]
 */
export function indiceDaTasto(tasto, indice, n, salto = 5) {
  if (n <= 0) return null;
  /** @type {Record<string, number>} */
  const passi = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, PageDown: salto, PageUp: -salto };
  if (Object.hasOwn(passi, tasto)) return limita(indice + passi[tasto], 0, n - 1);
  if (tasto === "Home") return 0;
  if (tasto === "End") return n - 1;
  return null;
}

// ===================================================================== giradischi ====

export const GIRO_MS = 1800; // un giro del piatto a 33⅓ giri al minuto
export const ACCELERA_S = 1.2; // da fermo a 33⅓
export const FRENA_S = 1.5; // da 33⅓ a fermo

/**
 * La "spinta" del motore (da 0 a 1) dopo `dt` secondi, verso `obiettivo` (1 = gira, 0 = fermo):
 * sale in ACCELERA_S, scende in FRENA_S.
 * @param {number} p @param {number} obiettivo @param {number} dt
 */
export function passoVelocita(p, obiettivo, dt) {
  return obiettivo > p ? Math.min(obiettivo, p + dt / ACCELERA_S) : Math.max(obiettivo, p - dt / FRENA_S);
}

/**
 * La velocità del piatto (1 = 33⅓) per una spinta: parte e si ferma morbida, come un piatto pesante.
 * @param {number} p
 */
export function velocitaDisco(p) {
  const q = limita(p, 0, 1);
  return q * q * (3 - 2 * q);
}

// Gradi del braccio: a riposo sul supporto, sul primo solco, sull'ultimo (vicino all'etichetta).
export const ANGOLO_BRACCIO = { riposo: 0, inizio: 24, fine: 43 };

/**
 * L'angolo del braccio: a riposo se il giradischi è fermo, altrimenti sul disco, sempre più verso
 * il centro man mano che il brano avanza (avanzamento da 0 a 1).
 * @param {string} fase @param {number} avanzamento
 */
export function angoloBraccio(fase, avanzamento) {
  if (fase === "fermo") return ANGOLO_BRACCIO.riposo;
  const a = limita(Number.isFinite(avanzamento) ? avanzamento : 0, 0, 1);
  return ANGOLO_BRACCIO.inizio + (ANGOLO_BRACCIO.fine - ANGOLO_BRACCIO.inizio) * a;
}

/** Il braccio è alzato (sopra il disco, non sul solco) in tutte le fasi tranne "suona" e "fermo". */
export function braccioAlzato(/** @type {string} */ fase) {
  return fase !== "suona" && fase !== "fermo";
}

/**
 * Cosa fa il giradischi quando cambia quello che deve fare. `fase` è quella di adesso: "fermo"
 * (braccio a riposo), "avvio" (braccio che va sul disco), "suona", "pausa" (braccio alzato sul
 * disco), "cambio" (braccio che torna al primo solco per un disco nuovo). `stato` è quello voluto
 * ("suona" | "pausa" | "fermo"); `nuovoBrano` = è cambiato il disco.
 * Restituisce null se non c'è niente da fare, altrimenti la fase in cui entrare, quanto dura lo
 * spostamento del braccio (braccioMs), se con la curva morbida, e la fase seguente (poi) dopo dopoMs.
 * @param {string} fase @param {string} stato @param {boolean} nuovoBrano
 * @returns {{ fase: string, braccioMs: number, curva: boolean, poi?: string, dopoMs?: number } | null}
 */
export function transizioneGiradischi(fase, stato, nuovoBrano) {
  if (stato === "fermo") return fase === "fermo" ? null : { fase: "fermo", braccioMs: 1000, curva: true };
  if (stato === "pausa") {
    if (fase === "pausa" && !nuovoBrano) return null;
    if (fase === "fermo") return { fase: "pausa", braccioMs: 1000, curva: true };
    return { fase: "pausa", braccioMs: nuovoBrano ? 650 : 300, curva: nuovoBrano };
  }
  if (fase === "fermo") return { fase: "avvio", braccioMs: 1000, curva: true, poi: "suona", dopoMs: 1150 };
  if (fase === "pausa") return { fase: "avvio", braccioMs: 300, curva: true, poi: "suona", dopoMs: 650 };
  if (nuovoBrano) return { fase: "cambio", braccioMs: 650, curva: true, poi: "suona", dopoMs: 800 };
  return null; // già in avvio, a suonare o a cambiare disco: si va avanti così
}

// ========================================================== indicatori di livello ====
// Simulati, non misurati (vedi il piano, scelta 7): si muovono in modo credibile mentre suona.

export const SEGMENTI_LIVELLO = 16;
export const PASSO_LIVELLI_MS = 60;
export const TENUTA_PICCO_S = 0.8;

/**
 * Il livello di un canale al tempo `t` (secondi): un'onda lenta, un colpo di cassa ogni mezzo
 * secondo e un po' di rumore (`rumore` da 0 a 1, nell'app Math.random()). Scala col volume della
 * manopola (da 0 a 1). Da 0 a poco più di 1 (gli ultimi segmenti, rossi, sono la saturazione).
 * @param {number} t @param {number} canale @param {number} volume @param {number} rumore
 */
export function livelloSimulato(t, canale, volume, rumore) {
  const tt = t + canale * 0.031;
  const colpo = Math.exp(-((tt % 0.5) / 0.09));
  const onda = 0.5 + 0.12 * Math.sin(tt * 0.9 + canale) + 0.08 * Math.sin(tt * 3.1 + canale * 2);
  const v = limita(volume, 0, 1) ** 0.6;
  return limita((onda + 0.32 * colpo + (rumore - 0.5) * 0.14) * v, 0, 1.05);
}

/**
 * Il livello mostrato: sale subito, scende piano (come la lancetta di un VU).
 * @param {number} mostrato @param {number} voluto @param {number} [caduta]
 */
export function cadutaLivello(mostrato, voluto, caduta = 0.07) {
  return voluto > mostrato ? voluto : Math.max(voluto, mostrato - caduta);
}

/**
 * Quanti segmenti accesi per un livello.
 * @param {number} livello @param {number} [segmenti]
 */
export function segmentiAccesi(livello, segmenti = SEGMENTI_LIVELLO) {
  return limita(Math.round(livello * segmenti), 0, segmenti);
}

/**
 * Il segmento di picco: resta acceso TENUTA_PICCO_S secondi, poi scende al livello di adesso.
 * @param {{ n: number, t: number }} picco @param {number} n @param {number} ora secondi
 */
export function aggiornaPicco(picco, n, ora) {
  return n >= picco.n || ora - picco.t > TENUTA_PICCO_S ? { n, t: ora } : picco;
}

// ========================================================================= display ====

export const FANTASMA_TEMPO = "88:88"; // i segmenti spenti dietro le cifre
export const FANTASMA_TEMPO_ORE = "8:88:88";
export const SOGLIA_SCORRIMENTO_PX = 2; // una riga che sfora di meno resta ferma

/** I brani da un'ora in su (i set) si mostrano con le ore. */
export const servonoOre = (/** @type {number} */ durata) => Number.isFinite(durata) && durata >= 3600;

/**
 * Il tempo per le cifre a segmenti: "m:ss" con una cifra spenta davanti sotto i 10 minuti ("!" in
 * DSEG7 è una cifra spenta: la larghezza resta fissa), "h:mm:ss" con `ore` o oltre i 99:59. I
 * secondi si contano interi (0:59 fino a 1:00, come i lettori veri).
 * @param {number} secondi @param {{ ore?: boolean }} [opzioni]
 */
export function tempoSegmenti(secondi, { ore = false } = {}) {
  const tot = Math.max(0, Math.floor(Number.isFinite(secondi) ? secondi : 0));
  if (ore || tot >= 6000) {
    const h = Math.min(9, Math.floor(tot / 3600));
    return `${h}:${due(Math.floor((tot % 3600) / 60))}:${due(tot % 60)}`;
  }
  const t = durataFmt(tot);
  return t.length < 5 ? `!${t}` : t;
}

/**
 * Il numero di traccia per le cifre a segmenti: almeno due cifre (03), di più se la coda è lunga.
 * @param {number} n
 */
export function cifreTraccia(n) {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

/**
 * Quanto dura un passaggio dello scorrimento di una riga che non ci sta (secondi): circa 26 px al
 * secondo, mai sotto i 5 secondi (a riposo all'inizio e alla fine, poi torna indietro).
 * @param {number} eccesso i pixel che non ci stanno
 */
export function durataScorrimento(eccesso) {
  return Math.max(5, (eccesso + 10) / 26 + 3);
}

// ============================================================= etichette dei dischi ====

// Carta e inchiostro delle etichette: ogni coppia si legge almeno 4,5:1 (test/hifi.test.mjs).
export const ETICHETTE = [
  { carta: "#b8432a", inchiostro: "#fbf1e3" },
  { carta: "#e9dfc7", inchiostro: "#2a2620" },
  { carta: "#24566f", inchiostro: "#f3efe4" },
  { carta: "#d6a13c", inchiostro: "#2b2114" },
  { carta: "#3e7350", inchiostro: "#f4f0e2" },
  { carta: "#6d4380", inchiostro: "#f6eefa" },
  { carta: "#c9c4b8", inchiostro: "#24231f" },
  { carta: "#8c2f39", inchiostro: "#fbefe9" },
];

/**
 * Il colore dell'etichetta di un disco: sempre lo stesso per la stessa chiave (l'id del brano).
 * @param {string} chiave
 */
export function coloreEtichetta(chiave) {
  let h = 2166136261; // FNV-1a
  for (const c of String(chiave ?? "")) {
    h ^= /** @type {number} */ (c.codePointAt(0));
    h = Math.imul(h, 16777619);
  }
  // Rimescolamento finale (quello di MurmurHash3): senza, i bit bassi di FNV dipendono solo dai bit
  // bassi dei caratteri e gli id con le stesse cifre in un altro ordine avrebbero tutti lo stesso colore.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return ETICHETTE[(h >>> 0) % ETICHETTE.length];
}

// ======================================================================= contrasti ====

/**
 * Un colore "#rgb", "#rrggbb" o "rgb(r g b / a)" come [r, g, b, a] (da 0 a 255, a da 0 a 1).
 * @param {string} colore
 * @returns {[number, number, number, number]}
 */
export function leggiColore(colore) {
  const c = String(colore).trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join("") : hex[1];
    const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
    return [r, g, b, 1];
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:\s*[/,]\s*([\d.]+))?\s*\)$/i.exec(c);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
  throw new Error(`Colore che non so leggere: ${colore}`);
}

/**
 * Il colore che si vede stendendo i colori uno sull'altro (il primo è il fondo, opaco; gli altri
 * possono essere trasparenti): come "#rrggbb".
 * @param {string[]} strati
 */
export function componi(strati) {
  let [r, g, b] = leggiColore(strati[0]);
  for (const s of strati.slice(1)) {
    const [r2, g2, b2, a] = leggiColore(s);
    r = r2 * a + r * (1 - a);
    g = g2 * a + g * (1 - a);
    b = b2 * a + b * (1 - a);
  }
  return `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * La luminanza relativa di un colore (WCAG 2).
 * @param {string} colore
 */
export function luminanza(colore) {
  const [r, g, b] = leggiColore(colore).map((x) => {
    const s = x / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Il contrasto tra due colori (WCAG 2): da 1 (uguali) a 21 (nero su bianco).
 * @param {string} a @param {string} b
 */
export function contrasto(a, b) {
  const [chiaro, scuro] = [luminanza(a), luminanza(b)].sort((x, y) => y - x);
  return (chiaro + 0.05) / (scuro + 0.05);
}

// Le coppie di colori dello stile con il contrasto minimo: 4,5:1 per il testo, 3:1 per gli elementi
// grafici (LED, fuoco, indice). I nomi sono i gettoni di css/base.css; il fondo è un elenco di strati
// (un velo trasparente steso su un colore). Le controlla test/gettoni.test.mjs e le mostra
// anteprima/componenti.html. Sul metallo e sul vetro si misura il punto peggiore del fondo.
export const COPPIE_CONTRASTO = [
  { uso: "Scritte sul metallo", testo: "--hf-serigrafia", fondo: ["--hf-alluminio-scuro"], minimo: 4.5 },
  {
    uso: "Scritte secondarie sul metallo",
    testo: "--hf-serigrafia-tenue",
    fondo: ["--hf-alluminio-scuro"],
    minimo: 4.5,
  },
  { uso: "Scritte sulla grafite", testo: "--hf-serigrafia-chiara", fondo: ["--hf-grafite-luce"], minimo: 4.5 },
  { uso: "Testo dei tasti", testo: "--hf-tasto-testo", fondo: ["--hf-tasto-scuro"], minimo: 4.5 },
  { uso: "Tasto principale", testo: "--hf-serigrafia-chiara", fondo: ["--hf-tasto-grafite-luce"], minimo: 4.5 },
  { uso: "Tasto pericoloso", testo: "--hf-pericolo", fondo: ["--hf-tasto-grafite-luce"], minimo: 4.5 },
  { uso: "Display: testo", testo: "--hf-vfd", fondo: ["--hf-vetro-luce"], minimo: 4.5 },
  { uso: "Display: testo tenue", testo: "--hf-vfd-tenue", fondo: ["--hf-vetro-luce"], minimo: 4.5 },
  { uso: "Display: scala dei livelli", testo: "--hf-ambra-tenue", fondo: ["--hf-vetro-luce"], minimo: 4.5 },
  { uso: "Avviso riuscito", testo: "--hf-led-verde", fondo: ["--hf-vetro-luce"], minimo: 4.5 },
  { uso: "Avviso d'errore", testo: "--hf-ambra", fondo: ["--hf-vetro-luce"], minimo: 4.5 },
  { uso: "Scala: generi", testo: "--hf-scala-testo", fondo: ["--hf-scala-vetro", "--hf-scala-bagliore"], minimo: 4.5 },
  { uso: "Scala: numeri", testo: "--hf-scala-numeri", fondo: ["--hf-scala-vetro", "--hf-scala-bagliore"], minimo: 4.5 },
  {
    uso: "Scala: stazione sintonizzata",
    testo: "--hf-scala-acceso",
    fondo: ["--hf-scala-vetro", "--hf-scala-bagliore"],
    minimo: 4.5,
  },
  { uso: "Livelli accesi sul vetro", testo: "--hf-ambra", fondo: ["--hf-vetro-luce"], minimo: 3 },
  { uso: "LED verde: acceso contro spento", testo: "--hf-led-verde", fondo: ["--hf-led-verde-spento"], minimo: 3 },
  {
    uso: "LED arancio: acceso contro spento",
    testo: "--hf-led-arancio",
    fondo: ["--hf-led-arancio-spento"],
    minimo: 3,
  },
  { uso: "Ghiera dei LED sul metallo", testo: "--hf-led-ghiera", fondo: ["--hf-alluminio-scuro"], minimo: 3 },
  {
    uso: "Indice della scala",
    testo: "--hf-scala-indice",
    fondo: ["--hf-scala-vetro", "--hf-scala-bagliore"],
    minimo: 3,
  },
  { uso: "Fuoco sul vetro", testo: "--hf-fuoco", fondo: ["--hf-vetro-luce"], minimo: 3 },
  {
    uso: "Fuoco sul metallo (anello interno)",
    testo: "--hf-fuoco-interno",
    fondo: ["--hf-alluminio-scuro"],
    minimo: 3,
  },
];

/**
 * Le coppie di COPPIE_CONTRASTO misurate con i valori dei gettoni (`valore(nome)` → il colore).
 * @param {(nome: string) => string} valore
 */
export function misuraContrasti(valore) {
  return COPPIE_CONTRASTO.map((c) => {
    const testo = valore(c.testo);
    const fondo = componi(c.fondo.map(valore));
    const rapporto = contrasto(testo, fondo);
    return { ...c, colore: testo, sfondo: fondo, rapporto, regge: rapporto >= c.minimo };
  });
}
