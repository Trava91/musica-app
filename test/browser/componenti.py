"""Prova nel browser della pagina dei componenti hi-fi (anteprima/componenti.html, Fase 8 del restauro).

Controlla, con Chrome e lo stesso scudo CSP dell'app:
1. la pagina si apre senza errori né violazioni della CSP, a 390 px (telefono) e a 1.280 px (PC);
2. nessuno scorrimento orizzontale a 390 e a 320 px; nessun testo dei componenti sotto i 12 px;
3. tutte le coppie di colori reggono il contrasto (la lista misurata dalla pagina);
4. tastiera: ogni elemento si raggiunge col Tab; manopola (frecce, Pagina, Inizio/Fine, rotella, trascinamento
   in cerchio; spenta non si gira), scala (frecce, Inizio/Fine, tocco), tasti con LED, finestra a comparsa
   (fuoco dentro, Invio, Esc, tocco fuori, il fuoco torna al tasto di partenza);
5. movimento: ▶ fa accelerare il disco e scendere il braccio, le barre si muovono, il titolo lungo scorre; in
   pausa il disco frena e il braccio si alza; fuori dallo schermo barre, scorrimento e disco si fermano;
6. "riduci movimento" (del sistema e simulato con l'interruttore della pagina): niente si muove.

Lancio (dalla cartella app/):  npm run prova:componenti   (con  -- --foto <cartella>  salva anche le schermate)
Serve: Playwright per Python e Google Chrome installato. Non tocca nulla di vero: server locale, dati inventati.
"""

import argparse
import math
import re
import sys
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# La console di Windows è in cp1252: senza questo il "✓" fa crashare lo script.
for _s in (sys.stdout, sys.stderr):
    _s.reconfigure(encoding="utf-8", errors="replace")

from playwright.sync_api import Error as ErrorePlaywright  # noqa: E402
from playwright.sync_api import expect, sync_playwright  # noqa: E402

APP = Path(__file__).resolve().parents[2]
PAGINA = "/anteprima/componenti.html"
ATTESA_MS = 10_000

# Registra le violazioni della CSP (uno stile o uno script dentro la pagina che lo scudo blocca).
SPIA_CSP = """
window.__csp = [];
document.addEventListener("securitypolicyviolation", (e) => {
  window.__csp.push(`${e.violatedDirective} ${e.blockedURI || "inline"} ${e.sourceFile || ""}:${e.lineNumber || ""}`);
});
"""

# I segmenti dei livelli dell'Insieme come stringa di 0 e 1: se cambia, le barre si muovono.
FIRMA_LIVELLI = """() => [...document.querySelectorAll('#pz-insieme-display .hf-liv-seg')]
  .map((s) => (s.classList.contains('hf-on') ? 1 : 0)).join('')"""

DISCO = """() => {
  const disco = document.querySelector('#pz-insieme-giradischi .hf-disco');
  const giro = disco.getAnimations()[0];
  const braccio = document.querySelector('#pz-insieme-giradischi .hf-braccio');
  const angolo = /rotate\\(([-\\d.]+)deg\\)/.exec(braccio.style.transform);
  return {
    stato: giro ? giro.playState : null,
    velocita: giro ? giro.playbackRate : 0,
    angolo: angolo ? Number(angolo[1]) : null,
    su: braccio.dataset.su,
    transizione: braccio.style.transition,
  };
}"""

IN_MOVIMENTO = "() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => a.animationName || a.constructor.name)"


class Gestore(SimpleHTTPRequestHandler):
    def log_message(self, *argomenti):  # niente rumore in console
        pass


def passo(testo: str) -> None:
    print(f"✓ {testo}", flush=True)


