// I "gettoni" dello stile hi-fi (css/base.css), i componenti (css/componenti.css) e la disposizione
// delle schermate (css/schermate.css): i contrasti delle coppie testo/fondo, nessun gettone inventato,
// solo classi hf- (base.css fatto solo di variabili e caratteri), le regole sul movimento (si animano
// solo transform e opacity; con "riduci movimento" i tempi vanno a zero e le animazioni si fermano),
// più le misure minime (testo da 12 px, tasti da 44 px). Se cambi un colore, un pezzo o una
// schermata, questi test dicono se regge ancora.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { COPPIE_CONTRASTO, misuraContrasti } from "../js/ui/hifi/calcoli.js";

const radice = join(dirname(fileURLToPath(import.meta.url)), "..");
const senzaCommenti = (testo) => testo.replace(/\/\*[\s\S]*?\*\//g, "");
const base = senzaCommenti(readFileSync(join(radice, "css", "base.css"), "utf-8"));
const componenti = senzaCommenti(readFileSync(join(radice, "css", "componenti.css"), "utf-8"));
const schermate = senzaCommenti(readFileSync(join(radice, "css", "schermate.css"), "utf-8"));
// I due fogli con le regole sui pezzi della pagina (base.css ha solo variabili).
const fogli = { "componenti.css": componenti, "schermate.css": schermate };

/**
 * Le regole di un foglio: [{ prelude, corpo, dentro }], anche quelle dentro @media e @container
 * (dentro = il prelude del blocco che le contiene, "" se stanno fuori).
 */
function regole(css) {
  const trovate = [];
  const pila = [];
  let inizio = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") {
      pila.push({ prelude: css.slice(inizio, i).trim(), da: i + 1 });
      inizio = i + 1;
    } else if (css[i] === "}") {
      const aperta = pila.pop();
      if (aperta)
        trovate.push({ prelude: aperta.prelude, corpo: css.slice(aperta.da, i), dentro: pila.at(-1)?.prelude ?? "" });
      inizio = i + 1;
    }
  }
  return trovate;
}

/** Le dichiarazioni di un corpo di regola (senza le regole annidate): [[proprietà, valore]]. */
function dichiarazioni(corpo) {
  return corpo
    .replace(/[^{}]*\{[^{}]*\}/g, "")
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d.includes(":"))
    .map((d) => {
      const i = d.indexOf(":");
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
    });
}

/** Divide alle virgole che non stanno dentro parentesi ("transform 1s cubic-bezier(.1,.2,.3,.4), opacity 1s"). */
function dividiVirgole(valore) {
  const parti = [];
  let profondita = 0;
  let pezzo = "";
  for (const ch of valore) {
    if (ch === "(") profondita++;
    if (ch === ")") profondita--;
    if (ch === "," && profondita === 0) {
      parti.push(pezzo.trim());
      pezzo = "";
    } else pezzo += ch;
  }
  if (pezzo.trim()) parti.push(pezzo.trim());
  return parti;
}

// I gettoni: le variabili del blocco :root principale di base.css (il primo; il secondo è quello
// dentro @media prefers-reduced-motion).
const regoleBase = regole(base);
const [radiceBase, radiceRiduci] = regoleBase.filter((r) => r.prelude === ":root");
const gettoni = Object.fromEntries(dichiarazioni(radiceBase?.corpo ?? "").filter(([p]) => p.startsWith("--hf-")));

test("base.css: i gettoni ci sono (colori, ombre, raggi, caratteri, misure, tempi)", () => {
  assert.ok(Object.keys(gettoni).length > 50, `gettoni trovati: ${Object.keys(gettoni).length}`);
  for (const nome of ["--hf-metallo", "--hf-vfd", "--hf-ambra", "--hf-led-verde", "--hf-led-arancio", "--hf-fuoco"]) {
    assert.ok(gettoni[nome], `manca ${nome}`);
  }
});

