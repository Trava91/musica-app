# Jukebox — app musica per il telefono e per il PC

PWA (web app installabile) per cercare e filtrare il tuo catalogo musicale, creare playlist a più
filtri e suonarle senza passare dalle altre app. Ha l'aspetto di un impianto hi-fi anni '90/2000:
un giradischi che gira davvero mentre suona, un display a fluorescenza, la manopola del volume.
Su telefono i moduli si impilano; da 700 px di larghezza (tablet, PC) diventano due colonne, da
1.100 px un "rack" a tre zone.

**Cosa sa fare:** ricerca per titolo, artista e genere (con i suggerimenti mentre si scrive), pagina
di ogni artista ed elenco A–Z, filtri e playlist intelligenti o fatte a mano, coda composta a mano
(«Suona dopo», «In fondo alla coda»), file sul telefono suonati dal Jukebox anche a schermo spento,
NewPipe e l'app Spotify gratuita per gli altri brani. Le tappe future (assistente DJ, Spotify
Premium, ricerca ovunque, social radio) sono nel piano
[`plans/2026-09-28-app-musica-telefono.md`](../../../plans/2026-09-28-app-musica-telefono.md); il restauro
del codice e dello stile è in [`plans/2026-11-14-restauro-jukebox.md`](../../../plans/2026-11-14-restauro-jukebox.md).

Stesso schema di [`03-burocrazia/app`](../../../03-burocrazia/app/): file statici su GitHub Pages,
nessun server, **nessun build** (il browser legge i file così come sono). Legge i dati da un repo
**privato** con un token che inserisci a runtime: resta solo su questo telefono.

## Avviarlo sul PC (tre righe)

```bash
cd 05-hobby/musica
python -m http.server 8000 --bind 127.0.0.1
# poi apri http://127.0.0.1:8000/app/?dati=../app-dati/catalogo.json
```

