// Test di js/ui/hifi/calcoli.js: i conti dei componenti hi-fi (manopola, scala, giradischi,
// livelli, display, etichette dei dischi, contrasti). Niente pagina: i componenti veri li prova
// test/browser/componenti.py sulla pagina anteprima/componenti.html.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as c from "../js/ui/hifi/calcoli.js";

const vicino = (a, b, scarto = 1e-9) => assert.ok(Math.abs(a - b) <= scarto, `${a} non è ${b}`);

describe("manopola", () => {
  test("la tacca va da -135° (minimo) a +135° (massimo), al centro sta in alto", () => {
    assert.equal(c.angoloManopola(0, 0, 100), -135);
    assert.equal(c.angoloManopola(100, 0, 100), 135);
    assert.equal(c.angoloManopola(50, 0, 100), 0);
    assert.equal(c.angoloManopola(150, 0, 100), 135, "oltre il massimo resta al massimo");
  });

  test("dove sta il dito: 0° in alto, 90° a destra, -90° a sinistra", () => {
    vicino(c.angoloPuntatore(0, -10), 0);
    vicino(c.angoloPuntatore(10, 0), 90);
    vicino(c.angoloPuntatore(-10, 0), -90);
    vicino(Math.abs(c.angoloPuntatore(0, 10)), 180);
  });

  test("passando dietro la manopola il dito gira di poco, non di un giro intero", () => {
    assert.equal(c.differenzaAngolo(170, -170), 20);
    assert.equal(c.differenzaAngolo(-170, 170), -20);
    assert.equal(c.differenzaAngolo(10, 30), 20);
  });

  test("girare di 27° sposta di 10 su 100; ai limiti si ferma", () => {
    vicino(c.giraManopola(50, 27, 0, 100), 60);
    assert.equal(c.giraManopola(95, 27, 0, 100), 100);
    assert.equal(c.giraManopola(5, -27, 0, 100), 0);
  });

  test("un giro col dito da -135° a +135° porta il valore da 0 a 100, sempre in salita", () => {
    let v = 0;
    let a = -135;
    let prima = -1;
    for (let k = 1; k <= 54; k++) {
      const nuovo = -135 + 5 * k;
      v = c.giraManopola(v, c.differenzaAngolo(a, nuovo), 0, 100);
      a = nuovo;
      assert.ok(v >= prima);
      prima = v;
    }
    vicino(v, 100, 1e-6);
  });

  test("tasti: frecce ±1, Pagina ±10, Inizio e Fine; gli altri tasti non la toccano", () => {
    const limiti = { min: 0, max: 100 };
    assert.equal(c.valoreDaTasto("ArrowUp", 50, limiti), 51);
    assert.equal(c.valoreDaTasto("ArrowRight", 50, limiti), 51);
    assert.equal(c.valoreDaTasto("ArrowDown", 50, limiti), 49);
    assert.equal(c.valoreDaTasto("ArrowLeft", 50, limiti), 49);
    assert.equal(c.valoreDaTasto("PageUp", 50, limiti), 60);
    assert.equal(c.valoreDaTasto("PageDown", 50, limiti), 40);
    assert.equal(c.valoreDaTasto("Home", 50, limiti), 0);
    assert.equal(c.valoreDaTasto("End", 50, limiti), 100);
    assert.equal(c.valoreDaTasto("PageUp", 95, limiti), 100);
    assert.equal(c.valoreDaTasto("ArrowDown", 0, limiti), 0);
    assert.equal(c.valoreDaTasto("a", 50, limiti), null);
    assert.equal(c.valoreDaTasto("constructor", 50, limiti), null);
  });
});

