// valida.js — controllo dei dati in ingresso: catalogo.json e playlist.json. Logica
// pura (niente DOM, niente rete). Valida SOLO in lettura: i brani sbagliati si
// scartano o si correggono in memoria e si segnalano; l'app non riscrive mai un file
// "ripulito" (si rischierebbe di perdere dati). I doppioni veri li sistema la catena
// del catalogo in liste/, non l'app.
//
// Contratto dei dati: in testa a strumenti/esporta.py (catalogo) e a regole.js (playlist).

/**
 * Un brano del catalogo (contratto v1, in testa a strumenti/esporta.py): campi abbreviati.
 * Dopo questo controllo ogni brano ha `id` e almeno una fonte in `s`.
 * @typedef {object} Brano
 * @property {string} id         impronta delle fonti (può cambiare: vedi la tabella `rinominati`)
 * @property {string[][]} [s]    fonti [codice, riferimento]; codice tra sp, yt, sc, lo
 * @property {string} [a]        artista
 * @property {string} [t]        titolo
 * @property {string} [v]        versione (es. "Extended Mix")
 * @property {string} [k]        tipo di versione (originale, remix, edit, extended, live, set)
 * @property {string} [f]        featuring
 * @property {number} [g]        indice del macro-genere in `macro`
 * @property {string} [gf]       generi fini
 * @property {number} [y]        anno
 * @property {number} [d]        durata in secondi
 * @property {number} [b]        BPM
 * @property {string} [c]        tonalità Camelot
 * @property {number} [e]        energia (0–1)
 * @property {number[]} [r]      indici delle raccolte
 * @property {number} [x]        1 = esplorazione (non scelto da Nicolò)
 * @property {string} [q]        quando è stato aggiunto
 * @property {string} [_normA]   artista normalizzato (lo aggiunge cerca.preparaIndice: è l'id dell'artista)
 * @property {string} [_normT]   titolo normalizzato (idem)
 */

/**
 * Una playlist di playlist.json (forma completa in testa a regole.js).
 * @typedef {object} Playlist
 * @property {string} id
 * @property {string} nome
 * @property {string} tipo      "intelligente" | "manuale"
 * @property {string[]} [brani]  solo le manuali: gli id dei brani
 * @property {object} [regole]   solo le intelligenti: i filtri
 * @property {string} [ordine]
 * @property {number} [seme]
 * @property {number | null} [limite]
 * @property {boolean} [telefono]  da tenere sul telefono (la prepara il PC)
 */

/** Errore bloccante: il file non è un catalogo (o una playlist) che l'app sa leggere. */
export class ErroreDati extends Error {
  constructor(messaggio) {
    super(messaggio);
    this.name = "ErroreDati";
  }
}

const SCHEMA = 1;
const CODICI_FONTE = new Set(["sp", "yt", "sc", "lo"]);
const CAMPI_NUMERICI = ["y", "d", "b", "e"]; // anno, durata, bpm, energia
const TIPI_PLAYLIST = new Set(["intelligente", "manuale"]);

const eTesto = (v) => typeof v === "string" && v.trim() !== "";
const eNumero = (v) => typeof v === "number" && Number.isFinite(v);
const eIndice = (v, lunghezza) => Number.isInteger(v) && v >= 0 && v < lunghezza;
const eOggetto = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
// Una fonte è una coppia [codice, riferimento]: il codice è uno dei quattro noti.
const eFonte = (f) => Array.isArray(f) && f.length >= 2 && CODICI_FONTE.has(f[0]) && eTesto(f[1]);

// "3 brani", "1 brano".
const conta = (n, uno, molti) => `${n.toLocaleString("it-IT")} ${n === 1 ? uno : molti}`;