Si serve la cartella `05-hobby/musica/` (così l'app vede anche `app-dati/`). Il parametro `dati` mette
l'app in modalità "anteprima": legge quel file, non chiede il token, e le playlist restano **solo in quel
browser** (non vanno su GitHub). Sul PC i pulsanti di riproduzione aprono YouTube/Spotify/SoundCloud
sul web (NewPipe e l'app Spotify esistono solo sul telefono); i file audio si possono importare anche
da qui, da Altro → Musica sul telefono. Per una vista da telefono: F12 → Ctrl+Shift+M. Per uscire
dall'anteprima: Impostazioni → «Esci dall'anteprima».

Scorciatoie da tastiera (sul PC, mai mentre si scrive in un campo né con una finestra aperta):
`/` porta alla ricerca, `Spazio` pausa e riprendi, `←` `→` brano precedente e successivo.

## Provarlo sul telefono via cavo

Per provare una versione non ancora pubblicata, **senza toccare l'app installata** (file audio, playlist
e token veri restano intatti): la pagina di prova è su `http://localhost:8000`, un'origine diversa da
quella vera, quindi con una memoria separata. Su questo telefono `adb reverse` perde le connessioni
e l'app resta a schermo nero: la versione di prova si serve dal canale DevTools con
[`../prova-telefono/servi_via_cdp.py`](../prova-telefono/servi_via_cdp.py) (la procedura, con `adb forward`,
è in testa allo script). Limite: il service worker non si registra, quindi la ricarica senza rete si prova
sul PC (`npm run prova`). I file audio di prova li carica `../prova-telefono/carica_file.py`.

## Com'è organizzato il codice

Tre strati, con una regola che un test fa rispettare (`test/dipendenze.test.mjs`): **`nucleo/` non importa
mai da `dati/`, `audio/` o `ui/`, e non usa né la pagina né la rete; `ui/` è l'unico strato che tocca la
pagina.**

- **`js/nucleo/` — la logica.** Ricerca, filtri, regole delle playlist, coda, motori di riproduzione,
  artisti, percorso di navigazione: roba pura, che si prova in Node senza browser. Il cuore è la
  **sessione di ascolto** (`sessione.js`: coda + lettore + regole), l'unico punto da cui passa ogni modifica
  alla coda; espone comandi e una fotografia di soli dati (`stato()`), ed emette eventi.
- **`js/dati/` e `js/audio/` — i dati e il suono.** Da dove arrivano catalogo e playlist (GitHub Contents
  API, cache, offline), dove sta l'audio sul telefono (Cache Storage), e il lettore `<audio>` con la
  Media Session (comandi dalla schermata di blocco).
- **`js/ui/` — l'interfaccia.** Una vista per schermata, che disegna dallo stato e passa i tocchi alla sessione
  (qui non si decide cosa suonare); i pezzi hi-fi (giradischi, display, manopola, scala) sono in `ui/hifi/`.
  `main.js` crea e collega tutto e non disegna nulla.

```
app/
├── index.html, manifest.webmanifest, sw.js   pagina unica, manifest PWA, service worker (shell offline)
├── css/          base.css (i "gettoni": colori, misure), componenti.css (i pezzi), schermate.css (disposizione)
├── fonts/        DSEG7, Doto, Barlow Condensed (offline, licenze in LICENZE.md)
├── js/
│   ├── main.js, config.js, memoria.js        avvio · impostazioni, tempi, VERSIONE · scrittura sicura in localStorage
│   ├── nucleo/   testo, casuale, filtri, cerca, regole, valida, dj, motori, link, generi, comandi, coda,
│   │             sessione, stato, playlist-calcolate, artisti, etichette-filtri, percorso, scorciatoie,
│   │             volume, diagnostica, errori
│   ├── dati/     github, catalogo, playlist, file-audio
│   ├── audio/    lettore
│   └── ui/       base, finestre, dialoghi, navigazione, tastiera, aggiornamento, riga-brano, menu-coda,
│                 suggerimenti, vista-* (avvio, cerca, generi, artisti, playlist, suona, impostazioni, diagnostica),
│                 foglio-* (brano, filtri, playlist), costruttore-playlist, azioni-playlist, mini-lettore, hifi/
├── strumenti/    esporta.py, prepara.py, archivio.py, valuta.mjs (+ i test Python): i pezzi che girano sul PC
├── test/         un file di test per modulo (*.test.mjs), fixture.json (catalogo INVENTATO), browser/ (prove nel browser)
├── anteprima/    pagine di anteprima dello stile (non fanno parte dell'app)
└── package.json, biome.json, pyproject.toml, tsconfig.json   gli attrezzi di sviluppo
```

`app-dati/` (repo separato e **privato**, cartella sorella di questa) contiene `catalogo.json` e
`playlist.json`: non fa parte di questo repo e non finisce mai nel repo pubblico (vedi `.gitignore`).

## Comandi

```bash
npm install                   # una volta sola: Biome, TypeScript (solo attrezzi di sviluppo)
python -m pip install ruff    # una volta sola: il controllo dei file Python
npm run verifica              # TUTTO: lint (Biome, Ruff) + tipi + test JavaScript (492) + test Python (50)
npm run formatta              # formatta il codice (Biome, Ruff)
npm test                      # solo i test JavaScript (node:test, dati inventati)
npm run prova                 # 13 giri nel browser sull'app vera (serve Chrome e `pip install playwright`)
npm run prova:componenti      # prova la pagina dei componenti hi-fi
```

Prima di ogni pubblicazione: `npm run verifica` e `npm run prova` verdi. Dopo aver toccato `valuta.mjs` o
`prepara.py`: `python strumenti/prepara.py --prova` (stesse playlist di prima). `test/fixture.json` è un
mini-catalogo **completamente inventato**: nessun dato personale, perché questo repo è pubblico.
Su GitHub gira da solo lo stesso controllo (`.github/workflows/verifica.yml`) a ogni push.

## Come si pubblica

Il sorgente **non contiene segreti né dati**, quindi sta in un repo **pubblico**
(`Trava91/musica-app`, GitHub Pages: <https://trava91.github.io/musica-app/>). Creare il repo, fare un
push e attivare Pages sono azioni esterne: **chiedi sempre conferma a Nicolò prima**.

1. Alza il numero di versione **in due posti**: `CACHE = "jukebox-vN"` in [`sw.js`](sw.js) e `VERSIONE` in
   [`js/config.js`](js/config.js) (un test controlla che coincidano). Se hai aggiunto o tolto file in `js/`,
   `css/`, `fonts/` o `icons/`, aggiorna anche l'elenco `SHELL` di `sw.js` (un test pretende che sia completo).
2. `npm run verifica` e `npm run prova`. Unisci il branch in `main` (`git merge --no-ff`, così si annulla con
   `git revert -m 1`) e `git push origin main`: Pages ripubblica da solo.
3. Sul telefono apri l'app: **Impostazioni → Musica sul telefono deve dire lo stesso numero di brani di prima**,
   i dati devono caricarsi da GitHub col token, e una playlist deve suonare 5 minuti a schermo spento.
   Se qualcosa non va: `git revert` dell'unione e nuovo push.
4. La prima volta: sul telefono apri l'URL → «Installa app» (o «Aggiungi a Home») → incolla il token.

## Cosa non toccare (invarianti)

Sul telefono ci sono già migliaia di file audio importati e il token. Queste «chiavi» devono restare
**identiche**, altrimenti l'app installata perde tutto e va reimportata (li fa rispettare
`test/contratti.test.mjs`):

| Cosa | Valore |
|---|---|
| Chiavi in `localStorage` | `jukebox.token`, `jukebox.dati.tipo`, `.url`, `.owner`, `.repo`, `.file`, `jukebox.dati.sha`, `jukebox.motori`, `jukebox.usaNewPipe`, `jukebox.soloJukebox`, `jukebox.volume`, `jukebox.file.indice`, `jukebox.playlist.cache`, `jukebox.playlist.sha` |
| Archivio audio | Cache Storage `jukebox-audio`, chiave `audio/<id>` |
| Copia del catalogo | Cache Storage `jukebox-dati`, chiave `cache-dati/catalogo.json` |
| Cache dell'app | nomi `jukebox-vN`; la pulizia cancella **solo** i nomi che iniziano per `jukebox-v` |
| Formato dei dati | contratto v1 di `catalogo.json` e `playlist.json` (vedi «Contratto dati») |
| Nome dei file audio | `<12 cifre esadecimali>.<estensione>` |
| Uscita di `strumenti/valuta.mjs` | la usa `prepara.py` (skill `/archivio-musica`) |
| Manifest | `start_url` e `scope` = `./` |
| Origine condivisa | l'app burocrazia vive sullo stesso indirizzo `trava91.github.io`: **mai `localStorage.clear()`**, mai chiavi senza il prefisso `jukebox.` |

## Dove agganciare la social radio

Non c'è ancora, ma il codice è fatto per accoglierla senza rifacimenti:

- **`nucleo/` non conosce schermo né rete**: la coda e le sue regole possono girare identiche su un server.
- **`sessione.js` è l'unico punto da cui passa ogni modifica alla coda**, con eventi in uscita: una «stanza» è una
  sessione condivisa i cui comandi arrivano dalla rete invece che dal dito. Ogni voce della coda ricorda **chi**
  l'ha messa e **quando** (`accoda(brano, { da })`: oggi sempre `"io"`): lì stanno i limiti per utente.
- **Comandi e stato fatti di soli dati** (id, numeri, testi): si spediscono in rete e si salvano in un database così
  come sono (`sessione.stato()`).
- **`dati/` come «porte»**: sostituire GitHub con un database condiviso tocca solo quella cartella.
- **La scala del sintonizzatore** (`ui/hifi/scala.js`) riceve una lista generica di «stazioni»: oggi generi e
  playlist, domani le stanze. «Metti in coda» è già il gesto base della radio.

Prerequisiti fuori dal codice: id dei brani stabili (previsto in `liste/motore/catalogo.py` a revisione del catalogo
chiusa) e le licenze per trasmettere al pubblico (SIAE/SCF, già annotato nel contesto musica).

## Come rigenerare i dati (`catalogo.json`)

Serve una copia già costruita del catalogo (`liste/dati/catalogo.sqlite`, vedi
[`liste/README.md`](../liste/README.md)):

```bash
cd 05-hobby/musica/app
python strumenti/esporta.py
```

Scrive `../app-dati/catalogo.json`, stampa conteggi e qualche controllo campione.
Legge **sempre una copia** del database, mai l'originale: durante una revisione
del catalogo un'altra sessione può ricostruirlo in qualsiasi momento con
`os.replace`, e leggere l'originale in quel momento darebbe un file a metà.

Quando la fase 1 (catalogo) sarà stabile, `liste/motore/aggiorna.py` avrà
un'opzione `--pubblica-app` che fa questo passo e il push da solo — vedi il piano.

## Token (PAT) — creazione e revoca

**Crearlo** — <https://github.com/settings/personal-access-tokens/new>:

1. **Repository access** → *Only select repositories* → `Trava91/musica-dati`.
2. **Permissions** → *Repository permissions* → **Contents: Read and write**
   (lascia tutto il resto su *No access*). La scrittura serve per le playlist.
3. **Expiration** → una scadenza (es. 1 anno).
4. Genera, copia il token (`github_pat_…`), incollalo nell'onboarding dell'app.

**Revocarlo** (telefono perso, o igiene periodica) — stessa pagina → seleziona
il token → *Revoke*.

> Sicurezza: dati a bassa sensibilità (gusti musicali, non documenti). Il rischio
> reale è l'accesso fisico al telefono sbloccato. La mitigazione è la **revoca**.

## Musica sul telefono (M2): le playlist vanno avanti da sole

Il Jukebox suona da sé i file audio salvati sul telefono: avanza da solo, ha la
pausa vera, va a schermo spento (comandi anche dalla schermata di blocco) e non
dipende da NewPipe. Con le app esterne (NewPipe, Spotify gratis) non è possibile:
Android non dice al Jukebox quando un brano è finito.

1. **Nel Jukebox**: apri una playlist → "Tieni questa playlist sul telefono".
2. **Sul PC** (o chiedi a Claude "prepara le playlist per il telefono"):
   ```bash
   python strumenti/prepara.py              # le playlist segnate
   python strumenti/prepara.py "Hip Rap"    # oppure per nome
   python strumenti/prepara.py --tutti --solo-invio   # tutto l'archivio tranne la tech house, senza playlist
   ```
   Procura l'audio in `05-hobby/musica/audio/` (fuori dai repo, riusato
   le volte dopo) e, se il telefono è collegato col debug USB, lo copia in
   `Download/Jukebox/`. I brani solo-Spotify li cerca su YouTube Music e li
   abbina per artista, titolo e durata (`abbinamenti.json`: un abbinamento
   sbagliato si corregge lì, cambiando `videoId`, e cancellando il file in
   `audio/`).
