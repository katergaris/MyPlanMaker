// Salvataggio: copia locale nel browser (funziona senza rete) + server su ZimaOS per PC e tablet.
// Regola: vince la versione con `aggiornato` più recente.
const PREF = 'mpm:progetto:';

const locali = () => Object.keys(localStorage).filter(k => k.startsWith(PREF)).map(k => JSON.parse(localStorage.getItem(k)));
const scriviLocale = (p, sporco) => localStorage.setItem(PREF + p.id, JSON.stringify({ ...p, _sporco: sporco }));
const pulito = p => { const { _sporco, ...resto } = p; return resto; };

async function api(metodo, url, corpo) {
  const r = await fetch(url, { method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
  if (r.status === 409) return { conflitto: await r.json() };
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function elenco() {
  const mappa = new Map(locali().map(p => [p.id, { id: p.id, nome: p.nome, aggiornato: p.aggiornato }]));
  try {
    for (const s of await api('GET', '/api/projects')) {
      const l = mappa.get(s.id);
      if (!l || s.updated > l.aggiornato) mappa.set(s.id, { id: s.id, nome: s.name, aggiornato: s.updated });
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
}

export async function elimina(id) {
  localStorage.removeItem(PREF + id);
  try { await api('DELETE', `/api/projects/${id}`); } catch { /* verrà rimosso solo in locale */ }
}
