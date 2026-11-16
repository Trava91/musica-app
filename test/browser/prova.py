"""Prova automatica nel browser: nove giri sull'app vera, con un catalogo FINTO di 200 brani.

Giri: 1. avvio -> la lista si vede; 2. si scrive un artista -> compaiono i suoi brani;
3. si apre un brano -> si vede la scheda; 4. si crea una playlist manuale (con la finestra
dell'app, non quella del sistema); 5. si importano 2 file audio di prova e si fa partire uno -> il
tasto dice "Pausa". In più: il catalogo ha un brano rotto apposta (senza fonti) e Impostazioni
deve dire che l'ha ignorato.
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
    pagina.wait_for_function("() => document.querySelectorAll('#cerca-risultati .striscia').length >= 2")
    # Pochi istanti perché la ricerca si assesti sull'ordine definitivo.
    pagina.wait_for_timeout(400)
    righe = pagina.locator("#cerca-risultati .striscia")
    rotto, buono = righe.nth(0).get_attribute("data-id"), righe.nth(1).get_attribute("data-id")
    (cartella_audio / f"{rotto}.mp3").write_bytes(b"questo non e' un file audio, solo testo" * 20)
    scrivi_wav(cartella_audio / f"{buono}.wav")
    pagina.click(".tab[data-tab='impostazioni']")
    pagina.set_input_files(
        "#imp-file-input", [str(cartella_audio / f"{rotto}.mp3"), str(cartella_audio / f"{buono}.wav")]
    )
    expect(pagina.locator("#imp-file-info")).to_contain_text("2 brani sul telefono")
    pagina.click(".tab[data-tab='cerca']")
    pagina.click(f"#cerca-risultati .striscia[data-id='{rotto}'] .striscia-play")
    expect(pagina.locator("#toast")).to_contain_text("Non riesco a suonare")
    expect(pagina.locator("#toast")).to_contain_text("passo al prossimo")
    pagina.wait_for_selector("#mini-pausa[aria-label='Pausa']:not([hidden])")
    # Nella Diagnostica c'è il file difettoso.
    pagina.click(".tab[data-tab='impostazioni']")
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
    pagina.wait_for_selector("#cerca-risultati .striscia")
    expect(pagina.locator("#avvio")).to_be_hidden()
    passo("avvio senza rete: errore con 'Riprova', e Riprova fa partire l'app quando la rete torna")
    pagina.context.close()


def giro_avvio_con_copia(browser, base: str, problemi: list[str]) -> None:
    """Una volta caricati i dati restano in cache: senza rete l'app parte con quelli e lo dice."""
    pagina = nuova_pagina(browser, problemi, ignora=("Failed to load resource", "ERR_INTERNET_DISCONNECTED"))
    pagina.goto(f"{base}/?dati=/dati/catalogo.json")
    pagina.wait_for_selector("#cerca-risultati .striscia")
    # Il catalogo si salva in cache in sottofondo: si aspetta che ci sia, e che l'app sia offline-ready.
    pagina.wait_for_function(
        "async () => (await caches.keys()).includes('jukebox-dati') && (await (await caches.open('jukebox-dati')).keys()).length > 0"
    )
    pagina.evaluate("() => navigator.serviceWorker.ready")
    pagina.context.set_offline(True)
    pagina.reload()
    pagina.wait_for_selector("#cerca-risultati .striscia")
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


