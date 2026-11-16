"""Prova automatica nel browser: cinque giri sull'app vera, con un catalogo FINTO di 200 brani.

Giri: 1. avvio -> la lista si vede; 2. si scrive un artista -> compaiono i suoi brani;
3. si apre un brano -> si vede la scheda; 4. si crea una playlist manuale; 5. si importano
2 file audio di prova e si fa partire uno -> il tasto dice "Pausa". In più: il catalogo ha un
brano rotto apposta (senza fonti) e Impostazioni deve dire che l'ha ignorato.

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


def prova(catalogo: dict, cartella_audio: Path) -> list[str]:
    """I cinque giri. Lancia AssertionError (o un errore di Playwright) al primo che non torna."""
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
        pagina.on("dialog", lambda d: d.accept(NOME_PLAYLIST if d.type == "prompt" else None))
        try:
            # 1. Avvio: la lista si vede.
            giro = "1. avvio"
            pagina.goto(f"{base}/?dati=/dati/catalogo.json")
            pagina.wait_for_selector("#cerca-risultati .striscia")
            visibili = pagina.locator("#cerca-risultati .striscia").count()
            assert visibili > 20, f"la lista dovrebbe avere decine di brani, ne ha {visibili}"
            passo(f"avvio: la lista mostra {visibili} brani")

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
        except (AssertionError, ErrorePlaywright) as errore:
            immagine = Path(tempfile.gettempdir()) / "jukebox-prova-errore.png"
            try:
                pagina.screenshot(path=str(immagine))
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
    print("\nProva nel browser: 5 giri riusciti, nessun errore nella console.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
