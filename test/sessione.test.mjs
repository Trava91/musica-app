// Test di js/nucleo/sessione.js: la "sessione di ascolto" (coda + lettore + regole), con un
// lettore finto. Descrivono quello che faceva ui.js prima del restauro: suonare da una lista,
// il motore "file", "Solo Jukebox", la fine di un brano, ⏮ ⏭, selezionato e in corso, le app
// esterne, i file che non si riescono a suonare.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { azzera, elenco } from "../js/nucleo/diagnostica.js";
import { SECONDI_PER_RIPARTIRE, Sessione } from "../js/nucleo/sessione.js";

/** Un lettore che non suona nulla ma si comporta come audio/lettore.js. */
class LettoreFinto {
  /** @param {{ rotti?: string[], negato?: boolean }} [opts] */
  constructor({ rotti = [], negato = false } = {}) {
    /** @type {any} */
    this.brano = null;
    this.stato = "fermo";
    this.posizione = 0;
    this.durata = 0;
    this.volume = 0; // lo imposta la sessione appena nasce (i test lo controllano)
    this.rotti = new Set(rotti); // id dei brani il cui file non si riesce a suonare
    this.negato = negato; // il browser vuole un tocco prima di far partire l'audio
    /** @type {string[]} */
    this.suonati = [];
    /** @type {any} */
    this.ultimaInfo = null;
    /** @type {((brano: any) => void) | null} */
    this.onFine = null;
    /** @type {(() => void) | null} */
    this.onStato = null;
    /** @type {((comando: string) => void) | null} */
    this.onComando = null;
    /** @type {((brano: any, motivo: string) => void) | null} */
    this.onErrore = null;
  }
  async suona(brano, info) {
    this.suonati.push(brano.id);
    this.ultimaInfo = info;
    if (this.rotti.has(brano.id)) throw new Error(`File rovinato: ${brano.id}`);
    this.brano = brano;
    this.posizione = 0;
    this.durata = 180;
    if (this.negato) {
      const errore = new Error("serve un tocco");
      errore.name = "NotAllowedError";
      throw errore;
    }
    this.imposta("suona");
  }
  imposta(stato) {
    this.stato = stato;
    this.onStato?.();
  }
  pausa() {
    if (this.brano) this.imposta("pausa");
  }
  riprendi() {
    if (this.brano) this.imposta("suona");
  }
  cerca(secondi) {
    this.posizione = secondi;
  }
  ferma() {
    this.brano = null;
    this.posizione = 0;
    this.imposta("fermo");
  }
  // Come l'evento "ended" dell'audio: lo stato va a "fermo" ma il brano resta caricato.
  finisci() {
    this.imposta("fermo");
    this.onFine?.(this.brano);
  }
  // Un tasto della schermata di blocco o delle cuffie.
  premi(comando) {
    this.onComando?.(comando);
  }
  // Il file smette di leggersi a metà brano (il lettore vero si ferma e lo dice alla sessione).
  guasta(motivo = "file danneggiato") {
    const b = this.brano;
    this.ferma();
    this.onErrore?.(b, motivo);
  }
}

const brano = (id, fonti = [["yt", `yt-${id}`]]) => ({ id, a: `Artista ${id}`, t: `Titolo ${id}`, s: fonti });
const LISTA = ["a", "b", "c", "d", "e"].map((id) => brano(id));
const trova = (id) => LISTA.find((b) => b.id === id);

/**
 * Una sessione nuova con il suo lettore finto. file = gli id che hanno il file sul telefono.
 * @param {{ file?: string[], soloJukebox?: boolean, usaNewPipe?: boolean, rotti?: string[], negato?: boolean, android?: boolean }} [opts]
 */
function prepara({
  file = ["a", "b", "c", "d", "e"],
  soloJukebox = false,
  usaNewPipe = true,
  rotti = [],
  negato = false,
  android = false,
} = {}) {
  const lettore = new LettoreFinto({ rotti, negato });
  /** @type {string[]} */
  const aperti = [];
  const ctx = { fileIds: new Set(file), usaNewPipe, soloJukebox, spotify: "non-configurato", priorita: [] };
  const s = new Sessione({ lettore, apri: (indirizzo) => aperti.push(indirizzo), ctx: () => ctx, android });
  /** @type {any[]} */
  const eventi = [];
  s.ascolta((e) => eventi.push(e));
  const avvisi = () => eventi.filter((e) => e.tipo === "avviso");
  return { s, lettore, aperti, ctx, eventi, avvisi };
}