3. **Nel Jukebox**: Altro → Musica sul telefono → Aggiungi file → apri
   `Download/Jukebox`, tieni premuto il primo file → Seleziona tutto.
4. Poi la cartella `Download/Jukebox` si può svuotare
   (`python strumenti/prepara.py --pulisci`): i file sono già dentro il Jukebox.

Formato: da YouTube l'audio **Opus** (`.webm`, qualità variabile, circa 110-160 kbps:
scelta di Nicolò del 05/10/2026); da SoundCloud il suo AAC 160 o mp3 128 (lì l'Opus
è a 64 kbps). I vecchi `.m4a` arrivati da YouTube si rifanno da soli al giro
successivo (`audio/origini.json` ricorda da dove arriva ogni file).

Spazio: circa 1 MB al minuto, una playlist sta fra 0,3 e 3 GB.

**Archivio sul PC** (scelta di Nicolò, 05/10/2026): tutti i brani "scelti" del
catalogo (circa 8.400, 39 GB) scaricati in `05-hobby/musica/audio/` a giri da
circa 30 minuti (circa 150 brani a giro), lanciati a mano:
```bash
python strumenti/prepara.py --archivio --minuti 30   # un giro
python strumenti/prepara.py --archivio --prova       # a che punto è
```
Ordine: brani delle playlist, poi link diretti (YouTube, SoundCloud, file),
poi i solo-Spotify (trovati su YouTube Music circa 9 su 10). I brani già
cercati e non trovati non si ricercano (`--riprova` per rifarlo). Con
l'archivio, preparare una playlist per il telefono diventa una copia.