def apri(browser, base: str, problemi: list[str], larghezza: int = 390, **contesto):
    pagina = browser.new_context(viewport={"width": larghezza, "height": 844}, **contesto).new_page()
    pagina.set_default_timeout(ATTESA_MS)
    pagina.add_init_script(SPIA_CSP)
    pagina.on("pageerror", lambda e: problemi.append(f"errore nella pagina: {e}"))
    pagina.on("console", lambda m: problemi.append(f"console.error: {m.text}") if m.type == "error" else None)
    pagina.on("dialog", lambda d: (problemi.append(f"finestra di sistema inattesa: {d.type}"), d.dismiss()))
    pagina.goto(f"{base}{PAGINA}")
    pagina.wait_for_selector("#pz-contrasti li")
    pagina.evaluate("() => document.fonts.ready.then(() => true)")
    pagina.wait_for_timeout(200)  # le righe dei display si rimisurano a caratteri arrivati
    return pagina


def controlla_csp(pagina, dove: str) -> None:
    violazioni = pagina.evaluate("() => window.__csp")
    assert not violazioni, f"{dove}: lo scudo CSP ha bloccato {violazioni}"


def senza_scorrimento(pagina, larghezza: int) -> None:
    pagina.set_viewport_size({"width": larghezza, "height": 844})
    pagina.wait_for_timeout(250)
    largo = pagina.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    assert largo[0] <= largo[1], f"a {larghezza} px la pagina scorre di lato ({largo[0]} > {largo[1]})"


def giro_aspetto(pagina) -> None:
    controlla_csp(pagina, "390 px")
    passo("390 px: nessun errore, nessuna violazione dello scudo CSP")
    senza_scorrimento(pagina, 390)
    senza_scorrimento(pagina, 320)
    passo("nessuno scorrimento orizzontale a 390 e a 320 px")
    pagina.set_viewport_size({"width": 390, "height": 844})
    piccoli = pagina.evaluate("""() => {
      const fuori = [];
      const giro = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = giro.nextNode(); n; n = giro.nextNode()) {
        const el = n.parentElement;
        if (!n.textContent.trim() || !el.closest('[class*="hf-"]') || el.closest('.hf-sr')) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px < 12) fuori.push(`${el.className}: ${px}px «${n.textContent.trim().slice(0, 24)}»`);
      }
      return fuori;
    }""")
    assert not piccoli, f"testi sotto i 12 px: {piccoli[:5]}"
    passo("nessun testo dei componenti sotto i 12 px")
    misure = pagina.evaluate(
        "() => [...document.querySelectorAll('#pz-contrasti li')].map((li) => [li.dataset.contrasto, li.textContent])"
    )
    deboli = [testo for esito, testo in misure if esito != "regge"]
    assert len(misure) >= 20 and not deboli, f"contrasti che non reggono: {deboli}"
    passo(f"contrasti: le {len(misure)} coppie reggono (testo 4,5:1, grafica 3:1)")


def giro_tab(pagina) -> None:
    """Ogni elemento che si può usare si raggiunge col Tab (nelle scale: la stazione scelta)."""
    totale = pagina.evaluate("""() => {
      const tutti = [...document.querySelectorAll('button, input, a[href], [tabindex]')]
        .filter((e) => e.tabIndex >= 0 && !e.disabled && e.getClientRects().length > 0);
      tutti.forEach((e, i) => { e.dataset.tabProva = String(i); });
      return tutti.length;
    }""")
    pagina.evaluate("() => { document.activeElement?.blur(); window.scrollTo(0, 0); }")
    visti = set()
    for _ in range(totale + 15):
        pagina.keyboard.press("Tab")
        indice = pagina.evaluate("() => document.activeElement?.dataset?.tabProva ?? null")
        if indice is not None:
            visti.add(indice)
    mancanti = pagina.evaluate(
        "(visti) => [...document.querySelectorAll('[data-tab-prova]')].filter((e) => !visti.includes(e.dataset.tabProva))"
        ".map((e) => e.getAttribute('aria-label') || e.textContent.trim().slice(0, 30) || e.id || e.className)",
        list(visti),
    )
    assert not mancanti, f"elementi che il Tab non raggiunge: {mancanti}"
    passo(f"Tab: raggiunti tutti i {totale} elementi da usare")