// =========================================================== suonare da una lista ====

describe("suonare da una lista", () => {
  test("parte dal brano scelto e prosegue col resto della lista", async () => {
    const { s, lettore } = prepara();
    assert.equal(s.suonaLista(LISTA, trova("c"), "Ricerca «x»"), true);
    await s.partenza;
    assert.equal(lettore.brano.id, "c");
    const st = s.stato();
    assert.equal(st.selezionato, "c");
    assert.deepEqual(st.prossimi, ["d", "e"]);
    assert.deepEqual(st.sorgente, { id: "lista", nome: "Ricerca «x»", ordine: null });
    assert.equal(lettore.ultimaInfo.album, "Ricerca «x»", "il nome della lista va sulla schermata di blocco");
    lettore.finisci();
    await s.partenza;
    assert.equal(lettore.brano.id, "d");
  });

  test("una coda nuova avvisa chi disegna con {tipo: 'coda', nuova: true}", () => {
    const { s, eventi } = prepara();
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    assert.ok(eventi.some((e) => e.tipo === "coda" && e.nuova));
  });
});

// ================================================================ motore "file" ====

describe("motore file", () => {
  test("la coda contiene solo i brani col file e si contano i saltati", async () => {
    const { s } = prepara({ file: ["a", "c", "e"] });
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    const st = s.stato();
    assert.equal(st.motore, "file");
    assert.equal(st.totale, 3);
    assert.equal(st.saltati, 2);
    assert.deepEqual(st.prossimi, ["c", "e"]);
  });

  test("avviaPlaylist: suona col motore consigliato, tiene nome e ordine della playlist", async () => {
    const { s, lettore } = prepara({ file: ["b", "d"] });
    const p = { id: "p1", nome: "Corsa", tipo: "intelligente", ordine: "bpm-su" };
    assert.equal(s.avviaPlaylist(p, LISTA), true);
    await s.partenza;
    assert.equal(lettore.brano.id, "b");
    const st = s.stato();
    assert.deepEqual(st.sorgente, { id: "p1", nome: "Corsa", ordine: "bpm-su" });
    assert.equal(st.saltati, 3);
    assert.equal(st.totale, 2);
  });

  test("avviaPlaylist: una playlist vuota non parte e lo dice", () => {
    const { s, avvisi } = prepara();
    assert.equal(s.avviaPlaylist({ id: "p", nome: "Vuota" }, []), false);
    assert.equal(s.stato().attiva, false);
    assert.deepEqual(avvisi().at(-1), { tipo: "avviso", testo: "Playlist vuota.", gravita: "err" });
  });

  test("avviaPlaylist con un'app esterna: non apre nulla, dice di premere il tasto grande", () => {
    const { s, aperti, avvisi } = prepara({ file: [] });
    s.avviaPlaylist({ id: "p", nome: "Fuori" }, LISTA);
    assert.equal(s.stato().motore, "newpipe");
    assert.deepEqual(aperti, []);
    assert.match(avvisi().at(-1).testo, /premi il tasto grande/);
  });
});

// ================================================================== Solo Jukebox ====

describe("Solo Jukebox", () => {
  test("un brano senza file fa partire il primo successivo che c'è, e lo dice", async () => {
    const { s, lettore, aperti, avvisi } = prepara({ file: ["a", "d"], soloJukebox: true });
    s.suonaLista(LISTA, trova("b"), "Ricerca");
    await s.partenza;
    assert.equal(lettore.brano.id, "d");
    assert.deepEqual(aperti, [], "mai app esterne");
    assert.match(avvisi().at(-1).testo, /"Titolo b" non è sul telefono: parto da "Titolo d"/);
  });

  test("se dopo non c'è nessun brano col file, avvisa e non cambia nulla", () => {
    const { s, avvisi } = prepara({ file: ["a"], soloJukebox: true });
    assert.equal(s.suonaLista(LISTA, trova("c"), "Ricerca"), false);
    assert.equal(s.stato().attiva, false);
    assert.deepEqual(avvisi().at(-1), { tipo: "avviso", testo: "Questo brano non è sul telefono.", gravita: "err" });
  });
});

