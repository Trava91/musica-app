"""Esporta il catalogo musica in app-dati/catalogo.json, per il Jukebox sul telefono.

Legge SOLO da una copia di liste/dati/catalogo.sqlite (mai il file originale: durante
la revisione un'altra sessione può ricostruirlo con os.replace in qualsiasi momento).
Non importa nulla da liste/motore/: questo script vive nel repo pubblico dell'app e
deve restare autonomo, con la sola libreria standard.

Uso (dalla cartella app/):
    python strumenti/esporta.py

CONTRATTO DATI v1 — se cambia un campo qui, aggiorna anche js/dati.js, js/playlist.js
e la sezione "Contratto dati" di README.md.

{
  "schema": 1,
  "costruito_il": "AAAA-MM-GG",          # data di build del catalogo sqlite (non di questo export)
  "macro": [ "Tech house", ... ],         # i 17 macro-generi, nell'ordine di generi.MACRO
  "raccolte": [ ["Mi piace", "like", "yt"], ... ],  # [nome, tipo, piattaforma]
  "brani": [
    {
      "id": "<versione_id>", "o": "<opera_id>",
      "a": "artista", "t": "titolo", "v": "versione" (assente se vuota),
      "k": "originale|remix|edit|extended|live|set",
      "f": "feat" (assente se vuoto),
      "g": <indice in "macro"> (assente se senza macro-genere),
      "gf": "generi fini, separati da virgola" (assente se vuoti),
      "y": <anno> (assente se ignoto), "d": <durata_s> (assente se ignota),
      "b": <bpm>, "c": "<camelot>", "e": <energia> (assenti se mancano),
      "x": 1 (presente SOLO se la versione è di esplorazione; assente = scelta da Nicolò),
      "s": [ ["sp","<id traccia>"], ["yt","<id video>"], ["sc","<url>"], ["lo","<percorso>"] ],
      "r": [ <indici in "raccolte"> ],
      "q": "AAAA-MM-GG" (data di aggiunta più recente tra le appartenenze; assente se ignota)
    }, ...
  ]
}
"""
from __future__ import annotations

import json
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    _s.reconfigure(encoding="utf-8", errors="replace")

APP = Path(__file__).resolve().parent.parent
CATALOGO_SQLITE = APP.parent / "liste" / "dati" / "catalogo.sqlite"
DEST = APP.parent / "app-dati" / "catalogo.json"

# Copia esatta di generi.MACRO in liste/motore/generi.py: questo script non importa
# da lì (vedi docstring), quindi la lista va tenuta allineata a mano se cambia.
MACRO = [
    "Tech house", "Deep e melodic", "Disco e funky house", "Chicago e acid", "Techno",
    "Minimal", "Disco, funk e soul", "Elettronica varia", "Hip hop USA", "Rap italiano",
    "Reggae, dub e ska", "Rock, garage e psichedelia", "Swing e rock'n'roll", "Jazz e blues",
    "Brasile, latin e Africa", "Cantautori e pop italiano", "Altro",
]
INDICE_MACRO = {nome: i for i, nome in enumerate(MACRO)}

ORDINE_PIATTAFORME = ("spotify", "youtube", "soundcloud", "locale")
CODICE = {"spotify": "sp", "youtube": "yt", "soundcloud": "sc", "locale": "lo"}


def _rif(fonte: sqlite3.Row) -> str:
    """L'identificativo compatto di una fonte: id traccia/video, url, o percorso locale."""
    p = fonte["piattaforma"]
    if p == "spotify":
        return fonte["id"].removeprefix("spotify:track:")
    if p == "youtube":
        return fonte["id"].removeprefix("youtube:")
    if p == "soundcloud":
        return fonte["url"] or fonte["id"].removeprefix("soundcloud:")
    if p == "locale":
        return fonte["id"].removeprefix("locale:")
    raise ValueError(f"piattaforma sconosciuta: {p}")


