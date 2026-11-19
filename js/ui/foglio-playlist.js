// foglio-playlist.js — il foglio di una playlist: piano di riproduzione, "tieni sul telefono",
// libera spazio, avvia, modifica, congela, duplica, elimina, e i suoi brani.

import { RIGHE_MAX_PLAYLIST } from "../config.js";
import * as file from "../dati/file-audio.js";
import * as playlist from "../dati/playlist.js";
import { $, apriFinestra, chiudiFinestra, esc, mostraAvviso, NOMI_MOTORE, testaFinestra, vaiA } from "./base.js";
import { chiediConferma } from "./dialoghi.js";
import { eliminaPlaylist, salvaPlaylist } from "./azioni-playlist.js";
import { apriCostruttore } from "./costruttore-playlist.js";
import { mostraLista } from "./riga-brano.js";

const MB = 1048576;
const chiudi = () => chiudiFinestra("foglio-overlay");

/** Salva e, se va bene, dice `fatto` e chiude il foglio (l'errore lo dice già salvaPlaylist). */
async function salvaEChiudi(app, p, fatto) {
  try {
    await salvaPlaylist(app, p);
  } catch {
    return; // già detto da salvaPlaylist
  }
  mostraAvviso(fatto, "ok");
  chiudi();
}

export function apriFoglioPlaylist(app, pScelta) {
  let p = pScelta;
  const el = $("#foglio-brano");
  const { ctx } = app.stato.leggi();
  const { elenco, piano } = app.stato.calcola(p);
  const righePiano = piano.gruppi
    .map((g) => `${esc(NOMI_MOTORE[g.motore] || g.motore)}: ${g.n}${g.continuo ? " (schermo spento)" : ""}`)
    .join(" · ");
  const pronti = elenco.filter((b) => ctx.fileIds.has(b.id)).length;
  el.innerHTML = `<div class="hf-frontale">
      ${testaFinestra("foglio-titolo", p.nome, "foglio-chiudi")}
      <div class="hf-finestra-corpo">
        <p class="hf-nota">${elenco.length} brani. ${righePiano || "Nessuna fonte disponibile"}${piano.esclusi.length ? ` · esclusi: ${piano.esclusi.length}` : ""}</p>
        <div class="hf-azioni hf-spazio">
          <button class="hf-tasto hf-principale" type="button" id="pl-avvia">▶ Avvia${piano.consigliato ? ` con ${esc(NOMI_MOTORE[piano.consigliato] || piano.consigliato)}` : ""}</button>
          ${p.tipo === "intelligente" ? `<button class="hf-tasto" type="button" id="pl-modifica">Modifica</button><button class="hf-tasto" type="button" id="pl-congela">Congela</button>` : ""}
          <button class="hf-tasto" type="button" id="pl-duplica">Duplica</button>
          <button class="hf-tasto hf-pericolo" type="button" id="pl-elimina">Elimina</button>
        </div>
        <div class="hf-parte">
          <label class="hf-interruttore"><input id="pl-telefono" type="checkbox" ${p.telefono ? "checked" : ""}><span class="hf-levetta" aria-hidden="true"></span><span>Tieni questa playlist sul telefono</span></label>
          <p class="hf-nota">${pronti} di ${elenco.length} brani già sul telefono (${(file.byte(elenco.map((b) => b.id)) / MB).toFixed(0)} MB).
            ${p.telefono && pronti < elenco.length ? "Gli altri li prepara il PC: chiedi a Claude di preparare le playlist per il telefono." : ""}</p>
          ${pronti ? `<div class="hf-azioni hf-spazio"><button class="hf-tasto" type="button" id="pl-libera">Libera spazio</button></div>` : ""}
        </div>
        <div class="hf-parte"><h3 class="hf-titoletto">Brani</h3><ol class="hf-cassetto" id="pl-elenco"></ol></div>
      </div>
    </div>`;
  $("#foglio-chiudi").addEventListener("click", chiudi);
  $("#pl-avvia").addEventListener("click", () => {
    chiudi();
    if (app.sessione.avviaPlaylist(p, elenco)) vaiA(app, "riproduzione");
  });
  $("#pl-telefono").addEventListener("change", async (e) => {
    const aggiornata = { ...p };
    if (e.target.checked) aggiornata.telefono = true;
    else delete aggiornata.telefono;
    try {
      await salvaPlaylist(app, aggiornata);
    } catch {
      e.target.checked = !e.target.checked; // il salvataggio non è riuscito (già detto): l'interruttore torna com'era
      return;
    }
    p = aggiornata;
    mostraAvviso(
      e.target.checked ? "Segnata per il telefono: il PC la preparerà." : "Non più segnata per il telefono.",
      "ok",
    );
  });
  $("#pl-libera")?.addEventListener("click", async () => {
    // Toglie i file di questa playlist che non servono ad altre playlist tenute sul telefono,
    // né al brano che sta suonando.
    const s = app.stato.leggi();
    const altre = new Set(
      s.playlist
        .filter((x) => x.id !== p.id && x.telefono)
        .flatMap((x) => app.stato.calcola(x).elenco.map((b) => b.id)),
    );
    const sessione = app.sessione.stato();
    const suonaOra = sessione.interno ? sessione.inCorso : null;
    const via = elenco.map((b) => b.id).filter((id) => s.ctx.fileIds.has(id) && !altre.has(id) && id !== suonaOra);
    if (!via.length) {
      mostraAvviso("Questi brani servono anche ad altre playlist sul telefono.", "");
      return;
    }
    const conferma = await chiediConferma({
      titolo: "Libera spazio",
      testo: `Togliere dal telefono ${via.length} brani (${(file.byte(via) / MB).toFixed(0)} MB)? Per riaverli andranno reimportati.`,
      conferma: "Togli",
      pericolo: true,
    });
    if (!conferma) return;
    await file.rimuovi(via);
    app.stato.cambiaCtx({ fileIds: file.ids() });
    chiudi();
    mostraAvviso(`${via.length} brani tolti dal telefono.`, "ok");
  });
  if (p.tipo === "intelligente") {
    $("#pl-modifica").addEventListener("click", () => {
      chiudi();
      apriCostruttore(app, p);
    });
    $("#pl-congela").addEventListener("click", () =>
      salvaEChiudi(
        app,
        {
          id: playlist.nuovoId(`${p.nome} congelata`),
          nome: `${p.nome} (congelata)`,
          tipo: "manuale",
          brani: elenco.map((b) => b.id),
        },
        "Copia congelata creata.",
      ),
    );
  }
  $("#pl-duplica").addEventListener("click", () =>
    salvaEChiudi(
      app,
      { ...p, id: playlist.nuovoId(`${p.nome} copia`), nome: `${p.nome} (copia)` },
      "Playlist duplicata.",
    ),
  );
  $("#pl-elimina").addEventListener("click", async () => {
    const conferma = await chiediConferma({
      titolo: "Eliminare la playlist?",
      testo: `«${p.nome}» verrà eliminata. Non si può annullare.`,
      conferma: "Elimina",
      pericolo: true,
    });
    if (!conferma) return;
    try {
      await eliminaPlaylist(app, p);
    } catch {
      return; // già detto da eliminaPlaylist
    }
    chiudi();
    mostraAvviso("Playlist eliminata.", "ok");
  });
  // Una playlist vuota dice cosa fare: aggiungere dischi (a mano) o cambiare i filtri.
  const vuoto =
    p.tipo === "intelligente"
      ? {
          testo: "Nessun disco con questi filtri.",
          azione: {
            etichetta: "Modifica i filtri",
            fai: () => {
              chiudi();
              apriCostruttore(app, p);
            },
          },
        }
      : {
          testo: "Questa playlist è vuota.",
          azione: {
            etichetta: "Cerca dischi da aggiungere",
            fai: () => {
              chiudi();
              vaiA(app, "cerca");
            },
          },
        };
  mostraLista(app, $("#pl-elenco"), elenco.slice(0, RIGHE_MAX_PLAYLIST), { lista: elenco, nome: p.nome }, { vuoto });
  apriFinestra("foglio-overlay");
}
