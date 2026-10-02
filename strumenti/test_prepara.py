"""Test dell'abbinamento di prepara.py (nessuna rete). Lancio: python strumenti/test_prepara.py

I candidati sono risultati veri di YouTube Music (02/10/2026), ridotti ai campi usati.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepara import scegli, titolo_base, query  # noqa: E402

esiti = []


def eq(nome, avuto, atteso):
    esiti.append(avuto == atteso)
    print(("✓ " if avuto == atteso else "✗ ") + nome + ("" if avuto == atteso else f"\n   atteso: {atteso}\n   avuto:  {avuto}"))


def scelto(brano, candidati):
    s = scegli(brano, candidati)
    return s[0]["videoId"] if s else None


cymande = [
    {"videoId": "dbWWkvEp2Pw", "title": "The Message", "artists": ["Cymande"], "duration_seconds": 258},
    {"videoId": "RLefc10kkMc", "title": "Dove", "artists": ["Cymande"], "duration_seconds": 655},
]
eq("Cymande: il titolo giusto", scelto({"a": "Cymande", "t": "The Message", "d": 257}, cymande), "dbWWkvEp2Pw")

kings = [
    {"videoId": "MPjqDoqiEx8", "title": "Finally (feat. Julie McKnight)", "artists": ["Kings of Tomorrow"], "duration_seconds": 316},
    {"videoId": "-7pwRI2LIu4", "title": "Finally [Extended Mix] (feat. Julie McKnight)", "artists": ["Kings of Tomorrow"], "duration_seconds": 357},
    {"videoId": "LkY5Of5e3V0", "title": "Finally (Radio Edit) (feat. Julie McKnight)", "artists": ["Kings Of Tomorrow"], "duration_seconds": 189},
]
eq("Kings of Tomorrow: la durata sceglie la radio edit", scelto({"a": "Kings Of Tomorrow", "t": "Finally", "d": 192}, kings), "LkY5Of5e3V0")
eq("Kings of Tomorrow: senza versione giusta non abbina", scelto({"a": "Kings Of Tomorrow", "t": "Finally", "d": 250}, kings), None)

turner = [
    {"videoId": "npTjmbpTn64", "title": "Switching in the Kitchen", "artists": ["Joe Turner"], "duration_seconds": 221},
    {"videoId": "tc2sbW0GYms", "title": "Switching in the Kitchen", "artists": ["Big Joe Turner"], "duration_seconds": 219},
]
eq("Big Joe Turner: accetta anche 'Joe Turner', vince il nome completo", scelto({"a": "Big Joe Turner", "t": "Switching in the Kitchen", "d": 220}, turner), "tc2sbW0GYms")
eq("artista diverso: nessun abbinamento", scelto({"a": "Sister Sledge", "t": "Switching in the Kitchen", "d": 220}, turner), None)

remix = [
    {"videoId": "orig", "title": "Eat Sleep Rave Repeat", "artists": ["Fatboy Slim", "Riva Starr"], "duration_seconds": 170},
    {"videoId": "calvin", "title": "Eat Sleep Rave Repeat (Calvin Harris Remix)", "artists": ["Fatboy Slim", "Riva Starr", "Beardyman"], "duration_seconds": 166},
]
eq("versione: il remix del catalogo vince sull'originale", scelto({"a": "Fatboy Slim", "t": "Eat Sleep Rave Repeat", "v": "Calvin Harris Remix Edit", "d": 168}, remix), "calvin")
eq("senza versione: l'originale vince sul remix", scelto({"a": "Fatboy Slim", "t": "Eat Sleep Rave Repeat", "d": 168}, remix), "orig")

eq("titolo_base: toglie le code da remaster", titolo_base("Good Times - 2013 Up All Night Album Remaster").strip(), "Good Times")
eq("query: artista, titolo e versione", query({"a": "Fatboy Slim", "t": "Eat Sleep Rave Repeat", "v": "Calvin Harris Remix Edit"}),
   "Fatboy Slim Eat Sleep Rave Repeat Calvin Harris Remix Edit")

print(f"\n{sum(esiti)} PASS, {len(esiti) - sum(esiti)} FAIL")
sys.exit(0 if all(esiti) else 1)
