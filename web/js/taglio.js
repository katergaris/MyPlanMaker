// Schema di taglio: pezzi dei pannelli sulle lastre commerciali (MaxRects, scelta "lato corto migliore"),
// listelli sulle barre (prima la barra dove entra, pezzi dal più lungo). Tiene conto di spessore della lama,
// rifilo dei bordi e venatura. Le misure sono quelle finite di ogni pezzo (per i pezzi tagliati o rotondi,
// il rettangolo che li contiene).
import { materiale } from './materiali.js';
import { righeDistinta } from './distinta.js';

export const IMPOSTAZIONI_TAGLIO = { lama: 3.2, rifilo: 10 };

class Lastra {
  constructor(L, H) { this.L = L; this.H = H; this.liberi = [{ x: 0, y: 0, w: L, h: H }]; this.pezzi = []; }

  cerca(w, h, ruota) {
    let migliore = null;
    const prova = (w, h, ruotato) => {
      for (const r of this.liberi) {
        if (w > r.w + 1e-6 || h > r.h + 1e-6) continue;
        const corto = Math.min(r.w - w, r.h - h), lungo = Math.max(r.w - w, r.h - h);
        if (!migliore || corto < migliore.corto || (corto === migliore.corto && lungo < migliore.lungo)) {
          migliore = { x: r.x, y: r.y, w, h, ruotato, corto, lungo };
        }
      }
    };
    prova(w, h, false);
    if (ruota) prova(h, w, true);
    return migliore;
  }

  metti(p) {
    const nuovi = [];
    for (const r of this.liberi) {
      if (p.x >= r.x + r.w || p.x + p.w <= r.x || p.y >= r.y + r.h || p.y + p.h <= r.y) { nuovi.push(r); continue; }
      if (p.x > r.x) nuovi.push({ x: r.x, y: r.y, w: p.x - r.x, h: r.h });
      if (p.x + p.w < r.x + r.w) nuovi.push({ x: p.x + p.w, y: r.y, w: r.x + r.w - p.x - p.w, h: r.h });
      if (p.y > r.y) nuovi.push({ x: r.x, y: r.y, w: r.w, h: p.y - r.y });
      if (p.y + p.h < r.y + r.h) nuovi.push({ x: r.x, y: p.y + p.h, w: r.w, h: r.y + r.h - p.y - p.h });
    }
    const dentro = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
    this.liberi = nuovi.filter((a, i) => !nuovi.some((b, j) => j !== i && dentro(a, b) && (!dentro(b, a) || j < i)));
  }
}

function lastre(pezzi, m, { lama, rifilo }, avanzi = []) {
  const [LL, HL] = m.lastra;
  const utileL = LL - 2 * rifilo + lama, utileH = HL - 2 * rifilo + lama;
  const ordinati = pezzi.slice().sort((a, b) => Math.max(b.L, b.W) - Math.max(a.L, a.W) || b.L * b.W - a.L * a.W);
  const fogli = [], fuori = [];
  // prima gli avanzi del magazzino (già rifilati: niente rifilo), dal più piccolo
  for (const a of avanzi.slice().sort((x, y) => x.L * x.W - y.L * y.W)) for (let i = 0; i < (a.qta || 1); i++) {
    const f = new Lastra(a.L + lama, a.W + lama);
    Object.assign(f, { avanzo: true, LL: a.L, HL: a.W, rif: 0 });
    fogli.push(f);
  }
  for (const p of ordinati) {
    // venatura lungo la larghezza: il pezzo va messo già ruotato; "libera": si può ruotare
    const forzaRuota = m.venatura && p.vena === 'W', ruota = !m.venatura || p.vena === 'libera';
    const w = (forzaRuota ? p.W : p.L) + lama, h = (forzaRuota ? p.L : p.W) + lama;
    const cerca = f => { const c = f.cerca(w, h, ruota); if (c && forzaRuota) c.ruotato = !c.ruotato; return c; };
    let posto = null, foglio = null;
    for (const f of fogli) { const c = cerca(f); if (c) { posto = c; foglio = f; break; } }
    if (!posto) {
      const f = new Lastra(utileL, utileH), c = cerca(f);
      Object.assign(f, { LL, HL, rif: rifilo });
      if (!c) { fuori.push(p); continue; }
      fogli.push(f); posto = c; foglio = f;
    }
    foglio.metti(posto);
    foglio.pezzi.push({ n: p.n, nome: p.nome, x: posto.x + foglio.rif, y: posto.y + foglio.rif, w: posto.w - lama, h: posto.h - lama, ruotato: posto.ruotato, rotondo: p.rotondo, raggio: p.raggio });
  }
  return {
    fogli: fogli.filter(f => f.pezzi.length || !f.avanzo).map(f => ({ L: f.LL, H: f.HL, avanzo: !!f.avanzo, pezzi: f.pezzi, uso: f.pezzi.reduce((s, p) => s + p.w * p.h, 0) / (f.LL * f.HL) })),
    fuori, prezzoUnita: (LL * HL / 1e6) * m.prezzoM2,
  };
}

