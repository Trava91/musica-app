// logica.test.mjs — test della logica pura del Jukebox (cerca, regole, dj, motori,
// link, coda). Nessun dato reale: test/fixture.json è tutto inventato.
//
// Come lanciarlo:
//   - Node:    node test/logica.test.mjs
//   - Browser: <script type="module" src="test/logica.test.mjs"></script> e leggi la console.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import * as cerca from "../js/cerca.js";
import * as regole from "../js/regole.js";
import * as dj from "../js/dj.js";
import * as motori from "../js/motori.js";
import * as link from "../js/link.js";
import { Coda } from "../js/coda.js";
import * as generi from "../js/generi.js";
import * as comandi from "../js/comandi.js";
import { idDaNome } from "../js/file.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(__dirname, "fixture.json"), "utf-8"));
cerca.preparaIndice(fixture.brani, fixture.raccolte);
const brani = fixture.brani;

let pass = 0, fail = 0;
function eq(name, got, exp) {
  const g = JSON.stringify(got), e = JSON.stringify(exp);
  if (g === e) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.error(`✗ ${name}\n   atteso: ${e}\n   avuto:  ${g}`); }
}
function ok(name, cond) {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.error(`✗ ${name} — condizione falsa`); }
}

// ============================================================ cerca.js =====

eq("normalizza: accenti", cerca.normalizza("Ünïcode Tëst"), "unicode test");
eq("normalizza: e commerciale", cerca.normalizza("Rock & Roll"), "rock and roll");
eq("normalizza: punteggiatura", cerca.normalizza("Prova, Uno! (Remix)"), "prova uno remix");

eq("cerca: query multi-parola per prefisso su artista",
  cerca.cerca(brani, "dj test", undefined, "rilevanza").map((b) => b.id).sort(),
  ["f01", "f02", "f03"].sort());

eq("cerca: artista esatto > prefisso in titolo > solo nell'indice",
  cerca.cerca(brani, "esempio completo", undefined, "rilevanza").map((b) => b.id),
  ["f11", "f13", "f12"]);

ok("cerca: tipo default esclude i set", !cerca.cerca(brani, "", {}, "artista").some((b) => b.id === "f06"));
eq("cerca: tipo 'set' include solo i set", cerca.cerca(brani, "", { tipo: "set" }, "artista").map((b) => b.id), ["f06"]);

ok("cerca: soloScelti di default esclude l'esplorazione", !cerca.cerca(brani, "", {}, "artista").some((b) => b.id === "f08"));
ok("cerca: soloScelti:false include l'esplorazione", cerca.cerca(brani, "", { soloScelti: false }, "artista").some((b) => b.id === "f08"));

eq("cerca: filtro BPM 120-130",
  cerca.cerca(brani, "", { bpm: [120, 130] }, "bpm").map((b) => b.id).sort(),
  ["f01", "f02", "f03", "f07", "f10", "f19", "f24"].sort());

eq("cerca: filtro macro Tech house esclude l'esplorazione",
  cerca.cerca(brani, "", { macro: [0] }, "artista").map((b) => b.id).sort(),
  ["f01", "f02", "f03"].sort());

eq("perArtista: originali prima dei remix, poi alfabetico",
  cerca.perArtista(brani, cerca.normalizza("DJ Testino")).map((b) => b.id),
  ["f03", "f01", "f02"]);

eq("conteggiMacro: Tech house esclude l'esplorazione di default", cerca.conteggiMacro(brani, {}).conteggi[0], 3);

// ============================================================ regole.js ====

eq("regole: AND tra campi, OR dentro macro",
  regole.valuta({ tipo: "intelligente", regole: { macro: [0, 1], bpm: [120, 130] }, ordine: "artista" }, brani)
    .map((b) => b.id).sort(),
  ["f01", "f02", "f03", "f10", "f19", "f24"].sort());

eq("regole: escludiArtisti",
  regole.valuta({
    tipo: "intelligente",
    regole: { macro: [0, 1], bpm: [120, 130], escludiArtisti: [cerca.normalizza("DJ Testino")] },
    ordine: "artista",
  }, brani).map((b) => b.id).sort(),
  ["f10", "f19", "f24"].sort());

eq("regole: filtro anno",
  regole.valuta({ tipo: "intelligente", regole: { anno: [1990, 2000] }, ordine: "artista" }, brani).map((b) => b.id),
  ["f15"]);

