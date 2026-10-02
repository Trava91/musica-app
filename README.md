# Jukebox — app musica per il telefono

PWA (web app installabile) per cercare e filtrare il tuo catalogo musicale, creare
playlist a più filtri e riprodurle senza passare dalle altre app. Stato attuale:
**M1** — ricerca, playlist intelligenti/manuali, riproduzione tramite NewPipe e
l'app Spotify gratuita. Le tappe successive (file sul telefono a schermo spento,
assistente DJ, Spotify Premium, ricerca ovunque) sono nel piano
[`plans/2026-09-28-app-musica-telefono.md`](../../../plans/2026-09-28-app-musica-telefono.md).

Stesso schema di [`03-burocrazia/app`](../../../03-burocrazia/app/): file statici
su GitHub Pages, nessun server, nessun build. Legge i dati da un repo **privato**
con un token che inserisci a runtime — resta solo su questo telefono.

## Struttura

```
app/
├── index.html              pagina unica (onboarding + 5 schede + 4 fogli/overlay)
├── manifest.webmanifest    manifest PWA
├── sw.js                   service worker (app shell offline)
├── css/styles.css          stile jukebox anni '50, blu notte con neon
├── fonts/                  Yellowtail, Oswald, Courier Prime (offline, licenze in LICENZE.md)
├── js/
│   ├── main.js              onboarding token, avvio, impostazioni, service worker
│   ├── ui.js                render di tutte le schermate
│   ├── config.js            da dove arrivano i dati + preferenze (motori, NewPipe)
│   ├── api.js                client GitHub Contents API (getFile/getSha/getRaw/putFile)
│   ├── dati.js               carica catalogo.json (sha, cache, offline)
│   ├── playlist.js           legge/scrive playlist.json (lock ottimistico)
│   ├── cerca.js               ricerca e filtri (logica pura)
│   ├── regole.js              valutazione delle playlist intelligenti (logica pura)
│   ├── dj.js                  Camelot/BPM/percorso armonico (logica pura)
│   ├── motori.js              chi suona ogni brano (logica pura)
│   ├── link.js                 link intent:// verso NewPipe/Spotify, ricerche esterne
│   ├── coda.js                 la coda di riproduzione (posizione, avanti/indietro/casuale)
│   ├── comandi.js              tasto grande, ⏮ ⏭, cosa parte a fine brano (logica pura)
│   ├── generi.js               generi raggruppati per la vista (Tech house, Disco)
│   ├── file.js                 l'audio sul telefono (Cache Storage, id brano → file)
│   └── lettore.js              lettore interno: <audio> + Media Session (schermo spento)
├── strumenti/
│   ├── esporta.py            genera app-dati/catalogo.json da liste/dati/catalogo.sqlite
│   ├── prepara.py            procura l'audio delle playlist per il telefono (M2)
│   ├── valuta.mjs            brani di ogni playlist con le regole dell'app (per prepara.py)
│   └── test_prepara.py       test dell'abbinamento su YouTube Music
├── test/
│   ├── logica.test.mjs      test Node della logica pura
│   └── fixture.json          catalogo finto (nessun dato reale: repo pubblico)
└── icons/icon.svg
```

`app-dati/` (repo separato e **privato**, cartella sorella di questa) contiene
`catalogo.json` e `playlist.json`: non fa parte di questo repo, non finisce mai
nel repo pubblico (vedi `.gitignore`).

## Anteprima sul PC (senza GitHub né token)

