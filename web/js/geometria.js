// Geometria dei pezzi con Manifold: profilo (anche con archi) estruso nello spessore, poi i tagli.
// Le curve sono salvate esatte nel modello (raggio, diametro); qui vengono solo approssimate per il disegno.
import Module from '../vendor/manifold.js';
import { BufferGeometry, Float32BufferAttribute, EdgesGeometry } from '../vendor/three.module.js';
import { dimensioni } from './modello.js';
import { foriPezzo } from './ferramenta.js';

let M = null;
export const moduloManifold = () => M;

export async function avviaGeometria() {
  if (M) return;
  const wasm = await Module();
  wasm.setup();
  M = wasm;
}

const segmentiArco = (r, angolo) => Math.max(3, Math.min(48, Math.ceil(Math.sqrt(r) * angolo / (Math.PI / 2) * 1.6)));

// Punti intermedi di un arco da a a b con freccia h (h > 0: la curva sporge a destra del verso a → b,
// cioè verso l'esterno se i punti girano in senso antiorario).
export function puntiArco(a, b, h) {
  const dx = b[0] - a[0], dy = b[1] - a[1], c = Math.hypot(dx, dy);
  if (Math.abs(h) < 0.05 || c < 0.01) return [];
  const nx = dy / c, ny = -dx / c, R = (c * c / 4 + h * h) / (2 * Math.abs(h));
  const picco = [(a[0] + b[0]) / 2 + nx * h, (a[1] + b[1]) / 2 + ny * h];
  const cx = picco[0] - nx * Math.sign(h) * R, cy = picco[1] - ny * Math.sign(h) * R;
  const ang = q => Math.atan2(q[1] - cy, q[0] - cx);
  const a0 = ang(a);
  let meta = ang(picco) - a0;
  while (meta > Math.PI) meta -= 2 * Math.PI;
  while (meta <= -Math.PI) meta += 2 * Math.PI;
  const tot = 2 * meta, n = Math.max(4, Math.min(64, Math.ceil(Math.abs(tot) * R / 6)));
  return Array.from({ length: n - 1 }, (_, i) => { const t = a0 + tot * (i + 1) / n; return [cx + R * Math.cos(t), cy + R * Math.sin(t)]; });
}

export function contornoSagoma(punti) {
  const out = [];
  punti.forEach((q, i) => { const b = punti[(i + 1) % punti.length]; out.push([q.x, q.y], ...puntiArco([q.x, q.y], [b.x, b.y], q.b || 0)); });
  return out;
}

export function profilo(p) {
  const { L, W } = dimensioni(p);
  if (p.tipo !== 'listello' && p.forma === 'sagoma' && p.sagoma?.length >= 3) return contornoSagoma(p.sagoma);
  if (p.tipo !== 'listello' && p.forma === 'cerchio') {
    // n multiplo di 4: i punti a 0°, 90°, 180°, 270° cadono sul cerchio vero, così le misure restano esatte.
    const r = p.D / 2, n = 4 * Math.max(12, Math.min(40, Math.round(p.D / 48)));
    return Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI; return [r + r * Math.cos(a), r + r * Math.sin(a)]; });
  }
  return rettangoloArrotondato(L, W, p.tipo === 'listello' ? 0 : (p.r || 0));
}

