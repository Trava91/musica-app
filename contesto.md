# Contesto — Jukebox (app musica per il telefono)

## Cos'è

`05-hobby/musica/app/` è una **PWA** che cerca e filtra il catalogo musicale
unificato di Nicolò (fase 1 della rotta musica, `liste/dati/catalogo.sqlite`),
crea playlist a più filtri e le riproduce **senza mandarlo alle altre app** dove
si può evitare. Nasce dal piano
[`plans/2026-09-28-app-musica-telefono.md`](../../../plans/2026-09-28-app-musica-telefono.md),
che copre 7 tappe (M1-M7): **M1 e M2 sono fatte** (le note in fondo al piano
raccontano deviazioni e scelte, data per data).

È un repo Git **separato e pubblico** (`Trava91/musica-app`, online su
https://trava91.github.io/musica-app/): il sorgente non contiene segreti né dati
(il PAT lo inserisce l'utente a runtime). I dati veri (`catalogo.json`,
`playlist.json`) stanno in `app-dati/`, cartella **sorella**, repo **privato**
(`Trava91/musica-dati`) — scelta esplicita di Nicolò il 28/09/2026 ("per adesso
privata con token").

## Il problema che risolve: riprodurre senza uscire dal Jukebox

Nicolò non vuole essere rimandato a YouTube/Spotify/SoundCloud, e vuole la
musica anche a schermo spento. Ma YouTube **vieta** la riproduzione in
background dal player incorporato (Developer Policies III.I.9) e Spotify
richiede **Premium** per essere comandato da un'altra app. In più, con un'app
esterna la coda non può andare avanti da sola: Android non avvisa il Jukebox
quando un brano finisce.

Motori di riproduzione (`js/nucleo/motori.js`), in ordine di priorità per ogni brano:
1. **file** sul telefono → suona nel Jukebox stesso (`lettore.js`, Media
   Session): avanza da solo, pausa vera, schermo spento. **È la strada scelta da
   Nicolò il 02/10/2026** (strada A): i file li prepara il PC (vedi sotto).
2. **Spotify Premium** → comandato dal Jukebox (M5, al prossimo periodo Premium
   di Nicolò: l'app sviluppatore Spotify funziona solo mentre è abbonato).
3. **NewPipe** → apre YouTube/SoundCloud senza pubblicità e a schermo spento
   (`intent://…;package=org.schabi.newpipe`), un brano alla volta.
4. **app Spotify gratuita** → apre il brano scelto, con pubblicità.
5. **web** → ultimo ripiego.

**Una playlist suona con UN SOLO motore alla volta** (`motori.pianoRiproduzione`).

## Archivio audio sul PC e file sul telefono

- `strumenti/prepara.py` procura l'audio in `05-hobby/musica/audio/`
  (fuori dai repo): da YouTube l'Opus, da SoundCloud AAC/mp3, i brani
  solo-Spotify cercati su YouTube Music e abbinati per artista, titolo e durata.
  Poi li copia sul telefono (adb, `Download/Jukebox`) e l'app li importa.
- **Archivio** (scelta di Nicolò, 05/10/2026): tutti i brani "scelti"
  (8.392, circa 40 GB) a giri da 30 minuti lanciati a mano. **Si gestisce con la
  skill `/archivio-musica`** ("scarica un'altra tranche"), che rispetta il
  limite anti-bot di YouTube (massimo 2-3 giri di fila). Al 06/10/2026:
  1.333 brani, 6,8 GB.
- `strumenti/archivio.py`: metadati dentro i file, `audio/indice.html`,
  `audio-per-nome/` (hard link), registro delle fonti, riallineamento e orfani.

## Regola d'oro: il contratto dati

`strumenti/esporta.py` (Python, autonomo, non importa da `liste/motore/`) legge
**una copia** di `liste/dati/catalogo.sqlite` e scrive `app-dati/catalogo.json`
nel contratto v1 documentato in testa allo script. `js/dati/catalogo.js` lo legge con
quella stessa forma (campi abbreviati: `a`/`t`/`v`/`k`/`g`/`b`/`c`/`e`/`s`/`r`/`x`/`q`,
più la tabella `rinominati`).

> **Se cambia un campo del contratto, va cambiato su ENTRAMBI i lati**:
> `esporta.py` *e* `js/dati/catalogo.js` (più `js/nucleo/cerca.js`, che si aspetta quei nomi).

Per `playlist.json` il contratto è simmetrico ma **scritto dall'app stessa**
(non da `esporta.py`): la forma è documentata in testa a `js/nucleo/regole.js`.

**Gli id dei brani possono cambiare** (sono impronte delle fonti: cambiano se
si uniscono doppioni o un brano guadagna/perde una fonte; non cambiano
correggendo un titolo). Per questo `esporta.py` scrive la tabella cumulativa
`rinominati`, il Jukebox la usa per spostare i file e correggere le playlist, e
`prepara.py --riallinea` riaggancia l'archivio. A revisione del catalogo finita
resta da rendere gli id stabili alla radice (`liste/motore/catalogo.py`).

## Perché non tocca `liste/`

La revisione del catalogo (fase 1) prosegue in un'altra sessione: `esporta.py`
fa sempre `shutil.copy2` prima di aprire il database, mai l'originale. Nessun
file sotto `liste/` viene toccato da questo progetto prima dello Step 9.1 del
piano (aggancio a `aggiorna.py`), e solo a revisione chiusa.

## Stato

- **Restauro in corso (dal 16/11/2026)** (piano
  [`plans/2026-11-14-restauro-jukebox.md`](../../../plans/2026-11-14-restauro-jukebox.md)):
  la prima pubblicazione (R1, versione 16: codice nuovo, aspetto invariato) è in `main` e online
  dal 16/11/2026; il lavoro sullo stile riparte sul branch `restauro-stile` fino a R2. La cartella
  è su quel branch, quindi `prepara.py` e `valuta.mjs` girano da lì; il controllo che
  tutto torni è `python strumenti/prepara.py --prova` (stesse playlist di prima).
  **Fase 8 (17/11/2026):** i pezzi dello stile hi-fi in `css/base.css` (gettoni),
  `css/componenti.css` e `js/ui/hifi/` (tutto col prefisso `hf-`), visibili in
  `anteprima/componenti.html`. Il volume della manopola passa da `sessione.impostaVolume()` e si
  ricorda in `jukebox.volume`.
  **Fase 9 (17–18/11/2026):** tutte le schermate sono nello stile hi-fi (versione 17, solo sul
  branch): disposizione in `css/schermate.css`; sotto i 700 px moduli impilati e barra delle
  sezioni in basso (con il mini lettore), da 700 px due colonne con Suona sempre a sinistra, da
  1.100 px il rack a tre zone. `styles.css` e i caratteri anni '50 sono stati tolti; nuova icona.
  Provata via cavo sul telefono il 18/11 (NewPipe però non si apre: punto aperto nel piano).
- **M1 (28/09/2026):** ricerca e filtri, playlist coi filtri e a mano, motori,
  link verso NewPipe/Spotify, coda, 5 schede.
- **Estetica (01–02/10/2026):** jukebox anni '50 in blu notte con neon, dal
  disegno su tela Claude Design. "Va bene per iniziare, la miglioriamo più avanti":
  sostituita dallo stile hi-fi anni '90/2000 col restauro (Fase 9, online con R2). Generi
  raggruppati solo nella vista (`js/nucleo/generi.js`): house/techno → "Tech house", disco house +
  disco/funk/soul → "Disco".
- **Online e installata (02/10/2026)** sul telefono di Nicolò (Oppo, Android
  11) col token; NewPipe 0.29.1 installato via adb.
- **M2 (02–06/10/2026):** file sul telefono suonati dal Jukebox; tasto grande
  sul brano che si vede; dal 22/10/2026 ⏮ ⏭ cambiano subito brano (coi file
  lo suona il Jukebox, con le app esterne lo apre lì; dal 16/11/2026 lo decide
  `js/nucleo/sessione.js`, le viste in `js/ui/` disegnano soltanto); ▶ su
  una riga suona la lista da lì; brano in corso evidenziato ovunque; scheda
  Suona sempre fedele a ciò che si sente, "Mostra altri" in "A seguire". In uso
  sul telefono: playlist "Hip Rap USA ITA (youtube)", 234 brani su 238.
- **Solo Jukebox (03/11/2026):** interruttore nelle Impostazioni (spento di
  default): acceso, il Jukebox non apre mai app esterne, i brani senza file
  appaiono spenti e un ▶ su uno di loro parte dal prossimo della lista che c'è.
- **Test:** 437 Node (`test/*.test.mjs`, dati inventati) + 50 Python
  (`strumenti/test_*.py`); `npm run verifica` lancia lint, tipi e tutti i test;
  `npm run prova` fa 11 giri nel browser sull'app vera, errori compresi, giradischi e disposizione a
  320/360/768/1.280 px (dal 16/11/2026, restauro);
  `npm run prova:componenti` prova nel browser la pagina dei componenti hi-fi (dal 17/11/2026).
- **Errori e velocità (restauro, fasi 6-7, 16/11/2026):** la Diagnostica (Impostazioni) elenca gli
  ultimi 20 errori e le misure di velocità (avvio, indice, ricerca…), con il tasto Copia; l'avvio ha
  tre stati (caricamento, errore con Riprova, pronto); un file audio rotto avvisa e passa al
  successivo (3 di fila e si ferma); la pagina ha lo scudo CSP; le playlist e i conteggi si
  calcolano una volta sola (`stato.calcola`, `stato.derivato`).
- **Da fare:** finire l'archivio; a revisione del catalogo chiusa →
  `esporta.py`, `--riallinea`, `--metadati`, `--riprova`, id stabili; poi M4
  (assistente DJ + Shazam), M5 (Spotify Premium), M6 (Deezer + lista da
  comprare). Idee non ancora fatte: Jukebox anche sul PC (legge da `audio/`),
  disegni di Impostazioni e scheda brano. M3 probabilmente non serve più.

## Limiti noti (per onestà)

- Vedi la sezione "Limiti noti" in `README.md`.
- `dj.js` copre solo Camelot/BPM/percorso armonico: `suggerisci()` e
  `scaletta()` per l'assistente DJ arrivano con M4 (servono prima esempi veri di
  Shazam da Nicolò).
- YouTube ferma chi scarica troppo (controllo anti-bot) e cambia spesso
  (errore 403 → aggiornare yt-dlp): dettagli nella skill `/archivio-musica`.