Cosa contiene l'archivio (`05-hobby/musica/audio/`, cura in `strumenti/archivio.py`):
- `<id brano>.<ext>`: i file. Dentro, i **metadati** (artista, titolo con la
  versione, genere, anno, BPM, Camelot, id), scritti con `ffmpeg -c copy` subito
  dopo ogni scaricamento, senza ricodificare. Provati con ffprobe e VLC:
  - `.mp3`: ID3v2.3 + ID3v1; BPM e tonalità in TBPM e TKEY. VLC legge il commento
    solo dall'ID3v1, per questo è corto e ASCII (`128 BPM, 8B, id …`);
  - `.m4a`: solo i campi standard. Con campi personalizzati VLC non legge più
    nulla, quindi BPM, tonalità e id stanno nel commento;
  - `.webm`: tag Matroska (anno in DATE_RELEASED, BPM, INITIAL_KEY). VLC mostra
    l'artista come "Artista dell'album".
- `registro.json`: per ogni file la **fonte** del catalogo (`yt:…`, `sp:…`,
  `sc:…`, `lo:…`), la provenienza, la data di scaricamento e l'impronta dei
  metadati scritti.
- `indice.html` e `indice.csv`: l'elenco leggibile (artista, titolo, genere,
  durata, provenienza, file), rigenerato a ogni giro.