// Rettangolo da (0, 0) a (L, W) con gli angoli di raggio r, in senso antiorario.
function rettangoloArrotondato(L, W, r0) {
  const r = Math.max(0, Math.min(r0, Math.min(L, W) / 2 - 0.01));
  if (r < 0.5) return [[0, 0], [L, 0], [L, W], [0, W]];
  const pts = [], k = segmentiArco(r, Math.PI / 2);
  const angolo = (cx, cy, a0) => { for (let i = 0; i <= k; i++) { const a = a0 + (i / k) * Math.PI / 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  angolo(L - r, r, -Math.PI / 2);
  angolo(L - r, W - r, 0);
  angolo(r, W - r, Math.PI / 2);
  angolo(r, r, Math.PI);
  return pts;
}

// ---------- Disegno 2D (forma 'disegno') ----------
// p.disegno.forme: forme con centro (cx, cy), misure w × h, rotazione rot (gradi, antioraria) e tipo:
// 'rett' (raggio degli angoli r), 'ellisse', 'poligono' (lati, inscritto nell'ellisse w × h, un vertice in alto),
// 'linea' (punti { x, y, b } rispetto al centro, chiusa, b = freccia dell'arco come nelle sagome).
// modo 'pieno' o 'vuoto'; un vuoto con prof > 0 è uno scasso profondo prof (da sopra, o da sotto se lato 'sotto').
// Il pezzo = unione dei pieni meno i vuoti passanti, estruso nello spessore, meno gli scassi.
export function contornoForma(f) {
  const w = Math.max(0.1, f.w), h = Math.max(0.1, f.h);
  let pts;
  if (f.tipo === 'ellisse') {
    const n = 4 * Math.max(8, Math.min(32, Math.round((w + h) / 40)));
    pts = Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI; return [w / 2 * Math.cos(a), h / 2 * Math.sin(a)]; });
  } else if (f.tipo === 'poligono') {
    const n = Math.max(3, Math.min(64, Math.round(f.lati || 6)));
    pts = Array.from({ length: n }, (_, i) => { const a = Math.PI / 2 + (i / n) * 2 * Math.PI; return [w / 2 * Math.cos(a), h / 2 * Math.sin(a)]; });
  } else if (f.tipo === 'linea' && f.punti?.length >= 3) pts = contornoSagoma(f.punti);
  else pts = rettangoloArrotondato(w, h, f.r || 0).map(([x, y]) => [x - w / 2, y - h / 2]);
  const a = (f.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [f.cx + x * c - y * s, f.cy + x * s + y * c]);
}

const unione = lista => {
  if (!lista.length) return null;
  const u = M.CrossSection.union(lista);
  lista.forEach(x => x.delete());
  return u;
};

// { base: CrossSection (pieni meno vuoti passanti, o null), scassi: [{ cs, prof, lato }] }. Da liberare con delete().
export function sezioniDisegno(dis) {
  const forme = dis?.forme || [], cs = f => new M.CrossSection([contornoForma(f)], 'NonZero');
  let base = unione(forme.filter(f => f.modo !== 'vuoto').map(cs));
  const passanti = unione(forme.filter(f => f.modo === 'vuoto' && !(f.prof > 0)).map(cs));
  if (base && passanti) { const b = base.subtract(passanti); base.delete(); base = b; }
  passanti?.delete();
  const gruppi = new Map();
  for (const f of forme.filter(x => x.modo === 'vuoto' && x.prof > 0)) {
    const k = `${f.prof}|${f.lato === 'sotto' ? 'sotto' : 'sopra'}`;
    if (!gruppi.has(k)) gruppi.set(k, []);
    gruppi.get(k).push(cs(f));
  }
  const scassi = [...gruppi].map(([k, l]) => { const [prof, lato] = k.split('|'); return { cs: unione(l), prof: +prof, lato }; });
  return { base, scassi };
}

// Ingombro dei pieni (meno i vuoti passanti) di un disegno: { min: [x, y], max: [x, y] } o null se vuoto.
export function ingombroDisegno(dis) {
  const { base, scassi } = sezioniDisegno(dis);
  scassi.forEach(s => s.cs.delete());
  if (!base) return null;
  const vuoto = !base.toPolygons().length, b = base.bounds();
  base.delete();
  return vuoto ? null : b;
}

// Contorni del risultato (esterni e fori) per il disegno 2D: { pieno: [[x, y]...][], scassi: [{ prof, lato, poli }] }.
export function poligoniDisegno(dis) {
  const { base, scassi } = sezioniDisegno(dis);
  const r = { pieno: base ? base.toPolygons() : [], scassi: scassi.map(s => ({ prof: s.prof, lato: s.lato, poli: s.cs.toPolygons() })) };
  base?.delete();
  scassi.forEach(s => s.cs.delete());
  return r;
}

const cache = new Map();
export const chiave = p => JSON.stringify([p.tipo, p.mat, dimensioni(p), p.forma, p.L, p.W, p.D, p.r, p.forma === 'sagoma' ? p.sagoma : p.forma === 'disegno' ? p.disegno : 0, p.tagli.map(t => [t.n, t.d]), foriPezzo(p)]);

