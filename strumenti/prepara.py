"""prepara.py — prepara sul PC l'audio delle playlist da tenere sul telefono.

Strada A della M2 (plans/2026-09-28-app-musica-telefono.md, FASE 3): il Jukebox
suona da sé i file, così le playlist vanno avanti da sole, anche a schermo
spento. Questo script:
  1. aggiorna app-dati (git pull) e calcola i brani delle playlist con le stesse
     regole dell'app (node strumenti/valuta.mjs);
  2. per ogni brano che non ha ancora il file in ../audio-telefono/ lo procura:
     - "lo"      → copia del file locale;
     - "yt"/"sc" → yt-dlp, audio m4a (circa 128 kbps) o il migliore disponibile;
     - solo "sp" → ricerca su YouTube Music e abbinamento per artista, titolo e
       durata; l'esito va in abbinamenti.json (correggibile a mano);
  3. se il telefono è collegato (adb), copia i file nuovi in Download/Jukebox/.
Poi, nel Jukebox: Altro → Musica sul telefono → Aggiungi file dal telefono.

Uso:
  python strumenti/prepara.py                  # le playlist segnate "sul telefono"
  python strumenti/prepara.py "Hip Rap"        # per nome (basta una parte)
  python strumenti/prepara.py --prova          # dice cosa farebbe, senza scaricare
  python strumenti/prepara.py --max 5          # procura al massimo 5 brani (per provare)
  python strumenti/prepara.py --solo-pc        # scarica ma non copia sul telefono
  python strumenti/prepara.py --solo-invio     # copia sul telefono i file già pronti, senza scaricare
  python strumenti/prepara.py --reinvia        # ricopia sul telefono anche i già inviati
  python strumenti/prepara.py --pulisci        # svuota Download/Jukebox sul telefono

Nota: scaricare da YouTube è contro i suoi termini di servizio, come NewPipe
(scelta consapevole di Nicolò, 02/10/2026). I file restano per uso personale.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import time
import unicodedata
from datetime import date
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
MUSICA = APP.parent
DATI = MUSICA / "app-dati"
AUDIO = MUSICA / "audio-telefono"
ABBINAMENTI = AUDIO / "abbinamenti.json"
INVIATI = AUDIO / "inviati.json"
CARTELLA_TELEFONO = "/sdcard/Download/Jukebox"
ESTENSIONI_AUDIO = {".m4a", ".mp3", ".opus", ".webm", ".ogg", ".aac", ".flac", ".wav"}


# ---------------------------------------------------------------- abbinamento --
# Logica pura (testata in strumenti/test_prepara.py): sceglie fra i risultati di
# YouTube Music quello che è davvero il brano del catalogo.

PAROLE_VUOTE = {"the", "a", "an", "and", "feat", "ft", "featuring", "with", "remaster", "remastered", "version"}


def normalizza(s: str | None) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower().replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def parole(s: str | None) -> set[str]:
    return {p for p in normalizza(s).split() if p not in PAROLE_VUOTE}


def titolo_base(t: str | None) -> str:
    """Il titolo senza parentesi né code tipo ' - 2013 Remaster'."""
    t = re.sub(r"[\(\[].*?[\)\]]", " ", t or "")
    return t.split(" - ")[0]


def tolleranza(durata: float) -> float:
    return max(6.0, 0.04 * durata)


def punteggio(brano: dict, cand: dict) -> float | None:
    """None se il candidato non è il brano; altrimenti più alto = più simile.

    cand: {"title", "artists": [nomi], "duration_seconds"} (forma di ytmusicapi).
    """
    art_cat = parole(brano.get("a"))
    art_cand = parole(" ".join(cand.get("artists") or []))
    if not art_cat or not art_cand:
        return None
    sovr_art = len(art_cat & art_cand) / len(art_cat)
    if sovr_art < 0.5:
        return None

    tit_cat = parole(titolo_base(brano.get("t")))
    tit_cand = parole(cand.get("title"))
    if not tit_cat:
        return None
    sovr_tit = len(tit_cat & tit_cand) / len(tit_cat)
    if sovr_tit < 0.6:
        return None

    d, dc = brano.get("d"), cand.get("duration_seconds")
    vicinanza = 0.0
    if d:
        if not dc:
            return None
        scarto = abs(d - dc)
        if scarto > tolleranza(d):
            return None
        vicinanza = 1 - scarto / tolleranza(d)

    # La versione (remix, edit, live...) deve tornare: se il catalogo ne ha una
    # la cerco nel titolo del candidato, se non ne ha penalizzo le versioni.
    ver = parole(brano.get("v"))
    extra = tit_cand - tit_cat
    if ver:
        bonus = len(ver & tit_cand) / len(ver) - 0.5
    else:
        bonus = -0.5 if extra & {"remix", "live", "edit", "mix", "rework", "dub", "instrumental", "acoustic"} else 0.0
    return sovr_art + sovr_tit + vicinanza + bonus


def scegli(brano: dict, candidati: list[dict]) -> tuple[dict, float] | None:
    migliori = [(c, p) for c in candidati if (p := punteggio(brano, c)) is not None]
    return max(migliori, key=lambda x: x[1]) if migliori else None


def query(brano: dict) -> str:
    return " ".join(x for x in [brano.get("a"), titolo_base(brano.get("t")), brano.get("v")] if x)


# ------------------------------------------------------------------- utilità --

def leggi_json(p: Path, vuoto):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return vuoto


def scrivi_json(p: Path, dati) -> None:
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(dati, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, p)


def file_audio(id_brano: str) -> Path | None:
    for f in AUDIO.glob(f"{id_brano}.*"):
        if f.suffix.lower() in ESTENSIONI_AUDIO:
            return f
    return None


def trova_adb() -> str | None:
    if shutil.which("adb"):
        return shutil.which("adb")
    base = os.environ.get("LOCALAPPDATA", "")
    trovati = glob.glob(os.path.join(base, "Microsoft", "WinGet", "Packages", "Genymobile.scrcpy*", "*", "adb.exe"))
    return trovati[0] if trovati else None


def telefono_collegato(adb: str) -> bool:
    out = subprocess.run([adb, "devices"], capture_output=True, text=True).stdout
    return any(r.strip().endswith("\tdevice") for r in out.splitlines()[1:])


def descr(b: dict) -> str:
    t = b.get("t") or "?"
    return f"{b.get('a') or '?'} — {t}" + (f" ({b['v']})" if b.get("v") else "")


# ---------------------------------------------------------------- procurare --

def prepara_rete():
    """yt-dlp e ytmusicapi, col truststore di Windows (l'antivirus ispeziona il TLS)."""
    import truststore
    truststore.inject_into_ssl()


def scarica_yt_dlp(url: str, id_brano: str) -> Path:
    import yt_dlp
    opzioni = {
        "format": "bestaudio[ext=m4a]/bestaudio",
        "outtmpl": str(AUDIO / f"{id_brano}.%(ext)s"),
        "quiet": True, "no_warnings": True, "noprogress": True,
        "retries": 3, "fragment_retries": 3,
        "js_runtimes": {"node": {}},
    }
    # YouTube ogni tanto risponde 403 a caso: un secondo tentativo dopo una pausa
    # di solito basta. Se fallisce sempre, yt-dlp va aggiornato.
    for tentativo in (1, 2):
        try:
            with yt_dlp.YoutubeDL(opzioni) as y:
                y.download([url])
            break
        except yt_dlp.utils.DownloadError:
            if tentativo == 2:
                raise
            time.sleep(5)
    f = file_audio(id_brano)
    if not f:
        raise RuntimeError("yt-dlp non ha prodotto nessun file")
    return f


def cerca_su_youtube_music(brano: dict, ytm) -> dict | None:
    for filtro in ("songs", "videos"):
        risultati = ytm.search(query(brano), filter=filtro, limit=8)
        candidati = [{
            "videoId": r.get("videoId"), "title": r.get("title"),
            "artists": [a["name"] for a in r.get("artists") or []],
            "duration_seconds": r.get("duration_seconds"),
        } for r in risultati if r.get("videoId")]
        scelta = scegli(brano, candidati)
        if scelta:
            c, p = scelta
            return {**c, "punteggio": round(p, 2), "filtro": filtro}
    return None


def procura(brano: dict, abbinamenti: dict, ytm_fn) -> str:
    """Procura il file del brano. Restituisce come ("locale", "youtube", ...)."""
    fonti = dict(brano["s"])
    if "lo" in fonti and (MUSICA / fonti["lo"]).is_file():
        orig = MUSICA / fonti["lo"]
        shutil.copy2(orig, AUDIO / f"{brano['id']}{orig.suffix.lower()}")
        return "file locale"
    # YouTube e SoundCloud: il link del catalogo. Se il video è sparito o vietato
    # ai minori, si ripiega sulla ricerca su YouTube Music come per Spotify.
    errore = None
    for cod, url, nome in (("yt", f"https://www.youtube.com/watch?v={fonti.get('yt')}", "YouTube"), ("sc", fonti.get("sc"), "SoundCloud")):
        if cod in fonti:
            try:
                scarica_yt_dlp(url, brano["id"])
                return nome
            except Exception as e:
                errore = e
    if errore and not re.search(r"unavailable|confirm your age|removed|private|not available", str(errore), re.I):
        raise errore
    # Solo Spotify (o link sparito): lo cerco su YouTube Music.
    ab = abbinamenti.get(brano["id"])
    if ab is None or (ab.get("videoId") is None and ab.get("riprova")):
        ab = cerca_su_youtube_music(brano, ytm_fn()) or {"videoId": None, "cercato": str(date.today())}
        abbinamenti[brano["id"]] = {"brano": descr(brano), **ab}
        scrivi_json(ABBINAMENTI, abbinamenti)
    if not ab.get("videoId"):
        raise LookupError("non trovato su YouTube Music")
    scarica_yt_dlp(f"https://music.youtube.com/watch?v={ab['videoId']}", brano["id"])
    return f"YouTube Music ({ab.get('title')})"


# --------------------------------------------------------------------- main --

def main() -> int:
    for flusso in (sys.stdout, sys.stderr):
        flusso.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="Prepara l'audio delle playlist per il telefono.")
    ap.add_argument("nomi", nargs="*", help="playlist da preparare (anche una parte del nome)")
    ap.add_argument("--prova", action="store_true", help="dice cosa farebbe, senza scaricare")
    ap.add_argument("--max", type=int, default=0, help="procura al massimo N brani in questo giro")
    ap.add_argument("--solo-pc", action="store_true", help="non copia sul telefono")
    ap.add_argument("--solo-invio", action="store_true", help="copia sul telefono i file già pronti, senza scaricare")
    ap.add_argument("--reinvia", action="store_true", help="ricopia sul telefono anche i file già inviati")
    ap.add_argument("--pulisci", action="store_true", help="svuota Download/Jukebox sul telefono e basta")
    a = ap.parse_args()

    AUDIO.mkdir(exist_ok=True)
    adb = trova_adb()

    if a.pulisci:
        if not adb or not telefono_collegato(adb):
            print("Telefono non collegato (serve il cavo col debug USB).")
            return 1
        subprocess.run([adb, "shell", "rm", "-rf", CARTELLA_TELEFONO], check=True)
        print(f"Svuotata {CARTELLA_TELEFONO} sul telefono.")
        return 0

    subprocess.run(["git", "-C", str(DATI), "pull", "-q"], check=False)
    if not (DATI / "playlist.json").exists():
        print("Nessuna playlist salvata nel repo dati.")
        return 1
    catalogo = json.loads((DATI / "catalogo.json").read_text(encoding="utf-8"))
    brani = {b["id"]: b for b in catalogo["brani"]}
    uscita = subprocess.run(["node", str(APP / "strumenti" / "valuta.mjs"), str(DATI / "catalogo.json"), str(DATI / "playlist.json")],
                            capture_output=True, text=True, encoding="utf-8", check=True).stdout
    playlist = json.loads(uscita)

    if a.nomi:
        scelte = [p for p in playlist if any(n.lower() in p["nome"].lower() for n in a.nomi)]
    else:
        scelte = [p for p in playlist if p["telefono"]]
    if not scelte:
        print("Nessuna playlist da preparare. Quelle salvate:")
        for p in playlist:
            print(f"  - {p['nome']} ({len(p['brani'])} brani){' · segnata per il telefono' if p['telefono'] else ''}")
        print('Segnala nel Jukebox ("Tieni questa playlist sul telefono") o passa il nome.')
        return 1

    ids = list(dict.fromkeys(i for p in scelte for i in p["brani"]))
    mancanti = [i for i in ids if not file_audio(i)]
    durata_min = sum((brani[i].get("d") or 290) for i in mancanti) / 60
    print(f"Playlist: {', '.join(p['nome'] for p in scelte)}")
    print(f"Brani: {len(ids)} · già pronti sul PC: {len(ids) - len(mancanti)} · da procurare: {len(mancanti)} (circa {durata_min:.0f} MB)")
    if a.prova:
        return 0
    if a.max:
        mancanti = mancanti[:a.max]
    if a.solo_invio:
        mancanti = []

    abbinamenti = leggi_json(ABBINAMENTI, {})
    if mancanti:
        prepara_rete()
    ytm = None

    def ytm_fn():
        nonlocal ytm
        if ytm is None:
            from ytmusicapi import YTMusic
            ytm = YTMusic()
        return ytm

    falliti = []
    for n, i in enumerate(mancanti, 1):
        b = brani[i]
        try:
            come = procura(b, abbinamenti, ytm_fn)
            print(f"[{n}/{len(mancanti)}] ok  {descr(b)}  ← {come}")
        except Exception as e:  # un brano che non va non ferma gli altri
            falliti.append((b, str(e).splitlines()[0][:160]))
            print(f"[{n}/{len(mancanti)}] NO  {descr(b)}  ← {falliti[-1][1]}")
        time.sleep(1)  # un po' di garbo con YouTube

    for p in scelte:
        pronti = sum(1 for i in p["brani"] if file_audio(i))
        print(f"\n{p['nome']}: {pronti} di {len(p['brani'])} brani pronti")
    if falliti:
        print(f"\nNon procurati ({len(falliti)}): restano suonabili con Spotify/NewPipe.")
        for b, motivo in falliti:
            print(f"  - {descr(b)}: {motivo}")
        if any("403" in m for _, m in falliti):
            print('  Errore 403: YouTube è cambiato o fa i capricci. Aggiorna yt-dlp e rilancia (riprende da dove era):')
            print('  python -m pip install -U "yt-dlp[default]"')

    if a.solo_pc:
        return 0
    if not adb or not telefono_collegato(adb):
        print("\nTelefono non collegato: i file sono pronti sul PC. Collegalo (debug USB) e rilancia per copiarli.")
        return 0
    inviati = set() if a.reinvia else set(leggi_json(INVIATI, []))
    da_inviare = [f for i in ids if i not in inviati and (f := file_audio(i))]
    if not da_inviare:
        print("\nSul telefono non c'è niente di nuovo da copiare.")
        return 0
    subprocess.run([adb, "shell", "mkdir", "-p", CARTELLA_TELEFONO], check=True)
    for k in range(0, len(da_inviare), 40):
        blocco = da_inviare[k:k + 40]
        subprocess.run([adb, "push", *map(str, blocco), CARTELLA_TELEFONO], check=True, capture_output=True)
        inviati.update(f.stem for f in blocco)
        scrivi_json(INVIATI, sorted(inviati))
        print(f"Copiati sul telefono: {min(k + 40, len(da_inviare))} di {len(da_inviare)}")
    # Fa comparire subito i file nel selettore di Android.
    subprocess.run([adb, "shell", "content", "call", "--uri", "content://media/", "--method", "scan_volume", "--arg", "external_primary"],
                   capture_output=True)
    mb = sum(f.stat().st_size for f in da_inviare) / 1048576
    print(f"\nFatto: {len(da_inviare)} file ({mb:.0f} MB) in Download/Jukebox.")
    print("Nel Jukebox: Altro → Musica sul telefono → Aggiungi file dal telefono → apri Download/Jukebox → Seleziona tutto.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