def giro_manopola(pagina) -> None:
    m = pagina.locator("#pz-manopola-vera .hf-manopola")
    m.focus()
    for tasto, atteso in (("ArrowUp", "63"), ("PageUp", "73"), ("ArrowLeft", "72"), ("End", "100"), ("Home", "0")):
        pagina.keyboard.press(tasto)
        expect(m).to_have_attribute("aria-valuenow", atteso)
    expect(m).to_have_attribute("aria-valuetext", "muto")
    expect(pagina.locator("#pz-manopola-display .hf-vfd-riga")).to_contain_text("MUTO")
    m.hover()
    pagina.mouse.wheel(0, -100)
    expect(m).to_have_attribute("aria-valuenow", "2")
    pagina.keyboard.press("Home")
    passo("manopola: frecce ±1, Pagina ±10, Inizio = muto, Fine = 100, rotella ±2")
    # Trascinamento in cerchio: da sinistra (-90°) a in alto (0°) = 90° di giro = un terzo della corsa.
    m.scroll_into_view_if_needed()
    box = m.bounding_box()
    cx, cy, r = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, box["width"] * 0.4
    pagina.mouse.move(cx - r, cy)
    pagina.mouse.down()
    for k in range(1, 19):
        a = math.radians(-90 + 5 * k)
        pagina.mouse.move(cx + r * math.sin(a), cy - r * math.cos(a))
    pagina.mouse.up()
    valore = int(m.get_attribute("aria-valuenow"))
    assert 31 <= valore <= 35, f"girando di 90° la manopola dovrebbe arrivare a 33, è a {valore}"
    passo(f"manopola: girata col mouse in cerchio di 90°, da 0 a {valore}")
    spenta = pagina.locator("#pz-manopola-spenta .hf-manopola")
    expect(spenta).to_have_attribute("aria-disabled", "true")
    spenta.focus()
    pagina.keyboard.press("ArrowUp")
    expect(spenta).to_have_attribute("aria-valuenow", "75")
    expect(pagina.locator("#pz-avviso")).to_contain_text("app esterna")
    passo("manopola spenta: non si gira e dice che il volume lo decide l'app esterna")


def giro_scala(pagina) -> None:
    gruppo = pagina.locator("#pz-scala-generi [role=radiogroup]")
    scelta = gruppo.locator("[aria-checked=true]")
    expect(scelta).to_have_attribute("data-id", "swing")
    scelta.focus()
    for tasto, atteso in (("ArrowRight", "rock"), ("End", "ambient"), ("Home", "house"), ("ArrowLeft", "house")):
        pagina.keyboard.press(tasto)
        expect(gruppo.locator("[aria-checked=true]")).to_have_attribute("data-id", atteso)
        assert pagina.evaluate("() => document.activeElement.dataset.id") == atteso
    gruppo.locator("[data-id=jazz]").click()
    expect(gruppo.locator("[aria-checked=true]")).to_have_attribute("data-id", "jazz")
    expect(pagina.locator("#pz-scala-generi-dettaglio")).to_contain_text("Jazz")
    assert gruppo.locator("[tabindex='0']").count() == 1, "nella scala si entra col Tab da una stazione sola"
    passo("scala: frecce, Inizio/Fine e tocco; una sola stazione col Tab; l'indice segue")


def giro_tasti(pagina) -> None:
    casuale = pagina.locator("[data-prova=casuale]")
    casuale.focus()
    pagina.keyboard.press("Space")
    expect(casuale).to_have_attribute("aria-pressed", "true")
    expect(casuale.locator(".hf-led")).to_have_class(re.compile(r"\bhf-acceso\b"))
    ripeti = pagina.locator("[data-prova=ripeti]")
    ripeti.focus()
    pagina.keyboard.press("Enter")
    expect(ripeti).to_have_attribute("aria-label", "Ripeti: tutta la coda")
    expect(ripeti.locator(".hf-tasto-modo")).to_have_text("TUTTI")
    passo("tasti con LED: casuale si accende (e resta giù), ripeti gira NO → TUTTI")