test("contrasti: ogni coppia testo/fondo dello stile regge il suo minimo (testo 4,5:1, grafica 3:1)", () => {
  const misure = misuraContrasti((nome) => {
    assert.ok(gettoni[nome], `il gettone ${nome} (in COPPIE_CONTRASTO) non c'è in base.css`);
    return gettoni[nome];
  });
  assert.equal(misure.length, COPPIE_CONTRASTO.length);
  const deboli = misure
    .filter((m) => !m.regge)
    .map((m) => `${m.uso}: ${m.rapporto.toFixed(2)}:1 (serve ${m.minimo}:1)`);
  assert.deepEqual(deboli, []);
});

test("ogni gettone usato senza un valore di riserva esiste (in base.css o dichiarato nei fogli)", () => {
  const dichiarati = new Set([
    ...Object.keys(gettoni),
    ...Object.values(fogli).flatMap((css) => regole(css).flatMap((r) => dichiarazioni(r.corpo).map(([p]) => p))),
  ]);
  const usati = [...`${base}\n${componenti}\n${schermate}`.matchAll(/var\(\s*(--hf-[\w-]+)\s*\)/g)].map((m) => m[1]);
  const mancanti = [...new Set(usati.filter((nome) => !dichiarati.has(nome)))];
  assert.deepEqual(mancanti, [], "gettoni usati ma mai definiti");
});

test("componenti.css e schermate.css: solo classi col prefisso hf-", () => {
  for (const [nome, css] of Object.entries(fogli)) {
    const classi = regole(css)
      .filter((r) => !r.prelude.startsWith("@"))
      .flatMap((r) => [...r.prelude.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));
    assert.ok(classi.length > 50, `${nome}: classi trovate ${classi.length}`);
    assert.deepEqual([...new Set(classi.filter((c) => !c.startsWith("hf-")))], [], nome);
  }
});

test("base.css: solo variabili e caratteri, nessuna regola su elementi della pagina", () => {
  const ammessi = [":root", ":root.hf-fermo", "@font-face", "@media (prefers-reduced-motion: reduce)"];
  const altri = regoleBase.map((r) => r.prelude).filter((p) => !ammessi.includes(p));
  assert.deepEqual(altri, []);
  for (const r of regoleBase.filter((x) => x.prelude.startsWith(":root"))) {
    const nonVariabili = dichiarazioni(r.corpo).filter(([p]) => !p.startsWith("--hf-"));
    assert.deepEqual(nonVariabili, [], `${r.prelude}: solo variabili --hf-`);
  }
});

test("movimento: le transizioni e le animazioni muovono solo transform e opacity", () => {
  const ammesse = new Set(["transform", "opacity"]);
  for (const [nome, css] of Object.entries(fogli)) {
    for (const r of regole(css)) {
      for (const [proprieta, valore] of dichiarazioni(r.corpo)) {
        if (proprieta === "transition" || proprieta === "transition-property") {
          for (const parte of dividiVirgole(valore)) {
            const animata = parte.split(/\s+/)[0];
            assert.ok(ammesse.has(animata), `${nome}, ${r.prelude}: si anima ${animata}`);
          }
        }
      }
    }
    const fotogrammi = regole(css).filter((r) => /^(\d+%|from|to)/.test(r.prelude));
    assert.ok(fotogrammi.length > 0, `${nome}: c'è almeno un'animazione (scorrimento del display, rotella)`);
    for (const f of fotogrammi) {
      for (const [proprieta] of dichiarazioni(f.corpo))
        assert.ok(ammesse.has(proprieta), `${nome}: @keyframes anima ${proprieta}`);
    }
  }
  // ...e i componenti in JavaScript: le transizioni che scrivono riguardano solo transform.
  const cartella = join(radice, "js", "ui", "hifi");
  for (const file of readdirSync(cartella).filter((f) => f.endsWith(".js"))) {
    const codice = readFileSync(join(cartella, file), "utf-8");
    for (const m of codice.matchAll(/style\.transition\s*=\s*([^;]+);/g)) {
      const testo = m[1].replace(/\$\{[^}]*\}/g, "");
      assert.doesNotMatch(testo, /\b(filter|width|height|top|left|box-shadow|background|color)\b/, `${file}: ${m[1]}`);
    }
  }
});

