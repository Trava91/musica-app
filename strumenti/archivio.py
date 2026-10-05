"""archivio.py — cura dell'archivio audio sul PC (05-hobby/musica/audio/).

I file si chiamano <id brano>.<ext>. Questo modulo, usato da prepara.py, tiene:
  - il REGISTRO (audio/registro.json): per ogni file la fonte del catalogo da cui
    è arrivato ("yt:<video>", "sp:<traccia>", "sc:<url>", "lo:<percorso>"), la
    provenienza, quando è stato scaricato e l'impronta dei metadati scritti.
    La fonte non cambia mai, l'id del brano sì (unione di doppioni, fonti
    aggiunte o tolte: vedi plans/2026-09-28-app-musica-telefono.md, 05/10/2026),
    quindi è la fonte a permettere di riagganciare un file al brano giusto;
  - i METADATI dentro ogni file (ffmpeg -c copy: l'audio non si ricodifica);
  - l'INDICE leggibile (audio/indice.html e indice.csv);
  - i COLLEGAMENTI con nomi leggibili (audio-per-nome/, hard link NTFS: nessuno
    spazio in più, niente permessi di amministratore);
  - il RIALLINEAMENTO quando cambiano gli id, e gli ORFANI (audio/_orfani/).

Le funzioni ricevono le cartelle come argomenti, così si provano su copie.
"""

from __future__ import annotations

import csv
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import unicodedata
from datetime import datetime
from pathlib import Path

ESTENSIONI_AUDIO = {".m4a", ".mp3", ".opus", ".webm", ".ogg", ".aac", ".flac", ".wav"}
REGISTRO = "registro.json"
MANIFESTO_COLLEGAMENTI = ".collegamenti.json"
LUNGHEZZA_NOME = 140  # caratteri del nome leggibile, estensione esclusa (Windows: percorsi entro 260)


# ------------------------------------------------------------------ utilità --

def leggi_json(p: Path, vuoto):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return vuoto


def scrivi_json(p: Path, dati) -> None:
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(dati, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, p)


def file_audio(cartella: Path) -> list[Path]:
    """I file audio dell'archivio (solo il primo livello: niente _orfani, _tmp).
    Solo nomi "<id>.<ext>": i residui di yt-dlp come "<id>.temp.m4a" non contano."""
    return sorted(f for f in cartella.iterdir()
                  if f.is_file() and f.suffix.lower() in ESTENSIONI_AUDIO and "." not in f.stem)


def adesso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def durata_fmt(sec) -> str:
    if not sec:
        return ""
    sec = int(round(sec))
    return f"{sec // 60}:{sec % 60:02d}"


# --------------------------------------------------------------- registro --

def fonte_ancora(brano: dict, origine: str) -> str | None:
    """La fonte del catalogo a cui legare il file: quella da cui è arrivato
    (YouTube, SoundCloud, file locale); per i brani trovati su YouTube Music,
    la traccia Spotify da cui è partita la ricerca."""
    fonti = {}
    for cod, rif in brano["s"]:
        fonti.setdefault(cod, rif)
    preferenza = {"file locale": "lo", "YouTube": "yt", "SoundCloud": "sc"}.get(origine)
    if preferenza and preferenza in fonti:
        return f"{preferenza}:{fonti[preferenza]}"
    for cod in ("sp", "yt", "sc", "lo"):
        if cod in fonti:
            return f"{cod}:{fonti[cod]}"
    return None


def migra(cartella: Path, brani: dict, origine_di) -> dict:
    """Crea o completa il registro per i file presenti: assorbe il vecchio
    origini.json e converte inviati.json da elenco a {id: scaricato}.
    origine_di(brano) deduce la provenienza dei file scaricati prima del registro."""
    registro = leggi_json(cartella / REGISTRO, {})
    vecchie = leggi_json(cartella / "origini.json", {})
    for f in file_audio(cartella):
        i = f.stem
        voce = registro.setdefault(i, {})
        if i in vecchie and "origine" not in voce:
            voce["origine"] = vecchie[i]
        if i in brani:
            voce.setdefault("origine", origine_di(brani[i]))
            if "fonte" not in voce:
                voce["fonte"] = fonte_ancora(brani[i], voce["origine"])
        voce.setdefault("scaricato", datetime.fromtimestamp(f.stat().st_mtime).isoformat(timespec="seconds"))
    scrivi_json(cartella / REGISTRO, registro)
    if (cartella / "origini.json").exists():
        (cartella / "origini.json").unlink()

    inviati = leggi_json(cartella / "inviati.json", {})
    if isinstance(inviati, list):  # vecchio formato: solo gli id
        inviati = {i: registro.get(i, {}).get("scaricato", "") for i in inviati}
        scrivi_json(cartella / "inviati.json", inviati)
    return registro