// ================================================================== fine brano ====

describe("fine di un brano", () => {
  test("parte il prossimo che si può suonare (salta quelli rimasti senza file)", async () => {
    const { s, lettore, ctx } = prepara();
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    ctx.fileIds.delete("b"); // tolto dal telefono mentre suonava "a"
    lettore.finisci();
    await s.partenza;
    assert.equal(lettore.brano.id, "c");
  });

  test("se nel frattempo ne è stato selezionato un altro, parte quello", async () => {
    const { s, lettore } = prepara();
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    s.saltaA("d");
    assert.equal(lettore.brano.id, "a", "selezionare non fa partire nulla");
    lettore.finisci();
    await s.partenza;
    assert.equal(lettore.brano.id, "d");
  });

  test("ripeti uno: rifà lo stesso brano", async () => {
    const { s, lettore } = prepara();
    s.suonaLista(LISTA, trova("b"), "Ricerca");
    await s.partenza;
    s.ripeti("uno");
    lettore.finisci();
    await s.partenza;
    assert.deepEqual(lettore.suonati, ["b", "b"]);
  });

  test("ripeti tutti: dopo l'ultimo ricomincia dal primo", async () => {
    const { s, lettore } = prepara();
    s.suonaLista(LISTA, trova("e"), "Ricerca");
    await s.partenza;
    s.ripeti("tutti");
    lettore.finisci();
    await s.partenza;
    assert.equal(lettore.brano.id, "a");
  });

  test("senza ripetere, a fine coda il lettore si ferma", async () => {
    const { s, lettore, eventi } = prepara();
    s.suonaLista(LISTA, trova("e"), "Ricerca");
    await s.partenza;
    eventi.length = 0;
    lettore.finisci();
    assert.equal(lettore.brano, null);
    assert.equal(s.stato().lettore, "fermo");
    assert.ok(eventi.some((e) => e.tipo === "coda"));
  });

  test("il tasto ripeti gira tra no, tutti e uno", () => {
    const { s } = prepara();
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    const giro = [1, 2, 3].map(() => {
      s.ripeti();
      return s.stato().ripeti;
    });
    assert.deepEqual(giro, ["tutti", "uno", "no"]);
  });

  test("con un'app esterna la fine del lettore interno non fa partire nulla", () => {
    const { s, lettore } = prepara({ file: [] });
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    lettore.finisci();
    assert.deepEqual(lettore.suonati, []);
  });
});

// ======================================================================= ⏮ ⏭ ====

describe("⏮ ⏭", () => {
  test(`⏮ dopo ${SECONDI_PER_RIPARTIRE} secondi riparte dall'inizio dello stesso brano`, async () => {
    const { s, lettore } = prepara();
    s.suonaLista(LISTA, trova("c"), "Ricerca");
    await s.partenza;
    lettore.posizione = 10;
    s.indietro();
    assert.equal(lettore.posizione, 0);
    assert.equal(lettore.brano.id, "c");
    assert.deepEqual(lettore.suonati, ["c"]);
  });

  test(`⏮ nei primi ${SECONDI_PER_RIPARTIRE} secondi passa al precedente, subito`, async () => {
    const { s, lettore } = prepara();
    s.suonaLista(LISTA, trova("c"), "Ricerca");
    await s.partenza;
    lettore.posizione = 2;
    s.indietro();
    await s.partenza;
    assert.equal(lettore.brano.id, "b");
  });

  test("⏭ suona subito il prossimo", async () => {
    const { s, lettore } = prepara();
    s.suonaLista(LISTA, trova("c"), "Ricerca");
    await s.partenza;
    s.avanti();
    await s.partenza;
    assert.equal(lettore.brano.id, "d");
  });

  test("⏭ ⏮ dalla schermata di blocco (o dalle cuffie)", async () => {
    const { s, lettore } = prepara();
    s.suonaLista(LISTA, trova("c"), "Ricerca");
    await s.partenza;
    lettore.premi("avanti");
    await s.partenza;
    assert.equal(lettore.brano.id, "d");
    lettore.premi("indietro");
    await s.partenza;
    assert.equal(lettore.brano.id, "c");
  });

  test("⏭ ⏮ con un'app esterna aprono subito il brano nuovo nell'app", () => {
    const { s, aperti } = prepara({ file: [] });
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    assert.deepEqual(aperti, ["https://www.youtube.com/watch?v=yt-a"]);
    s.avanti();
    assert.equal(aperti.at(-1), "https://www.youtube.com/watch?v=yt-b");
    assert.equal(s.stato().inCorso, "b");
    s.indietro();
    assert.equal(aperti.at(-1), "https://www.youtube.com/watch?v=yt-a");
  });

  test("con un'app esterna i tasti della schermata di blocco non fanno nulla", () => {
    const { s, lettore, aperti } = prepara({ file: [] });
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    lettore.premi("avanti");
    assert.equal(aperti.length, 1);
    assert.equal(s.stato().selezionato, "a");
  });
});