eq("regole: soloScelti:false include l'esplorazione",
  regole.valuta({ tipo: "intelligente", regole: { macro: [0], soloScelti: false }, ordine: "artista" }, brani)
    .map((b) => b.id).sort(),
  ["f01", "f02", "f03", "f08"].sort());

eq("regole: soloSchermoSpento senza file né Premium esclude tutto",
  regole.valuta({ tipo: "intelligente", regole: { soloSchermoSpento: true }, ordine: "artista" }, brani, {}).length, 0);

{
  const ctx = { fileIds: new Set(["f07"]), spotify: "premium" };
  const ris = new Set(
    regole.valuta({ tipo: "intelligente", regole: { soloSchermoSpento: true }, ordine: "artista" }, brani, ctx)
      .map((b) => b.id),
  );
  ok("soloSchermoSpento: file abbinato incluso (f07)", ris.has("f07"));
  ok("soloSchermoSpento: Spotify Premium incluso (f01)", ris.has("f01"));
  ok("soloSchermoSpento: solo YouTube escluso, NewPipe non è continuo (f02)", !ris.has("f02"));
  ok("soloSchermoSpento: l'esplorazione resta esclusa (f08)", !ris.has("f08"));
}

eq("regole: ordine armonico non perde brani",
  regole.valuta({ tipo: "intelligente", regole: { macro: [0, 1], bpm: [120, 130] }, ordine: "armonico" }, brani)
    .map((b) => b.id).sort(),
  ["f01", "f02", "f03", "f10", "f19", "f24"].sort());

{
  const pl = { tipo: "intelligente", regole: { macro: [0] }, ordine: "casuale", seme: 42 };
  eq("regole: casuale con lo stesso seme dà lo stesso ordine",
    regole.valuta(pl, brani).map((b) => b.id),
    regole.valuta(pl, brani).map((b) => b.id));
}

eq("regole: il limite tronca l'elenco",
  regole.valuta({ tipo: "intelligente", regole: {}, ordine: "artista", limite: 2 }, brani).length, 2);

eq("regole: playlist manuale mantiene l'ordine e ignora gli id mancanti",
  regole.valuta({ tipo: "manuale", brani: ["f05", "f01", "id-inesistente"] }, brani).map((b) => b.id),
  ["f05", "f01"]);

// ================================================================ dj.js ====

eq("livelloChiave 8A-8A (uguale)", dj.livelloChiave("8A", "8A"), 3);
eq("livelloChiave 8A-9A (adiacente)", dj.livelloChiave("8A", "9A"), 2);
eq("livelloChiave 12A-1A (adiacente, giro dell'orologio)", dj.livelloChiave("12A", "1A"), 2);
eq("livelloChiave 8A-8B (relativa)", dj.livelloChiave("8A", "8B"), 2);
eq("livelloChiave 8A-10A (+2)", dj.livelloChiave("8A", "10A"), 1);
eq("livelloChiave 8A-9B (diagonale)", dj.livelloChiave("8A", "9B"), 1);
eq("livelloChiave 8A-3A (nessuna relazione)", dj.livelloChiave("8A", "3A"), 0);

ok("scartoBpm 128→125 ≈ 0.023", Math.abs(dj.scartoBpm(128, 125) - 0.0234375) < 1e-6);
ok("scartoBpm 128→64 incompatibile senza metà/doppio", dj.scartoBpm(128, 64) > dj.TOLLERANZA_BPM);
ok("scartoBpm 128→64 compatibile con metà/doppio", dj.scartoBpm(128, 64, { metaDoppio: true }) <= dj.TOLLERANZA_BPM);
ok("scartoBpm 128→136 oltre la soglia", dj.scartoBpm(128, 136) > dj.TOLLERANZA_BPM);