# --------------------------------------------------------------- metadati --

def tag_brano(brano: dict, macro: list[str]) -> dict:
    """I metadati di un brano, in forma neutra (prima di adattarli al formato)."""
    titolo = (brano.get("t") or brano["id"]) + (f" ({brano['v']})" if brano.get("v") else "")
    artista = (brano.get("a") or "") + (f" feat. {brano['f']}" if brano.get("f") else "")
    bpm = str(round(brano["b"])) if brano.get("b") else ""
    camelot = brano.get("c") or ""
    # Commento solo ASCII e corto: negli mp3 VLC lo legge dal vecchio ID3v1 (30 caratteri).
    commento = ", ".join(x for x in [f"{bpm} BPM" if bpm else "", camelot, f"id {brano['id']}"] if x)
    return {
        "titolo": titolo, "artista": artista,
        "genere": macro[brano["g"]] if brano.get("g") is not None and brano["g"] < len(macro) else "",
        "anno": str(brano["y"]) if brano.get("y") else "", "bpm": bpm, "camelot": camelot,
        "id": brano["id"], "commento": commento,
    }


def argomenti_ffmpeg(tag: dict, ext: str) -> list[str] | None:
    """Gli argomenti -metadata per il formato del file; None se il formato non li regge.

    Scelte provate con ffprobe e VLC (05/10/2026):
      - mp3: ID3v2.3 + ID3v1 (VLC legge il commento solo dall'ID3v1); BPM e
        tonalità nei frame standard TBPM e TKEY, l'id in TXXX:JUKEBOX_ID;
      - m4a: solo i campi standard. Con campi personalizzati
        (-movflags use_metadata_tags) VLC non legge più nulla, quindi BPM,
        tonalità e id stanno nel commento;
      - webm: tag Matroska; l'anno in DATE_RELEASED (VLC non legge DATE).
        VLC mostra l'artista come "Artista dell'album" (ffprobe come ARTIST).
    """
    ext = ext.lower()
    base = {"title": tag["titolo"], "artist": tag["artista"], "genre": tag["genere"], "comment": tag["commento"]}
    extra: list[str] = []
    if ext == ".mp3":
        campi = {**base, "date": tag["anno"], "TBPM": tag["bpm"], "TKEY": tag["camelot"], "JUKEBOX_ID": tag["id"]}
        extra = ["-id3v2_version", "3", "-write_id3v1", "1"]
    elif ext in (".m4a", ".mp4"):
        campi = {**base, "date": tag["anno"]}
    elif ext in (".webm", ".mkv", ".mka"):
        campi = {**base, "DATE_RELEASED": tag["anno"], "BPM": tag["bpm"], "INITIAL_KEY": tag["camelot"], "JUKEBOX_ID": tag["id"]}
    elif ext in (".opus", ".ogg", ".flac"):
        campi = {**base, "date": tag["anno"], "BPM": tag["bpm"], "INITIALKEY": tag["camelot"], "JUKEBOX_ID": tag["id"]}
    else:
        return None
    argomenti = []
    for k, v in campi.items():
        if v:
            argomenti += ["-metadata", f"{k}={v}"]
    return argomenti + extra


def impronta(tag: dict, ext: str) -> str:
    return hashlib.sha1(json.dumps([tag, ext.lower()], sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()[:16]


def _durata(f: Path) -> float | None:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(f)],
                       capture_output=True, text=True, encoding="utf-8")
    try:
        return float(r.stdout.strip())
    except ValueError:
        return None