// ==================================================== selezionato e in corso ====

describe("selezionato (quello che si vede) e in corso (quello che si sente)", () => {
  test("selezionare un altro brano non cambia quello in corso", async () => {
    const { s } = prepara();
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    s.saltaA("c");
    const st = s.stato();
    assert.equal(st.selezionato, "c");
    assert.equal(st.inCorso, "a");
    assert.equal(st.attuale, "a", "il mini lettore mostra quello che si sente");
    assert.deepEqual(st.tasto, { azione: "suona", icona: "play", etichetta: "Suona questo" });
  });

  test("il tasto grande suona il selezionato, poi fa pausa e riprendi", async () => {
    const { s, lettore } = prepara();
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    s.saltaA("c");
    s.tasto();
    await s.partenza;
    assert.equal(lettore.brano.id, "c");
    s.tasto();
    assert.equal(lettore.stato, "pausa");
    assert.equal(s.stato().tasto.azione, "riprendi");
    s.tasto();
    assert.equal(lettore.stato, "suona");
  });

  test("▶ sulla riga del brano in corso: pausa e riprendi", async () => {
    const { s, lettore } = prepara();
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    s.premiRiga(trova("a"), { lista: LISTA, nome: "Ricerca" });
    assert.equal(lettore.stato, "pausa");
    s.premiRiga(trova("a"), { lista: LISTA, nome: "Ricerca" });
    assert.equal(lettore.stato, "suona");
  });

  test("▶ su una riga della coda: salta lì e la suona", async () => {
    const { s, lettore } = prepara();
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    s.premiRiga(trova("d"), { coda: true });
    await s.partenza;
    assert.equal(lettore.brano.id, "d");
    assert.equal(s.stato().sorgente.nome, "Ricerca", "la coda resta la stessa");
  });

  test("▶ su una riga di un'altra lista: suona quella lista da lì", async () => {
    const { s, lettore } = prepara();
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    const altri = [trova("e"), trova("d")];
    s.premiRiga(trova("d"), { lista: altri, nome: "Brani di Artista d" });
    await s.partenza;
    assert.equal(lettore.brano.id, "d");
    assert.equal(s.stato().sorgente.nome, "Brani di Artista d");
    assert.equal(s.stato().totale, 2);
  });

  test("alterna: pausa se suona, altrimenti riprendi", async () => {
    const { s, lettore } = prepara();
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    s.alterna();
    assert.equal(lettore.stato, "pausa");
    s.alterna();
    assert.equal(lettore.stato, "suona");
  });
});

// ============================================================== app esterne ====