def esporta() -> dict:
    if not CATALOGO_SQLITE.exists():
        sys.exit(f"Non trovo {CATALOGO_SQLITE}. Prima costruisci il catalogo con "
                  "python liste/motore/aggiorna.py (vedi liste/README.md).")

    with tempfile.TemporaryDirectory() as tmp:
        copia = Path(tmp) / "catalogo.sqlite"
        shutil.copy2(CATALOGO_SQLITE, copia)  # mai il file originale: può essere ricostruito altrove
        con = sqlite3.connect(copia)
        con.row_factory = sqlite3.Row

        macro_db = {r["macro_genere"] for r in con.execute(
            "SELECT DISTINCT macro_genere FROM versioni WHERE macro_genere IS NOT NULL")}
        ignoti = macro_db - set(MACRO)
        if ignoti:
            sys.exit(f"Macro-generi nel database non presenti nella copia locale di MACRO: {ignoti}. "
                      "Allinea la costante MACRO in questo script a liste/motore/generi.py.")

        fonti_per_versione: dict[str, list[sqlite3.Row]] = {}
        for f in con.execute("SELECT id, versione_id, piattaforma, url FROM fonti "
                              "WHERE versione_id IS NOT NULL"):
            fonti_per_versione.setdefault(f["versione_id"], []).append(f)

        # Indice delle raccolte: (nome, tipo, codice piattaforma) -> indice, in ordine
        # stabile. Il codice è lo stesso di CODICE (sp/yt/sc/lo), non il nome intero:
        # così la terza colonna di "raccolte" è coerente coi codici usati in "s".
        raccolta_di_fonte: dict[str, str] = {}  # fonte_id -> codice piattaforma
        for f in con.execute("SELECT id, piattaforma FROM fonti"):
            raccolta_di_fonte[f["id"]] = CODICE[f["piattaforma"]]
        terne: set[tuple[str, str, str]] = set()
        appartenenze_per_fonte: dict[str, list[sqlite3.Row]] = {}
        for a in con.execute("SELECT fonte_id, raccolta, tipo, aggiunto_il FROM appartenenze"):
            appartenenze_per_fonte.setdefault(a["fonte_id"], []).append(a)
            codice_piattaforma = raccolta_di_fonte.get(a["fonte_id"])
            if codice_piattaforma:
                terne.add((a["raccolta"], a["tipo"], codice_piattaforma))
        raccolte_ordinate = sorted(terne)
        indice_raccolta = {t: i for i, t in enumerate(raccolte_ordinate)}

        brani = []
        righe_versioni = con.execute(
            "SELECT id, opera_id, artista, titolo, versione, tipo, feat, anno, durata_s, "
            "macro_genere, generi, bpm, camelot, energia, esplorazione FROM versioni "
            "ORDER BY artista COLLATE NOCASE, titolo COLLATE NOCASE").fetchall()
        for v in righe_versioni:
            fnt = fonti_per_versione.get(v["id"], [])
            if not fnt:
                continue  # non dovrebbe succedere: una versione nasce da almeno una fonte
            sorgenti = sorted(fnt, key=lambda f: ORDINE_PIATTAFORME.index(f["piattaforma"]))

            indici_raccolte: set[int] = set()
            date_aggiunta: list[str] = []
            for f in fnt:
                codice_piattaforma = CODICE[f["piattaforma"]]
                for a in appartenenze_per_fonte.get(f["id"], []):
                    idx = indice_raccolta.get((a["raccolta"], a["tipo"], codice_piattaforma))
                    if idx is not None:
                        indici_raccolte.add(idx)
                    if a["aggiunto_il"]:
                        date_aggiunta.append(a["aggiunto_il"])

            b = {
                "id": v["id"], "o": v["opera_id"], "a": v["artista"], "t": v["titolo"],
                "k": v["tipo"] or "originale",
                "s": [[CODICE[f["piattaforma"]], _rif(f)] for f in sorgenti],
                "r": sorted(indici_raccolte),
            }
            if v["versione"]:
                b["v"] = v["versione"]
            if v["feat"]:
                b["f"] = v["feat"]
            if v["macro_genere"]:
                b["g"] = INDICE_MACRO[v["macro_genere"]]
            if v["generi"]:
                b["gf"] = v["generi"]
            if v["anno"] is not None:
                b["y"] = v["anno"]
            if v["durata_s"] is not None:
                b["d"] = v["durata_s"]
            if v["bpm"] is not None:
                b["b"] = round(v["bpm"], 1)
            if v["camelot"]:
                b["c"] = v["camelot"]
            if v["energia"] is not None:
                b["e"] = round(v["energia"], 3)
            if v["esplorazione"]:
                b["x"] = 1
            if date_aggiunta:
                b["q"] = max(date_aggiunta)
            brani.append(b)

        costruito_il = con.execute(
            "SELECT valore FROM meta WHERE chiave='costruito_il'").fetchone()
        con.close()

    return {
        "schema": 1,
        "costruito_il": costruito_il[0] if costruito_il else None,
        "macro": MACRO,
        "raccolte": [list(t) for t in raccolte_ordinate],
        "brani": brani,
    }


def _campione(brani: list[dict], **filtro) -> dict | None:
    for b in brani:
        if all(b.get(k) == v for k, v in filtro.items()):
            return b
    return None


def verifica(dati: dict):
    con = sqlite3.connect(CATALOGO_SQLITE)
    attese = con.execute("SELECT count(*) FROM versioni").fetchone()[0]
    con.close()
    ottenute = len(dati["brani"])
    if ottenute != attese:
        sys.exit(f"Conteggio non torna: esportate {ottenute}, nel database {attese}.")

    controlli = {
        "tech house con BPM/Camelot": _campione(dati["brani"], g=INDICE_MACRO["Tech house"]) is not None,
        "almeno un brano solo YouTube": any(len(b["s"]) == 1 and b["s"][0][0] == "yt" for b in dati["brani"]),
        "almeno un set": any(b["k"] == "set" for b in dati["brani"]),
        "almeno un file locale": any(any(c == "lo" for c, _ in b["s"]) for b in dati["brani"]),
        "almeno un brano su più piattaforme": any(len(b["s"]) > 1 for b in dati["brani"]),
    }
    for nome, ok in controlli.items():
        print(f"  {'✓' if ok else '✗ ATTENZIONE'} {nome}")
    if not all(controlli.values()):
        print("  Uno o più controlli campione sono falliti: dai un'occhiata al database.")


def main():
    dati = esporta()
    DEST.parent.mkdir(parents=True, exist_ok=True)
    testo = json.dumps(dati, ensure_ascii=False, separators=(",", ":"))
    DEST.write_text(testo, encoding="utf-8", newline="\n")

    dimensione_kb = DEST.stat().st_size // 1024
    con_bpm = sum(1 for b in dati["brani"] if "b" in b)
    scelti = sum(1 for b in dati["brani"] if "x" not in b)
    print(f"Esportato: {len(dati['brani'])} brani, {len(dati['raccolte'])} raccolte, "
          f"{dimensione_kb} KB → {DEST.relative_to(APP.parent)}")
    print(f"  scelti: {scelti} | esplorazione: {len(dati['brani']) - scelti} | con BPM: {con_bpm}")
    if dimensione_kb > 5000:
        print(f"  ATTENZIONE: sopra i 5 MB previsti dal piano ({dimensione_kb} KB).")
    verifica(dati)


if __name__ == "__main__":
    main()