def scrivi_metadati(f: Path, tag: dict) -> bool:
    """Riscrive i metadati di `f` senza toccare l'audio (-c copy). Il file nuovo
    sostituisce il vecchio solo se ffmpeg riesce e durata e dimensione tornano.
    False se il formato non regge i metadati."""
    argomenti = argomenti_ffmpeg(tag, f.suffix)
    if argomenti is None:
        return False
    tmpdir = f.parent / "_tmp"
    tmpdir.mkdir(exist_ok=True)
    tmp = tmpdir / f.name
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(f), "-map", "0", "-c", "copy", "-map_metadata", "-1", *argomenti, str(tmp)]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    try:
        if r.returncode != 0 or not tmp.exists():
            raise RuntimeError(f"ffmpeg: {r.stderr.strip()[:200]}")
        if tmp.stat().st_size < 0.9 * f.stat().st_size:
            raise RuntimeError("il file con i metadati è più piccolo del 10%: lascio l'originale")
        d0, d1 = _durata(f), _durata(tmp)
        if d0 and d1 and abs(d0 - d1) > 1:
            raise RuntimeError(f"durata cambiata ({d0:.1f} → {d1:.1f} s): lascio l'originale")
        os.replace(tmp, f)
    finally:
        tmp.unlink(missing_ok=True)
    return True


def aggiorna_metadati(cartella: Path, brani: dict, macro: list[str], registro: dict, forza: bool = False, stampa=print) -> dict:
    """Scrive i metadati nei file che non li hanno o li hanno vecchi (per es.
    dopo una correzione dei titoli). Salta quelli già a posto."""
    esito = {"aggiornati": 0, "a_posto": 0, "senza_brano": 0, "non_supportati": 0, "errori": []}
    for n, f in enumerate(file_audio(cartella), 1):
        i = f.stem
        if i not in brani:
            esito["senza_brano"] += 1
            continue
        tag = tag_brano(brani[i], macro)
        h = impronta(tag, f.suffix)
        voce = registro.setdefault(i, {})
        if not forza and voce.get("tag") == h:
            esito["a_posto"] += 1
            continue
        try:
            if scrivi_metadati(f, tag):
                voce["tag"] = h
                esito["aggiornati"] += 1
            else:
                esito["non_supportati"] += 1
        except Exception as e:
            esito["errori"].append((i, str(e)))
        if n % 50 == 0:
            scrivi_json(cartella / REGISTRO, registro)
            stampa(f"  metadati: {n} file controllati…")
    scrivi_json(cartella / REGISTRO, registro)
    return esito


# ----------------------------------------------------------------- indice --

def righe_indice(cartella: Path, brani: dict, macro: list[str], registro: dict) -> list[dict]:
    righe = []
    for f in file_audio(cartella):
        b = brani.get(f.stem)
        if not b:
            continue
        righe.append({
            "artista": b.get("a") or "", "titolo": (b.get("t") or "") + (f" ({b['v']})" if b.get("v") else ""),
            "genere": macro[b["g"]] if b.get("g") is not None and b["g"] < len(macro) else "",
            "durata": durata_fmt(b.get("d")), "provenienza": registro.get(f.stem, {}).get("origine", ""),
            "file": f.name, "mb": f.stat().st_size / 1048576,
        })
    righe.sort(key=lambda r: (r["artista"].casefold(), r["titolo"].casefold()))
    return righe