describe("app esterne", () => {
  test("un brano mandato a un'app esterna ferma il lettore interno e diventa 'in corso'", async () => {
    const { s, lettore, aperti } = prepara({ file: ["a", "b", "c", "d", "e"] });
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    const fuori = brano("z", [["sp", "sp-z"]]);
    s.suonaLista([fuori], fuori, "Brano singolo");
    assert.equal(lettore.brano, null);
    const st = s.stato();
    assert.equal(st.inCorso, "z");
    assert.equal(st.interno, false);
    assert.equal(st.motoreAttuale, "spotify-app");
    assert.deepEqual(aperti, ["https://open.spotify.com/track/sp-z"]);
  });

  test("▶ sulla riga del brano mandato fuori lo riapre nell'app", () => {
    const { s, aperti } = prepara({ file: [] });
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    s.premiRiga(trova("a"), { lista: LISTA, nome: "Ricerca" });
    assert.equal(aperti.length, 2);
    assert.equal(aperti[1], aperti[0]);
  });

  test("sul telefono Android si aprono le app (intent://), sul PC il web", () => {
    const { s, aperti } = prepara({ file: [], android: true });
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    assert.match(aperti[0], /^intent:\/\/.*package=org\.schabi\.newpipe/);
  });

  test("apriFonte apre la fonte scelta senza fermare la musica", async () => {
    const { s, lettore, aperti } = prepara();
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    s.apriFonte(["sp", "sp-x"]);
    assert.deepEqual(aperti, ["https://open.spotify.com/track/sp-x"]);
    assert.equal(lettore.brano.id, "a");
  });

  test("un brano senza nessuna fonte utilizzabile non parte", () => {
    const { s, avvisi } = prepara({ file: [] });
    const soloFile = brano("q", [["lo", "q.mp3"]]);
    assert.equal(s.suonaLista([soloFile], soloFile, "Brano singolo"), false);
    assert.equal(
      avvisi().at(-1).testo,
      "È un file del PC che non è sul telefono: serve la musica sul telefono.",
      "dice perché: il brano esiste solo come file del PC",
    );
  });
});

// ==================================================== file che non si suonano ====

describe("file che non si riescono a suonare", () => {
  test("si passa al successivo e lo si dice", async () => {
    const { s, lettore, avvisi } = prepara({ rotti: ["b"] });
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    lettore.finisci();
    await s.partenza;
    assert.equal(lettore.brano.id, "c");
    assert.deepEqual(avvisi().at(-1), {
      tipo: "avviso",
      testo: "Non riesco a suonare «Titolo b»: passo al prossimo.",
      gravita: "err",
    });
  });

  test("il file difettoso finisce nella diagnostica, con il motivo", async () => {
    azzera();
    const { s, lettore } = prepara({ rotti: ["b"] });
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    lettore.finisci();
    await s.partenza;
    const [voce] = elenco();
    assert.equal(voce.origine, "audio");
    assert.match(voce.testo, /«Titolo b» \(b\): .*File rovinato: b/);
  });

  test("tutti rovinati: ognuno si prova una volta sola, e dopo 3 di fila ci si ferma e lo si dice", async () => {
    const { s, lettore, avvisi } = prepara();
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    s.ripeti("tutti");
    for (const b of LISTA) lettore.rotti.add(b.id);
    lettore.finisci();
    await s.partenza;
    assert.deepEqual(lettore.suonati, ["a", "b", "c", "d"], "dopo il terzo fallito (b, c, d) non ne prova altri");
    assert.equal(s.stato().lettore, "fermo");
    assert.match(avvisi().at(-1).testo, /3 file che non si riescono a suonare di fila: mi fermo/);
    assert.equal(avvisi().at(-1).gravita, "err");
  });

  test("con ripeti tutti e due soli file rovinati ognuno si prova una volta e basta", async () => {
    const { s, lettore } = prepara();
    const due = [trova("a"), trova("b")];
    s.suonaLista(due, trova("a"), "Ricerca");
    await s.partenza;
    s.ripeti("tutti");
    lettore.rotti.add("a");
    lettore.rotti.add("b");
    lettore.finisci();
    await s.partenza;
    assert.deepEqual(lettore.suonati, ["a", "b", "a"], "a era in corso, poi b e a falliscono: nessun giro infinito");
  });

  test("un file che si rompe a metà brano: avvisa e passa al prossimo", async () => {
    const { s, lettore, avvisi } = prepara();
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    lettore.guasta("file danneggiato");
    await s.partenza;
    assert.equal(lettore.brano.id, "b");
    assert.equal(avvisi().at(-1).testo, "Non riesco a suonare «Titolo a»: passo al prossimo.");
  });

  test("il conto dei file rotti riparte quando un brano parte bene; a 3 di fila ci si ferma", async () => {
    const { s, lettore, avvisi } = prepara();
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    lettore.guasta(); // a si rompe: errore 1, parte b
    await s.partenza;
    lettore.guasta(); // b si rompe: errore 1 (b era partito bene: il conto ricomincia)
    await s.partenza;
    assert.equal(lettore.brano.id, "c", "un brano partito bene azzera il conto: si va avanti");
    lettore.rotti.add("d");
    lettore.rotti.add("e");
    lettore.guasta(); // c si rompe (1), d non parte (2), e non parte (3): stop
    await s.partenza;
    assert.equal(s.stato().lettore, "fermo");
    assert.match(avvisi().at(-1).testo, /mi fermo/);
  });

  test("un file rotto in un motore esterno non fa nulla (l'audio non è del Jukebox)", async () => {
    const { s, lettore } = prepara({ file: [] });
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    lettore.onErrore?.(trova("a"), "x");
    assert.deepEqual(lettore.suonati, []);
  });

  test("con ripeti uno un file rovinato non si riprova all'infinito", async () => {
    const { s, lettore } = prepara();
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    s.ripeti("uno");
    lettore.rotti.add("a");
    lettore.finisci();
    await s.partenza;
    assert.deepEqual(lettore.suonati, ["a", "a"]);
  });

  test("se il browser vuole un tocco prima dell'audio, lo chiede e non salta il brano", async () => {
    const { s, lettore, avvisi } = prepara({ negato: true });
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    assert.deepEqual(lettore.suonati, ["a"]);
    assert.deepEqual(avvisi().at(-1), { tipo: "avviso", testo: "Premi ▶ per far partire la musica.", gravita: "" });
  });
});

