"""Prova automatica nel browser: dodici giri sull'app vera, con un catalogo FINTO di 200 brani.

Giri: 1. avvio -> la lista si vede; 2. si scrive un artista -> compaiono i suoi brani;
3. si apre un brano -> si vede la scheda; 4. si crea una playlist manuale (con la finestra
dell'app, non quella del sistema); 5. si importano 2 file audio di prova e si fa partire uno -> il
tasto dice "Pausa". In più: il catalogo ha un brano rotto apposta (senza fonti) e Impostazioni
deve dire che l'ha ignorato.
Giri dello stile hi-fi (Fase 9 del restauro): 5b. il disco gira solo mentre si sente la musica e in
pausa frena, col braccio alzato; 5c. a 320, 360, 640, 768 e 1.280 px nessuna schermata scorre di lato, e
da 700 px la schermata Suona sta a sinistra, sempre in vista.
Giro della Fase 11 (11): le finestre usate solo da tastiera (fuoco dentro, Esc, fuoco di ritorno) e gli
avvisi per gli screen reader.
Giro della Fase 10 (10): dalla ricerca all'artista, «indietro» del telefono, l'elenco A–Z, le etichette
dei filtri, la coda composta a mano e le scorciatoie da tastiera.
Giri sugli errori (ognuno in un browser pulito): 6. un file "audio" rovinato -> avviso e si passa
al brano dopo; 7. l'avvio senza rete -> errore con Riprova, e Riprova funziona; 8. avvio senza
rete ma con una copia dei dati -> si parte e lo si dice; 9. un token rifiutato -> errore con
"Cambia token", che porta alla schermata del token.

Lancio (dalla cartella app/):  npm run prova
Serve: Playwright per Python, Google Chrome installato, Node (per generare il catalogo finto).
Non tocca nulla di vero: server locale su una porta libera, dati inventati, browser pulito.
"""

import json
import math
import struct
import subprocess
import sys
import tempfile
import threading
import wave
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# La console di Windows è in cp1252: senza questo il "✓" fa crashare lo script.
for _s in (sys.stdout, sys.stderr):
    _s.reconfigure(encoding="utf-8", errors="replace")

from playwright.sync_api import Error as ErrorePlaywright  # noqa: E402
from playwright.sync_api import expect, sync_playwright  # noqa: E402

APP = Path(__file__).resolve().parents[2]
NOME_PLAYLIST = "Playlist di prova"
ATTESA_MS = 15_000  # quanto aspettare ogni cosa che deve comparire


def catalogo_finto(quanti: int = 200) -> dict:
    """Il catalogo finto (test/genera-catalogo.mjs, seme fisso) più un brano rotto apposta."""
    uscita = subprocess.run(
        ["node", str(APP / "test" / "genera-catalogo.mjs"), str(quanti), "1"],
        capture_output=True,
        check=True,
        encoding="utf-8",
    ).stdout
    catalogo = json.loads(uscita)
    # Senza fonti: l'app deve partire lo stesso e dire che l'ha ignorato.
    catalogo["brani"].append({"id": "brano-rotto", "a": "Artista Rotto", "t": "Senza Fonti"})
    return catalogo


def scrivi_wav(percorso: Path, secondi: int = 3, frequenza: int = 440, campioni: int = 8000) -> None:
    """Un file audio vero ma minuscolo: un tono, mono, 16 bit. Lungo abbastanza da vedere "Pausa"."""
    with wave.open(str(percorso), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(campioni)
        onde = (int(8000 * math.sin(2 * math.pi * frequenza * i / campioni)) for i in range(campioni * secondi))
        w.writeframes(b"".join(struct.pack("<h", x) for x in onde))


class Server(ThreadingHTTPServer):
    """Il server di prova. La coda di attesa predefinita (5 connessioni) su Windows non regge il browser,
    che carica decine di moduli insieme: le richieste in più venivano rifiutate (ERR_CONNECTION_REFUSED),
    e la prova falliva a caso. Con una coda lunga non succede."""

    request_queue_size = 256


class Gestore(SimpleHTTPRequestHandler):
    """Serve la cartella dell'app; il catalogo finto sta a /dati/catalogo.json (fuori dall'app, come in anteprima)."""

    catalogo_json = b""

    def do_GET(self):
        if self.path.split("?")[0] == "/dati/catalogo.json":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(self.catalogo_json)))
            self.end_headers()
            self.wfile.write(self.catalogo_json)
            return
        super().do_GET()

    def log_message(self, *argomenti):  # niente rumore in console
        pass


def passo(testo: str) -> None:
    print(f"✓ {testo}", flush=True)


PAGINE_DEI_GIRI_ERRORE: list = []  # l'ultima serve a fotografare la schermata se un giro fallisce

# Il disco della schermata Suona: l'animazione che lo fa girare (stato e velocità) e il braccio.
DISCO = """() => {
  const disco = document.querySelector('#rip-giradischi .hf-disco');
  const giro = disco.getAnimations()[0];
  return {
    stato: giro ? giro.playState : null,
    velocita: giro ? giro.playbackRate : 0,
    su: document.querySelector('#rip-giradischi .hf-braccio').dataset.su,
    led: document.querySelector('#rip-led-giri').classList.contains('hf-acceso'),
  };
}"""

# Cosa scorre di lato: la pagina, o una delle due colonne (che hanno overflow-x nascosto: un pezzo
# troppo largo lì non farebbe scorrere, verrebbe tagliato).
SCORRE_DI_LATO = """() => {
  const fuori = [];
  if (document.documentElement.scrollWidth > window.innerWidth) fuori.push('pagina');
  for (const el of document.querySelectorAll('#suona, #schermi')) {
    if (el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1) fuori.push(`${el.id}: ${el.scrollWidth} > ${el.clientWidth}`);
  }
  return fuori;
}"""


