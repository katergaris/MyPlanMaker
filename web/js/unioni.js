// Unioni: trova dove due pezzi si toccano (facce complanari e opposte, con l'area di contatto vera calcolata da
// Manifold) e propone le viti: da che pezzo passano, tipo, lunghezza, quante, dove, preforo. Controlla anche
// le collisioni tra viti, scodelle delle cerniere e fori delle maniglie.
//
// Regole di partenza (indicative, da verificare con l'uso):
// - la vite passa dal pezzo che tocca con una faccia grande e va nella testa o nel bordo dell'altro;
// - lunghezza standard più vicina a spessore attraversato + 1,2 × spessore (almeno 15 mm nell'altro pezzo,
//   senza uscire); diametro dallo spessore del bordo che la riceve;
// - prima e ultima vite a 50 mm dalle estremità del contatto, le altre ogni 200 mm al massimo;
// - preforo obbligatorio nel legno duro, consigliato nei pannelli, facoltativo nel legno tenero.
import { Matrix4, Vector3 } from '../vendor/three.module.js';
import { materiale } from './materiali.js';
import { dimensioni, fmt, matrice } from './modello.js';
import { geometriaPezzo, moduloManifold } from './geometria.js';
import { cerniere, haCerniere, maniglia } from './ferramenta.js';

const LUNGHEZZE = [16, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 120, 140, 160];
const f1 = v => fmt(v, 1);

function facceMondo(p) {
  const g = geometriaPezzo(p);
  if (!g) return [];
  const m = matrice(p), pos = g.geometria.attributes.position.array, gruppi = new Map();
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (let i = 0; i < pos.length; i += 9) {
    a.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(m);
    b.set(pos[i + 3], pos[i + 4], pos[i + 5]).applyMatrix4(m);
    c.set(pos[i + 6], pos[i + 7], pos[i + 8]).applyMatrix4(m);
    const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
    if (n.length() < 1e-6) continue;
    n.normalize();
    const d = n.dot(a);
    const k = `${Math.round(n.x * 2000)},${Math.round(n.y * 2000)},${Math.round(n.z * 2000)},${Math.round(d * 4)}`;
    if (!gruppi.has(k)) gruppi.set(k, { n, d, tri: [] });
    gruppi.get(k).tri.push([a.clone(), b.clone(), c.clone()]);
  }
  return [...gruppi.values()];
}

function base(n) {
  const u = new Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)).normalize();
  return { u, v: new Vector3().crossVectors(n, u) };
}

function sezione(tri, u, v) {
  const poli = tri.map(t => {
    const q = t.map(p => [p.dot(u), p.dot(v)]);
    const area = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[2][0] - q[0][0]) * (q[1][1] - q[0][1]);
    return area < 0 ? [q[0], q[2], q[1]] : q;
  });
  return new (moduloManifold().CrossSection)(poli, 'Positive');
}

// Rettangolo orientato più piccolo che contiene il poligono di contatto.
function rettangolo(punti) {
  let migliore = null;
  for (let i = 0; i < punti.length; i++) {
    const [x0, y0] = punti[i], [x1, y1] = punti[(i + 1) % punti.length];
    const l = Math.hypot(x1 - x0, y1 - y0);
    if (l < 1e-6) continue;
    const e1 = [(x1 - x0) / l, (y1 - y0) / l], e2 = [-e1[1], e1[0]];
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, y] of punti) { const a = x * e1[0] + y * e1[1], b = x * e2[0] + y * e2[1]; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    const area = (a1 - a0) * (b1 - b0);
    if (!migliore || area < migliore.area - 1e-6) migliore = { area, e1, e2, a0, a1, b0, b1 };
  }
  const r = migliore;
  if (r.a1 - r.a0 < r.b1 - r.b0) return { lungo: r.e2, corto: r.e1, l1: r.b1 - r.b0, l2: r.a1 - r.a0, c1: (r.b0 + r.b1) / 2, c2: (r.a0 + r.a1) / 2, scambia: true };
  return { lungo: r.e1, corto: r.e2, l1: r.a1 - r.a0, l2: r.b1 - r.b0, c1: (r.a0 + r.a1) / 2, c2: (r.b0 + r.b1) / 2 };
}