/**
 * Controlla un catalogo.json già letto (JSON.parse).
 *
 * Restituisce { catalogo, scartati: [{id, motivo}], avvisi: [testo] }:
 * - catalogo: lo stesso catalogo con i brani buoni (quelli corretti sono copie, gli
 *   altri sono gli stessi oggetti di prima); l'originale non viene toccato;
 * - scartati: i brani lasciati fuori (senza id, senza fonti valide, id già visto);
 * - avvisi: le segnalazioni che non fermano nulla (brani senza titolo o artista,
 *   campi corretti, coppie artista+titolo+versione ripetute).
 *
 * Lancia ErroreDati solo se il file nel suo insieme non è leggibile: formato diverso
 * da quello atteso, o brani/generi/raccolte che non sono elenchi.
 */
export function validaCatalogo(dati) {
  if (!eOggetto(dati)) throw new ErroreDati("Il catalogo non è un file valido.");
  if (dati.schema !== SCHEMA) {
    throw new ErroreDati(
      `Il catalogo ha un formato (schema ${dati.schema ?? "assente"}) che questa versione dell'app non conosce: aggiorna l'app.`,
    );
  }
  if (!Array.isArray(dati.brani)) throw new ErroreDati("Il catalogo non contiene l'elenco dei brani.");
  if (!Array.isArray(dati.macro)) throw new ErroreDati("Il catalogo non contiene l'elenco dei generi.");
  if (!Array.isArray(dati.raccolte)) throw new ErroreDati("Il catalogo non contiene l'elenco delle raccolte.");

  const nMacro = dati.macro.length;
  const nRaccolte = dati.raccolte.length;
  const brani = [];
  const scartati = [];
  const idVisti = new Set();
  const coppie = new Map(); // artista + titolo + versione → quante volte
  const n = { senzaTitolo: 0, senzaArtista: 0, fonti: 0, genere: 0, raccolte: 0, numeri: 0 };

  dati.brani.forEach((grezzo, posizione) => {
    if (!eOggetto(grezzo)) {
      scartati.push({ id: null, motivo: `la voce n. ${posizione + 1} non è un brano` });
      return;
    }
    if (!eTesto(grezzo.id)) {
      scartati.push({ id: null, motivo: `senza id (voce n. ${posizione + 1})` });
      return;
    }
    const id = grezzo.id;
    if (idVisti.has(id)) {
      scartati.push({ id, motivo: "id già presente: si tiene il primo" });
      return;
    }
    const fonti = Array.isArray(grezzo.s) ? grezzo.s.filter(eFonte) : [];
    if (!fonti.length) {
      scartati.push({
        id,
        motivo: Array.isArray(grezzo.s) && grezzo.s.length ? "nessuna fonte valida" : "senza fonti",
      });
      return;
    }

    // Copia solo se serve correggere qualcosa: gli altri brani restano gli oggetti di prima.
    let b = grezzo;
    const modificabile = () => {
      if (b === grezzo) b = { ...grezzo };
      return b;
    };
    if (fonti.length !== grezzo.s.length) {
      modificabile().s = fonti;
      n.fonti++;
    }
    if (grezzo.g !== undefined && !eIndice(grezzo.g, nMacro)) {
      delete modificabile().g;
      n.genere++;
    }
    if (grezzo.r === undefined) {
      modificabile().r = [];
    } else if (!Array.isArray(grezzo.r)) {
      modificabile().r = [];
      n.raccolte++;
    } else {
      const valide = grezzo.r.filter((i) => eIndice(i, nRaccolte));
      if (valide.length !== grezzo.r.length) {
        modificabile().r = valide;
        n.raccolte++;
      }
    }
    let numeriSbagliati = false;
    for (const campo of CAMPI_NUMERICI) {
      if (grezzo[campo] !== undefined && !eNumero(grezzo[campo])) {
        delete modificabile()[campo];
        numeriSbagliati = true;
      }
    }
    if (numeriSbagliati) n.numeri++;

    // Tenuti comunque (l'interfaccia mostra un segnaposto), ma segnalati.
    if (!eTesto(b.t)) n.senzaTitolo++;
    if (!eTesto(b.a)) n.senzaArtista++;
    if (eTesto(b.a) || eTesto(b.t)) {
      const chiave = `${b.a ?? ""}\u0001${b.t ?? ""}\u0001${b.v ?? ""}`.toLowerCase();
      coppie.set(chiave, (coppie.get(chiave) || 0) + 1);
    }

    idVisti.add(id);
    brani.push(b);
  });

  const ripetute = [...coppie.values()].filter((volte) => volte > 1).length;
  const avvisi = [];
  if (n.senzaTitolo) avvisi.push(`${conta(n.senzaTitolo, "brano", "brani")} senza titolo`);
  if (n.senzaArtista) avvisi.push(`${conta(n.senzaArtista, "brano", "brani")} senza artista`);
  if (ripetute) {
    avvisi.push(
      `${conta(ripetute, "coppia", "coppie")} artista + titolo + versione ${ripetute === 1 ? "ripetuta" : "ripetute"}`,
    );
  }
  if (n.fonti) avvisi.push(`${conta(n.fonti, "brano", "brani")} con fonti malformate (tolte)`);
  if (n.genere) avvisi.push(`${conta(n.genere, "brano", "brani")} con un genere che non esiste (genere tolto)`);
  if (n.raccolte)
    avvisi.push(`${conta(n.raccolte, "brano", "brani")} con raccolte che non esistono (riferimenti tolti)`);
  if (n.numeri)
    avvisi.push(`${conta(n.numeri, "brano", "brani")} con anno, durata, BPM o energia non numerici (tolti)`);

  return { catalogo: { ...dati, brani }, scartati, avvisi };
}

