"""Test di calcola_rinominati (esporta.py). Lancio: python strumenti/test_esporta.py"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from esporta import calcola_rinominati  # noqa: E402

esiti = []


def eq(nome, avuto, atteso):
    esiti.append(avuto == atteso)
    print(("✓ " if avuto == atteso else "✗ ") + nome + ("" if avuto == atteso else f"\n   atteso: {atteso}\n   avuto:  {avuto}"))


def b(i, *fonti):
    return {"id": i, "s": [list(f) for f in fonti]}


prima = [b("a", ("sp", "1")), b("x", ("yt", "2")), b("y", ("yt", "3")), b("d", ("sc", "4")), b("z", ("lo", "5"))]
dopo = [b("a2", ("sp", "1"), ("yt", "9")),       # a ha guadagnato una fonte → id nuovo
        b("xy", ("yt", "2"), ("yt", "3")),       # x e y uniti
        b("z", ("lo", "5"))]                      # z invariato; d sparito
m = calcola_rinominati(prima, dopo)
eq("fonte aggiunta: id vecchio → nuovo", m.get("a"), "a2")
eq("doppioni uniti: entrambi verso lo stesso", (m.get("x"), m.get("y")), ("xy", "xy"))
eq("brano sparito: nessuna voce", "d" in m, False)
eq("id invariato: nessuna voce", "z" in m, False)

diviso = calcola_rinominati([b("p", ("sp", "1"), ("yt", "2"), ("yt", "3"))], [b("q", ("sp", "1")), b("r", ("yt", "2"), ("yt", "3"))])
eq("brano diviso: vince quello con più fonti in comune", diviso, {"p": "r"})

catena = calcola_rinominati([b("a2", ("sp", "1"), ("yt", "9"))], [b("a3", ("sp", "1"))], {"a": "a2"})
eq("cumulativa: a→a2 di ieri diventa a→a3", catena, {"a2": "a3", "a": "a3"})
eq("cumulativa: la voce vecchia resta se l'arrivo esiste ancora", calcola_rinominati([], [b("a2", ("sp", "1"))], {"a": "a2"}), {"a": "a2"})
eq("cumulativa: se l'id vecchio torna a esistere, niente voce", calcola_rinominati([], [b("a", ("sp", "1"))], {"a": "a2"}), {})

print(f"\n{sum(esiti)} PASS, {len(esiti) - sum(esiti)} FAIL")
sys.exit(0 if all(esiti) else 1)
