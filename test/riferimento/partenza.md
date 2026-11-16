# Fotografia di partenza del restauro

Presa il 16/11/2026 sul commit `5de9824` (etichetta `pre-restauro-2026-11-14`),
prima di ogni modifica del piano `plans/2026-11-14-restauro-jukebox.md`.

| Controllo | Comando | Risultato |
|---|---|---|
| Test JavaScript | `node test/logica.test.mjs` | 114 verdi, 0 falliti |
| Test Python: esporta | `python strumenti/test_esporta.py` | 8 verdi |
| Test Python: prepara | `python strumenti/test_prepara.py` | 9 verdi |
| Test Python: archivio | `python strumenti/test_archivio.py` | 30 verdi |

Totale Python: 47. Con la console di Windows in cp1252 i test Python si
lanciano con `PYTHONUTF8=1` (la Fase 1 del piano sistema questo punto).

## Confronto dopo ogni spostamento di codice

L'uscita di `node strumenti/valuta.mjs <catalogo.json> <playlist.json>` sui dati
veri sta **fuori da questo repo** (contiene nomi e brani delle playlist, e il
repo è pubblico): `05-hobby/musica/_backup/2026-11-14-pre-restauro/valuta-prima.json`.
Dopo ogni fase che sposta codice l'uscita deve restare identica, a parte campi
nuovi dichiarati nel piano.

Per rifare il confronto si usano le due copie congelate nella stessa cartella,
non `app-dati/` (che `prepara.py` aggiorna con un `git pull`, quindi i dati
potrebbero cambiare nel frattempo):

```bash
node strumenti/valuta.mjs ../_backup/2026-11-14-pre-restauro/catalogo.json ../_backup/2026-11-14-pre-restauro/playlist.json
```
