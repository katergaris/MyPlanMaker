// Distinta dei pezzi: misure finali (dopo i tagli), forma, tagli da fare, costo stimato.
import { materiale } from './materiali.js';
import { descriviTaglio, dimensioni, fmt } from './modello.js';
import { geometriaPezzo } from './geometria.js';

export function righeDistinta(progetto) {
  return progetto.pezzi.slice().sort((a, b) => a.n - b.n).map(p => {
    const m = materiale(p.mat), g = geometriaPezzo(p), base = dimensioni(p);
    const L = g ? g.max[0] - g.min[0] : 0, W = g ? g.max[1] - g.min[1] : 0;
    const forma = [];
    if (p.tipo === 'pannello' && p.forma === 'cerchio') forma.push(`rotondo Ø ${fmt(p.D)}`);
    else if (p.tipo === 'pannello' && p.r > 0) forma.push(`angoli raggio ${fmt(p.r)}`);
    const tagli = p.tagli.map(descriviTaglio);
    const costo = p.tipo === 'listello' ? (L / 1000) * m.prezzoM : (L * W / 1e6) * m.prezzoM2;
    return {
      n: p.n, nome: p.nome, tipo: p.tipo, materiale: m.nome,
      L: Math.round(L), W: Math.round(p.tipo === 'listello' ? base.W : W), T: base.T,
      grezzoL: base.L, forma, tagli, costo, vuoto: !g,
    };
  });
}

export function riepilogo(progetto) {
  const righe = righeDistinta(progetto);
  const perMat = new Map();
  let costo = 0;
  for (const r of righe) {
    costo += r.costo;
    const k = r.materiale, v = perMat.get(k) || { tipo: r.tipo, qta: 0 };
    v.qta += r.tipo === 'listello' ? r.L / 1000 : (r.L * r.W) / 1e6;
    perMat.set(k, v);
  }
  return { pezzi: righe.length, costo, materiali: [...perMat].map(([nome, v]) => ({ nome, ...v })) };
}

export const euro = v => v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