def prova(catalogo: dict, cartella_audio: Path) -> list[str]:
    """I nove giri. Lancia AssertionError (o un errore di Playwright) al primo che non torna."""
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
        scrivi_wav(percorso)
        file_audio.append(percorso)

    Gestore.catalogo_json = json.dumps(catalogo).encode("utf-8")
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Gestore, directory=str(APP)))
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
            pagina.wait_for_selector("#cerca-risultati .striscia")
            visibili = pagina.locator("#cerca-risultati .striscia").count()
            assert visibili > 20, f"la lista dovrebbe avere decine di brani, ne ha {visibili}"
            passo(f"avvio: la lista mostra {visibili} brani")

            # "Mostra altri" aggiunge le righe in fondo senza ridisegnare quelle di prima; e tornando
            # alla scheda senza aver cambiato nulla la lista non si rifà.
            giro = "1b. mostra altri"
            pagina.evaluate("() => { document.querySelector('#cerca-risultati .striscia').dataset.marca = 'si'; }")
            pagina.click("#cerca-altri")
            pagina.wait_for_function(
                "n => document.querySelectorAll('#cerca-risultati .striscia').length > n", arg=visibili
            )
            prima_riga = pagina.locator("#cerca-risultati .striscia").first
            assert prima_riga.get_attribute("data-marca") == "si", "'Mostra altri' ha ridisegnato le righe di prima"
            pagina.click(".tab[data-tab='generi']")
            pagina.click(".tab[data-tab='cerca']")
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
                "n => document.querySelectorAll('#cerca-risultati .striscia').length < n", arg=visibili
            )
            ora = pagina.locator("#cerca-risultati .striscia").count()
            mancanti = [
                b["id"]
                for b in del_artista
                if pagina.locator(f"#cerca-risultati .striscia[data-id='{b['id']}']").count() == 0
            ]
            assert not mancanti, f"cercando '{artista}' mancano dei suoi brani: {mancanti}"
            passo(f"ricerca: '{artista}' mostra i suoi {len(del_artista)} brani ({ora} risultati su {visibili})")

            # Nessun risultato: lo dice e offre di togliere i filtri; con un tocco la lista torna.
            pagina.fill("#cerca-testo", "zzzzqqqq")
            expect(pagina.locator("#cerca-risultati .vuoto")).to_contain_text("Nessun disco per «zzzzqqqq»")
            pagina.click("#cerca-risultati [data-azione-vuoto]")
            expect(pagina.locator("#cerca-testo")).to_have_value("")
            pagina.wait_for_selector("#cerca-risultati .striscia")
            passo("nessun risultato: 'Nessun disco per…' e 'Togli i filtri' riporta la lista")
            # Nessuna playlist ancora: lo dice e offre di crearne una.
            pagina.click(".tab[data-tab='playlist']")
            expect(pagina.locator("#playlist-lista")).to_contain_text("Nessuna playlist ancora")
            expect(pagina.locator("#playlist-lista [data-azione-vuoto]")).to_contain_text("Crea la prima playlist")
            pagina.click(".tab[data-tab='cerca']")
            passo("nessuna playlist: la scheda dice 'Nessuna playlist ancora' e offre di crearne una")
            pagina.fill("#cerca-testo", artista)
            pagina.wait_for_function(
                "n => document.querySelectorAll('#cerca-risultati .striscia').length < n", arg=visibili
            )

            # 3. Si apre un brano: compare la scheda.
            giro = "3. scheda del brano"
            pagina.click(f"#cerca-risultati .striscia[data-id='{brano_aperto['id']}'] .striscia-corpo")
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
            pagina.click("#dialogo button.btn-primary")
            expect(pagina.locator("#toast")).to_contain_text(NOME_PLAYLIST)
            pagina.click("#foglio-chiudi")
            pagina.click(".tab[data-tab='playlist']")
            expect(pagina.locator("#playlist-lista")).to_be_visible()
            expect(pagina.locator("#playlist-lista")).to_contain_text(NOME_PLAYLIST)
            passo(f"playlist: '{NOME_PLAYLIST}' creata e visibile nella scheda Playlist")

            # 5. Si importano 2 file audio e se ne fa partire uno.
            giro = "5. audio e controllo dei dati"
            pagina.click(".tab[data-tab='impostazioni']")
            pagina.set_input_files("#imp-file-input", [str(f) for f in file_audio])
            expect(pagina.locator("#imp-file-info")).to_be_visible()
            expect(pagina.locator("#imp-file-info")).to_contain_text("2 brani sul telefono")
            passo("audio: importati 2 file, Impostazioni dice '2 brani sul telefono'")
            expect(pagina.locator("#imp-dati-controllo")).to_be_visible()
            expect(pagina.locator("#imp-dati-controllo")).to_contain_text("1 brano ignorato perché incompleto")
            passo("dati: Impostazioni segnala '1 brano ignorato perché incompleto'")

            pagina.click(".tab[data-tab='cerca']")
            pagina.click(f"#cerca-risultati .striscia[data-id='{brano_aperto['id']}'] .striscia-play")
            pagina.wait_for_selector("#mini-pausa[aria-label='Pausa']:not([hidden])")
            passo("riproduzione: il brano suona e il tasto dice 'Pausa'")
            pagina.click("#mini-pausa")
            pagina.wait_for_selector("#mini-pausa[aria-label='Riprendi']")
            passo("riproduzione: in pausa il tasto dice 'Riprendi'")

            # 6-8. Gli errori, ognuno in un browser pulito (senza dati di prima).
            giro = "6. file audio rovinato"
            giro_file_rovinato(browser, base, artista, cartella_audio, problemi)
            giro = "7. avvio senza rete"
            giro_avvio_senza_rete(browser, base, problemi)
            giro = "8. avvio senza rete, con la copia dei dati"
            giro_avvio_con_copia(browser, base, problemi)
            giro = "9. token rifiutato"
            giro_token_rifiutato(browser, base, problemi)
        except (AssertionError, ErrorePlaywright) as errore:
            immagine = Path(tempfile.gettempdir()) / "jukebox-prova-errore.png"
            try:
                (PAGINE_DEI_GIRI_ERRORE[-1] if giro[:1] in "6789" else pagina).screenshot(path=str(immagine))
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
    print("\nProva nel browser: 9 giri riusciti, nessun errore nella console.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