// Come tocca il pezzo: con la testa (fine della lunghezza), con un bordo, o con una faccia / un fianco.
function classifica(p, n) {
  const inv = new Matrix4().extractRotation(matrice(p)).transpose();
  const l = n.clone().applyMatrix4(inv);
  const c = [Math.abs(l.x), Math.abs(l.y), Math.abs(l.z)], k = c.indexOf(Math.max(...c));
  const { L, W, T } = dimensioni(p), dim = [L, W, T];
  const tipo = k === 0 ? 'testa' : p.tipo === 'listello' ? 'fianco' : k === 1 ? 'bordo' : 'faccia';
  return { tipo, asse: k, profondita: dim[k], passa: tipo === 'faccia' || tipo === 'fianco' };
}

function contatto(a, b, fa, fb) {
  let migliore = null;
  for (const x of fa) for (const y of fb) {
    if (x.n.dot(y.n) > -0.9995 || Math.abs(x.d + y.d) > 0.6) continue;
    const { u, v } = base(x.n);
    const sa = sezione(x.tri, u, v), sb = sezione(y.tri, u, v), si = sa.intersect(sb);
    const area = si.area();
    if (area > 60 && (!migliore || area > migliore.area)) {
      const poli = si.toPolygons();
      migliore = { area, n: x.n.clone(), d: x.d, u, v, punti: poli.flat() };
    }
    sa.delete(); sb.delete(); si.delete();
  }
  return migliore;
}

function scegliVite(attraversa, profondita, bordo, mat, inFaccia = false) {
  let d = bordo >= 60 ? 6 : bordo >= 30 ? 5 : bordo >= 22 ? 4.5 : bordo >= 16 ? 4 : bordo >= 12 ? 3.5 : 3;
  const max = attraversa + profondita - (inFaccia ? 3 : 4), min = attraversa + (inFaccia ? 10 : 15);
  if (inFaccia && profondita <= 20) d = Math.min(d, 3.5);
  const obiettivo = attraversa + Math.min(profondita - 4, Math.max(20, 1.2 * attraversa));
  const possibili = LUNGHEZZE.filter(l => l >= min && l <= max);
  if (!possibili.length) return null;
  const l = possibili.reduce((x, y) => (Math.abs(y - obiettivo) < Math.abs(x - obiettivo) ? y : x));
  if (l >= 80 && d < 5) d = 5;
  const fattore = mat.duro ? 0.7 : mat.massello ? 0.5 : 0.6;
  return {
    d, l, misura: `${f1(d)}×${l}`,
    preforo: Math.round(d * fattore * 2) / 2,
    preforoQuando: mat.duro ? 'obbligatorio' : mat.massello ? 'facoltativo' : 'consigliato',
  };
}

// Fissaggi possibili per un'unione "faccia su testa/bordo".
export const FISSAGGI = { viti: 'Viti', confirmat: 'Confirmat 7×50', spinotti: 'Spinotti e colla', eccentrici: 'Eccentrici (minifix)', colla: 'Solo colla', nessuno: 'Niente' };
const PASSO = { viti: 200, confirmat: 200, spinotti: 128, eccentrici: 400 };

function posizioni(l1, tipo = 'viti') {
  if (l1 < 40) return [0];
  if (l1 < 120) return [-l1 / 4, l1 / 4];
  const margine = Math.min(tipo === 'spinotti' ? 32 : 50, l1 / 4), n = Math.max(2, Math.ceil((l1 - 2 * margine) / PASSO[tipo]) + 1);
  return Array.from({ length: n }, (_, i) => -l1 / 2 + margine + (i * (l1 - 2 * margine)) / (n - 1));
}

const distSegmenti = (p1, q1, p2, q2) => {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), b = d1.dot(d2), den = a * e - b * b;
  let s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
  let t = (b * s + f) / e;
  if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
  return p1.clone().add(d1.multiplyScalar(s)).distanceTo(p2.clone().add(d2.multiplyScalar(t)));
};

export const chiaveUnione = (a, b) => [a.id, b.id].sort().join('|');

let ultimo = { k: null, r: null };