describe("scala del sintonizzatore", () => {
  test("frecce, Pagina, Inizio e Fine; si resta dentro la scala", () => {
    assert.equal(c.indiceDaTasto("ArrowRight", 3, 13), 4);
    assert.equal(c.indiceDaTasto("ArrowDown", 3, 13), 4);
    assert.equal(c.indiceDaTasto("ArrowLeft", 3, 13), 2);
    assert.equal(c.indiceDaTasto("ArrowUp", 3, 13), 2);
    assert.equal(c.indiceDaTasto("PageDown", 3, 13), 8);
    assert.equal(c.indiceDaTasto("PageUp", 3, 13), 0);
    assert.equal(c.indiceDaTasto("Home", 7, 13), 0);
    assert.equal(c.indiceDaTasto("End", 7, 13), 12);
    assert.equal(c.indiceDaTasto("ArrowRight", 12, 13), 12);
    assert.equal(c.indiceDaTasto("ArrowLeft", 0, 13), 0);
  });

  test("senza una scelta la freccia porta alla prima; senza stazioni nulla", () => {
    assert.equal(c.indiceDaTasto("ArrowRight", -1, 13), 0);
    assert.equal(c.indiceDaTasto("ArrowLeft", -1, 13), 0);
    assert.equal(c.indiceDaTasto("ArrowRight", -1, 0), null);
    assert.equal(c.indiceDaTasto("Enter", 3, 13), null);
  });
});

describe("giradischi", () => {
  test("il piatto accelera in 1,2 s e frena in 1,5 s", () => {
    const dt = 1 / 60;
    let p = 0;
    for (let i = 0; i < 71; i++) p = c.passoVelocita(p, 1, dt);
    assert.ok(p < 1, "dopo 71 fotogrammi non è ancora a regime");
    p = c.passoVelocita(p, 1, dt);
    vicino(p, 1, 1e-9);
    for (let i = 0; i < 89; i++) p = c.passoVelocita(p, 0, dt);
    assert.ok(p > 0, "dopo 89 fotogrammi gira ancora");
    p = c.passoVelocita(p, 0, dt);
    vicino(p, 0, 1e-9);
    assert.equal(c.ACCELERA_S, 1.2);
    assert.equal(c.FRENA_S, 1.5);
  });

  test("la velocità parte e si ferma morbida (e non esce da 0..1)", () => {
    assert.equal(c.velocitaDisco(0), 0);
    assert.equal(c.velocitaDisco(1), 1);
    assert.equal(c.velocitaDisco(0.5), 0.5);
    assert.ok(c.velocitaDisco(0.1) < 0.1, "all'inizio cresce piano");
    assert.equal(c.velocitaDisco(2), 1);
    assert.equal(c.velocitaDisco(-1), 0);
  });

  test("il braccio: a riposo da fermo, sul disco dal primo solco verso il centro", () => {
    assert.equal(c.angoloBraccio("fermo", 0.7), 0);
    assert.equal(c.angoloBraccio("suona", 0), 24);
    assert.equal(c.angoloBraccio("suona", 1), 43);
    assert.equal(c.angoloBraccio("pausa", 0.5), 33.5);
    assert.equal(c.angoloBraccio("suona", Number.NaN), 24);
    assert.equal(c.angoloBraccio("suona", 3), 43);
  });

  test("il braccio è alzato tranne quando suona o è a riposo", () => {
    assert.equal(c.braccioAlzato("suona"), false);
    assert.equal(c.braccioAlzato("fermo"), false);
    for (const fase of ["pausa", "avvio", "cambio"]) assert.equal(c.braccioAlzato(fase), true);
  });

  test("da fermo a suona: il braccio va sul disco (1 s) e poi si posa", () => {
    assert.deepEqual(c.transizioneGiradischi("fermo", "suona", false), {
      fase: "avvio",
      braccioMs: 1000,
      curva: true,
      poi: "suona",
      dopoMs: 1150,
    });
  });

  test("pausa e ripresa: il braccio si alza e si riabbassa, senza tornare a riposo", () => {
    assert.deepEqual(c.transizioneGiradischi("suona", "pausa", false), { fase: "pausa", braccioMs: 300, curva: false });
    assert.deepEqual(c.transizioneGiradischi("pausa", "suona", false), {
      fase: "avvio",
      braccioMs: 300,
      curva: true,
      poi: "suona",
      dopoMs: 650,
    });
  });

  test("un disco nuovo mentre suona: il braccio torna al primo solco e si riposa", () => {
    assert.deepEqual(c.transizioneGiradischi("suona", "suona", true), {
      fase: "cambio",
      braccioMs: 650,
      curva: true,
      poi: "suona",
      dopoMs: 800,
    });
    assert.deepEqual(c.transizioneGiradischi("pausa", "pausa", true), { fase: "pausa", braccioMs: 650, curva: true });
  });

  test("fermarsi riporta il braccio a riposo; niente da fare se non cambia nulla", () => {
    assert.deepEqual(c.transizioneGiradischi("suona", "fermo", false), { fase: "fermo", braccioMs: 1000, curva: true });
    assert.equal(c.transizioneGiradischi("fermo", "fermo", true), null);
    assert.equal(c.transizioneGiradischi("suona", "suona", false), null);
    assert.equal(c.transizioneGiradischi("avvio", "suona", false), null);
    assert.equal(c.transizioneGiradischi("pausa", "pausa", false), null);
  });
});