def giro_disco(pagina) -> None:
    """Il brano suona in pausa: ▶ lo fa ripartire, il disco arriva a 33⅓ col braccio sul solco; ⏸ lo
    ferma, il disco frena fino a fermarsi e il braccio si alza. Il tasto ▶ sta sotto il giradischi:
    premendolo la colonna scorre e il disco esce dallo schermo (fuori vista si ferma, apposta), quindi
    dopo ogni tocco si torna in cima."""
    in_cima = "() => document.querySelector('#suona').scrollTo(0, 0)"
    pagina.click("[data-tab='riproduzione']")
    expect(pagina.locator("#rip-principale")).to_have_attribute("aria-label", "Riprendi")
    d = pagina.evaluate(DISCO)
    assert d["stato"] in (None, "paused") and d["su"] == "si", f"in pausa il disco deve stare fermo: {d}"
    pagina.click("#rip-principale")
    pagina.evaluate(in_cima)
    pagina.wait_for_timeout(1700)
    d = pagina.evaluate(DISCO)
    assert d["stato"] == "running" and abs(d["velocita"] - 1) < 0.01, f"mentre suona il disco non gira a 33⅓: {d}"
    assert d["su"] == "no" and d["led"], f"mentre suona il braccio va sul solco e il LED 33⅓ si accende: {d}"
    passo("giradischi: con la musica il disco arriva a 33⅓, il braccio scende e il LED si accende")
    pagina.click("#rip-principale")
    pagina.evaluate(in_cima)
    pagina.wait_for_timeout(1900)
    d = pagina.evaluate(DISCO)
    assert d["stato"] == "paused" and d["su"] == "si" and not d["led"], f"in pausa il disco deve frenare: {d}"
    passo("giradischi: in pausa il disco frena fino a fermarsi e il braccio si alza")


def giro_disposizione(pagina) -> None:
    """Ogni scheda a 320, 360, 640, 768 e 1.280 px: niente scorre di lato; sotto i 700 px Suona è una scheda,
    da 700 px è la colonna di sinistra (e il suo tasto sparisce dalla barra)."""
    for larghezza in (320, 360, 640, 768, 1280):
        pagina.set_viewport_size({"width": larghezza, "height": 844})
        pagina.wait_for_timeout(300)
        larga = larghezza >= 700
        schede = ["cerca", "generi", "playlist", "impostazioni"] + ([] if larga else ["riproduzione"])
        for scheda in schede:
            pagina.click(f"[data-tab='{scheda}']")
            pagina.wait_for_timeout(150)
            fuori = pagina.evaluate(SCORRE_DI_LATO)
            assert not fuori, f"a {larghezza} px la scheda {scheda} scorre di lato: {fuori}"
            suona = pagina.locator("#suona").is_visible()
            if larga:
                assert suona and pagina.locator("#schermi").is_visible(), f"a {larghezza} px Suona e {scheda} insieme"
            else:
                assert suona == (scheda == "riproduzione"), f"a {larghezza} px Suona si vede solo nella sua scheda"
        assert pagina.locator("[data-tab='riproduzione']").is_visible() != larga, f"tasto Suona a {larghezza} px"
    pagina.set_viewport_size({"width": 390, "height": 844})
    pagina.click("[data-tab='cerca']")
    passo("disposizione: a 320, 360, 640, 768 e 1.280 px niente scorre di lato; da 700 px Suona sta a sinistra")


def nuova_pagina(browser, problemi: list[str], ignora: tuple[str, ...] = ()):
    """Una pagina in un contesto pulito (niente dati dei giri di prima). I messaggi che contengono
    uno dei testi di `ignora` non contano come problemi (per esempio la rete staccata apposta)."""
    pagina = browser.new_context(viewport={"width": 390, "height": 844}).new_page()
    pagina.set_default_timeout(ATTESA_MS)
    pagina.on("pageerror", lambda e: problemi.append(f"errore nella pagina: {e}"))
    pagina.on(
        "console",
        lambda m: (
            problemi.append(f"console.error: {m.text}")
            if m.type == "error" and not any(t in m.text for t in ignora)
            else None
        ),
    )
    pagina.on("dialog", lambda d: (problemi.append(f"finestra di sistema inattesa: {d.type}"), d.dismiss()))
    PAGINE_DEI_GIRI_ERRORE.append(pagina)
    return pagina


def giro_file_rovinato(browser, base: str, artista: str, cartella_audio: Path, problemi: list[str]) -> None:
    """Il primo brano ha un file che non è audio (rinominato come un brano vero), il secondo è buono:
    dal primo si deve passare al secondo, dicendolo."""
    pagina = nuova_pagina(browser, problemi)
    pagina.goto(f"{base}/?dati=/dati/catalogo.json")
    pagina.fill("#cerca-testo", artista)
    pagina.wait_for_function("() => document.querySelectorAll('#cerca-risultati .hf-vano[data-id]').length >= 2")
    # Pochi istanti perché la ricerca si assesti sull'ordine definitivo.
    pagina.wait_for_timeout(400)
    righe = pagina.locator("#cerca-risultati .hf-vano[data-id]")
    rotto, buono = righe.nth(0).get_attribute("data-id"), righe.nth(1).get_attribute("data-id")
    (cartella_audio / f"{rotto}.mp3").write_bytes(b"questo non e' un file audio, solo testo" * 20)
    scrivi_wav(cartella_audio / f"{buono}.wav")
    pagina.click("[data-tab='impostazioni']")
    pagina.set_input_files(
        "#imp-file-input", [str(cartella_audio / f"{rotto}.mp3"), str(cartella_audio / f"{buono}.wav")]
    )
    expect(pagina.locator("#imp-file-info")).to_contain_text("2 brani sul telefono")
    pagina.click("[data-tab='cerca']")
    pagina.click(f"#cerca-risultati .hf-vano[data-id='{rotto}'] .hf-vano-azione")
    expect(pagina.locator("#toast")).to_contain_text("Non riesco a suonare")
    expect(pagina.locator("#toast")).to_contain_text("passo al prossimo")
    pagina.wait_for_selector("#mini-pausa[aria-label='Pausa']:not([hidden])")
    # Nella Diagnostica c'è il file difettoso.
    pagina.click("[data-tab='impostazioni']")
    expect(pagina.locator("#imp-diagnostica")).to_contain_text(rotto)
    passo(
        "file rovinato: avviso 'Non riesco a suonare… passo al prossimo', suona il successivo, il file è in Diagnostica"
    )
    pagina.context.close()


