// link.js — logica pura per i link verso le altre app e le ricerche esterne.
// Nessun accesso al DOM: solo stringhe. Chi le apre (window.location, un <a>...) è
// compito di ui.js.

// Forma intent:// di Android: apre `pacchetto` con quell'URL https, e se
// l'app non c'è ripiega sul browser (S.browser_fallback_url).
function intent(urlHttps, pacchetto) {
  const senzaSchema = urlHttps.replace(/^https?:\/\//, "");
  return `intent://${senzaSchema}#Intent;scheme=https;package=${pacchetto};S.browser_fallback_url=${encodeURIComponent(urlHttps)};end`;
}

export function intentNewPipe(urlHttps) {
  return intent(urlHttps, "org.schabi.newpipe");
}

export function intentSpotify(idTraccia) {
  return intent(`https://open.spotify.com/track/${idTraccia}`, "com.spotify.music");
}

// Il link "grezzo" (https) di una fonte [codice, riferimento]. null per i file
// locali: non hanno un indirizzo web (sono sul telefono, li suona lettore.js).
export function urlWeb([codice, rif]) {
  switch (codice) {
    case "sp": return `https://open.spotify.com/track/${rif}`;
    case "yt": return `https://www.youtube.com/watch?v=${rif}`;
    case "sc": return rif; // già un URL completo (permalink SoundCloud)
    case "lo": return null;
    default: return null;
  }
}

// L'indirizzo da aprire per suonare `fonte` con `motore`. Su Android gli intent
// aprono direttamente NewPipe o l'app Spotify; altrove (anteprima sul PC) non
// esistono, quindi si usa il link web. null per i file locali (li suona il Jukebox).
export function linkApertura(motore, fonte, { android = true } = {}) {
  if (!fonte) return null;
  const web = urlWeb(fonte);
  if (!android) return web;
  if (motore === "newpipe" && web) return intentNewPipe(web);
  if ((motore === "spotify-app" || motore === "spotify-premium") && fonte[0] === "sp") return intentSpotify(fonte[1]);
  return web;
}

const RICERCA = {
  spotify: (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}`,
  youtube: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  beatport: (q) => `https://www.beatport.com/search?q=${encodeURIComponent(q)}`,
  bandcamp: (q) => `https://bandcamp.com/search?q=${encodeURIComponent(q)}`,
};

// URL di ricerca esterna per artista+titolo, su uno dei 4 servizi. null se il
// servizio non è tra questi.
export function cercaEsterno(servizio, artista, titolo) {
  const f = RICERCA[servizio];
  if (!f) return null;
  return f([artista, titolo].filter(Boolean).join(" "));
}