describe("indicatori di livello", () => {
  test("a volume zero restano spenti; sempre tra 0 e 1,05", () => {
    for (let t = 0; t < 5; t += 0.07) {
      assert.equal(c.livelloSimulato(t, 0, 0, Math.random()), 0);
      for (const v of [0.3, 1]) {
        const l = c.livelloSimulato(t, 1, v, Math.random());
        assert.ok(l >= 0 && l <= 1.05, `livello ${l}`);
      }
    }
  });

  test("più volume, più livello", () => {
    const media = (v) => {
      let somma = 0;
      for (let t = 0; t < 10; t += 0.06) somma += c.livelloSimulato(t, 0, v, 0.5);
      return somma;
    };
    assert.ok(media(1) > media(0.4));
    assert.ok(media(0.4) > media(0.1));
  });

  test("salgono subito e scendono piano", () => {
    assert.equal(c.cadutaLivello(0.2, 0.9), 0.9);
    vicino(c.cadutaLivello(0.9, 0.2), 0.83);
    assert.equal(c.cadutaLivello(0.25, 0.2), 0.2);
  });

  test("segmenti accesi e picco che resta acceso 0,8 s", () => {
    assert.equal(c.segmentiAccesi(0), 0);
    assert.equal(c.segmentiAccesi(0.5), 8);
    assert.equal(c.segmentiAccesi(1), 16);
    assert.equal(c.segmentiAccesi(1.05), 16);
    const picco = { n: 12, t: 10 };
    assert.equal(c.aggiornaPicco(picco, 5, 10.5), picco, "dopo mezzo secondo il picco resta");
    assert.deepEqual(c.aggiornaPicco(picco, 5, 10.9), { n: 5, t: 10.9 });
    assert.deepEqual(c.aggiornaPicco(picco, 14, 10.1), { n: 14, t: 10.1 });
  });
});

describe("display", () => {
  test("il tempo per le cifre a segmenti, con la cifra spenta davanti sotto i 10 minuti", () => {
    assert.equal(c.tempoSegmenti(0), "!0:00");
    assert.equal(c.tempoSegmenti(83), "!1:23");
    assert.equal(c.tempoSegmenti(59.6), "!0:59", "i secondi si contano interi: mai 0:60");
    assert.equal(c.tempoSegmenti(600), "10:00");
    assert.equal(c.tempoSegmenti(5999), "99:59");
    assert.equal(c.tempoSegmenti(Number.NaN), "!0:00");
    assert.equal(c.tempoSegmenti(-5), "!0:00");
  });

  test("i brani da un'ora in su (i set) con le ore", () => {
    assert.equal(c.servonoOre(3599), false);
    assert.equal(c.servonoOre(3600), true);
    assert.equal(c.servonoOre(Number.NaN), false);
    assert.equal(c.tempoSegmenti(3725, { ore: true }), "1:02:05");
    assert.equal(c.tempoSegmenti(83, { ore: true }), "0:01:23");
    assert.equal(c.tempoSegmenti(6000), "1:40:00", "oltre 99:59 le ore servono comunque");
    assert.equal(c.FANTASMA_TEMPO_ORE.length, "1:02:05".length);
  });

  test("il numero di traccia: almeno due cifre", () => {
    assert.equal(c.cifreTraccia(3), "03");
    assert.equal(c.cifreTraccia(12), "12");
    assert.equal(c.cifreTraccia(238), "238");
  });

  test("lo scorrimento: mai più veloce di un passaggio ogni 5 s", () => {
    assert.equal(c.durataScorrimento(0), 5);
    vicino(c.durataScorrimento(520), 530 / 26 + 3);
  });
});

