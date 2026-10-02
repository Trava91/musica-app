# Contesto — Jukebox (app musica per il telefono)

## Cos'è

`05-hobby/musica/app/` è una **PWA** che cerca e filtra il catalogo musicale
unificato di Nicolò (fase 1 della rotta musica, `liste/dati/catalogo.sqlite`),
crea playlist a più filtri e le riproduce **senza mandarlo alle altre app** dove
si può evitare. Nasce dal piano
[`plans/2026-09-28-app-musica-telefono.md`](../../../plans/2026-09-28-app-musica-telefono.md),
che copre 7 tappe (M1-M7); questa sessione ha implementato **solo M1**.

È un repo Git **separato e pubblico** (`Trava91/musica-app`, da creare): il
sorgente non contiene segreti né dati (il PAT lo inserisce l'utente a runtime).
I dati veri (`catalogo.json`, `playlist.json`) stanno in `app-dati/`, cartella
**sorella**, repo **privato** (`Trava91/musica-dati`, da creare) — scelta
esplicita di Nicolò il 28/09/2026 ("per adesso privata con token").

## Il problema che risolve: riprodurre senza uscire dal Jukebox

Nicolò non vuole essere rimandato a YouTube/Spotify/SoundCloud, e vuole la
musica anche a schermo spento. Ma YouTube **vieta** la riproduzione in
background dal player incorporato (Developer Policies III.I.9) — è la stessa
regola per cui Google ha chiuso i bot Discord Rythm e Groovy nel 2021 — e
Spotify richiede **Premium** per essere comandato da un'altra app.

Soluzione a tre motori (`js/motori.js`), scelti in ordine di priorità per ogni
brano:
1. **file** sul telefono → suona nel Jukebox stesso, a schermo spento (M2, non
   ancora implementata: oggi il foglio brano lo segnala e basta).
2. **Spotify Premium** → comandato dal Jukebox, a schermo spento (M5, al
   prossimo periodo Premium di Nicolò: l'app sviluppatore Spotify in modalità
   dev funziona solo mentre il proprietario è abbonato).
3. **NewPipe** → scelta di Nicolò (28/09/2026), sapendo che è fuori dal Play
   Store e contro i termini di YouTube. Apre YouTube/SoundCloud senza pubblicità
   e a schermo spento tramite un link `intent://…;package=org.schabi.newpipe`.
4. **app Spotify gratuita** → ripiego universale, apre il brano scelto (Pick &
   Play da settembre 2025) con pubblicità.
5. **web** → ultimo ripiego, apre il link nel browser.

**Una playlist suona con UN SOLO motore alla volta** (`motori.pianoRiproduzione`):
a schermo spento il Jukebox non può aprire un'altra app quando il motore
cambierebbe, quindi mischiarli fermerebbe la coda al primo passaggio.

## Regola d'oro: il contratto dati

`strumenti/esporta.py` (Python, autonomo, non importa da `liste/motore/`) legge
**una copia** di `liste/dati/catalogo.sqlite` e scrive `app-dati/catalogo.json`
nel contratto v1 documentato in testa allo script. `js/dati.js` lo legge con
quella stessa forma (campi abbreviati: `a`/`t`/`v`/`k`/`g`/`b`/`c`/`e`/`s`/`r`/`x`/`q`).

> **Se cambia un campo del contratto, va cambiato su ENTRAMBI i lati**:
> `esporta.py` *e* `js/dati.js` (più `js/cerca.js`, che si aspetta quei nomi).

Per `playlist.json` il contratto è simmetrico ma **scritto dall'app stessa**
(non da `esporta.py`): la forma è documentata in testa a `js/regole.js`.

## Perché non tocca `liste/` durante l'implementazione

La revisione del catalogo (fase 1) può proseguire in un'altra sessione mentre si
lavora qui: `esporta.py` fa sempre `shutil.copy2` prima di aprire il database,
mai l'originale, perché quella sessione può ricostruirlo con `os.replace` in
qualsiasi momento. Nessun file sotto `liste/` viene toccato da questo progetto
prima dello Step 9.1 del piano (aggancio a `aggiorna.py`), e solo dopo che la
revisione risulta chiusa.

## Stato

- **2026-09-28 (questa sessione):** implementata la **M1** — catalogo esportato
  (`esporta.py`), scheletro PWA, ricerca e filtri (`cerca.js`), playlist
  intelligenti/manuali a più filtri combinati (`regole.js`), nucleo di teoria
  armonica per l'ordine "percorso armonico" (`dj.js`, solo Camelot/BPM: i
  suggerimenti DJ veri arrivano con M4), scelta del motore di riproduzione per
  brano e per playlist (`motori.js`), link verso NewPipe/Spotify (`link.js`),
  coda di riproduzione (`coda.js`), lettura/scrittura playlist con lock
  ottimistico (`playlist.js`), interfaccia completa a 5 schede (`ui.js`/`main.js`).
  84 test Node passano (`test/logica.test.mjs`, dati tutti inventati).
- **Estetica (01–02/10/2026):** jukebox anni '50 in blu notte con neon, dal
  disegno su tela Claude Design "Jukebox anni '50"; caratteri in `fonts/`.
  Generi raggruppati solo nella vista (`js/generi.js`): house/techno → "Tech
  house", disco house + disco/funk/soul → "Disco".
- **Verificato:** anteprima sul PC (`?dati=../app-dati/catalogo.json`) provata
  da Nicolò e con un browser automatico (Playwright + Edge, viewport telefono)
  su tutte le schermate, senza errori in console.
- **Da fare (azione di Nicolò):** creare il PAT, installare la PWA sul
  telefono, installare NewPipe (APK F-Droid già scaricato, serve il telefono in
  USB col debug attivo). Poi le tappe M2-M7 del piano, ciascuna con i suoi gate
  (file locali, OAuth Google per M3, esempi veri di Shazam per M4, Spotify
  Premium per M5).

## Limiti noti (per onestà)

- Vedi la sezione "Limiti noti di questa versione (M1)" in `README.md`.
- Il modulo `dj.js` in questa fase copre solo Camelot/BPM/percorso armonico: le
  funzioni `suggerisci()` e `scaletta()` per l'assistente DJ vero e proprio
  arrivano con M4 (richiede prima gli esempi reali di Shazam da Nicolò).
