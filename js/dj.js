// dj.js — logica pura di teoria armonica e BPM. Nucleo scritto in M1, per l'ordine
// "armonico" delle playlist (regole.js). Sarà esteso in M4 con suggerisci() e
// scaletta() per l'assistente DJ vero e proprio: stesse regole, uso diverso.

export const TOLLERANZA_BPM = 0.06;

// Legge una notazione Camelot ("8A") in {n: 1-12, l: "A"|"B"}. null se non valida.
export function camelot(c) {
  if (!c) return null;
  const m = /^(\d{1,2})\s*([ABab])$/.exec(String(c).trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n < 1 || n > 12) return null;
  return { n, l: m[2].toUpperCase() };
}

function distanzaCiclica(a, b) {
  const d = Math.abs(a - b) % 12;
  return Math.min(d, 12 - d);
}

// Quanto due tonalità Camelot vanno bene in sequenza: 3 uguale, 2 adiacente o
// relativa (maggiore/minore), 1 "+2" o diagonale, 0 altrimenti (o dati mancanti).
export function livelloChiave(a, b) {
  const ca = camelot(a), cb = camelot(b);
  if (!ca || !cb) return 0;
  if (ca.n === cb.n && ca.l === cb.l) return 3;
  const dist = distanzaCiclica(ca.n, cb.n);
  if (ca.l === cb.l && dist === 1) return 2;      // adiacente
  if (ca.n === cb.n && ca.l !== cb.l) return 2;    // relativa
  if (ca.l === cb.l && dist === 2) return 1;       // +2
  if (ca.l !== cb.l && dist === 1) return 1;       // diagonale
  return 0;
}

// Scarto relativo minimo di BPM tra a e b: |b/a - 1|, e con metaDoppio anche
// confrontando b al doppio o alla metà. Compatibile se il risultato è ≤ TOLLERANZA_BPM.
export function scartoBpm(a, b, { metaDoppio = false } = {}) {
  if (!a || !b) return Infinity;
  const rel = (r) => Math.abs(r - 1);
  const candidati = [rel(b / a)];
  if (metaDoppio) candidati.push(rel((2 * b) / a), rel(b / (2 * a)));
  return Math.min(...candidati);
}

export function compatibileBpm(a, b, opts) {
  return scartoBpm(a, b, opts) <= TOLLERANZA_BPM;
}

function energiaVerso(ea, eb) {
  // "vicina o in salita": 1 se sale di poco o resta ferma, cala se scende o
  // se il salto è grande. Con energia mancante, punteggio neutro.
  if (ea === undefined || eb === undefined) return 0.5;
  const d = eb - ea;
  return d >= 0 ? Math.max(0, 1 - d) : Math.max(0, 1 - Math.abs(d) * 2);
}

/**
 * Ordina i brani di una playlist in un percorso armonico: BPM e tonalità vicini
 * passo dopo passo, come in un set. I brani senza BPM+Camelot restano fuori dal
 * percorso e vanno in coda, in ordine alfabetico (servono comunque _normA/_normT,
 * quindi vanno passati brani già indicizzati con cerca.preparaIndice).
 */
export function percorsoArmonico(brani, { inizio } = {}) {
  const conDati = brani.filter((b) => b.b !== undefined && b.c !== undefined);
  const senzaDati = brani
    .filter((b) => b.b === undefined || b.c === undefined)
    .sort((a, b) => (a._normA || "").localeCompare(b._normA || "") || (a._normT || "").localeCompare(b._normT || ""));
  if (!conDati.length) return senzaDati;

  const rimasti = new Set(conDati);
  let corrente = inizio && rimasti.has(inizio)
    ? inizio
    : conDati.reduce((min, b) => (b.b < min.b ? b : min), conDati[0]);
  rimasti.delete(corrente);
  const percorso = [corrente];

  while (rimasti.size) {
    let migliore = null;
    let migliorPunteggio = -Infinity;
    for (const cand of rimasti) {
      const scarto = scartoBpm(corrente.b, cand.b);
      const livello = livelloChiave(corrente.c, cand.c);
      if (scarto > TOLLERANZA_BPM || livello < 1) continue;
      const bonusSalita = cand.b >= corrente.b ? 0.05 : 0;
      const p = 0.5 * (livello / 3) + 0.4 * (1 - scarto / TOLLERANZA_BPM + bonusSalita) + 0.1 * energiaVerso(corrente.e, cand.e);
      if (p > migliorPunteggio) { migliorPunteggio = p; migliore = cand; }
    }
    if (!migliore) {
      // Nessuno è compatibile: si riparte dal più vicino per BPM, anche se il salto è brusco.
      migliore = [...rimasti].reduce((best, cand) => (Math.abs(cand.b - corrente.b) < Math.abs(best.b - corrente.b) ? cand : best));
    }
    percorso.push(migliore);
    rimasti.delete(migliore);
    corrente = migliore;
  }
  return [...percorso, ...senzaDati];
}
