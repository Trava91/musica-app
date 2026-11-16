// Test di js/nucleo/link.js: intent verso NewPipe e Spotify, indirizzi web, link di apertura.

import assert from "node:assert/strict";
import { test } from "node:test";
import * as link from "../js/nucleo/link.js";

const urlYt = "https://www.youtube.com/watch?v=ABC123";
const iNewPipe = link.intentNewPipe(urlYt);
const iSpotify = link.intentSpotify("abc123");

test("intentNewPipe: punta al pacchetto di NewPipe", () => {
  assert.ok(iNewPipe.includes("package=org.schabi.newpipe"));
});

test("intentNewPipe: ha l'URL di ripiego codificato", () => {
  assert.ok(iNewPipe.includes(encodeURIComponent(urlYt)));
});

test("intentSpotify: punta al pacchetto di Spotify", () => {
  assert.ok(iSpotify.includes("package=com.spotify.music"));
});

test("intentSpotify: contiene l'id della traccia", () => {
  assert.ok(iSpotify.includes("open.spotify.com/track/abc123"));
});

test("urlWeb: spotify", () => {
  assert.equal(link.urlWeb(["sp", "abc"]), "https://open.spotify.com/track/abc");
});

test("urlWeb: youtube", () => {
  assert.equal(link.urlWeb(["yt", "xyz"]), "https://www.youtube.com/watch?v=xyz");
});

test("urlWeb: soundcloud è già un url completo", () => {
  assert.equal(link.urlWeb(["sc", "https://soundcloud.com/a/b"]), "https://soundcloud.com/a/b");
});

test("urlWeb: un file locale non ha un indirizzo web", () => {
  assert.equal(link.urlWeb(["lo", "percorso/x.mp3"]), null);
});

test("cercaEsterno: beatport codifica gli spazi (%20, non spazi veri)", () => {
  const beat = link.cercaEsterno("beatport", "Jamie Esempio", "Titolo Prova");
  assert.ok(beat.includes("%20") && !beat.includes(" "));
});

test("linkApertura: su Android NewPipe usa l'intent", () => {
  assert.ok(link.linkApertura("newpipe", ["yt", "xyz"], { android: true }).startsWith("intent://"));
});

test("linkApertura: sul PC NewPipe ripiega sul web", () => {
  assert.equal(link.linkApertura("newpipe", ["yt", "xyz"], { android: false }), "https://www.youtube.com/watch?v=xyz");
});

test("linkApertura: su Android l'app Spotify usa l'intent", () => {
  assert.ok(link.linkApertura("spotify-app", ["sp", "abc"], { android: true }).includes("package=com.spotify.music"));
});

test("linkApertura: sul PC Spotify ripiega sul web", () => {
  assert.equal(
    link.linkApertura("spotify-app", ["sp", "abc"], { android: false }),
    "https://open.spotify.com/track/abc",
  );
});

test("linkApertura: un file locale non ha un link", () => {
  assert.equal(link.linkApertura("file", ["lo", "x.mp3"], { android: true }), null);
});
