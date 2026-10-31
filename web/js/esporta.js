// Esportazioni: CSV della distinta (per i centri di taglio e i fogli di calcolo), DXF dei contorni (CNC, laser,
// pantografo), STL del modello 3D (stampa 3D, altri programmi).
import { Vector3 } from '../vendor/three.module.js';
import { fmt, matrice, nomeBordo } from './modello.js';

import { geometriaPezzo, poligoniDisegno, sezionePezzo } from './geometria.js';
import { righeDistinta } from './distinta.js';
import { foriDelPezzo } from './disegni.js';
import { t, tr } from './lingua.js';

const n1 = v => fmt(v, 1);
const cella = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function csvDistinta(progetto) {
  const righe = righeDistinta(progetto);
  const testa = [t('N'), t('Pezzo'), t('Materiale'), t('Lunghezza taglio'), t('Larghezza taglio'), t('Spessore'), t('Quantità'), t('Venatura'), t('Bordo davanti/sopra/…'), t('Spessore bordo'), t('Misura finita'), t('Tagli e forma')];
  const corpo = righe.filter(r => !r.vuoto).map(r => {
    const p = progetto.pezzi.find(x => x.n === r.n), lati = p.bordatura?.lati || [];
    return [r.n, r.nome, r.materiale, n1(r.Ltaglio), n1(r.Wtaglio), n1(r.T), 1, t({ L: tr('lungo L'), W: tr('lungo W'), libera: tr('libera') }[r.vena]),
      lati.map(l => nomeBordo(p, l)).join(', '), r.spessoreBordo ? n1(r.spessoreBordo) : '', `${r.L} × ${r.W}`, [...r.forma, ...r.tagli].join(' · ')].map(cella).join(';');
  });
  return '﻿' + [testa.join(';'), ...corpo].join('\r\n') + '\r\n';
}

// DXF R12 (il più compatibile): ogni pezzo sul suo layer, in fila, con contorno (LINE), fori (CIRCLE) e nome (TEXT).
export function dxfPezzi(progetto) {
  const out = ['0', 'SECTION', '2', 'ENTITIES'];
  const linea = (layer, a, b) => out.push('0', 'LINE', '8', layer, '10', a[0].toFixed(3), '20', a[1].toFixed(3), '30', '0', '11', b[0].toFixed(3), '21', b[1].toFixed(3), '31', '0');
  let x = 0;
  for (const p of progetto.pezzi.slice().sort((a, b) => a.n - b.n)) {
    const poli = sezionePezzo(p);
    if (!poli.length) continue;
    const xs = poli.flat().map(q => q[0]), ys = poli.flat().map(q => q[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs);
    const layer = `P${String(p.n).padStart(2, '0')}_${p.nome.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 24)}`;
    for (const pl of poli) pl.forEach((q, i) => { const r = pl[(i + 1) % pl.length]; linea(layer, [q[0] - x0 + x, q[1] - y0], [r[0] - x0 + x, r[1] - y0]); });
    // scassi del disegno 2D su un layer per profondità (es. P03_Piano_SCASSO_8mm), da leggere come tasche
    if (p.forma === 'disegno') for (const sc of poligoniDisegno(p.disegno).scassi) {
      const ls = `${layer}_SCASSO_${String(sc.prof).replace('.', '_')}mm${sc.lato === 'sotto' ? '_SOTTO' : ''}`;
      for (const pl of sc.poli) pl.forEach((q, i) => { const r = pl[(i + 1) % pl.length]; linea(ls, [q[0] - x0 + x, q[1] - y0], [r[0] - x0 + x, r[1] - y0]); });
    }
    for (const f of foriDelPezzo(progetto, p).filter(f => f.faccia !== 'bordo')) out.push('0', 'CIRCLE', '8', `${layer}_FORI`, '10', (f.x - x0 + x).toFixed(3), '20', (f.y - y0).toFixed(3), '30', '0', '40', (f.d / 2).toFixed(3));
    out.push('0', 'TEXT', '8', `${layer}_TESTI`, '10', x.toFixed(3), '20', '-30', '30', '0', '40', '12', '1', `${p.n} ${p.nome}`.replace(/[^\x20-\x7e]/g, '?'));
    x += x1 - x0 + 50;
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\r\n');
}

// STL ASCII di tutto il progetto, in millimetri, già al suo posto.
export function stlProgetto(progetto) {
  const r = [`solid ${progetto.nome.replace(/\s+/g, '_')}`], a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (const p of progetto.pezzi) {
    const g = geometriaPezzo(p);
    if (!g) continue;
    const m = matrice(p), pos = g.geometria.attributes.position.array;
    for (let i = 0; i < pos.length; i += 9) {
      a.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(m);
      b.set(pos[i + 3], pos[i + 4], pos[i + 5]).applyMatrix4(m);
      c.set(pos[i + 6], pos[i + 7], pos[i + 8]).applyMatrix4(m);
      const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
      r.push(` facet normal ${n.x.toFixed(5)} ${n.y.toFixed(5)} ${n.z.toFixed(5)}`, '  outer loop',
        ...[a, b, c].map(v => `   vertex ${v.x.toFixed(3)} ${v.y.toFixed(3)} ${v.z.toFixed(3)}`), '  endloop', ' endfacet');
    }
  }
  r.push(`endsolid ${progetto.nome.replace(/\s+/g, '_')}`);
  return r.join('\n');
}

export function scarica(nome, contenuto, tipo = 'text/plain') {
  const a = document.createElement('a');
  a.href = contenuto.startsWith?.('data:') ? contenuto : URL.createObjectURL(new Blob([contenuto], { type: tipo }));
  a.download = nome.replace(/[\\/:*?"<>|]+/g, '-');
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (!contenuto.startsWith?.('data:')) setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
