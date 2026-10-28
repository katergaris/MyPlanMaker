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

export function profilo(p) {
  const { L, W } = dimensioni(p);
  if (p.tipo !== 'listello' && p.forma === 'cerchio') {
    // n multiplo di 4: i punti a 0°, 90°, 180°, 270° cadono sul cerchio vero, così le misure restano esatte.
    const r = p.D / 2, n = 4 * Math.max(12, Math.min(40, Math.round(p.D / 48)));
    return Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI; return [r + r * Math.cos(a), r + r * Math.sin(a)]; });
  }
  const r = Math.max(0, Math.min(p.tipo === 'listello' ? 0 : (p.r || 0), Math.min(L, W) / 2 - 0.01));
  if (r < 0.5) return [[0, 0], [L, 0], [L, W], [0, W]];
  const pts = [], k = segmentiArco(r, Math.PI / 2);
  const angolo = (cx, cy, a0) => { for (let i = 0; i <= k; i++) { const a = a0 + (i / k) * Math.PI / 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  angolo(L - r, r, -Math.PI / 2);
  angolo(L - r, W - r, 0);
  angolo(r, W - r, Math.PI / 2);
  angolo(r, r, Math.PI);
  return pts;
}

const cache = new Map();
export const chiave = p => JSON.stringify([p.tipo, p.mat, p.forma, p.L, p.W, p.D, p.r, p.tagli.map(t => [t.n, t.d]), foriPezzo(p)]);

// Restituisce { geometria, bordi, min, max, vertici } nel sistema locale del pezzo, o null se i tagli
// hanno tolto tutto.
export function geometriaPezzo(p) {
  const k = chiave(p);
  if (cache.has(k)) return cache.get(k);
  const { T } = dimensioni(p);
  const sezione = new M.CrossSection([profilo(p)]);
  let solido = sezione.extrude(T);
  sezione.delete();
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