// Restituisce { giunti, viti, avvisi }. Ogni giunto: { a, b, tipo, passa, riceve, vite, viti: [...], note, escluso }.
export function unioni(progetto) {
  // Il risultato contiene i pezzi stessi: si riusa solo se è proprio lo stesso progetto con gli stessi dati.
  const k = JSON.stringify([progetto.pezzi, progetto.unioniEscluse, progetto.fissaggi, progetto.fissaggioPredefinito]);
  if (ultimo.k === k && ultimo.progetto === progetto && ultimo.pezzi.every((p, i) => p === progetto.pezzi[i])) return ultimo.r;
  const pezzi = progetto.pezzi.filter(p => geometriaPezzo(p));
  const facce = new Map(pezzi.map(p => [p.id, facceMondo(p)]));
  const box = new Map(pezzi.map(p => {
    const min = new Vector3(Infinity, Infinity, Infinity), max = min.clone().negate();
    for (const f of facce.get(p.id)) for (const t of f.tri) for (const v of t) { min.min(v); max.max(v); }
    return [p.id, { min: min.subScalar(1), max: max.addScalar(1) }];
  }));
  const esclusi = new Set(progetto.unioniEscluse || []);
  const giunti = [];
  for (let i = 0; i < pezzi.length; i++) for (let j = i + 1; j < pezzi.length; j++) {
    const a = pezzi[i], b = pezzi[j], ba = box.get(a.id), bb = box.get(b.id);
    if (ba.max.x < bb.min.x || bb.max.x < ba.min.x || ba.max.y < bb.min.y || bb.max.y < ba.min.y || ba.max.z < bb.min.z || bb.max.z < ba.min.z) continue;
    const c = contatto(a, b, facce.get(a.id), facce.get(b.id));
    if (!c) continue;
    const g = { a, b, chiave: chiaveUnione(a, b), area: c.area, normale: c.n.clone(), viti: [], note: [], escluso: esclusi.has(chiaveUnione(a, b)) };
    giunti.push(g);
    if (haCerniere(a) || haCerniere(b)) { g.tipo = 'cerniere'; g.note.push('Anta con cerniere: niente viti.'); continue; }
    if ((a.mobile || b.mobile) && (a.gruppo || a.id) !== (b.gruppo || b.id)) { g.tipo = 'parte mobile'; g.note.push('Parte mobile (cassetto): niente viti verso il mobile.'); continue; }
    const ca = classifica(a, c.n), cb = classifica(b, c.n.clone().negate());
    let passa, riceve, cp, cr, n;
    if (ca.passa && !cb.passa) [passa, riceve, cp, cr, n] = [a, b, ca, cb, c.n];
    else if (cb.passa && !ca.passa) [passa, riceve, cp, cr, n] = [b, a, cb, ca, c.n.clone().negate()];
    else if (ca.passa && cb.passa) {
      // faccia contro faccia: passa dal pezzo più sottile
      if (ca.profondita <= cb.profondita) [passa, riceve, cp, cr, n] = [a, b, ca, cb, c.n];
      else [passa, riceve, cp, cr, n] = [b, a, cb, ca, c.n.clone().negate()];
    } else {
      g.tipo = 'testa contro testa';
      const r = rettangolo(c.punti);
      g.angolari = r.l1 > 300 ? 3 : 2;
      g.note.push(`Testa contro testa: le viti non tengono. Proposti ${g.angolari} angolari (o spinotti).`);
      continue;
    }
    if ((a.ruolo === 'frontale' && cb.tipo !== 'faccia' && cb.tipo !== 'fianco') || (b.ruolo === 'frontale' && ca.tipo !== 'faccia' && ca.tipo !== 'fianco')) {
      g.tipo = 'appoggio'; g.note.push('Il frontale si avvita dall\'interno del cassone, non qui.'); continue;
    }
    g.tipo = `${cp.tipo} su ${cr.tipo}`;
    g.comePassa = cp.tipo; g.comeRiceve = cr.tipo;
    g.passa = passa; g.riceve = riceve;
    const mr = materiale(riceve.mat), dr = dimensioni(riceve);
    const r = rettangolo(c.punti);
    const bordo = Math.min(r.l2, cr.tipo === 'testa' ? Math.min(dr.W, dr.T) : dr.T);
    if (cp.profondita <= 6) { g.note.push(`Pezzo di ${f1(cp.profondita)} mm: chiodini o graffe ogni 15 cm (e colla).`); g.chiodini = true; continue; }
    if (bordo < 8) { g.note.push(`Bordo di ${f1(bordo)} mm troppo sottile per le viti: chiodini o graffe (e colla).`); g.chiodini = true; continue; }
    const vite = scegliVite(cp.profondita, cr.profondita, bordo, mr, cr.tipo === 'faccia' || cr.tipo === 'fianco');
    if (!vite) { g.note.push('Pezzi troppo sottili per una vite: meglio colla e chiodini o spinotti.'); continue; }
    g.vite = vite;
    if (cr.tipo === 'testa' && mr.massello) g.note.push('Vite in testa al legno massello: tiene poco. Meglio spinotti, tenone o viti più lunghe.');
    if (n.y < -0.7) {
      g.note.push(`Le teste delle viti restano in vista sopra «${passa.nome}»: meglio fissare da sotto con angolari${materiale(passa.mat).massello ? ' o fissaggi a 8 (lasciano muovere il legno)' : ''}.`);
    }
    g.fissaggio = g.escluso ? 'nessuno' : (progetto.fissaggi || {})[g.chiave] || progetto.fissaggioPredefinito || 'viti';
    const tipo = g.fissaggio;
    if (tipo === 'confirmat' && (cp.profondita < 15 || bordo < 15)) { g.note.push('Confirmat solo con pannelli da 15 mm in su: qui uso le viti.'); g.fissaggio = 'viti'; }
    if (tipo === 'eccentrici' && (cr.tipo === 'faccia' || cr.tipo === 'fianco' || bordo < 15)) { g.note.push('Eccentrici solo nella testa o nel bordo di pannelli da 15 mm in su: qui uso le viti.'); g.fissaggio = 'viti'; }
    if (g.fissaggio === 'nessuno' || g.fissaggio === 'colla') { g.escluso = g.fissaggio === 'nessuno'; continue; }
    if (g.fissaggio !== 'viti') g.note = g.note.filter(x => !/in vista/.test(x) || g.fissaggio === 'confirmat');
    const origine = c.n.clone().multiplyScalar(c.d);
    const assiR = new Matrix4().extractRotation(matrice(riceve)), spessoreR = new Vector3(0, 0, 1).applyMatrix4(assiR);
    for (const t of posizioni(r.l1, g.fissaggio)) {
      const s1 = r.c1 + t, s2 = r.c2;
      const x = r.lungo[0] * s1 + r.corto[0] * s2, y = r.lungo[1] * s1 + r.corto[1] * s2;
      const p = origine.clone().add(c.u.clone().multiplyScalar(x)).add(c.v.clone().multiplyScalar(y));
      const testa = p.clone().sub(n.clone().multiplyScalar(cp.profondita));
      const asse = c.u.clone().multiplyScalar(r.lungo[0]).add(c.v.clone().multiplyScalar(r.lungo[1]));
      const el = { tipo: g.fissaggio, d: vite.d, giunto: g, asse, t, limite: r.l1 / 2 - Math.min(20, r.l1 / 4), profPassa: g.fissaggio === 'spinotti' ? Math.min(12, cp.profondita * 0.65) : g.fissaggio === 'eccentrici' ? 11 : cp.profondita };
      if (g.fissaggio === 'viti') Object.assign(el, { testa, punta: testa.clone().add(n.clone().multiplyScalar(vite.l)) });
      else if (g.fissaggio === 'confirmat') Object.assign(el, { d: 7, testa, punta: testa.clone().add(n.clone().multiplyScalar(50)) });
      else if (g.fissaggio === 'spinotti') {
        const d = cp.profondita >= 16 && bordo >= 16 ? 8 : 6;
        Object.assign(el, { d, testa: p.clone().sub(n.clone().multiplyScalar(Math.min(12, cp.profondita * 0.65))), punta: p.clone().add(n.clone().multiplyScalar(Math.min(d === 8 ? 23 : 18, cr.profondita - 5))) });
      } else if (g.fissaggio === 'eccentrici') {
        // perno avvitato nel pezzo "di faccia", eccentrico Ø 15 nella faccia del pezzo che riceve, a 34 mm dal bordo
        const c34 = p.clone().add(n.clone().multiplyScalar(34)), mezzo = dimensioni(riceve).T / 2;
        const sopra = spessoreR.clone().multiplyScalar(mezzo);
        Object.assign(el, { d: 6, testa: p.clone().sub(n.clone().multiplyScalar(11)), punta: c34, camma: { da: c34.clone().add(sopra), a: c34.clone().add(sopra).sub(spessoreR.clone().multiplyScalar(12.5)) } });
      }
      g.viti.push(el);
    }
  }

  // Viti che si incontrano negli angoli: si spostano lungo la loro unione (verso il centro) finché c'è posto.
  const messe = [];
  const urta = v => messe.some(x => x.giunto !== v.giunto && distSegmenti(x.testa, x.punta, v.testa, v.punta) < (x.d + v.d) / 2 + 3);
  for (const g of giunti) {
    g.viti = g.viti.filter(v => {
      for (const passo of [0, 12, 24, 36, 48]) {
        const verso = v.t > 0 ? -1 : 1, nuovo = v.t + verso * passo;
        if (passo && Math.abs(nuovo) > v.limite + 1e-6 && passo > Math.abs(v.t)) break;
        if (passo) { const d = v.asse.clone().multiplyScalar(verso * (passo - (v.spostata || 0))); v.testa.add(d); v.punta.add(d); if (v.camma) { v.camma.da.add(d); v.camma.a.add(d); } v.spostata = passo; }
        if (!urta(v)) { messe.push(v); return true; }
      }
      // non c'è posto: si toglie, se ne restano altre nell'unione
      return g.viti.length <= 1 ? (messe.push(v), true) : false;
    });
    if (g.viti.some(v => v.spostata)) g.note.push('Alcune viti sono spostate per non incontrare quelle dell\'unione vicina.');
  }

  // Collisioni rimaste: viti tra loro, viti contro scodelle e fori delle maniglie.
  const viti = giunti.flatMap(g => g.viti), avvisi = [], errate = new Set();
  for (let i = 0; i < viti.length; i++) for (let j = i + 1; j < viti.length; j++) {
    const x = viti[i], y = viti[j];
    if (x.giunto === y.giunto) continue;
    if (distSegmenti(x.testa, x.punta, y.testa, y.punta) < (x.d + y.d) / 2 + 3) {
      errate.add(x); errate.add(y);
      const msg = `Due viti si incontrano: «${x.giunto.passa.nome}» → «${x.giunto.riceve.nome}» e «${y.giunto.passa.nome}» → «${y.giunto.riceve.nome}».`;
      if (!avvisi.includes(msg)) avvisi.push(msg);
    }
  }
  for (const p of pezzi) {
    const m = matrice(p), fori = [...(cerniere(p)?.fori || []), ...(maniglia(p)?.fori || [])];
    for (const f of fori) {
      const c = new Vector3(f.c[0], f.c[1], (f.z0 + f.z1) / 2).applyMatrix4(m);
      for (const v of viti) if (distSegmenti(v.testa, v.punta, c, c) < f.r + v.d / 2 + 2) {
        errate.add(v);
        const msg = `Una vite di «${v.giunto.passa.nome}» finisce contro ${f.nome} di «${p.nome}».`;
        if (!avvisi.includes(msg)) avvisi.push(msg);
      }
    }
  }
  ultimo = { k, progetto, pezzi: progetto.pezzi.slice(), r: { giunti, viti, avvisi, errate } };
  return ultimo.r;
}

export function descriviGiunto(g) {
  if (g.tipo === 'cerniere') return 'anta con cerniere';
  if (g.tipo === 'parte mobile') return 'parte mobile, niente viti';
  if (g.angolari) return `${g.angolari} angolari`;
  if (g.chiodini) return 'chiodini o graffe';
  if (!g.vite) return 'nessuna vite adatta';
  const v = g.vite, n = g.viti.length;
  if (g.escluso) return 'nessun fissaggio';
  if (g.fissaggio === 'colla') return 'solo colla (e morsetti)';
  if (g.fissaggio === 'confirmat') return `${n} confirmat 7×50 da «${g.passa.nome}» · foro a gradino Ø 7 / Ø 5`;
  if (g.fissaggio === 'spinotti') return `${n} spinotti Ø ${g.viti[0]?.d || 8} e colla · fori ciechi, interasse ≤ 128`;
  if (g.fissaggio === 'eccentrici') return `${n} eccentrici Ø 15 con perno · eccentrico in «${g.riceve.nome}» a 34 mm dal bordo`;
  return `${n} viti ${f1(v.d)}×${v.l} da «${g.passa.nome}» · preforo Ø ${f1(v.preforo)} ${v.preforoQuando}`;
}
