"""Test delle parti pure di archivio.py (niente rete, niente ffmpeg).
Lancio: python strumenti/test_archivio.py"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archivio as A  # noqa: E402

esiti = []


def eq(nome, avuto, atteso):
    esiti.append(avuto == atteso)
    print(("✓ " if avuto == atteso else "✗ ") + nome + ("" if avuto == atteso else f"\n   atteso: {atteso!r}\n   avuto:  {avuto!r}"))


MACRO = ["Tech house", "Deep e melodic", "Disco e funky house"]
b = {"id": "c9412dc07ba6", "a": "Fatboy Slim", "t": "Eat Sleep Rave Repeat", "v": "Calvin Harris Remix Edit",
     "f": "Riva Starr", "g": 0, "y": 2013, "b": 128.04, "c": "8B", "s": [["sp", "SP1"], ["yt", "YT1"]]}

# --- metadati
t = A.tag_brano(b, MACRO)
eq("tag: titolo con la versione", t["titolo"], "Eat Sleep Rave Repeat (Calvin Harris Remix Edit)")
eq("tag: artista col feat", t["artista"], "Fatboy Slim feat. Riva Starr")
eq("tag: genere e anno", (t["genere"], t["anno"]), ("Tech house", "2013"))
eq("tag: commento con BPM, tonalità e id", t["commento"], "128 BPM, 8B, id c9412dc07ba6")
eq("tag: commento ASCII e dentro i 30 caratteri dell'ID3v1", (t["commento"].isascii(), len(t["commento"]) <= 30), (True, True))
eq("tag: senza BPM né tonalità resta l'id", A.tag_brano({"id": "x1", "s": []}, MACRO)["commento"], "id x1")
eq("tag: titolo mancante → id", A.tag_brano({"id": "x1", "s": []}, MACRO)["titolo"], "x1")

mp3 = A.argomenti_ffmpeg(t, ".mp3")
eq("mp3: BPM e tonalità nei frame standard, id in TXXX", all(x in mp3 for x in ["TBPM=128", "TKEY=8B", "JUKEBOX_ID=c9412dc07ba6"]), True)
eq("mp3: ID3v2.3 + ID3v1", mp3[-4:], ["-id3v2_version", "3", "-write_id3v1", "1"])
m4a = A.argomenti_ffmpeg(t, ".M4A")
eq("m4a: niente campi personalizzati (VLC smetterebbe di leggere)", any(x.startswith(("BPM", "TBPM", "JUKEBOX")) for x in m4a), False)
eq("m4a: anno in date", "date=2013" in m4a, True)
webm = A.argomenti_ffmpeg(t, ".webm")
eq("webm: anno in DATE_RELEASED, BPM e INITIAL_KEY", all(x in webm for x in ["DATE_RELEASED=2013", "BPM=128", "INITIAL_KEY=8B"]), True)
eq("formato senza metadati (wav) → None", A.argomenti_ffmpeg(t, ".wav"), None)
eq("campi vuoti non scritti", any(x.endswith("=") for x in A.argomenti_ffmpeg(A.tag_brano({"id": "x1", "s": []}, MACRO), ".mp3")), False)
eq("impronta: cambia se cambia il titolo", A.impronta(t, ".mp3") != A.impronta({**t, "titolo": "Altro"}, ".mp3"), True)
eq("impronta: cambia col formato", A.impronta(t, ".mp3") != A.impronta(t, ".webm"), True)

# --- nomi leggibili
eq("nome: artista - titolo (versione)", A.nome_leggibile(b), "Fatboy Slim - Eat Sleep Rave Repeat (Calvin Harris Remix Edit)")
eq("nome: caratteri vietati da Windows", A.nome_leggibile({"id": "x", "a": 'AC/DC', "t": 'What? "Yes": <1|2>*'}), "AC-DC - What 'Yes' - 1-2")
eq("nome: niente punto o spazio finale", A.nome_leggibile({"id": "x", "a": "Mr.", "t": "Ok..."}), "Mr. - Ok")
eq("nome: nome riservato di Windows", A.nome_leggibile({"id": "x", "a": "", "t": "CON"}), "_CON")
lungo = A.nome_leggibile({"id": "x", "a": "A" * 100, "t": "B" * 100})
eq("nome: troncato entro il limite", (len(lungo) <= A.LUNGHEZZA_NOME, lungo.endswith("…")), (True, True))
eq("nome: senza artista né titolo → id", A.nome_leggibile({"id": "abc", "a": "", "t": ""}), "abc")

p1, p2, p3 = Path("aaaaaaaaaaa1.webm"), Path("aaaaaaaaaaa2.m4a"), Path("aaaaaaaaaaa3.webm")
nomi = A.nomi_collegamenti([(p1, {"id": "aaaaaaaaaaa1", "a": "Sister Sledge", "t": "Lost in Music"}),
                            (p3, {"id": "aaaaaaaaaaa3", "a": "SISTER SLEDGE", "t": "lost in music"}),
                            (p2, {"id": "aaaaaaaaaaa2", "a": "Sister Sledge", "t": "Lost in Music"})])
eq("doppioni (anche solo per maiuscole): tutti prendono l'id", nomi[p1], "Sister Sledge - Lost in Music [aaaaaaaaaaa1].webm")
eq("doppioni: anche l'altro", nomi[p3], "SISTER SLEDGE - lost in music [aaaaaaaaaaa3].webm")
eq("stesso nome ma estensione diversa: nessun conflitto", nomi[p2], "Sister Sledge - Lost in Music.m4a")

# --- fonti e riallineamento
eq("fonte: da YouTube → il video", A.fonte_ancora(b, "YouTube"), "yt:YT1")
eq("fonte: da YouTube Music → la traccia Spotify", A.fonte_ancora(b, "YouTube Music"), "sp:SP1")
eq("fonte: SoundCloud senza link SC → la prima disponibile", A.fonte_ancora(b, "SoundCloud"), "sp:SP1")
eq("mappa fonti", A.mappa_fonti({"n1": {"s": [["yt", "YT1"], ["sp", "SP1"]]}}), {"yt:YT1": "n1", "sp:SP1": "n1"})
eq("durata", A.durata_fmt(257), "4:17")

print(f"\n{sum(esiti)} PASS, {len(esiti) - sum(esiti)} FAIL")
sys.exit(0 if all(esiti) else 1)