def giro_avvio_senza_rete(browser, base: str, problemi: list[str]) -> None:
    """Il catalogo non arriva: schermata d'errore con Riprova. Tornata la rete, Riprova avvia l'app."""
    pagina = nuova_pagina(browser, problemi, ignora=("Failed to load resource",))
    # Si stacca solo il file dei dati (la pagina ha lo stesso testo nell'indirizzo, dopo il "?").
    e_il_catalogo = lambda url: url.endswith("/dati/catalogo.json") and "?" not in url  # noqa: E731
    pagina.route(e_il_catalogo, lambda r: r.abort())
    pagina.goto(f"{base}/?dati=/dati/catalogo.json")
    expect(pagina.locator("#avvio-testo")).to_contain_text("Impossibile leggere il file dati")
    expect(pagina.locator("#avvio-riprova")).to_be_visible()
    expect(pagina.locator("#avvio-token")).to_be_hidden()  # non è un problema di token
    expect(pagina.locator("#schermi")).to_be_hidden()
    pagina.unroute(e_il_catalogo)
    pagina.click("#avvio-riprova")
    pagina.wait_for_selector("#cerca-risultati .hf-vano[data-id]")
    expect(pagina.locator("#avvio")).to_be_hidden()
    passo("avvio senza rete: errore con 'Riprova', e Riprova fa partire l'app quando la rete torna")
    pagina.context.close()


def giro_avvio_con_copia(browser, base: str, problemi: list[str]) -> None:
    """Una volta caricati i dati restano in cache: senza rete l'app parte con quelli e lo dice."""
    pagina = nuova_pagina(browser, problemi, ignora=("Failed to load resource", "ERR_INTERNET_DISCONNECTED"))
    pagina.goto(f"{base}/?dati=/dati/catalogo.json")
    pagina.wait_for_selector("#cerca-risultati .hf-vano[data-id]")
    # Il catalogo si salva in cache in sottofondo: si aspetta che ci sia, e che l'app sia offline-ready.
    pagina.wait_for_function(
        "async () => (await caches.keys()).includes('jukebox-dati') && (await (await caches.open('jukebox-dati')).keys()).length > 0"
    )
    pagina.evaluate("() => navigator.serviceWorker.ready")
    pagina.context.set_offline(True)
    pagina.reload()
    pagina.wait_for_selector("#cerca-risultati .hf-vano[data-id]")
    expect(pagina.locator("#toast")).to_contain_text("non aggiornati: rete assente")
    passo("avvio senza rete con la copia: l'app parte e dice 'dati… non aggiornati: rete assente'")
    pagina.context.close()


def giro_token_rifiutato(browser, base: str, problemi: list[str]) -> None:
    """GitHub risponde 401: l'avvio dice che il token non va e offre 'Cambia token'."""
    pagina = nuova_pagina(browser, problemi, ignora=("Failed to load resource",))
    # Un telefono con un token salvato (finto): la pagina parte in modalità GitHub, senza anteprima.
    pagina.add_init_script("localStorage.setItem('jukebox.token', 'github_pat_finto')")
    pagina.route(
        "https://api.github.com/**",
        lambda r: r.fulfill(status=401, content_type="application/json", body='{"message":"Bad credentials"}'),
    )
    pagina.goto(f"{base}/")
    expect(pagina.locator("#avvio-testo")).to_contain_text("Token errato o scaduto")
    expect(pagina.locator("#avvio-riprova")).to_be_visible()
    expect(pagina.locator("#avvio-token")).to_be_visible()
    pagina.click("#avvio-token")
    expect(pagina.locator("#onboarding")).to_be_visible()
    expect(pagina.locator("#onb-token")).to_be_visible()
    passo("token rifiutato: errore con 'Cambia token', che porta alla schermata del token")
    pagina.context.close()


def prossimi_in_coda(pagina) -> list[str]:
    """Gli id dei brani di «A seguire», nell'ordine in cui suoneranno."""
    return pagina.eval_on_selector_all("#riproduzione-prossimi .hf-vano[data-id]", "els => els.map(e => e.dataset.id)")


def attendi_coda(pagina, atteso: list[str], quando: str) -> None:
    """Aspetta (fino a 5 s) che «A seguire» sia proprio questa: dopo ⏭ la coda cambia e il cassetto si
    ridisegna un attimo dopo, quando il brano nuovo è partito."""
    try:
        pagina.wait_for_function(
            "atteso => JSON.stringify([...document.querySelectorAll('#riproduzione-prossimi .hf-vano[data-id]')]"
            ".map((e) => e.dataset.id)) === JSON.stringify(atteso)",
            arg=atteso,
            timeout=5000,
        )
    except ErrorePlaywright:
        raise AssertionError(f"{quando}: «A seguire» doveva essere {atteso}, è {prossimi_in_coda(pagina)}") from None


