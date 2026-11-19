// comune.js — gli aiuti che servono a tutti i componenti hi-fi:
//   - "riduci movimento": quello del sistema, oppure forzato (la pagina dei componenti lo simula
//     con la classe hf-fermo su <html>, la stessa che guarda css/base.css);
//   - se un componente si vede: dentro lo schermo, in una scheda aperta, con lo schermo acceso.
//     Livelli, scorrimento del display e piatto si fermano quando non si vedono;
//   - id unici (gli SVG del braccio hanno sfumature con un id: due giradischi non devono pestarsi);
//   - accendere una spia (LED + parola per i lettori di schermo).

const CLASSE_FERMO = "hf-fermo";

/** @type {MediaQueryList | null} */
let mq = null;
/** @type {Set<(ridotto: boolean) => void>} */
const ascoltatoriMovimento = new Set();

function media() {
  if (!mq && typeof matchMedia === "function") {
    mq = matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", avvisaMovimento);
  }
  return mq;
}

function avvisaMovimento() {
  const ridotto = movimentoRidotto();
  for (const fn of [...ascoltatoriMovimento]) fn(ridotto);
}

/** true se le animazioni vanno fermate ("riduci movimento" del sistema, o forzato). */
export function movimentoRidotto() {
  return Boolean(media()?.matches) || document.documentElement.classList.contains(CLASSE_FERMO);
}

/** Forza (true) o toglie (false) "riduci movimento" su tutta la pagina. */
export function forzaMovimentoRidotto(si) {
  document.documentElement.classList.toggle(CLASSE_FERMO, Boolean(si));
  avvisaMovimento();
}

/**
 * fn(ridotto) ogni volta che "riduci movimento" cambia. Restituisce la funzione per smettere.
 * @param {(ridotto: boolean) => void} fn
 */
export function seCambiaMovimento(fn) {
  media();
  ascoltatoriMovimento.add(fn);
  return () => {
    ascoltatoriMovimento.delete(fn);
  };
}

/**
 * fn(visibile) quando l'elemento comincia o smette di vedersi: esce dallo schermo, sta in una
 * scheda nascosta, oppure la pagina va in secondo piano o lo schermo si spegne. All'inizio, finché
 * il browser non ha detto nulla, l'elemento conta come non visibile. Restituisce la funzione per smettere.
 * @param {Element} el @param {(visibile: boolean) => void} fn
 */
export function osservaVisibilita(el, fn) {
  let inVista = false;
  /** @type {boolean | null} */
  let ultimo = null;
  const valuta = () => {
    const visibile = inVista && !document.hidden;
    if (visibile === ultimo) return;
    ultimo = visibile;
    fn(visibile);
  };
  const io = new IntersectionObserver((voci) => {
    inVista = voci[voci.length - 1].isIntersecting;
    valuta();
  });
  io.observe(el);
  document.addEventListener("visibilitychange", valuta);
  return () => {
    io.disconnect();
    document.removeEventListener("visibilitychange", valuta);
  };
}

let contatore = 0;

/** Un id che nella pagina c'è una volta sola: "prefisso-N". */
export function idUnico(prefisso) {
  contatore += 1;
  return `${prefisso}-${contatore}`;
}

/**
 * Accende o spegne una spia (`.hf-spia`: un LED con la sua scritta). La parola per i lettori di
 * schermo (`.hf-sr` dentro la spia) dice "accesa" o "spenta".
 * @param {Element} spia @param {boolean} accesa
 */
export function accendiSpia(spia, accesa) {
  spia.querySelector(".hf-led")?.classList.toggle("hf-acceso", accesa);
  const voce = spia.querySelector(".hf-sr");
  if (voce) voce.textContent = accesa ? ": accesa" : ": spenta";
}