// ============================================================ coda e comandi ====

describe("coda: casuale, accoda, togli, cerca, ferma", () => {
  test("casuale: il brano in corso resta il selezionato", async () => {
    const { s } = prepara();
    s.suonaLista(LISTA, trova("c"), "Ricerca");
    await s.partenza;
    s.casuale();
    const st = s.stato();
    assert.equal(st.casuale, true);
    assert.equal(st.selezionato, "c");
    s.casuale();
    assert.equal(s.stato().casuale, false);
  });

  test("senza una coda i comandi non fanno nulla", () => {
    const { s, aperti, lettore } = prepara();
    s.casuale();
    s.ripeti();
    s.avanti();
    s.indietro();
    s.tasto();
    s.saltaA("a");
    assert.equal(s.stato().attiva, false);
    assert.deepEqual(aperti, []);
    assert.deepEqual(lettore.suonati, []);
  });

  test("accoda dopo il corrente e togli: passano dalla sessione e avvisano chi disegna", async () => {
    const { s, eventi } = prepara();
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    eventi.length = 0;
    assert.equal(s.accoda(trova("e"), { dopoCorrente: true }), true);
    assert.deepEqual(s.stato().prossimi, ["e", "b", "c", "d"]);
    assert.equal(s.togli("c"), true);
    assert.deepEqual(s.stato().prossimi, ["e", "b", "d"]);
    assert.equal(eventi.filter((e) => e.tipo === "coda").length, 2);
  });

  test("accoda e togli senza una coda: false (cosa fare in quel caso lo decide la fase 10)", () => {
    const { s } = prepara();
    assert.equal(s.accoda(trova("b")), false);
    assert.equal(s.togli("b"), false);
    assert.equal(s.stato().attiva, false);
  });

  test("cerca sposta la posizione, ferma spegne il lettore", async () => {
    const { s, lettore } = prepara();
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    s.cerca(42);
    assert.equal(s.stato().posizione, 42);
    s.ferma();
    assert.equal(lettore.brano, null);
    assert.equal(s.stato().interno, false);
  });
});

// ======================================================= fotografia e ascolto ====