def scheda_visibile(pagina) -> str:
    """Quale schermata della colonna delle sezioni si vede (cerca, artista, artisti, generi…)."""
    return pagina.evaluate("() => document.querySelector('#schermi .hf-schermo:not([hidden])')?.dataset.schermo")


def giro_artisti_coda_e_tastiera(browser, base: str, catalogo: dict, cartella_audio: Path, problemi: list[str]) -> None:
    """Fase 10: dalla ricerca all'artista in un tocco, «indietro» del telefono, l'elenco A–Z, le etichette
    dei filtri, la coda composta a mano (tre brani accodati mentre suona una playlist) e le scorciatoie
    da tastiera del PC."""
    brani = catalogo["brani"]
    titolo = {b["id"]: b["t"] for b in brani}
    scelti = [b for b in brani if b.get("x") != 1 and b.get("k") != "set" and b.get("a")]
    pagina = nuova_pagina(browser, problemi)
    pagina.goto(f"{base}/?dati=/dati/catalogo.json")
    pagina.wait_for_selector("#cerca-risultati .hf-vano[data-id]")

    # --- cambiando scheda la pagina scorre dov'era, al ritorno ---
    pagina.click("#cerca-altri")
    pagina.evaluate("() => document.querySelector('#schermi').scrollTo(0, 900)")
    pagina.wait_for_timeout(200)
    dove = pagina.evaluate("() => document.querySelector('#schermi').scrollTop")
    assert dove > 300, f"la lista dovrebbe essere lunga abbastanza da scorrere: {dove}"
    pagina.click("[data-tab='generi']")
    pagina.click("[data-tab='cerca']")
    pagina.wait_for_timeout(300)
    dopo = pagina.evaluate("() => document.querySelector('#schermi').scrollTop")
    assert abs(dopo - dove) < 5, f"tornando a Cerca la pagina doveva stare a {dove}, sta a {dopo}"
    pagina.evaluate("() => document.querySelector('#schermi').scrollTo(0, 0)")
    passo(f"posizione: tornando alla scheda Cerca la lista è ancora dov'era ({dove} px)")

    # --- scrivendo si propone l'artista: un tocco e si è sulla sua pagina, coi brani per tipo ---
    inizio = scelti[0]["a"][:5]
    pagina.fill("#cerca-testo", inizio)
    expect(pagina.locator("#cerca-suggerimenti")).to_be_visible()
    suggerito = pagina.locator("#cerca-suggerimenti [data-sugg='artista']").first
    nome = suggerito.locator(".hf-vano-titolo").inner_text()
    suggerito.click()
    expect(pagina.locator("#t-artista")).to_have_text(nome)
    righe = pagina.locator("[data-schermo='artista'] .hf-vano[data-id]").count()
    assert righe >= 1, "la pagina dell'artista non ha brani"
    expect(pagina.locator("#artista-sotto")).to_have_text(f"{righe} brani")
    assert pagina.locator("[data-schermo='artista'] [data-gruppo='originale']").count() == 1, (
        "manca il gruppo Originali"
    )
    expect(pagina.locator("[data-tab='cerca']")).to_have_attribute("aria-current", "page")
    pagina.set_viewport_size({"width": 320, "height": 800})
    pagina.wait_for_timeout(200)
    fuori = pagina.evaluate(SCORRE_DI_LATO)
    assert not fuori, f"a 320 px la pagina dell'artista scorre di lato: {fuori}"
    pagina.set_viewport_size({"width": 390, "height": 844})
    passo(f"artista: scrivendo '{inizio}' si propone '{nome}', un tocco e si vedono i suoi {righe} brani per tipo")

    # --- «indietro» torna alla ricerca com'era; con una finestra aperta chiude la finestra ---
    pagina.go_back()
    expect(pagina.locator("[data-schermo='cerca']")).to_be_visible()
    expect(pagina.locator("#cerca-testo")).to_have_value(inizio)
    prima = pagina.locator("#cerca-risultati .hf-vano[data-id]").first.get_attribute("data-id")
    pagina.click(f"#cerca-risultati .hf-vano[data-id='{prima}'] .hf-vano-corpo")
    expect(pagina.locator("#foglio-overlay")).to_be_visible()
    pagina.go_back()
    expect(pagina.locator("#foglio-overlay")).to_be_hidden()
    assert scheda_visibile(pagina) == "cerca", "chiudendo la finestra con «indietro» si è lasciata anche la scheda"
    pagina.click(f"#cerca-risultati .hf-vano[data-id='{prima}'] .hf-vano-seconda")
    expect(pagina.locator("#dialogo")).to_be_visible()
    pagina.go_back()
    expect(pagina.locator("#dialogo-overlay")).to_be_hidden()
    pagina.click("[data-tab='generi']")
    pagina.click("[data-tab='playlist']")
    pagina.go_back()
    expect(pagina.locator("[data-tab='generi']")).to_have_attribute("aria-current", "page")
    pagina.go_back()
    expect(pagina.locator("[data-tab='cerca']")).to_have_attribute("aria-current", "page")
    expect(pagina.locator("#cerca-testo")).to_have_value(inizio)
    passo("indietro: chiude la finestra o il menu aperto, poi torna di scheda in scheda; la ricerca resta com'era")

    # --- l'elenco A–Z: una lettera alla volta, un tocco porta all'artista ---
    pagina.click("#rapido-artisti")
    expect(pagina.locator("[data-schermo='artisti']")).to_be_visible()
    expect(pagina.locator("[data-tab='cerca']")).to_have_attribute("aria-current", "page")
    lettere = pagina.locator("#artisti-lettere [data-lettera]")
    assert lettere.count() >= 3, "l'elenco A–Z dovrebbe avere varie lettere"
    expect(lettere.first).to_have_attribute("aria-pressed", "true")
    pagina.click("#artisti-lettere [data-lettera]:nth-child(2)")
    primo = pagina.locator("#artisti-lista .hf-vano[data-id]").first
    nome_elenco = primo.locator(".hf-vano-titolo").inner_text()
    primo.locator(".hf-vano-corpo").click()
    expect(pagina.locator("#t-artista")).to_have_text(nome_elenco)
    pagina.go_back()
    expect(pagina.locator("[data-schermo='artisti']")).to_be_visible()
    pagina.go_back()
    passo(
        f"artisti A–Z: {lettere.count()} lettere, un tocco su '{nome_elenco}' porta alla sua pagina, indietro torna all'elenco"
    )

    # --- i filtri attivi diventano etichette con la ✕ ---
    pagina.fill("#cerca-testo", "")
    pagina.click("[data-tab='generi']")
    pagina.click(".hf-tasto-genere:not(.hf-tutti) >> nth=0")
    expect(pagina.locator("[data-schermo='cerca']")).to_be_visible()
    etichette = pagina.locator("#cerca-etichette [data-chiave]")
    expect(etichette).to_have_count(1)
    pagina.click("#cerca-etichette [data-chiave='macro']")
    expect(pagina.locator("#cerca-etichette")).to_be_hidden()
    expect(pagina.locator("#cerca-filtri-badge")).to_be_hidden()
    passo("filtri: il genere scelto compare come etichetta; la ✕ lo toglie")

    # --- la coda a mano: tre brani accodati mentre suona una playlist (sul PC: tutto in vista) ---
    pagina.set_viewport_size({"width": 1280, "height": 900})
    pagina.click("[data-tab='cerca']")
    pagina.wait_for_selector("#cerca-risultati .hf-vano[data-id]")
    i1, i2, i3, i4 = pagina.eval_on_selector_all(
        "#cerca-risultati .hf-vano[data-id]", "els => els.slice(0, 4).map(e => e.dataset.id)"
    )
    for i in (i1, i2, i3, i4):
        scrivi_wav(cartella_audio / f"{i}.wav", secondi=20)
    pagina.click("[data-tab='impostazioni']")
    pagina.set_input_files("#imp-file-input", [str(cartella_audio / f"{i}.wav") for i in (i1, i2, i3, i4)])
    expect(pagina.locator("#imp-file-info")).to_contain_text("4 brani sul telefono")
    pagina.click("[data-tab='cerca']")
    pagina.click(f"#cerca-risultati .hf-vano[data-id='{i1}'] .hf-vano-azione")
    expect(pagina.locator("#rip-principale")).to_have_attribute("aria-label", "Pausa")
    attendi_coda(pagina, [i2, i3, i4], "la playlist di file dovrebbe avere i 4 brani")

    def dal_menu(brano: str, scelta: str) -> None:
        pagina.click(f"#cerca-risultati .hf-vano[data-id='{brano}'] .hf-vano-seconda")
        pagina.click(f"#dialogo button:has-text('{scelta}')")

    dal_menu(i4, "Suona dopo")
    expect(pagina.locator("#toast")).to_contain_text("suona dopo")
    dal_menu(i2, "In fondo alla coda")
    expect(pagina.locator("#toast")).to_contain_text("in fondo alla coda")
    dal_menu(i3, "Suona dopo")
    attendi_coda(pagina, [i3, i4, i2], "ordine della coda sbagliato")
    # Dalla scheda del brano: gli stessi due gesti.
    pagina.click(f"#cerca-risultati .hf-vano[data-id='{i2}'] .hf-vano-corpo")
    pagina.click("#foglio-dopo")
    pagina.click("#foglio-chiudi")
    attendi_coda(pagina, [i2, i3, i4], "dalla scheda")
    # Si può togliere un brano dalla coda.
    pagina.click(f"#riproduzione-prossimi .hf-vano[data-id='{i3}'] .hf-vano-seconda")
    attendi_coda(pagina, [i2, i4], "dopo togli")
    pagina.click("#rip-avanti")
    expect(pagina.locator("#rip-display")).to_contain_text(titolo[i2])
    attendi_coda(pagina, [i4], "dopo ⏭")
    passo(
        "coda: «Suona dopo», «In fondo alla coda» (dal + e dalla scheda) e ✕ comandano l'ordine; ⏭ passa al primo accodato"
    )

    # --- le scorciatoie da tastiera ---
    pagina.evaluate("() => document.activeElement.blur()")
    pagina.keyboard.press("Space")
    expect(pagina.locator("#rip-principale")).to_have_attribute("aria-label", "Riprendi")
    pagina.keyboard.press("Space")
    expect(pagina.locator("#rip-principale")).to_have_attribute("aria-label", "Pausa")
    pagina.keyboard.press("/")
    assert pagina.evaluate("() => document.activeElement.id") == "cerca-testo", "«/» deve portare alla ricerca"
    pagina.keyboard.type(" a/ b")
    expect(pagina.locator("#cerca-testo")).to_have_value(" a/ b")  # mentre si scrive i tasti sono del campo
    expect(pagina.locator("#rip-principale")).to_have_attribute("aria-label", "Pausa")
    pagina.fill("#cerca-testo", "")
    pagina.evaluate("() => document.activeElement.blur()")
    pagina.keyboard.press("ArrowRight")  # la coda aveva solo i4 dopo i2
    expect(pagina.locator("#rip-display")).to_contain_text(titolo[i4])
    pagina.keyboard.press("ArrowLeft")
    expect(pagina.locator("#rip-display")).to_contain_text(titolo[i2])
    # Con una finestra aperta le scorciatoie non scattano.
    pagina.click(f"#cerca-risultati .hf-vano[data-id='{i1}'] .hf-vano-corpo")
    pagina.keyboard.press("Space")
    expect(pagina.locator("#rip-principale")).to_have_attribute("aria-label", "Pausa")
    pagina.keyboard.press("Escape")
    passo(
        "tastiera: «/» porta alla ricerca, Spazio pausa e riprendi, ← → cambiano brano; mai mentre si scrive o con una finestra"
    )
    pagina.context.close()