/**
 * Controlla un playlist.json già letto: { schema, playlist: [...] }.
 *
 * Restituisce { playlist, scartate: [{id, motivo}], avvisi: [testo] }. Una playlist è
 * valida se ha id e nome (testo) e un tipo noto ("intelligente" o "manuale"). Alle
 * manuali senza elenco dei brani si mette una lista vuota, alle intelligenti senza
 * regole un oggetto vuoto. Id doppio: si tiene la prima. Non lancia mai: un file
 * senza elenco vale "nessuna playlist" e lo dice negli avvisi.
 */
export function validaPlaylist(dati) {
  const playlist = [];
  const scartate = [];
  const avvisi = [];
  const idVisti = new Set();

  if (!Array.isArray(dati?.playlist)) {
    avvisi.push("Il file delle playlist non ha l'elenco: lo considero vuoto.");
  } else if (dati.schema !== undefined && dati.schema !== SCHEMA) {
    avvisi.push(`Il file delle playlist ha un formato diverso (schema ${dati.schema}): lo leggo comunque.`);
  }
  const elenco = Array.isArray(dati?.playlist) ? dati.playlist : [];

  let corrette = 0;
  elenco.forEach((p, posizione) => {
    if (!eTesto(p?.id)) {
      scartate.push({ id: null, motivo: `senza id (voce n. ${posizione + 1})` });
      return;
    }
    if (!eTesto(p.nome)) {
      scartate.push({ id: p.id, motivo: "senza nome" });
      return;
    }
    if (!TIPI_PLAYLIST.has(p.tipo)) {
      scartate.push({ id: p.id, motivo: `tipo sconosciuto (${String(p.tipo)})` });
      return;
    }
    if (idVisti.has(p.id)) {
      scartate.push({ id: p.id, motivo: "id già presente: si tiene la prima" });
      return;
    }
    idVisti.add(p.id);
    if (p.tipo === "manuale" && !Array.isArray(p.brani)) {
      playlist.push({ ...p, brani: [] });
      corrette++;
    } else if (p.tipo === "intelligente" && !eOggetto(p.regole)) {
      playlist.push({ ...p, regole: {} });
      corrette++;
    } else {
      playlist.push(p);
    }
  });
  if (corrette) avvisi.push(`${conta(corrette, "playlist", "playlist")} senza brani o regole: le considero vuote`);

  return { playlist, scartate, avvisi };
}
