"""prepara.py — prepara sul PC l'audio delle playlist da tenere sul telefono.

Strada A della M2 (plans/2026-09-28-app-musica-telefono.md, FASE 3): il Jukebox
suona da sé i file, così le playlist vanno avanti da sole, anche a schermo
spento. Questo script:
  1. aggiorna app-dati (git pull) e calcola i brani delle playlist con le stesse
     regole dell'app (node strumenti/valuta.mjs);
  2. per ogni brano che non ha ancora il file in ../audio/ lo procura:
     - "lo"      → copia del file locale;
     - "yt"      → yt-dlp, audio Opus di YouTube (circa 130-160 kbps, file .webm);
     - "sc"      → yt-dlp, l'audio migliore di SoundCloud (AAC 160 o mp3 128);
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
  python strumenti/prepara.py --archivio --minuti 30   # un giro dell'archivio sul PC
  python strumenti/prepara.py --archivio --prova       # a che punto è l'archivio
  python strumenti/prepara.py --metadati               # riscrive i metadati cambiati (dopo correzioni ai titoli)
  python strumenti/prepara.py --riallinea              # riaggancia i file agli id nuovi, sposta gli orfani in _orfani/
  python strumenti/prepara.py --indice                 # rigenera solo indice e collegamenti

Dopo ogni scaricamento il file riceve i metadati (artista, titolo con la
versione, genere, anno, BPM, Camelot, id: ffmpeg -c copy, l'audio non si
ricodifica) e una voce nel registro audio/registro.json (fonte, provenienza,
data). A fine giro si rigenerano audio/indice.html, audio/indice.csv e la
cartella audio-per-nome/ (hard link "Artista - Titolo (versione).ext"). Vedi
archivio.py.

Archivio sul PC (scelta di Nicolò, 05/10/2026): tutti i brani "scelti" del
catalogo (circa 8.400, 39 GB) scaricati a giri di circa 30 minuti, lanciati a
mano. Ordine: prima i brani delle playlist, poi quelli con un link diretto
(YouTube, SoundCloud, file), per ultimi i solo-Spotify. I brani già cercati e
non trovati non si ricercano (si riprovano con --riprova).

Telefono: un file si ricopia solo se il suo AUDIO è cambiato (inviati.json
ricorda la data di scaricamento), non se cambiano solo i metadati: così il
Jukebox non reimporta niente inutilmente.

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

import archivio as A

APP = Path(__file__).resolve().parent.parent
MUSICA = APP.parent
DATI = MUSICA / "app-dati"
AUDIO = MUSICA / "audio"
ABBINAMENTI = AUDIO / "abbinamenti.json"
REGISTRO = AUDIO / A.REGISTRO  # id → fonte, provenienza, scaricato, impronta metadati
INVIATI = AUDIO / "inviati.json"  # id → data di scaricamento della copia mandata al telefono
PER_NOME = MUSICA / "audio-per-nome"
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
        if f.suffix.lower() in ESTENSIONI_AUDIO and f.stem == id_brano:  # non "<id>.temp.m4a"
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


def durata_file(f: Path) -> float | None:
    """Durata vera del file audio (ffprobe), None se non si può sapere."""
    if not shutil.which("ffprobe"):
        return None
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(f)],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return None


# Da YouTube l'audio Opus (formato 251, circa 130-160 kbps: scelta di Nicolò del
# 05/10/2026, meglio dell'AAC a 128). Da SoundCloud no: lì l'Opus è a 64 kbps,
# meglio il suo AAC 160 o l'mp3 128.
FORMATO_YOUTUBE = "bestaudio[acodec=opus]/bestaudio"
FORMATO_ALTRI = "bestaudio[ext=m4a]/bestaudio"


def file_del_brano(id_brano: str) -> set[Path]:
    return {f for f in AUDIO.glob(f"{id_brano}.*") if f.suffix.lower() in ESTENSIONI_AUDIO and f.stem == id_brano}


def scarica_yt_dlp(url: str, id_brano: str, durata_attesa: float | None = None) -> Path:
    """Scarica l'audio di `url` come <id>.<ext>. Se il brano aveva già un file
    (per es. un vecchio .m4a), lo sostituisce solo a scaricamento riuscito."""
    import yt_dlp
    da_youtube = "youtube.com" in url or "youtu.be" in url
    prima = file_del_brano(id_brano)
    opzioni = {
        "format": FORMATO_YOUTUBE if da_youtube else FORMATO_ALTRI,
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
    nuovi = file_del_brano(id_brano) - prima
    if not nuovi:
        # yt-dlp non riscarica un file che c'è già con lo stesso nome.
        f = file_audio(id_brano)
        if not f:
            raise RuntimeError("yt-dlp non ha prodotto nessun file")
        return f
    f = max(nuovi, key=lambda x: x.stat().st_mtime)
    # SoundCloud dà solo un'anteprima di 30 s dei brani Go+: un file molto più
    # corto del brano non va bene, si cerca altrove (il file vecchio resta).
    durata = durata_file(f) if durata_attesa else None
    if durata and durata < 0.7 * durata_attesa:
        f.unlink()
        raise RuntimeError(f"solo un'anteprima di {durata:.0f} s (brano Go+)")
    for vecchio in prima - {f}:
        vecchio.unlink()
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
        dest = AUDIO / f"{brano['id']}{orig.suffix.lower()}"
        shutil.copy2(orig, dest)
        for vecchio in file_del_brano(brano["id"]) - {dest}:
            vecchio.unlink()
        return "file locale"
    # YouTube e SoundCloud: il link del catalogo. Se il video è sparito, vietato
    # ai minori o protetto da DRM (alcuni brani SoundCloud), si ripiega sulla ricerca su YouTube Music come per Spotify.
    errore = None
    for cod, url, nome in (("yt", f"https://www.youtube.com/watch?v={fonti.get('yt')}", "YouTube"), ("sc", fonti.get("sc"), "SoundCloud")):
        if cod in fonti:
            try:
                scarica_yt_dlp(url, brano["id"], brano.get("d"))
                return nome
            except Exception as e:
                errore = e
    if errore and not re.search(r"unavailable|confirm your age|removed|private|not available|anteprima|DRM", str(errore), re.I):
        raise errore
    # Solo Spotify (o link sparito): lo cerco su YouTube Music.
    ab = abbinamenti.get(brano["id"])
    if ab is None or (ab.get("videoId") is None and ab.get("riprova")):
        ab = cerca_su_youtube_music(brano, ytm_fn()) or {"videoId": None, "cercato": str(date.today())}
        abbinamenti[brano["id"]] = {"brano": descr(brano), **ab}
        scrivi_json(ABBINAMENTI, abbinamenti)
    if not ab.get("videoId"):
        raise LookupError("non trovato su YouTube Music")
    scarica_yt_dlp(f"https://music.youtube.com/watch?v={ab['videoId']}", brano["id"], brano.get("d"))
    return f"YouTube Music ({ab.get('title')})"


def origine(brano: dict, registro: dict, abbinamenti: dict) -> str:
    """Da dove è arrivato il file del brano: dal registro, oppure dedotto dalle
    fonti per i file scaricati prima che ci fosse."""
    if registro.get(brano["id"], {}).get("origine"):
        return registro[brano["id"]]["origine"]
    fonti = dict(brano["s"])
    if "lo" in fonti and (MUSICA / fonti["lo"]).is_file():
        return "file locale"
    if "yt" in fonti:
        return "YouTube"
    if "sc" in fonti and not (abbinamenti.get(brano["id"]) or {}).get("videoId"):
        return "SoundCloud"
    return "YouTube Music"


def da_rifare_in_opus(brano: dict, registro: dict, abbinamenti: dict) -> bool:
    """Un vecchio .m4a arrivato da YouTube: va riscaricato in Opus."""
    f = file_audio(brano["id"])
    return bool(f) and f.suffix.lower() == ".m4a" and origine(brano, registro, abbinamenti).startswith("YouTube")


def finisci_giro(brani: dict, macro: list[str], registro: dict) -> None:
    """A ogni giro: indice leggibile e collegamenti con i nomi leggibili."""
    n = A.scrivi_indice(AUDIO, brani, macro, registro)
    print(f"Indice aggiornato: {n} brani in audio/indice.html e indice.csv")
    k, errore = A.scrivi_collegamenti(AUDIO, PER_NOME, brani)
    print(f"Collegamenti: {k} in audio-per-nome/" + (f" · {errore}" if errore else ""))


def manutenzione(a, brani: dict, macro: list[str], registro: dict, abbinamenti: dict, rinominati: dict) -> int:
    """--riallinea, --metadati, --indice: nessuno scaricamento."""
    if a.riallinea:
        inviati = leggi_json(INVIATI, {})
        esito = A.riallinea(AUDIO, brani, registro, rinominati, abbinamenti, inviati)
        scrivi_json(REGISTRO, registro)
        scrivi_json(ABBINAMENTI, abbinamenti)
        scrivi_json(INVIATI, inviati)
        print(f"Riagganciati agli id nuovi: {len(esito['riagganciati'])}")
        for vecchio, nuovo in esito["riagganciati"][:20]:
            print(f"  {vecchio} → {nuovo}  {descr(brani[nuovo])}")
        spostati = len(esito["orfani"]) + len(esito["doppioni"])
        print(f"Spostati in audio/_orfani/: {spostati} file ({esito['mb_orfani']:.0f} MB) — "
              f"{len(esito['orfani'])} senza più un brano, {len(esito['doppioni'])} doppioni di brani uniti. "
              "Non ho cancellato niente: la cancellazione la decidi tu.")
    if a.riallinea or a.metadati:
        esito = A.aggiorna_metadati(AUDIO, brani, macro, registro, forza=a.forza)
        print(f"Metadati: {esito['aggiornati']} riscritti, {esito['a_posto']} già a posto"
              + (f", {esito['non_supportati']} in formati senza metadati" if esito["non_supportati"] else "")
              + (f", {esito['senza_brano']} senza brano (usa --riallinea)" if esito["senza_brano"] else ""))
        for i, errore in esito["errori"][:10]:
            print(f"  errore su {i}: {errore}")
    finisci_giro(brani, macro, registro)
    return 0


def archivio_in_ordine(tutti: list[dict], playlist: list[dict]) -> list[str]:
    """I brani "scelti" (niente esplorazione, niente set) nell'ordine in cui
    conviene scaricarli: prima quelli delle playlist, poi quelli con un link
    diretto (file, YouTube, SoundCloud: veloci e sicuri), poi i solo-Spotify."""
    scelti = [b for b in tutti if b.get("x") != 1 and b.get("k") != "set"]
    in_playlist = {i for p in playlist for i in p["brani"]}

    def priorita(b):
        cod = {s[0] for s in b["s"]}
        return (0 if b["id"] in in_playlist else 1, 0 if cod & {"lo", "yt", "sc"} else 1)
    return [b["id"] for b in sorted(scelti, key=priorita)]


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
    ap.add_argument("--archivio", action="store_true", help="tutti i brani scelti del catalogo, solo sul PC")
    ap.add_argument("--minuti", type=float, default=0, help="ferma il giro dopo circa N minuti")
    ap.add_argument("--riprova", action="store_true", help="ricerca anche i brani già cercati e non trovati")
    ap.add_argument("--metadati", action="store_true", help="riscrive i metadati dei file che li hanno vecchi")
    ap.add_argument("--forza", action="store_true", help="con --metadati: riscrive i metadati di tutti i file")
    ap.add_argument("--riallinea", "--orfani", action="store_true", help="riaggancia i file agli id nuovi, sposta gli orfani in _orfani/")
    ap.add_argument("--indice", action="store_true", help="rigenera solo indice e collegamenti")
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
    catalogo = json.loads((DATI / "catalogo.json").read_text(encoding="utf-8"))
    brani = {b["id"]: b for b in catalogo["brani"]}
    macro = catalogo["macro"]
    abbinamenti = leggi_json(ABBINAMENTI, {})
    if a.prova:
        registro = leggi_json(REGISTRO, {})  # sola lettura
    else:
        registro = A.migra(AUDIO, brani, lambda b: origine(b, {}, abbinamenti))
    if a.riallinea or a.metadati or a.indice:
        return manutenzione(a, brani, macro, registro, abbinamenti, catalogo.get("rinominati", {}))

    if not (DATI / "playlist.json").exists():
        print("Nessuna playlist salvata nel repo dati.")
        return 1
    uscita = subprocess.run(["node", str(APP / "strumenti" / "valuta.mjs"), str(DATI / "catalogo.json"), str(DATI / "playlist.json")],
                            capture_output=True, text=True, encoding="utf-8", check=True).stdout
    playlist = json.loads(uscita)

    if a.archivio:
        scelte = []
        a.solo_pc = True  # l'archivio non va sul telefono
    elif a.nomi:
        scelte = [p for p in playlist if any(n.lower() in p["nome"].lower() for n in a.nomi)]
    else:
        scelte = [p for p in playlist if p["telefono"]]
    if not scelte and not a.archivio:
        print("Nessuna playlist da preparare. Quelle salvate:")
        for p in playlist:
            print(f"  - {p['nome']} ({len(p['brani'])} brani){' · segnata per il telefono' if p['telefono'] else ''}")
        print('Segnala nel Jukebox ("Tieni questa playlist sul telefono") o passa il nome.')
        return 1

    if a.archivio:
        ids = archivio_in_ordine(catalogo["brani"], playlist)
    else:
        ids = list(dict.fromkeys(i for p in scelte for i in p["brani"]))
    rifare = {i for i in ids if da_rifare_in_opus(brani[i], registro, abbinamenti)}
    mancanti = [i for i in ids if not file_audio(i) or i in rifare]
    # Già cercati e non trovati: non li si ricerca a ogni giro.
    introvabili = [i for i in mancanti if i in abbinamenti and abbinamenti[i].get("videoId") is None]
    if not a.riprova:
        mancanti = [i for i in mancanti if i not in introvabili]
        for i in introvabili:
            abbinamenti[i].pop("riprova", None)
    else:
        for i in introvabili:
            abbinamenti[i]["riprova"] = True
    durata_min = sum((brani[i].get("d") or 290) for i in mancanti) / 60
    if a.archivio:
        pronti = [i for i in ids if file_audio(i)]
        gb = sum(file_audio(i).stat().st_size for i in pronti) / 1073741824
        print(f"Archivio sul PC: {len(pronti)} di {len(ids)} brani scelti ({gb:.1f} GB)")
        print(f"Da procurare: {len(mancanti)} (circa {durata_min / 1024:.1f} GB), di cui {len(rifare)} da rifare in Opus · già cercati e non trovati: {len(introvabili)}")
        if mancanti:
            print(f"A circa 5 brani al minuto: {len(mancanti) / 5 / 60:.0f} ore di scaricamento, cioè {len(mancanti) / 150:.0f} giri da 30 minuti")
    else:
        print(f"Playlist: {', '.join(p['nome'] for p in scelte)}")
        print(f"Brani: {len(ids)} · già pronti sul PC: {len(ids) - len(mancanti) - len(introvabili)} · da procurare: {len(mancanti)} (circa {durata_min:.0f} MB), di cui {len(rifare)} da rifare in Opus")
    if a.prova:
        return 0
    if a.max:
        mancanti = mancanti[:a.max]
    if a.solo_invio:
        mancanti = []

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
    inizio = time.time()
    fatti = 0
    rifiuti_di_fila = 0  # "conferma di non essere un bot": YouTube ci ha fermati per troppi scaricamenti
    for n, i in enumerate(mancanti, 1):
        if a.minuti and time.time() - inizio > a.minuti * 60:
            print(f"\nTempo scaduto ({a.minuti:.0f} minuti): mi fermo qui, il prossimo giro riparte da dove sono arrivato.")
            break
        fatti = n
        b = brani[i]
        try:
            come = procura(b, abbinamenti, ytm_fn)
            prov = "YouTube Music" if come.startswith("YouTube Music") else come
            # Una data di scaricamento nuova = audio nuovo: il telefono riceverà la copia aggiornata.
            registro[i] = {"fonte": A.fonte_ancora(b, prov), "origine": prov, "scaricato": A.adesso()}
            tag = A.tag_brano(b, macro)
            f = file_audio(i)
            try:
                if A.scrivi_metadati(f, tag):
                    registro[i]["tag"] = A.impronta(tag, f.suffix)
            except Exception as e:
                print(f"   (metadati non scritti, il file resta com'è: {str(e)[:120]})")
            scrivi_json(REGISTRO, registro)
            print(f"[{n}/{len(mancanti)}] ok  {descr(b)}  ← {come}")
            rifiuti_di_fila = 0
        except Exception as e:  # un brano che non va non ferma gli altri
            falliti.append((b, str(e).splitlines()[0][:160]))
            print(f"[{n}/{len(mancanti)}] NO  {descr(b)}  ← {falliti[-1][1]}")
            rifiuti_di_fila = rifiuti_di_fila + 1 if "not a bot" in str(e) else 0
            if rifiuti_di_fila >= 3:
                # Insistere allunga il blocco: meglio fermarsi e riprovare fra qualche ora.
                print("\nYouTube ha chiesto di confermare di non essere un bot (troppi scaricamenti di fila).")
                print("Mi fermo qui: riprova fra qualche ora, il giro riparte da dove sono arrivato.")
                break
        time.sleep(1)  # un po' di garbo con YouTube

    for p in scelte:
        pronti = sum(1 for i in p["brani"] if file_audio(i))
        print(f"\n{p['nome']}: {pronti} di {len(p['brani'])} brani pronti")
    if a.archivio:
        pronti = [i for i in ids if file_audio(i)]
        gb = sum(file_audio(i).stat().st_size for i in pronti) / 1073741824
        print(f"\nGiro finito: {fatti - len(falliti)} brani scaricati in {(time.time() - inizio) / 60:.0f} minuti.")
        print(f"Archivio sul PC: {len(pronti)} di {len(ids)} brani scelti ({gb:.1f} GB).")
    if falliti:
        print(f"\nNon procurati ({len(falliti)}): restano suonabili con Spotify/NewPipe.")
        anti_bot = sum("not a bot" in m for _, m in falliti)
        for b, motivo in falliti:
            if "not a bot" not in motivo:
                print(f"  - {descr(b)}: {motivo}")
        if anti_bot:
            print(f"  - {anti_bot} fermati dal controllo anti-bot di YouTube: si riprovano al prossimo giro, fra qualche ora")
        if any("403" in m for _, m in falliti):
            print('  Errore 403: YouTube è cambiato o fa i capricci. Aggiorna yt-dlp e rilancia (riprende da dove era):')
            print('  python -m pip install -U "yt-dlp[default]"')

    finisci_giro(brani, macro, registro)

    if a.solo_pc:
        return 0
    if not adb or not telefono_collegato(adb):
        print("\nTelefono non collegato: i file sono pronti sul PC. Collegalo (debug USB) e rilancia per copiarli.")
        return 0
    inviati = leggi_json(INVIATI, {})
    da_inviare = [f for i in ids if (f := file_audio(i))
                  and (a.reinvia or inviati.get(i) != registro.get(i, {}).get("scaricato"))]
    if not da_inviare:
        print("\nSul telefono non c'è niente di nuovo da copiare.")
        return 0
    subprocess.run([adb, "shell", "mkdir", "-p", CARTELLA_TELEFONO], check=True)
    for k in range(0, len(da_inviare), 40):
        blocco = da_inviare[k:k + 40]
        subprocess.run([adb, "push", *map(str, blocco), CARTELLA_TELEFONO], check=True, capture_output=True)
        for f in blocco:
            inviati[f.stem] = registro.get(f.stem, {}).get("scaricato", "")
        scrivi_json(INVIATI, inviati)
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