def giro_finestre_accessibili(browser, base: str, problemi: list[str]) -> None:
    """Fase 11, solo da tastiera: la scheda di un brano si apre con Invio, il fuoco entra e non esce
    (Tab e Maiusc+Tab girano dentro), dietro tutto è inerte, Esc chiude e il fuoco torna al tasto di
    prima; lo stesso per il menu del +. Gli avvisi arrivano anche all'area per gli screen reader."""
    pagina = nuova_pagina(browser, problemi)
    pagina.goto(f"{base}/?dati=/dati/catalogo.json")
    pagina.wait_for_selector("#cerca-risultati .hf-vano[data-id]")
    prima = pagina.locator("#cerca-risultati .hf-vano[data-id]").first.get_attribute("data-id")
    corpo = f"#cerca-risultati .hf-vano[data-id='{prima}'] .hf-vano-corpo"
    dentro = "(id) => document.getElementById(id).contains(document.activeElement)"
    sul_tasto = "(sel) => document.activeElement === document.querySelector(sel)"

    pagina.focus(corpo)
    pagina.keyboard.press("Enter")
    expect(pagina.locator("#foglio-overlay")).to_be_visible()
    assert pagina.evaluate(dentro, "foglio-brano"), "aprendo la scheda il fuoco deve entrare nella finestra"
    assert pagina.evaluate("() => document.getElementById('app').inert"), "dietro la finestra tutto deve essere inerte"
    assert (
        pagina.evaluate("() => document.getElementById('foglio-brano').getAttribute('aria-labelledby')")
        == "foglio-titolo"
    )
    expect(pagina.locator("#foglio-chiudi")).to_have_attribute("aria-label", "Chiudi")
    for tasto in ["Tab"] * 40 + ["Shift+Tab"] * 40:
        pagina.keyboard.press(tasto)
        assert pagina.evaluate(dentro, "foglio-brano"), f"con {tasto} il fuoco è uscito dalla finestra"
    pagina.keyboard.press("Escape")
    expect(pagina.locator("#foglio-overlay")).to_be_hidden()
    assert pagina.evaluate(sul_tasto, corpo), "chiusa la finestra il fuoco deve tornare al tasto di partenza"
    assert not pagina.evaluate("() => document.getElementById('app').inert"), (
        "chiusa la finestra l'app non è più inerte"
    )
    passo(
        "finestre da tastiera: Invio apre, il fuoco resta dentro (Tab e Maiusc+Tab), Esc chiude e il fuoco torna al tasto"
    )

    # Il menu del «+»: un dialogo sopra la pagina, anche lui chiuso con Esc, con il fuoco di ritorno.
    piu = f"#cerca-risultati .hf-vano[data-id='{prima}'] .hf-vano-seconda"
    pagina.focus(piu)
    pagina.keyboard.press("Enter")
    expect(pagina.locator("#dialogo")).to_be_visible()
    assert pagina.evaluate(dentro, "dialogo"), "aprendo il menu il fuoco deve entrare nel dialogo"
    pagina.keyboard.press("Escape")
    expect(pagina.locator("#dialogo-overlay")).to_be_hidden()
    assert pagina.evaluate(sul_tasto, piu), "chiuso il menu il fuoco deve tornare al «+»"
    passo("finestre da tastiera: il menu del + si chiude con Esc e il fuoco torna al + ")

    # Un dialogo sopra una finestra (il «+» di un brano di «Altri di…» dentro la scheda): è l'unico attivo,
    # Esc chiude solo lui e il fuoco torna dentro la finestra; un secondo Esc chiude la finestra.
    pagina.click(corpo)
    pagina.click("#foglio-altri-artista .hf-vano-seconda >> nth=0")
    expect(pagina.locator("#dialogo")).to_be_visible()
    assert pagina.evaluate("() => document.getElementById('foglio-overlay').inert"), (
        "la finestra sotto il dialogo deve essere inerte"
    )
    pagina.keyboard.press("Escape")
    expect(pagina.locator("#dialogo-overlay")).to_be_hidden()
    expect(pagina.locator("#foglio-overlay")).to_be_visible()  # la finestra sotto resta
    assert not pagina.evaluate("() => document.getElementById('foglio-overlay').inert"), (
        "tornata in cima la finestra deve essere attiva"
    )
    assert pagina.evaluate(dentro, "foglio-brano"), "chiuso il dialogo il fuoco deve tornare dentro la scheda"
    pagina.keyboard.press("Escape")
    expect(pagina.locator("#foglio-overlay")).to_be_hidden()
    passo("finestre da tastiera: con un dialogo sopra una finestra, Esc chiude una alla volta")

    # Gli avvisi: oltre al riquadro in basso arrivano all'area per gli screen reader (cortese o urgente).
    pagina.click(corpo)
    pagina.click("#foglio-aggiungi")
    pagina.click("#agg-nuova")
    pagina.fill("#dialogo-campo", "Playlist accessibile")
    pagina.click("#dialogo button.hf-principale")
    expect(pagina.locator("#toast")).to_contain_text("Playlist accessibile")
    expect(pagina.locator("#annuncio")).to_contain_text("Playlist accessibile")
    expect(pagina.locator("#annuncio")).to_have_attribute("role", "status")
    expect(pagina.locator("#annuncio-errore")).to_have_attribute("role", "alert")
    passo("avvisi: il testo arriva anche all'area per gli screen reader (status; alert per gli errori)")
    pagina.context.close()