def scrivi_indice(cartella: Path, brani: dict, macro: list[str], registro: dict) -> int:
    righe = righe_indice(cartella, brani, macro, registro)
    with (cartella / "indice.csv").open("w", encoding="utf-8-sig", newline="") as fh:  # utf-8-sig e ";" per Excel in italiano
        w = csv.writer(fh, delimiter=";")
        w.writerow(["Artista", "Titolo", "Genere", "Durata", "Provenienza", "File"])
        for r in righe:
            w.writerow([r["artista"], r["titolo"], r["genere"], r["durata"], r["provenienza"], r["file"]])

    gb = sum(r["mb"] for r in righe) / 1024
    corpo = "\n".join(
        f"<tr><td>{html.escape(r['artista'])}</td><td>{html.escape(r['titolo'])}</td><td>{html.escape(r['genere'])}</td>"
        f"<td class=n>{r['durata']}</td><td>{html.escape(r['provenienza'])}</td>"
        f"<td><a href=\"{html.escape(r['file'])}\">{html.escape(r['file'])}</a></td></tr>"
        for r in righe)
    pagina = f"""<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Archivio audio</title>
<style>
:root {{ color-scheme: light dark; --bg:#fbfaf7; --fg:#1d1d1d; --tenue:#666; --riga:#efece4; --bordo:#d9d4c7; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#14161c; --fg:#e8e6e1; --tenue:#9a9a9a; --riga:#1d2029; --bordo:#30343f; }} }}
body {{ margin:0; padding:16px; background:var(--bg); color:var(--fg); font:15px/1.4 system-ui, sans-serif; }}
h1 {{ font-size:1.3rem; margin:0 0 4px; }} p {{ margin:0 0 12px; color:var(--tenue); }}
input {{ width:100%; max-width:420px; padding:8px 10px; font:inherit; border:1px solid var(--bordo); border-radius:8px; background:transparent; color:inherit; }}
table {{ border-collapse:collapse; width:100%; margin-top:12px; }}
th, td {{ text-align:left; padding:6px 8px; border-bottom:1px solid var(--bordo); vertical-align:top; }}
th {{ position:sticky; top:0; background:var(--bg); }} tr:nth-child(even) td {{ background:var(--riga); }}
td.n {{ font-variant-numeric:tabular-nums; }} a {{ color:inherit; }}
</style></head><body>
<h1>Archivio audio</h1>
<p>{len(righe)} brani · {gb:.1f} GB · aggiornato il {datetime.now():%d/%m/%Y %H:%M} · clic sul file per ascoltarlo</p>
<label for="f">Cerca</label><br><input id="f" type="search" placeholder="artista, titolo, genere…" autocomplete="off">
<table><thead><tr><th>Artista</th><th>Titolo</th><th>Genere</th><th>Durata</th><th>Provenienza</th><th>File</th></tr></thead>
<tbody id="t">
{corpo}
</tbody></table>
<script>
const f = document.getElementById("f"), righe = [...document.querySelectorAll("#t tr")];
f.addEventListener("input", () => {{ const q = f.value.toLowerCase(); righe.forEach(r => r.hidden = q && !r.textContent.toLowerCase().includes(q)); }});
</script>
</body></html>
"""
    (cartella / "indice.html").write_text(pagina, encoding="utf-8")
    return len(righe)


# ------------------------------------------------------------ collegamenti --

_VIETATI = str.maketrans({"<": "", ">": "", ":": " -", '"': "'", "/": "-", "\\": "-", "|": "-", "?": "", "*": ""})
_RISERVATI = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}


def nome_leggibile(brano: dict) -> str:
    """'Artista - Titolo (versione)', valido come nome di file su Windows."""
    titolo = (brano.get("t") or "") + (f" ({brano['v']})" if brano.get("v") else "")
    nome = " - ".join(x for x in [brano.get("a") or "", titolo] if x.strip()) or brano["id"]
    nome = unicodedata.normalize("NFC", nome).translate(_VIETATI)
    nome = "".join(c for c in nome if ord(c) >= 32)
    nome = re.sub(r"\s+", " ", nome).strip()
    if len(nome) > LUNGHEZZA_NOME:
        nome = nome[:LUNGHEZZA_NOME - 1].rstrip() + "…"
    nome = nome.rstrip(". ")  # Windows non accetta nomi che finiscono con punto o spazio
    if nome.split(".")[0].upper() in _RISERVATI:
        nome = "_" + nome
    return nome or brano["id"]


def nomi_collegamenti(file_e_brani: list[tuple[Path, dict]]) -> dict[Path, str]:
    """Il nome leggibile di ogni file. Se due brani darebbero lo stesso nome (NTFS
    non distingue maiuscole e minuscole), TUTTI quelli in conflitto prendono anche
    l'id: così i nomi non cambiano da un giro all'altro."""
    proposti = {f: nome_leggibile(b) + f.suffix.lower() for f, b in file_e_brani}
    conteggio: dict[str, int] = {}
    for nome in proposti.values():
        conteggio[nome.casefold()] = conteggio.get(nome.casefold(), 0) + 1
    finali = {}
    for (f, b) in file_e_brani:
        nome = proposti[f]
        if conteggio[nome.casefold()] > 1:
            nome = f"{nome[:-len(f.suffix)]} [{b['id']}]{f.suffix.lower()}"
        finali[f] = nome
    return finali