describe("stato() e ascolta()", () => {
  test("stato() è fatto di soli dati: si può spedire in rete così com'è", async () => {
    const { s } = prepara();
    s.suonaLista(LISTA, trova("b"), "Ricerca");
    await s.partenza;
    const st = s.stato();
    assert.deepEqual(JSON.parse(JSON.stringify(st)), st);
    assert.deepEqual(Object.keys(st).sort(), [
      "attiva",
      "attuale",
      "casuale",
      "durata",
      "inCorso",
      "indice",
      "interno",
      "lettore",
      "motore",
      "motoreAttuale",
      "posizione",
      "prossimi",
      "ripeti",
      "saltati",
      "selezionato",
      "sorgente",
      "tasto",
      "totale",
      "volume",
      "volumeAttivo",
    ]);
  });

  test("stato() senza coda", () => {
    const { s } = prepara();
    const st = s.stato();
    assert.equal(st.attiva, false);
    assert.equal(st.selezionato, null);
    assert.equal(st.inCorso, null);
    assert.deepEqual(st.prossimi, []);
    assert.equal(st.tasto.azione, "nessuna");
  });

  test("i cambiamenti del lettore arrivano come {tipo: 'lettore'}", async () => {
    const { s, eventi } = prepara();
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    eventi.length = 0;
    s.pausa();
    s.riprendi();
    assert.deepEqual(
      eventi.map((e) => e.tipo),
      ["lettore", "lettore"],
    );
  });

  test("ascolta restituisce la funzione per smettere di ascoltare", () => {
    const { s } = prepara();
    let n = 0;
    const smetti = s.ascolta(() => n++);
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    const visti = n;
    smetti();
    s.casuale();
    assert.ok(visti > 0);
    assert.equal(n, visti);
  });
});

// ====================================================================== volume ====

describe("volume della manopola", () => {
  test("senza indicazione parte pieno, come prima che ci fosse la manopola", () => {
    const { s, lettore } = prepara();
    assert.equal(s.stato().volume, 1);
    assert.equal(lettore.volume, 1);
  });

  test("parte da quello ricordato e lo passa al lettore", () => {
    const lettore = new LettoreFinto();
    const s = new Sessione({ lettore, volume: 0.4 });
    assert.equal(s.stato().volume, 0.4);
    assert.equal(lettore.volume, 0.4);
  });

  test("impostaVolume: arriva al lettore e lo dice a chi ascolta (per ricordarlo)", () => {
    const { s, lettore, eventi } = prepara();
    s.impostaVolume(0.62);
    assert.equal(lettore.volume, 0.62);
    assert.equal(s.stato().volume, 0.62);
    assert.deepEqual(
      eventi.filter((e) => e.tipo === "volume"),
      [{ tipo: "volume", volume: 0.62 }],
    );
  });

  test("impostaVolume: oltre i limiti si ferma a 0 o a 1; uguale a prima non avvisa", () => {
    const { s, eventi } = prepara();
    s.impostaVolume(7);
    assert.equal(s.stato().volume, 1);
    s.impostaVolume(-3);
    assert.equal(s.stato().volume, 0);
    s.impostaVolume(0);
    assert.deepEqual(
      eventi.filter((e) => e.tipo === "volume").map((e) => e.volume),
      [0],
    );
  });

  test("impostaVolume: un valore che non è un numero si ignora (mai a tutto volume per sbaglio)", () => {
    const { s, lettore } = prepara();
    s.impostaVolume(0.3);
    for (const sbagliato of [Number.NaN, Number.POSITIVE_INFINITY, undefined, null, "0.9"]) {
      s.impostaVolume(/** @type {any} */ (sbagliato));
    }
    assert.equal(s.stato().volume, 0.3);
    assert.equal(lettore.volume, 0.3);
  });

  test("volumeAttivo: acceso senza coda e con i file del telefono", async () => {
    const { s } = prepara();
    assert.equal(s.stato().volumeAttivo, true);
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    await s.partenza;
    assert.equal(s.stato().motore, "file");
    assert.equal(s.stato().volumeAttivo, true);
  });

  test("volumeAttivo: spento quando la musica la suona un'app esterna (il volume lo decide lei)", () => {
    const { s, aperti } = prepara({ file: [] });
    s.suonaLista(LISTA, trova("a"), "Ricerca");
    assert.equal(aperti.length, 1);
    assert.equal(s.stato().motore, "newpipe");
    assert.equal(s.stato().volumeAttivo, false);
  });
});
