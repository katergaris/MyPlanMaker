// Lingue dell'interfaccia: italiano (testo di partenza, usato come chiave), inglese, francese, tedesco, spagnolo.
// t('Testo con {nome}', { nome }) restituisce la traduzione nella lingua scelta, con i segnaposto sostituiti; se una
// traduzione manca resta l'italiano. I dizionari stanno in js/lingue/<codice>.js e si caricano solo se servono.
// La lingua si sceglie dal menu (salvata su questo dispositivo); la prima volta si segue quella del browser.
export const LINGUE = { it: 'Italiano', en: 'English', fr: 'Français', de: 'Deutsch', es: 'Español' };
const LOCALI = { it: 'it-IT', en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

// mancanti: testi senza traduzione incontrati in questa sessione (per le prove: window.mpm.lingua.mancanti).
export const lingua = { cod: 'it', locale: 'it-IT', mancanti: new Set() };
let dizionario = {};

export function t(testo, valori) {
  const s = dizionario[testo] ?? testo;
  if (lingua.cod !== 'it' && !(testo in dizionario) && /[A-Za-z]/.test(testo)) lingua.mancanti.add(testo);

  return valori ? s.replace(/\{(\w+)\}/g, (m, k) => (k in valori ? valori[k] : m)) : s;
}

// Segna un testo da tradurre più tardi, quando si mostra con t(valore): serve per nomi in costanti e cataloghi,
// che si definiscono prima che la lingua sia caricata. Non cambia niente: lo usa solo il controllo dei dizionari.
export const tr = s => s;

// Singolare o plurale: tn(n, '{n} pezzo', '{n} pezzi', { altri valori }).
export const tn = (n, uno, molti, valori = {}) => t(n === 1 ? uno : molti, { n, ...valori });

export function linguaScelta() {
  let c = null;
  try { c = localStorage.getItem('mpm:lingua'); } catch { /* niente memoria: si segue il browser */ }
  if (c && LINGUE[c]) return c;
  const b = (navigator.language || 'it').slice(0, 2).toLowerCase();
  return LINGUE[b] ? b : 'en';
}

export async function caricaLingua(cod = linguaScelta()) {
  lingua.cod = LINGUE[cod] ? cod : 'it';
  lingua.locale = LOCALI[lingua.cod];
  dizionario = lingua.cod === 'it' ? {} : (await import(`./lingue/${lingua.cod}.js`)).default;
  document.documentElement.lang = lingua.cod;
}

export function salvaLingua(cod) {
  try { localStorage.setItem('mpm:lingua', cod); } catch { /* vale solo per questa volta */ }
}

// Testi fissi di index.html: elementi con data-t (si traduce tutto il contenuto HTML, che è la chiave) e
// attributi title / aria-label / placeholder.
export function traduciPagina(radice = document) {
  if (lingua.cod === 'it') return;
  radice.querySelectorAll('[data-t]').forEach(el => {
    const k = el.dataset.t || el.innerHTML.trim().replace(/\s+/g, ' ');
    el.dataset.t = k;
    el.innerHTML = t(k);
  });
  for (const a of ['title', 'aria-label', 'placeholder']) radice.querySelectorAll(`[${a}]`).forEach(el => el.setAttribute(a, t(el.getAttribute(a))));
}