{
  const catena = [
    { id: "c1", _normA: "catena", _normT: "uno", b: 120, c: "8A" },
    { id: "c2", _normA: "catena", _normT: "due", b: 122, c: "8A" },
    { id: "c3", _normA: "catena", _normT: "tre", b: 124, c: "9A" },
    { id: "c4", _normA: "catena", _normT: "quattro", b: 126, c: "9B" },
    { id: "c5", _normA: "catena", _normT: "senza dati b" },
    { id: "c6", _normA: "catena", _normT: "senza dati a" },
  ];
  const percorso = dj.percorsoArmonico(catena);
  eq("percorsoArmonico: nessun brano perso", percorso.map((b) => b.id).sort(), ["c1", "c2", "c3", "c4", "c5", "c6"].sort());

  const conDati = percorso.filter((b) => b.b !== undefined);
  const senzaDati = percorso.filter((b) => b.b === undefined);
  ok("percorsoArmonico: i brani con dati vengono prima di quelli senza",
    Math.max(...conDati.map((b) => percorso.indexOf(b))) < Math.min(...senzaDati.map((b) => percorso.indexOf(b))));

  let compatibili = true;
  for (let i = 1; i < conDati.length; i++) {
    if (dj.scartoBpm(conDati[i - 1].b, conDati[i].b) > dj.TOLLERANZA_BPM || dj.livelloChiave(conDati[i - 1].c, conDati[i].c) < 1) {
      compatibili = false;
    }
  }
  ok("percorsoArmonico: passi consecutivi compatibili (dati costruiti apposta)", compatibili);
  eq("percorsoArmonico: i brani senza dati vanno in coda in ordine alfabetico", senzaDati.map((b) => b.id), ["c6", "c5"]);
}

// ============================================================ motori.js ====

{
  const bFile = { id: "m1", s: [["lo", "percorso/uno.mp3"]] };
  const bSp = { id: "m2", s: [["sp", "spX"]] };
  const bYt = { id: "m3", s: [["yt", "ytX"]] };
  const bMulti = { id: "m4", s: [["sp", "spY"], ["yt", "ytY"]] };

  eq("motoreBrano: il file sul telefono vince su tutto",
    motori.motoreBrano(bFile, { fileIds: new Set(["m1"]), spotify: "premium" }).motore, "file");
  eq("motoreBrano: il file vale per id anche se il brano non era un file locale",
    motori.motoreBrano(bSp, { fileIds: new Set(["m2"]) }).fonte, ["file", "m2"]);
  eq("motoreBrano: con Premium suona da Spotify",
    motori.motoreBrano(bMulti, { spotify: "premium" }).motore, "spotify-premium");
  eq("motoreBrano: senza Premium, un brano solo YouTube va a NewPipe",
    motori.motoreBrano(bYt, { spotify: "senza" }).motore, "newpipe");
  eq("motoreBrano: senza Premium, un brano solo Spotify apre l'app gratis",
    motori.motoreBrano(bSp, { spotify: "senza" }).motore, "spotify-app");
  eq("motoreBrano: senza NewPipe, un brano YouTube va sul web",
    motori.motoreBrano(bYt, { spotify: "senza", usaNewPipe: false }).motore, "web");

  const piano = motori.pianoRiproduzione([bFile, bSp, bYt, bMulti], { fileIds: new Set(["m1"]), spotify: "senza" });
  const contaMotore = (m) => piano.gruppi.find((g) => g.motore === m)?.n || 0;
  eq("pianoRiproduzione: conteggio file", contaMotore("file"), 1);
  eq("pianoRiproduzione: conteggio newpipe (yt singolo + multi senza premium)", contaMotore("newpipe"), 2);
  eq("pianoRiproduzione: conteggio spotify-app", contaMotore("spotify-app"), 1);
  eq("pianoRiproduzione: il consigliato è l'unico motore continuo", piano.consigliato, "file");
  eq("pianoRiproduzione: nessun brano escluso", piano.esclusi.length, 0);
}

// ============================================================== link.js ====

{
  const urlYt = "https://www.youtube.com/watch?v=ABC123";
  const iNewPipe = link.intentNewPipe(urlYt);
  ok("intentNewPipe: punta al pacchetto di NewPipe", iNewPipe.includes("package=org.schabi.newpipe"));
  ok("intentNewPipe: ha l'URL di ripiego codificato", iNewPipe.includes(encodeURIComponent(urlYt)));

  const iSpotify = link.intentSpotify("abc123");
  ok("intentSpotify: punta al pacchetto di Spotify", iSpotify.includes("package=com.spotify.music"));
  ok("intentSpotify: contiene l'id della traccia", iSpotify.includes("open.spotify.com/track/abc123"));
}