- `abbinamenti.json`, `inviati.json`: ricerche su YouTube Music e copie mandate
  al telefono (con la data di scaricamento: si ricopia solo se cambia l'audio,
  non i metadati, quindi il Jukebox non reimporta niente).
- `_orfani/`: file il cui brano non c'è più nel catalogo. Non si cancellano da soli.

E accanto, `05-hobby/musica/audio-per-nome/`: **hard link NTFS** chiamati
"Artista - Titolo (versione).ext", rigenerati a ogni giro (stesso file su disco,
nessuno spazio in più, niente permessi di amministratore). Nomi ripuliti dai
caratteri vietati da Windows e troncati a 140 caratteri; se due brani darebbero
lo stesso nome, entrambi prendono anche l'id.

```bash
python strumenti/prepara.py --metadati     # dopo una correzione dei titoli: riscrive solo i metadati cambiati
python strumenti/prepara.py --riallinea    # dopo una ricostruzione del catalogo (anche --orfani)
python strumenti/prepara.py --indice       # solo indice e collegamenti
```

**Gli id possono cambiare.** L'id di un brano è un'impronta delle sue fonti
(`liste/motore/catalogo.py`): resta uguale correggendo un titolo o ricostruendo
il catalogo, cambia se si uniscono doppioni, se si separa una versione o se un
brano guadagna o perde una fonte (o se una correzione lo fonde con un altro).
Per questo:
- `esporta.py` scrive in `catalogo.json` la tabella cumulativa `rinominati`
  (id vecchio → id nuovo, trovata attraverso le fonti in comune);
- il Jukebox la usa all'avvio: sposta i file salvati sul telefono e corregge le
  playlist a mano senza reimportare niente;