describe("etichette dei dischi", () => {
  test("ogni coppia carta/inchiostro si legge almeno 4,5:1", () => {
    for (const { carta, inchiostro } of c.ETICHETTE) {
      const r = c.contrasto(carta, inchiostro);
      assert.ok(r >= 4.5, `${inchiostro} su ${carta}: ${r.toFixed(2)}:1`);
    }
  });

  test("lo stesso disco ha sempre la stessa etichetta, e si usano tutti i colori", () => {
    assert.equal(c.coloreEtichetta("a1b2c3d4e5f6"), c.coloreEtichetta("a1b2c3d4e5f6"));
    const visti = new Set();
    for (let i = 0; i < 200; i++) {
      const e = c.coloreEtichetta(`brano-${i}`);
      assert.ok(c.ETICHETTE.includes(e));
      visti.add(e);
    }
    assert.equal(visti.size, c.ETICHETTE.length);
    assert.ok(c.ETICHETTE.includes(c.coloreEtichetta("")));
  });

  test("id con le stesse cifre in un altro ordine non finiscono tutti nello stesso colore", () => {
    const base = "a1b2c3d4e5f6";
    const rotazioni = [...base].map((_, i) => base.slice(i) + base.slice(0, i));
    const colori = new Set(rotazioni.map((id) => c.coloreEtichetta(id)));
    assert.ok(colori.size >= 5, `12 rotazioni di ${base}: solo ${colori.size} colori`);
  });

  test("con gli id veri del catalogo (12 cifre esadecimali) i colori si dividono in parti quasi uguali", () => {
    let seme = 7;
    const caso = () => {
      seme = (seme * 1103515245 + 12345) % 2147483648;
      return seme / 2147483648;
    };
    const conta = new Map(c.ETICHETTE.map((e) => [e, 0]));
    const quanti = 4000;
    for (let k = 0; k < quanti; k++) {
      let id = "";
      for (let j = 0; j < 12; j++) id += "0123456789abcdef"[Math.floor(caso() * 16)];
      const e = c.coloreEtichetta(id);
      conta.set(e, (conta.get(e) ?? 0) + 1);
    }
    for (const n of conta.values()) {
      assert.ok(n > quanti * 0.09 && n < quanti * 0.16, `un colore esce ${n} volte su ${quanti}`);
    }
  });
});

describe("colori e contrasti", () => {
  test("legge #rgb, #rrggbb e rgb() con la trasparenza", () => {
    assert.deepEqual(c.leggiColore("#fff"), [255, 255, 255, 1]);
    assert.deepEqual(c.leggiColore(" #0c1c1a "), [12, 28, 26, 1]);
    assert.deepEqual(c.leggiColore("rgb(70 190 160 / 0.13)"), [70, 190, 160, 0.13]);
    assert.deepEqual(c.leggiColore("rgba(1, 2, 3, 0.5)"), [1, 2, 3, 0.5]);
    assert.throws(() => c.leggiColore("linear-gradient(red, blue)"));
  });

  test("componi: un velo trasparente steso su un colore", () => {
    assert.equal(c.componi(["#000000", "rgb(255 255 255 / 0.5)"]), "#808080");
    assert.equal(c.componi(["#123456"]), "#123456");
  });

  test("il contrasto WCAG: 21 tra nero e bianco, 1 tra colori uguali, uguale nei due versi", () => {
    vicino(c.contrasto("#000", "#fff"), 21);
    assert.equal(c.contrasto("#7df9e6", "#7df9e6"), 1);
    assert.equal(c.contrasto("#26272b", "#c9c5bb"), c.contrasto("#c9c5bb", "#26272b"));
  });
});