eq("urlWeb: spotify", link.urlWeb(["sp", "abc"]), "https://open.spotify.com/track/abc");
eq("urlWeb: youtube", link.urlWeb(["yt", "xyz"]), "https://www.youtube.com/watch?v=xyz");
eq("urlWeb: soundcloud è già un url completo", link.urlWeb(["sc", "https://soundcloud.com/a/b"]), "https://soundcloud.com/a/b");
eq("urlWeb: un file locale non ha un indirizzo web", link.urlWeb(["lo", "percorso/x.mp3"]), null);

{
  const beat = link.cercaEsterno("beatport", "Jamie Esempio", "Titolo Prova");
  ok("cercaEsterno: beatport codifica gli spazi (%20, non spazi veri)", beat.includes("%20") && !beat.includes(" "));
}

ok("linkApertura: su Android NewPipe usa l'intent",
  link.linkApertura("newpipe", ["yt", "xyz"], { android: true }).startsWith("intent://"));
eq("linkApertura: sul PC NewPipe ripiega sul web",
  link.linkApertura("newpipe", ["yt", "xyz"], { android: false }), "https://www.youtube.com/watch?v=xyz");
ok("linkApertura: su Android l'app Spotify usa l'intent",
  link.linkApertura("spotify-app", ["sp", "abc"], { android: true }).includes("package=com.spotify.music"));
eq("linkApertura: sul PC Spotify ripiega sul web",
  link.linkApertura("spotify-app", ["sp", "abc"], { android: false }), "https://open.spotify.com/track/abc");
eq("linkApertura: un file locale non ha un link", link.linkApertura("file", ["lo", "x.mp3"], { android: true }), null);

// =============================================================== coda.js ===

{
  const q = [{ id: "q1" }, { id: "q2" }, { id: "q3" }];

  const coda1 = new Coda(q);
  eq("Coda: parte dal primo brano", coda1.corrente.id, "q1");
  eq("Coda: avanti", coda1.avanti().id, "q2");
  eq("Coda: avanti ancora", coda1.avanti().id, "q3");
  eq("Coda: avanti oltre la fine, senza ripetere, dà null", coda1.avanti(), null);
  eq("Coda: indietro dopo la fine torna all'ultimo brano", coda1.indietro().id, "q3");

  const coda2 = new Coda(q);
  eq("Coda: salta a un id", coda2.salta("q3").id, "q3");
  eq("Coda: salta a un id inesistente non cambia posizione", coda2.salta("id-inesistente").id, "q3");

  const coda3 = new Coda(q, { ripeti: "tutti" });
  coda3.salta("q3");
  eq("Coda: con ripeti 'tutti' torna al primo", coda3.avanti().id, "q1");

  const coda4 = new Coda(q, { ripeti: "uno" });
  eq("Coda: con ripeti 'uno' resta ferma", coda4.avanti().id, "q1");

  const codaA = new Coda(q, { casuale: true, seme: 7 });
  const codaB = new Coda(q, { casuale: true, seme: 7 });
  eq("Coda: casuale con lo stesso seme dà lo stesso ordine",
    codaA.ordine.map((b) => b.id), codaB.ordine.map((b) => b.id));

  const conFile = [{ id: "p1", s: [["yt", "y1"]] }, { id: "p2", s: [["lo", "file2.mp3"]] }, { id: "p3", s: [["sp", "s3"]] }];
  const coda5 = new Coda(conFile);
  const disponibili = new Set(["file2.mp3"]);
  const predicato = (b) => b.s.some(([c, r]) => c === "lo" && disponibili.has(r));
  eq("Coda: prossimoRiproducibile salta i brani senza file abbinato", coda5.prossimoRiproducibile(predicato).id, "p2");
}

// ============================================================ generi.js ===

{
  const MACRO = ["Tech house", "Deep e melodic", "Disco e funky house", "Chicago e acid", "Techno", "Minimal", "Disco, funk e soul", "Jazz e blues"];
  const voci = generi.vociGeneri(MACRO);
  eq("vociGeneri: house/techno in una voce, disco in un'altra", voci.map((v) => v.nome), ["Tech house", "Disco", "Jazz e blues"]);
  eq("vociGeneri: la voce Disco unisce disco house e disco/funk/soul", voci[1].indici, [2, 6]);
  eq("vociGeneri: la voce Tech house tiene tutti i suoi indici", voci[0].indici, [0, 1, 3, 4, 5]);
  eq("voceDi: Techno sta nella voce Tech house", generi.voceDi(voci, 4), 0);
  eq("voceDi: genere mancante", generi.voceDi(voci, undefined), -1);
  eq("vociSelezionate: solo le voci complete", generi.vociSelezionate(voci, [0, 1, 3, 4, 5, 7]).map((v) => v.nome), ["Tech house", "Jazz e blues"]);
  eq("vociSelezionate: voce parziale esclusa", generi.vociSelezionate(voci, [4]).length, 0);
  eq("vociGeneri: catalogo senza i membri del gruppo", generi.vociGeneri(["Rock"]).map((v) => v.nome), ["Rock"]);
}