function barre(pezzi, m, { lama, rifilo }, avanzi = []) {
  const utile = m.barra - 2 * rifilo + lama;
  const ordinati = pezzi.slice().sort((a, b) => b.L - a.L);
  const fogli = [], fuori = [];
  for (const a of avanzi.slice().sort((x, y) => x.L - y.L)) for (let i = 0; i < (a.qta || 1); i++) fogli.push({ resto: a.L + lama, utile: a.L + lama, L: a.L, rif: 0, avanzo: true, pezzi: [] });
  for (const p of ordinati) {
    const serve = p.L + lama;
    if (serve > utile && !fogli.some(f => f.avanzo && f.resto >= serve)) { fuori.push(p); continue; }
    let b = fogli.find(f => f.resto >= serve - 1e-6);
    if (!b) { b = { resto: utile, utile, L: m.barra, rif: rifilo, pezzi: [] }; fogli.push(b); }
    b.pezzi.push({ n: p.n, nome: p.nome, x: b.rif + (b.utile - b.resto), w: p.L });
    b.resto -= serve;
  }
  return {
    fogli: fogli.filter(f => f.pezzi.length).map(f => ({ L: f.L, avanzo: !!f.avanzo, pezzi: f.pezzi, uso: f.pezzi.reduce((s, p) => s + p.w, 0) / f.L })),
    fuori, prezzoUnita: (m.barra / 1000) * m.prezzoM,
  };
}

// Restituisce un gruppo per materiale: { materiale, tipo, fogli, fuori, prezzoUnita, totale }.
export function schemaDiTaglio(progetto, avanzi = []) {
  const imp = { ...IMPOSTAZIONI_TAGLIO, ...(progetto.taglio || {}) };
  const perMat = new Map();
  const mats = new Map(progetto.pezzi.map(p => [p.n, p.mat]));
  for (const r of righeDistinta(progetto)) {
    if (r.vuoto) continue;
    const id = mats.get(r.n);
    if (!perMat.has(id)) perMat.set(id, []);
    perMat.get(id).push({ ...r, L: r.Ltaglio, W: r.Wtaglio });
  }
  return [...perMat].map(([id, pezzi]) => {
    const m = materiale(id);
    const miei = progetto.usaAvanzi === false ? [] : avanzi.filter(a => a.mat === id);
    const g = m.tipo === 'listello' ? barre(pezzi, m, imp, miei) : lastre(pezzi, m, imp, miei);
    const nuovi = g.fogli.filter(f => !f.avanzo).length;
    return { materiale: m, tipo: m.tipo, ...g, nuovi, daAvanzi: g.fogli.length - nuovi, totale: nuovi * g.prezzoUnita };
  });
}
