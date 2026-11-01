// Salvataggio: copia locale nel browser (funziona senza rete) + server su ZimaOS per PC e tablet.
// Regola: vince la versione con `aggiornato` più recente.
import { t } from './lingua.js';
const PREF = 'mpm:progetto:';
// Progetti eliminati senza rete: si ricordano finché il server non conferma, così non ricompaiono.
const ELIMINATI = 'mpm:eliminati';
const eliminati = () => { try { return JSON.parse(localStorage.getItem(ELIMINATI) || '[]'); } catch { return []; } };
const segnaEliminati = ids => localStorage.setItem(ELIMINATI, JSON.stringify(ids));

const locali = () => Object.keys(localStorage).filter(k => k.startsWith(PREF)).map(k => JSON.parse(localStorage.getItem(k)));
const scriviLocale = (p, sporco) => localStorage.setItem(PREF + p.id, JSON.stringify({ ...p, _sporco: sporco }));
const pulito = p => { const { _sporco, ...resto } = p; return resto; };

async function api(metodo, url, corpo) {
  // Senza risposta entro pochi secondi si va avanti con la copia locale (tablet con rete debole).
  const r = await fetch(url, { signal: AbortSignal.timeout(metodo === 'GET' ? 5000 : 15000), method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
  if (r.status === 409) return { conflitto: await r.json() };
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// `soloLocale`: elenco immediato dalle copie del dispositivo, senza aspettare il server.
export async function elenco({ soloLocale = false } = {}) {
  const via = new Set(eliminati());
  const mappa = new Map(locali().filter(p => !via.has(p.id)).map(p => [p.id, { id: p.id, nome: p.nome, aggiornato: p.aggiornato, anteprima: p.anteprima }]));
  if (!soloLocale) try {
    for (const s of await api('GET', '/api/projects')) {
      if (via.has(s.id)) continue;
      const l = mappa.get(s.id);
      if (!l || s.updated > l.aggiornato) mappa.set(s.id, { id: s.id, nome: s.name, aggiornato: s.updated, anteprima: s.preview || l?.anteprima });
    }
  } catch { /* senza rete: solo le copie locali */ }
  return [...mappa.values()].sort((a, b) => b.aggiornato - a.aggiornato);
}

export async function carica(id) {
  const raw = localStorage.getItem(PREF + id), locale = raw ? JSON.parse(raw) : null;
  try {
    const s = await api('GET', `/api/projects/${id}`);
    if (!locale || s.updated > locale.aggiornato) { scriviLocale(s.data, false); return s.data; }
  } catch { /* uso la copia locale */ }
  return locale ? pulito(locale) : null;
}

// Restituisce 'salvato', 'locale' (senza rete) o { conflitto: progettoDelServer }.
export async function salva(progetto) {
  progetto.aggiornato = Date.now();
  scriviLocale(progetto, true);
  return invia(progetto);
}

async function invia(progetto) {
  try {
    const r = await api('PUT', `/api/projects/${progetto.id}`, { name: progetto.nome, data: pulito(progetto), updated: progetto.aggiornato });
    if (r.conflitto) { scriviLocale(r.conflitto.data, false); return { conflitto: r.conflitto.data }; }
    scriviLocale(progetto, false);
    return 'salvato';
  } catch {
    return 'locale';
  }
}

export async function sincronizza() {
  for (const p of locali().filter(p => p._sporco)) await invia(pulito(p));
  for (const id of eliminati()) await eliminaDalServer(id);
}

async function eliminaDalServer(id) {
  try {
    await api('DELETE', `/api/projects/${id}`);
    segnaEliminati(eliminati().filter(x => x !== id));
  } catch { /* si riprova alla prossima sincronizzazione */ }
}

export async function elimina(id) {
  localStorage.removeItem(PREF + id);
  segnaEliminati([...new Set([...eliminati(), id])]);
  await eliminaDalServer(id);
}

// Ripristina un progetto appena eliminato (pulsante Annulla).
export async function ripristina(progetto) {
  segnaEliminati(eliminati().filter(x => x !== progetto.id));
  return salva(progetto);
}

export async function rinomina(id, nome) {
  const p = await carica(id);
  if (!p) return null;
  p.nome = nome;
  await salva(p);
  return p;
}

// File di progetto (.mpm.json): per passare progetti tra portable, server e tablet, o prepararli a parte.
export function versoFile(progetto) {
  const { _sporco, ...dati } = progetto;
  return JSON.stringify({ formato: 'myplanmaker', versione: 1, esportato: new Date().toISOString(), progetto: dati }, null, 1);
}

export function daFile(testo) {
  let j;
  try { j = JSON.parse(testo); } catch { throw new Error(t('Il file non è un progetto MyPlanMaker (JSON non valido).')); }
  const p = j && j.formato === 'myplanmaker' ? j.progetto : j;
  if (!p || !Array.isArray(p.pezzi)) throw new Error(t('Il file non contiene un progetto MyPlanMaker.'));
  for (const x of p.pezzi) {
    if (!x || typeof x.id !== 'string' || !Array.isArray(x.pos) || !Array.isArray(x.rot)) throw new Error(t('Un pezzo del file è incompleto.'));
    x.tagli = Array.isArray(x.tagli) ? x.tagli : [];
  }
  p.prossimoN = Math.max(p.prossimoN || 1, ...p.pezzi.map(x => (x.n || 0) + 1));
  p.nome = String(p.nome || t('Progetto importato'));

  return p;
}

// Impostazioni condivise (magazzino avanzi, catalogo materiali): copia locale + server, vince la più recente.
const IMP = 'mpm:impostazioni';
export async function caricaImpostazioni() {
  let locale = {};
  try { locale = JSON.parse(localStorage.getItem(IMP) || '{}'); } catch { /* copia locale rovinata: si riparte */ }
  try {
    const s = await api('GET', '/api/settings');
    if ((s.aggiornato || 0) > (locale.aggiornato || 0)) { localStorage.setItem(IMP, JSON.stringify(s)); return s; }
    if ((locale.aggiornato || 0) > (s.aggiornato || 0)) api('PUT', '/api/settings', locale).catch(() => {});
  } catch { /* senza rete */ }
  return locale;
}
export async function salvaImpostazioni(imp) {
  imp.aggiornato = Date.now();
  localStorage.setItem(IMP, JSON.stringify(imp));
  try { await api('PUT', '/api/settings', imp); return 'salvato'; } catch { return 'locale'; }
}