// =========================================================== comandi.js ===

{
  const T = comandi.tastoPrincipale;
  eq("tasto: brano in corso che suona → pausa", T({ motore: "file", selezionato: "a", inCorso: "a", stato: "suona" }).azione, "pausa");
  eq("tasto: brano in corso in pausa → riprendi", T({ motore: "file", selezionato: "a", inCorso: "a", stato: "pausa" }).azione, "riprendi");
  eq("tasto: scelto un altro mentre suona → suona questo", T({ motore: "file", selezionato: "b", inCorso: "a", stato: "suona" }), { azione: "suona", icona: "play", etichetta: "Suona questo" });
  eq("tasto: niente in corso → suona", T({ motore: "file", selezionato: "a", inCorso: null, stato: "fermo" }).etichetta, "Suona");
  eq("tasto: motore esterno → apri l'app", T({ motore: "newpipe", selezionato: "a", inCorso: null, stato: "fermo" }), { azione: "apri", icona: "play", etichetta: "Manda a NewPipe" });
  eq("tasto: niente selezionato", T({ motore: null, selezionato: null }).azione, "nessuna");

  const tre = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const tutti = () => true;
  let c = new Coda(tre);
  eq("spostaSelezione: avanti", comandi.spostaSelezione(c, 1).id, "b");
  comandi.spostaSelezione(c, 1);
  eq("spostaSelezione: in fondo resta sull'ultimo", comandi.spostaSelezione(c, 1).id, "c");
  c.ripeti = "tutti";
  eq("spostaSelezione: con ripeti ricomincia", comandi.spostaSelezione(c, 1).id, "a");
  eq("spostaSelezione: indietro dal primo con ripeti va all'ultimo", comandi.spostaSelezione(c, -1).id, "c");

  c = new Coda(tre);
  eq("dopoFine: senza scelte parte il prossimo", comandi.dopoFine(c, "a", tutti).id, "b");
  eq("dopoFine: la coda si sposta sul prossimo", c.corrente.id, "b");
  c = new Coda(tre);
  comandi.spostaSelezione(c, 1); comandi.spostaSelezione(c, 1); // mentre suona "a" scelgo "c"
  eq("dopoFine: parte il brano scelto con ⏭", comandi.dopoFine(c, "a", tutti).id, "c");
  c = new Coda(tre);
  eq("dopoFine: salta i brani che il lettore non sa suonare", comandi.dopoFine(c, "a", (b) => b.id !== "b").id, "c");
  c = new Coda(tre); c.salta("c");
  eq("dopoFine: a fine coda si ferma", comandi.dopoFine(c, "c", tutti), null);
  c = new Coda(tre, { ripeti: "tutti" }); c.salta("c");
  eq("dopoFine: con ripeti tutti ricomincia", comandi.dopoFine(c, "c", tutti).id, "a");
  c = new Coda(tre, { ripeti: "uno" });
  eq("dopoFine: con ripeti uno rifà lo stesso", comandi.dopoFine(c, "a", tutti).id, "a");
}

// ============================================================== file.js ===

eq("idDaNome: nome preparato dal PC", idDaNome("c9412dc07ba6.m4a"), "c9412dc07ba6");
eq("idDaNome: copia doppia di Android", idDaNome("C9412DC07BA6 (1).m4a"), "c9412dc07ba6");
eq("idDaNome: file qualunque", idDaNome("Dan Black - Laka Laka.mp3"), null);
eq("idDaNome: id troppo lungo", idDaNome("c9412dc07ba6ff.m4a"), null);

// ================================================================ esito ====

console.log(`\n${pass} PASS, ${fail} FAIL`);
if (typeof process !== "undefined" && fail > 0) process.exit(1);