def giro_finestra(pagina) -> None:
    velo = pagina.locator("#pz-velo")
    pagina.click("#pz-apri-testo")
    expect(velo).to_be_visible()
    assert pagina.evaluate("() => document.activeElement.id") == "pz-campo-finestra"
    pagina.fill("#pz-campo-finestra", "Prova")
    pagina.keyboard.press("Enter")
    expect(velo).to_be_hidden()
    expect(pagina.locator("#pz-esito-finestra")).to_have_text("Creata: «Prova»")
    assert pagina.evaluate("() => document.activeElement.id") == "pz-apri-testo"
    passo("finestra col campo: il fuoco va nel campo, Invio conferma, il fuoco torna al tasto")
    pagina.click("#pz-apri-conferma")
    expect(velo).to_be_visible()
    pagina.keyboard.press("Tab")
    assert pagina.evaluate("() => document.activeElement.hasAttribute('data-chiudi')"), "il Tab esce dalla finestra"
    pagina.keyboard.press("Escape")
    expect(velo).to_be_hidden()
    expect(pagina.locator("#pz-esito-finestra")).to_have_text("Chiusa con Esc")
    assert pagina.evaluate("() => document.activeElement.id") == "pz-apri-conferma"
    pagina.click("#pz-apri-conferma")
    pagina.mouse.click(5, 5)
    expect(velo).to_be_hidden()
    expect(pagina.locator("#pz-esito-finestra")).to_have_text("Chiusa con un tocco fuori")
    passo("finestra di conferma: il fuoco resta dentro, Esc e un tocco fuori la chiudono")


def giro_movimento(pagina) -> None:
    pagina.evaluate("() => window.scrollTo(0, 0)")
    prima = pagina.evaluate(DISCO)
    assert prima["su"] == "si" and prima["stato"] in (None, "paused"), (
        f"all'inizio in pausa col braccio alzato: {prima}"
    )
    pagina.click("#pz-suona")
    pagina.wait_for_timeout(1800)
    d = pagina.evaluate(DISCO)
    assert d["stato"] == "running" and abs(d["velocita"] - 1) < 0.01, f"il disco non gira a 33⅓: {d}"
    assert d["su"] == "no" and 24 <= d["angolo"] <= 43, f"il braccio non è sul solco: {d}"
    firme = set()
    for _ in range(4):
        firme.add(pagina.evaluate(FIRMA_LIVELLI))
        pagina.wait_for_timeout(150)
    assert len(firme) > 1 and any("1" in f for f in firme), "mentre suona le barre non si muovono"
    passo(f"▶: il disco arriva a 33⅓, il braccio scende sul solco ({d['angolo']:.1f}°), le barre si muovono")
    lungo = pagina.locator('[data-display="lungo"] .hf-vfd-titolo')
    expect(lungo).to_have_class(re.compile(r"\bhf-lungo\b"))
    expect(pagina.locator('[data-display="pausa"] .hf-vfd-titolo')).not_to_have_class(re.compile(r"\bhf-lungo\b"))
    lungo.scroll_into_view_if_needed()
    pagina.wait_for_timeout(300)
    stato = pagina.evaluate("""() => document.querySelector('[data-display="lungo"] .hf-vfd-titolo .hf-vfd-scorre')
      .getAnimations()[0]?.playState""")
    assert stato == "running", f"il titolo lungo non scorre: {stato}"
    passo("display: il titolo lungo scorre, quello corto resta fermo")
    # Fuori dallo schermo si ferma tutto (qui l'Insieme è sparito in alto).
    fuori = pagina.evaluate("""() => ({
      vfd: document.querySelector('#pz-insieme-display .hf-vfd').classList.contains('hf-in-pausa'),
      disco: document.querySelector('#pz-insieme-giradischi .hf-disco').getAnimations()[0]?.playState,
    })""")
    f1 = pagina.evaluate(FIRMA_LIVELLI)
    pagina.wait_for_timeout(400)
    f2 = pagina.evaluate(FIRMA_LIVELLI)
    assert fuori["vfd"] and fuori["disco"] == "paused" and f1 == f2, f"fuori dallo schermo qualcosa si muove: {fuori}"
    passo("fuori dallo schermo: barre, scorrimento e disco fermi")
    pagina.evaluate("() => window.scrollTo(0, 0)")
    pagina.wait_for_timeout(400)
    assert pagina.evaluate(DISCO)["stato"] == "running", "tornato in vista il disco non riparte"
    pagina.click("#pz-suona")
    pagina.wait_for_timeout(1900)
    d = pagina.evaluate(DISCO)
    assert d["stato"] == "paused" and d["su"] == "si", f"in pausa il disco deve fermarsi e il braccio alzarsi: {d}"
    passo("⏸: il disco frena fino a fermarsi, il braccio si alza")