def scrivi_collegamenti(cartella: Path, dest: Path, brani: dict) -> tuple[int, str | None]:
    """Rigenera dest/ con un hard link per file. Toglie solo i collegamenti che
    ha creato lui (elencati nel manifesto), mai altri file. (n, errore)."""
    dest.mkdir(exist_ok=True)
    manifesto = dest / MANIFESTO_COLLEGAMENTI
    for nome in leggi_json(manifesto, []):
        (dest / nome).unlink(missing_ok=True)
    coppie = [(f, brani[f.stem]) for f in file_audio(cartella) if f.stem in brani]
    creati = []
    errore = None
    try:
        for f, nome in nomi_collegamenti(coppie).items():
            os.link(f, dest / nome)
            creati.append(nome)
    except OSError as e:
        errore = f"collegamenti non disponibili ({e.strerror or e}): resta l'indice"
    scrivi_json(manifesto, creati)
    return len(creati), errore


# ----------------------------------------------------- riallineamento e orfani --

def mappa_fonti(brani: dict) -> dict[str, str]:
    """'yt:<video>' (ecc.) → id del brano che oggi contiene quella fonte."""
    return {f"{cod}:{rif}": i for i, b in brani.items() for cod, rif in b["s"]}


def riallinea(cartella: Path, brani: dict, registro: dict, rinominati: dict, abbinamenti: dict, inviati: dict) -> dict:
    """Per ogni file il cui id non c'è più nel catalogo:
      - se la sua fonte (registro) o la tabella "rinominati" di esporta.py porta
        a un brano che esiste → il file prende il nuovo id;
      - se quel brano ha già un file (doppioni uniti) → il file va in _orfani/;
      - se non porta a nessun brano → va in _orfani/.
    Niente si cancella. Aggiorna registro, abbinamenti e inviati (che il chiamante salva)."""
    fonti = mappa_fonti(brani)
    orfani_dir = cartella / "_orfani"
    esito = {"riagganciati": [], "doppioni": [], "orfani": [], "mb_orfani": 0.0}
    presenti = {f.stem for f in file_audio(cartella)}
    da_sistemare = [f for f in file_audio(cartella) if f.stem not in brani]

    def destinazione(f: Path) -> str | None:
        r = rinominati.get(f.stem)
        return r if r in brani else fonti.get(registro.get(f.stem, {}).get("fonte") or "")

    def bonta(f: Path):
        # Se due file finiscono sullo stesso brano si tiene quello con la fonte
        # più affidabile (link diretto, non una ricerca), poi il più grande.
        diretta = registro.get(f.stem, {}).get("origine") in ("YouTube", "SoundCloud", "file locale")
        return (diretta, f.stat().st_size)

    da_sistemare.sort(key=bonta, reverse=True)
    for f in da_sistemare:
        vecchio = f.stem
        nuovo = destinazione(f)
        if nuovo and nuovo not in presenti:
            presenti.add(nuovo)
            os.replace(f, cartella / f"{nuovo}{f.suffix}")
            voce = registro.pop(vecchio, {})
            voce.pop("tag", None)  # l'id nei metadati è cambiato: si riscrivono
            registro[nuovo] = voce
            for tabella in (abbinamenti, inviati):
                if vecchio in tabella:
                    tabella[nuovo] = tabella.pop(vecchio)
            esito["riagganciati"].append((vecchio, nuovo))
            continue
        orfani_dir.mkdir(exist_ok=True)
        esito["mb_orfani"] += f.stat().st_size / 1048576
        dest = orfani_dir / f.name
        k = 2
        while dest.exists():  # mai sovrascrivere un orfano già messo da parte
            dest = orfani_dir / f"{f.stem}-{k}{f.suffix}"
            k += 1
        os.replace(f, dest)
        registro_orfani = leggi_json(orfani_dir / REGISTRO, {})
        registro_orfani[vecchio] = {**registro.pop(vecchio, {}), "spostato": adesso(), **({"doppione_di": nuovo} if nuovo else {})}
        scrivi_json(orfani_dir / REGISTRO, registro_orfani)
        esito["doppioni" if nuovo else "orfani"].append(vecchio)
    return esito