test("riduci movimento: tutti i tempi dei gettoni vanno a 0 (dal sistema e forzato con hf-fermo)", () => {
  const tempi = Object.keys(gettoni).filter((nome) => nome.startsWith("--hf-tempo-"));
  assert.ok(tempi.length >= 3);
  const forzato = regoleBase.find((r) => r.prelude === ":root.hf-fermo");
  for (const blocco of [radiceRiduci, forzato]) {
    assert.ok(blocco, "manca un blocco di riduci movimento");
    const valori = Object.fromEntries(dichiarazioni(blocco.corpo));
    for (const nome of tempi) assert.equal(valori[nome], "0ms", `${nome} con riduci movimento`);
  }
});

// Le animazioni che non dipendono dai gettoni dei tempi (la rotella d'attesa di schermate.css): ogni
// selettore animato deve comparire, con animation: none, sia con "riduci movimento" del sistema sia
// con quello forzato (hf-fermo).
test("riduci movimento: le animazioni di schermate.css si fermano (dal sistema e forzato con hf-fermo)", () => {
  const tutte = regole(schermate);
  const animati = tutte
    .filter((r) => !r.prelude.startsWith("@") && !/^(\d+%|from|to)/.test(r.prelude))
    .filter((r) => dichiarazioni(r.corpo).some(([p, v]) => p === "animation" && v !== "none"))
    .flatMap((r) => r.prelude.split(",").map((s) => s.trim()));
  assert.ok(animati.length >= 2, `selettori animati: ${animati}`);
  const fermati = (filtro) =>
    tutte
      .filter(filtro)
      .filter((r) => dichiarazioni(r.corpo).some(([p, v]) => p === "animation" && v === "none"))
      .flatMap((r) => r.prelude.split(",").map((s) => s.trim()));
  const dalSistema = new Set(fermati((r) => r.dentro === "@media (prefers-reduced-motion: reduce)"));
  const forzati = new Set(fermati((r) => r.prelude.includes(":root.hf-fermo")));
  for (const s of animati) {
    assert.ok(dalSistema.has(s), `${s}: non si ferma con "riduci movimento" del sistema`);
    assert.ok(forzati.has(`:root.hf-fermo ${s}`), `${s}: non si ferma con hf-fermo`);
  }
});

test("misure minime: nessun testo sotto i 12 px, tasti di almeno 44 px", () => {
  const piccoli = [];
  for (const [nome, css] of Object.entries(fogli)) {
    for (const r of regole(css)) {
      for (const [proprieta, valore] of dichiarazioni(r.corpo)) {
        if (proprieta !== "font-size" || valore === "inherit") continue;
        const px = /^(\d+(?:\.\d+)?)px$/.exec(valore);
        const conMinimo = /^max\(\s*(\d+)px\s*,/.exec(valore);
        if (px && Number(px[1]) >= 12) continue;
        if (conMinimo && Number(conMinimo[1]) >= 12) continue;
        piccoli.push(`${nome}, ${r.prelude}: ${valore}`);
      }
    }
  }
  assert.deepEqual(piccoli, []);
  assert.equal(gettoni["--hf-tocco-min"], "44px");
  assert.equal(gettoni["--hf-testo-min"], "12px");
  const tasto = regole(componenti).find((r) => r.prelude === ".hf-tasto");
  const d = Object.fromEntries(dichiarazioni(tasto?.corpo ?? ""));
  assert.equal(d["min-width"], "var(--hf-tocco-min)");
  assert.equal(d["min-height"], "var(--hf-tocco-min)");
});