Serve la cartella `05-hobby/musica/` (così l'app vede anche `app-dati/`):

```bash
cd 05-hobby/musica
python -m http.server 8000 --bind 127.0.0.1
```

Apri <http://127.0.0.1:8000/app/?dati=../app-dati/catalogo.json>. Il parametro
`dati` mette l'app in modalità "url": legge quel file, non chiede il token, e le
playlist restano **solo in quel browser** (non vanno su GitHub). Sul PC i pulsanti
di riproduzione aprono YouTube/Spotify/SoundCloud sul web: NewPipe e l'app Spotify
esistono solo sul telefono. Per una vista da telefono: F12 → Ctrl+Shift+M.
Per uscire dall'anteprima: Impostazioni → "Esci dall'anteprima".

## Dev locale con i dati veri

Il service worker richiede `localhost` o HTTPS (non `file://`):

```bash
cd 05-hobby/musica/app
python -m http.server 8000
```

Apri `http://localhost:8000` e usa il token nell'onboarding.

### Test della logica

```bash
node test/logica.test.mjs
python strumenti/test_prepara.py
```

`test/fixture.json` è un mini-catalogo **completamente inventato**: nessun dato
personale, perché questo repo è pubblico.

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

## Deploy su GitHub Pages

Il sorgente di questo repo **non contiene segreti né dati**, quindi sta in un
repo **pubblico** (Pages gratis). Prima di fare qualsiasi push, chiedi conferma
a Nicolò (creazione repo, push e attivazione di Pages sono azioni esterne).

1. Crea il repo pubblico `Trava91/musica-app` e collega questa cartella
   (`05-hobby/musica/app/`) come suo repo Git.
2. `git push` su `main`.
3. **Settings → Pages** → *Deploy from a branch* → `main` / `root` → Save.
4. URL: `https://trava91.github.io/musica-app/`.
5. Sul telefono apri l'URL → **Installa app** (o "Aggiungi a Home") → incolla il PAT.

Aggiornamenti: `git push` → Pages rideploya. Per invalidare la cache dell'app
shell, **bump** `CACHE = "jukebox-vN"` in [`sw.js`](sw.js).

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
   ```
   Procura l'audio in `05-hobby/musica/audio-telefono/` (fuori dai repo, riusato
   le volte dopo) e, se il telefono è collegato col debug USB, lo copia in
   `Download/Jukebox/`. I brani solo-Spotify li cerca su YouTube Music e li
   abbina per artista, titolo e durata (`abbinamenti.json`: un abbinamento
   sbagliato si corregge lì, cambiando `videoId`, e cancellando il file in
   `audio-telefono/`).
3. **Nel Jukebox**: Altro → Musica sul telefono → Aggiungi file → apri
   `Download/Jukebox`, tieni premuto il primo file → Seleziona tutto.
4. Poi la cartella `Download/Jukebox` si può svuotare
   (`python strumenti/prepara.py --pulisci`): i file sono già dentro il Jukebox.

Spazio: circa 1 MB al minuto (m4a ~128 kbps), una playlist sta fra 0,3 e 3 GB.
"Libera spazio" nel foglio di una playlist toglie i suoi brani che non servono
ad altre playlist tenute sul telefono.

**Se si ferma:**
- `HTTP Error 403` → YouTube è cambiato: `python -m pip install -U "yt-dlp[default]"`
  e rilancia (riprende da dove era).
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
(niente `watch_videos?video_ids=…`). "Manda i prossimi 10" apre solo il primo con
un tocco; gli altri si mandano uno alla volta dalla lista "Prossimi in coda". Una
vera coda automatica arriva con la M3 (una playlist "non in elenco" sul tuo
canale YouTube, che NewPipe apre e suona tutta).

## Contratto dati (v1)

`app-dati/catalogo.json`, generato da `strumenti/esporta.py`, letto da
`js/dati.js`. **Se cambia un campo, aggiorna insieme lo script e `dati.js`/`cerca.js`**
(la forma esatta è documentata in testa a `esporta.py`). In sintesi: un oggetto
per versione con campi abbreviati (`a` artista, `t` titolo, `v` versione, `k` tipo,
`g` indice del macro-genere, `b`/`c`/`e` BPM/Camelot/energia, `s` le fonti
`[[codice, riferimento], …]` con codice `sp`/`yt`/`sc`/`lo`, `r` gli indici delle
raccolte di provenienza, `x` presente solo se la versione è "di esplorazione").

`app-dati/playlist.json` (scritto dall'app, non da `esporta.py`): `{schema:1,
playlist:[{id, nome, tipo:"intelligente"|"manuale", regole|brani, ordine, seme,
limite}]}`. Il formato completo delle regole è documentato in testa a `js/regole.js`.

## Limiti noti di questa versione (M2)

- Una playlist va avanti da sola solo con i brani che hanno il file sul
  telefono: quelli non ancora preparati restano fuori dalla coda (la schermata
  "Suona" dice quanti sono).
- Spotify: solo l'app gratuita (apre il brano scelto, con pubblicità). Il motore
  "Spotify Premium" comparirà con M5, al prossimo periodo Premium di Nicolò.
- "Manda i prossimi 10" a NewPipe apre solo il primo automaticamente (vedi sopra).
- Le playlist intelligenti con `soloSchermoSpento` restano vuote finché non ci
  sono file (M2) o Spotify Premium (M5): senza nessuno dei due motori continui
  configurati, nessun brano qualifica.