def prova(catalogo: dict, cartella_audio: Path) -> list[str]:
    """I tredici giri. Lancia AssertionError (o un errore di Playwright) al primo che non torna."""
    brani = catalogo["brani"]
    # Brani visibili con i filtri di default (le "scelte", non l'esplorazione) e con un artista.
    scelti = [b for b in brani if b.get("x") != 1 and b.get("k") != "set" and b.get("a")]
    artista = scelti[0]["a"]
    del_artista = [b for b in scelti if b["a"] == artista]
    assert len(del_artista) >= 2, f"servono 2 brani di {artista} per la prova audio"
    brano_aperto, secondo = del_artista[0], del_artista[1]
    file_audio = []
    for b in (brano_aperto, secondo):
        percorso = cartella_audio / f"{b['id']}.wav"  # il nome del file è l'id del brano
        scrivi_wav(percorso, secondi=8)  # abbastanza lunghi per vedere il disco partire e frenare
        file_audio.append(percorso)

    Gestore.catalogo_json = json.dumps(catalogo).encode("utf-8")
    server = Server(("127.0.0.1", 0), partial(Gestore, directory=str(APP)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"

    problemi: list[str] = []  # errori della pagina: la prova non passa se ce ne sono
    giro = ""  # il giro in corso, per dire dove si è fermata la prova
    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel="chrome", headless=True, args=["--autoplay-policy=no-user-gesture-required"]
        )
        pagina = browser.new_context(viewport={"width": 390, "height": 844}).new_page()
        pagina.set_default_timeout(ATTESA_MS)
        expect.set_options(timeout=ATTESA_MS)
        pagina.on("pageerror", lambda e: problemi.append(f"errore nella pagina: {e}"))
        pagina.on("console", lambda m: problemi.append(f"console.error: {m.text}") if m.type == "error" else None)
        # Le domande sono finestre dell'app: se compare una finestra del sistema è un difetto.
        pagina.on("dialog", lambda d: (problemi.append(f"finestra di sistema inattesa: {d.type}"), d.dismiss()))
        try:
            # 1. Avvio: la lista si vede.
            giro = "1. avvio"
            pagina.goto(f"{base}/?dati=/dati/catalogo.json")
            pagina.wait_for_selector("#cerca-risultati .hf-vano[data-id]")
            visibili = pagina.locator("#cerca-risultati .hf-vano[data-id]").count()
            assert visibili > 20, f"la lista dovrebbe avere decine di brani, ne ha {visibili}"
            passo(f"avvio: la lista mostra {visibili} brani")

            # "Mostra altri" aggiunge le righe in fondo senza ridisegnare quelle di prima; e tornando
            # alla scheda senza aver cambiato nulla la lista non si rifà.
            giro = "1b. mostra altri"
            pagina.evaluate(
                "() => { document.querySelector('#cerca-risultati .hf-vano[data-id]').dataset.marca = 'si'; }"
            )
            pagina.click("#cerca-altri")
            pagina.wait_for_function(
                "n => document.querySelectorAll('#cerca-risultati .hf-vano[data-id]').length > n", arg=visibili
            )
            prima_riga = pagina.locator("#cerca-risultati .hf-vano[data-id]").first
            assert prima_riga.get_attribute("data-marca") == "si", "'Mostra altri' ha ridisegnato le righe di prima"
            pagina.click("[data-tab='generi']")
            pagina.click("[data-tab='cerca']")
            assert prima_riga.get_attribute("data-marca") == "si", "tornando alla scheda Cerca la lista è stata rifatta"
            passo(
                "mostra altri: le righe nuove si aggiungono in fondo, le vecchie restano; tornando alla scheda non si rifà"
            )
            giro = "1. avvio"

            # 2. Si scrive un artista: compaiono i suoi brani (e meno brani in tutto).
            giro = "2. ricerca di un artista"
            pagina.fill("#cerca-testo", artista)
            # La ricerca parte dopo una breve attesa: si aspetta che la lista si restringa davvero.
            pagina.wait_for_function(
                "n => document.querySelectorAll('#cerca-risultati .hf-vano[data-id]').length < n", arg=visibili
            )
            ora = pagina.locator("#cerca-risultati .hf-vano[data-id]").count()
            mancanti = [
                b["id"]
                for b in del_artista
                if pagina.locator(f"#cerca-risultati .hf-vano[data-id='{b['id']}']").count() == 0
            ]
            assert not mancanti, f"cercando '{artista}' mancano dei suoi brani: {mancanti}"
            passo(f"ricerca: '{artista}' mostra i suoi {len(del_artista)} brani ({ora} risultati su {visibili})")

            # Nessun risultato: lo dice e offre di togliere i filtri; con un tocco la lista torna.
            pagina.fill("#cerca-testo", "zzzzqqqq")
            expect(pagina.locator("#cerca-risultati .hf-stato-vuoto")).to_contain_text("Nessun disco per «zzzzqqqq»")
            pagina.click("#cerca-risultati [data-azione-vuoto]")
            expect(pagina.locator("#cerca-testo")).to_have_value("")
            pagina.wait_for_selector("#cerca-risultati .hf-vano[data-id]")
            passo("nessun risultato: 'Nessun disco per…' e 'Togli i filtri' riporta la lista")
            # Nessuna playlist ancora: lo dice e offre di crearne una.
            pagina.click("[data-tab='playlist']")
            expect(pagina.locator("#playlist-lista")).to_contain_text("Nessuna playlist ancora")
            expect(pagina.locator("#playlist-lista [data-azione-vuoto]")).to_contain_text("Crea la prima playlist")
            pagina.click("[data-tab='cerca']")
            passo("nessuna playlist: la scheda dice 'Nessuna playlist ancora' e offre di crearne una")
            pagina.fill("#cerca-testo", artista)
            pagina.wait_for_function(
                "n => document.querySelectorAll('#cerca-risultati .hf-vano[data-id]').length < n", arg=visibili
            )

            # 3. Si apre un brano: compare la scheda.
            giro = "3. scheda del brano"
            pagina.click(f"#cerca-risultati .hf-vano[data-id='{brano_aperto['id']}'] .hf-vano-corpo")
            expect(pagina.locator("#foglio-brano")).to_be_visible()
            expect(pagina.locator("#foglio-brano")).to_contain_text(brano_aperto["t"])
            expect(pagina.locator("#foglio-suona")).to_be_visible()
            passo(f"scheda: si apre quella di '{brano_aperto['t']}'")

            # 4. Si crea una playlist manuale dalla scheda ("+ Playlist" -> "Nuova playlist").
            giro = "4. playlist manuale"
            pagina.click("#foglio-aggiungi")
            pagina.click("#agg-nuova")
            expect(pagina.locator("#dialogo")).to_be_visible()
            pagina.fill("#dialogo-campo", NOME_PLAYLIST)
            pagina.click("#dialogo button.hf-principale")
            expect(pagina.locator("#toast")).to_contain_text(NOME_PLAYLIST)
            pagina.click("#foglio-chiudi")
            pagina.click("[data-tab='playlist']")
            expect(pagina.locator("#playlist-lista")).to_be_visible()
            expect(pagina.locator("#playlist-lista")).to_contain_text(NOME_PLAYLIST)
            passo(f"playlist: '{NOME_PLAYLIST}' creata e visibile nella scheda Playlist")

            # 5. Si importano 2 file audio e se ne fa partire uno.
            giro = "5. audio e controllo dei dati"
            pagina.click("[data-tab='impostazioni']")
            pagina.set_input_files("#imp-file-input", [str(f) for f in file_audio])
            expect(pagina.locator("#imp-file-info")).to_be_visible()
            expect(pagina.locator("#imp-file-info")).to_contain_text("2 brani sul telefono")
            passo("audio: importati 2 file, Impostazioni dice '2 brani sul telefono'")
            expect(pagina.locator("#imp-dati-controllo")).to_be_visible()
            expect(pagina.locator("#imp-dati-controllo")).to_contain_text("1 brano ignorato perché incompleto")
            passo("dati: Impostazioni segnala '1 brano ignorato perché incompleto'")

            pagina.click("[data-tab='cerca']")
            pagina.click(f"#cerca-risultati .hf-vano[data-id='{brano_aperto['id']}'] .hf-vano-azione")
            pagina.wait_for_selector("#mini-pausa[aria-label='Pausa']:not([hidden])")
            passo("riproduzione: il brano suona e il tasto dice 'Pausa'")
            pagina.click("#mini-pausa")
            pagina.wait_for_selector("#mini-pausa[aria-label='Riprendi']")
            passo("riproduzione: in pausa il tasto dice 'Riprendi'")

            # 5b-5c. Lo stile hi-fi: il giradischi e le tre disposizioni.
            giro = "5b. giradischi"
            giro_disco(pagina)
            giro = "5c. disposizione"
            giro_disposizione(pagina)

            # 6-8. Gli errori, ognuno in un browser pulito (senza dati di prima).
            giro = "6. file audio rovinato"
            giro_file_rovinato(browser, base, artista, cartella_audio, problemi)
            giro = "7. avvio senza rete"
            giro_avvio_senza_rete(browser, base, problemi)
            giro = "8. avvio senza rete, con la copia dei dati"
            giro_avvio_con_copia(browser, base, problemi)
            giro = "9. token rifiutato"
            giro_token_rifiutato(browser, base, problemi)
            giro = "10. artisti, coda e tastiera"
            giro_artisti_coda_e_tastiera(browser, base, catalogo, cartella_audio, problemi)
            giro = "11. finestre accessibili"
            giro_finestre_accessibili(browser, base, problemi)
        except (AssertionError, ErrorePlaywright) as errore:
            immagine = Path(tempfile.gettempdir()) / "jukebox-prova-errore.png"
            try:
                (
                    PAGINE_DEI_GIRI_ERRORE[-1] if giro[:1] in "6789" or giro.startswith(("10", "11")) else pagina
                ).screenshot(path=str(immagine))
                problemi.append(f"(schermata salvata in {immagine})")
            except ErrorePlaywright:
                pass
            dettaglio = str(errore).strip().splitlines()[0] if str(errore).strip() else type(errore).__name__
            problemi.insert(0, f"FALLITA al giro {giro}: {dettaglio}")
        finally:
            browser.close()
            server.shutdown()
    return problemi


def main() -> int:
    catalogo = catalogo_finto()
    with tempfile.TemporaryDirectory(prefix="jukebox-prova-") as cartella:
        problemi = prova(catalogo, Path(cartella))
    if problemi:
        print("\n✗ La prova nel browser NON è passata:", file=sys.stderr)
        for riga in problemi:
            print(f"  - {riga}", file=sys.stderr)
        return 1
    print("\nProva nel browser: 13 giri riusciti, nessun errore nella console.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
