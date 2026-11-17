// volume.js — il volume del Jukebox: la posizione della manopola (da 0 a 1) e come diventa il
// volume dell'audio. Logica pura: la usano la sessione, il lettore e config.js.

/** Il volume di partenza se non è mai stato toccato: pieno, come prima che ci fosse la manopola. */
export const VOLUME_DEFAULT = 1;

/**
 * Un volume valido, tra 0 e 1. Un valore che non è un numero (un dato salvato rovinato) dà il
 * default: chi lo cambia a mano (sessione.impostaVolume) i valori non validi li ignora prima.
 * @param {unknown} v
 */
export function limitaVolume(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return VOLUME_DEFAULT;
  return Math.min(1, Math.max(0, v));
}

/**
 * Dalla posizione della manopola al volume dell'audio, come i potenziometri degli amplificatori
 * (la "curva logaritmica"): a metà corsa la musica suona a circa metà forza percepita (−12 dB).
 * Con una retta, a metà corsa sembrerebbe ancora quasi piena e tutto si deciderebbe nell'ultimo tratto.
 * @param {number} posizione da 0 a 1
 */
export function curvaVolume(posizione) {
  const p = limitaVolume(posizione);
  return p * p;
}