- `prepara.py --riallinea` riaggancia i file dell'archivio (dalla fonte del
  registro o dalla tabella), tiene il migliore se due finiscono sullo stesso
  brano e sposta il resto in `_orfani/`.

"Libera spazio" nel foglio di una playlist toglie i suoi brani che non servono
ad altre playlist tenute sul telefono.

**Se si ferma:**
- `HTTP Error 403` → YouTube è cambiato: `python -m pip install -U "yt-dlp[default]"`
  e rilancia (riprende da dove era).
- "Sign in to confirm you're not a bot" → YouTube ferma chi scarica troppo di fila
  (successo il 05/10/2026 dopo circa 850 brani in 2 ore). Dopo 3 rifiuti di fila il giro
  si ferma da solo: riprovare fra qualche ora, senza insistere.
- La musica si interrompe a schermo spento → batteria di Chrome su "Senza
  restrizioni" (sugli Oppo: Impostazioni → Batteria → Chrome).

Nota: scaricare da YouTube è contro i suoi termini, come NewPipe (scelta di
Nicolò, 02/10/2026). I file sono per uso personale.

## NewPipe

Scelta di Nicolò (28/09/2026): suona YouTube e SoundCloud senza pubblicità e a
schermo spento, a differenza del player ufficiale incorporato. È fuori dal Play
Store (viola i termini di YouTube) — si installa da [F-Droid](https://f-droid.org/packages/org.schabi.newpipe/).

Il Jukebox lo apre con un link `intent://…;package=org.schabi.newpipe;…`: se
NewPipe non è installato, il link ripiega sul browser. Impostazioni consigliate
in NewPipe (da verificare/aggiornare dopo la prova reale): azione di apertura dei
link su "Lettore in background", così il brano parte subito senza altri tocchi.

**Limite noto:** NewPipe non accetta una playlist temporanea in un solo link
(niente `watch_videos?video_ids=…`). Il Jukebox apre un brano alla volta: si passa
al successivo con ⏭. Una vera coda automatica
arriva con la M3 (una playlist "non in elenco" sul tuo canale YouTube, che NewPipe
apre e suona tutta).

## Contratto dati (v1)

`app-dati/catalogo.json`, generato da `strumenti/esporta.py`, letto da
`js/dati/catalogo.js`. **Se cambia un campo, aggiorna insieme lo script, `dati/catalogo.js` e `nucleo/cerca.js`**
(la forma esatta è documentata in testa a `esporta.py`). In sintesi: un oggetto
per versione con campi abbreviati (`a` artista, `t` titolo, `v` versione, `k` tipo,
`g` indice del macro-genere, `b`/`c`/`e` BPM/Camelot/energia, `s` le fonti
`[[codice, riferimento], …]` con codice `sp`/`yt`/`sc`/`lo`, `r` gli indici delle
raccolte di provenienza, `x` presente solo se la versione è "di esplorazione").
In più `rinominati: {id vecchio: id nuovo}` (dal 05/10/2026, vedi sopra).

`app-dati/playlist.json` (scritto dall'app, non da `esporta.py`): `{schema:1,
playlist:[{id, nome, tipo:"intelligente"|"manuale", regole|brani, ordine, seme,
limite}]}`. Il formato completo delle regole è documentato in testa a `js/nucleo/regole.js`.

## Limiti noti di questa versione (M2)

- Una playlist va avanti da sola solo con i brani che hanno il file sul
  telefono: quelli non ancora preparati restano fuori dalla coda (la schermata
  "Suona" dice quanti sono).
- Spotify: solo l'app gratuita (apre il brano scelto, con pubblicità). Il motore
  "Spotify Premium" comparirà con M5, al prossimo periodo Premium di Nicolò.
- Con NewPipe (e le altre app esterne) la coda non va avanti da sola: si passa al prossimo brano con ⏭ (vedi sopra).
- Le playlist intelligenti con `soloSchermoSpento` restano vuote finché non ci
  sono file (M2) o Spotify Premium (M5): senza nessuno dei due motori continui
  configurati, nessun brano qualifica.