def giro_riduci(pagina, come: str) -> None:
    pagina.evaluate("() => window.scrollTo(0, 0)")
    if pagina.evaluate(DISCO)["su"] == "si":
        pagina.click("#pz-suona")
    pagina.wait_for_timeout(1300)
    in_moto = pagina.evaluate(IN_MOVIMENTO)
    assert not in_moto, f"{come}: si muovono ancora {in_moto}"
    assert pagina.locator(".hf-lungo").count() == 0, f"{come}: un testo scorre"
    f1 = pagina.evaluate(FIRMA_LIVELLI)
    pagina.wait_for_timeout(400)
    assert f1 == pagina.evaluate(FIRMA_LIVELLI) and "1" not in f1, f"{come}: le barre si muovono"
    d = pagina.evaluate(DISCO)
    assert d["transizione"] == "none" and d["su"] == "no", f"{come}: il braccio non cambia posto di colpo ({d})"
    passo(f"{come}: con ▶ niente si muove (disco, barre, scorrimento), il braccio cambia posto senza animazione")


def main() -> int:
    argomenti = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    argomenti.add_argument("--foto", type=Path, help="cartella dove salvare le schermate (telefono e PC)")
    opzioni = argomenti.parse_args()

    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Gestore, directory=str(APP)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    problemi: list[str] = []
    giro = ""
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        expect.set_options(timeout=ATTESA_MS)
        pagina = None
        try:
            giro = "aspetto"
            pagina = apri(browser, base, problemi)
            giro_aspetto(pagina)
            if opzioni.foto:
                opzioni.foto.mkdir(parents=True, exist_ok=True)
                pagina.screenshot(path=str(opzioni.foto / "componenti-telefono.png"), full_page=True)
            giro = "tastiera"
            giro_tab(pagina)
            giro_manopola(pagina)
            giro_scala(pagina)
            giro_tasti(pagina)
            giro_finestra(pagina)
            giro = "movimento"
            giro_movimento(pagina)
            giro = "riduci movimento (interruttore)"
            pagina.check("#pz-riduci")
            giro_riduci(pagina, "riduci movimento simulato")
            pagina.uncheck("#pz-riduci")
            controlla_csp(pagina, "dopo le prove")
            pagina.context.close()

            giro = "riduci movimento (sistema)"
            pagina = apri(browser, base, problemi, reduced_motion="reduce")
            giro_riduci(pagina, "riduci movimento del sistema")
            pagina.context.close()

            giro = "PC"
            pagina = apri(browser, base, problemi, larghezza=1280)
            controlla_csp(pagina, "1.280 px")
            senza_scorrimento(pagina, 1280)
            if opzioni.foto:
                pagina.screenshot(path=str(opzioni.foto / "componenti-pc.png"), full_page=True)
            passo("1.280 px: nessun errore, nessuno scorrimento di lato")
            pagina.context.close()
        except (AssertionError, ErrorePlaywright) as errore:
            immagine = Path(tempfile.gettempdir()) / "jukebox-componenti-errore.png"
            try:
                if pagina:
                    pagina.screenshot(path=str(immagine))
                    problemi.append(f"(schermata salvata in {immagine})")
            except ErrorePlaywright:
                pass
            dettaglio = str(errore).strip().splitlines()[0] if str(errore).strip() else type(errore).__name__
            problemi.insert(0, f"FALLITA al giro «{giro}»: {dettaglio}")
        finally:
            browser.close()
            server.shutdown()
    if problemi:
        print("\n✗ La prova dei componenti NON è passata:", file=sys.stderr)
        for riga in problemi:
            print(f"  - {riga}", file=sys.stderr)
        return 1
    print("\nProva dei componenti: tutto a posto, nessun errore nella console.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