// Restituisce { geometria, bordi, min, max, vertici } nel sistema locale del pezzo, o null se i tagli
// hanno tolto tutto.
export function geometriaPezzo(p) {
  const k = chiave(p);
  if (cache.has(k)) return cache.get(k);
  const { T } = dimensioni(p);
  const disegno = p.tipo === 'pannello' && p.forma === 'disegno' && p.disegno?.forme?.length;
  const { base: sezione, scassi } = disegno ? sezioniDisegno(p.disegno) : { base: new M.CrossSection([profilo(p)]), scassi: [] };
  if (!sezione) { scassi.forEach(x => x.cs.delete()); cache.set(k, null); return null; }
  let solido = sezione.extrude(T);
  sezione.delete();
  for (const s of scassi) {
    const prof = Math.min(s.prof, T), cavo = s.cs.extrude(prof + 1).translate([0, 0, s.lato === 'sotto' ? -1 : T - prof]);
    const r = solido.subtract(cavo);
    cavo.delete(); s.cs.delete(); solido.delete();
    solido = r;
  }
  for (const t of p.tagli) {
    const s = solido.trimByPlane(t.n, t.d);
    solido.delete();
    solido = s;
  }
  for (const f of foriPezzo(p)) {
    const cil = M.Manifold.cylinder(f.z1 - f.z0, f.r, f.r, 32).translate([f.c[0], f.c[1], f.z0]);
    const s = solido.subtract(cil);
    cil.delete(); solido.delete();
    solido = s;
  }
  let risultato = null;
  if (!solido.isEmpty()) {
    const mesh = solido.getMesh();
    const np = mesh.numProp, vp = mesh.vertProperties, tv = mesh.triVerts;
    const pos = new Float32Array(tv.length * 3);
    for (let i = 0; i < tv.length; i++) {
      pos[i * 3] = vp[tv[i] * np]; pos[i * 3 + 1] = vp[tv[i] * np + 1]; pos[i * 3 + 2] = vp[tv[i] * np + 2];
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const bb = solido.boundingBox();
    const vertici = [];
    for (let i = 0; i < vp.length; i += np) vertici.push([vp[i], vp[i + 1], vp[i + 2]]);
    // baricentro del solido (somma dei tetraedri con l'origine)
    let vol = 0, cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < pos.length; i += 9) {
      const [ax, ay, az, bx, by, bz, qx, qy, qz] = pos.subarray(i, i + 9);
      const v = (ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx)) / 6;
      vol += v; cx += v * (ax + bx + qx) / 4; cy += v * (ay + by + qy) / 4; cz += v * (az + bz + qz) / 4;
    }
    const centro = vol ? [cx / vol, cy / vol, cz / vol] : [0, 0, 0];
    risultato = { geometria: g, bordi: new EdgesGeometry(g, 25), min: bb.min, max: bb.max, vertici, volume: solido.volume(), centro, solido };
  }
  if (!risultato) solido.delete();
  if (cache.size > 400) {
    const [vecchia] = cache.keys();
    const v = cache.get(vecchia);
    if (v) { v.geometria.dispose(); v.bordi.dispose(); v.solido.delete(); }
    cache.delete(vecchia);
  }
  cache.set(k, risultato);
  return risultato;
}

// Volume (mm³) della parte comune tra due pezzi, già messi al loro posto (matrici three.js).
export function volumeComune(ga, ma, gb, mb) {
  const a = ga.solido.transform(ma.elements), b = gb.solido.transform(mb.elements), c = a.intersect(b);
  const v = c.volume();
  a.delete(); b.delete(); c.delete();
  return v;
}

// Contorno del pezzo visto di faccia (sezione a metà spessore, quindi con tagli e fori passanti), nel suo sistema locale.
export function sezionePezzo(p, z) {
  const g = geometriaPezzo(p);
  if (!g) return [];
  const cs = g.solido.slice(z ?? (g.max[2] + g.min[2]) / 2), poli = cs.toPolygons();
  cs.delete();
  return poli;
}
