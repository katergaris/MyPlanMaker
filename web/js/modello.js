// Modello del progetto: pezzi, orientamento, comandi Accosta e Adatta, descrizione dei tagli.
// Unità: millimetri. Assi del mondo: X verso destra, Y in alto, Z verso chi guarda.
// Rotazioni in gradi, applicate in quest'ordine sugli assi del mondo: prima X (inclina avanti/indietro),
// poi Y (gira in pianta), poi Z (inclina di lato). In three.js è l'ordine Euler 'ZYX'.
// Ogni pezzo ha un sistema locale: lunghezza lungo x (0..L), larghezza lungo y (0..W), spessore lungo z (0..T).
// I tagli sono semipiani nel sistema locale: si tiene la parte dove n·x >= d.
import { Euler, Matrix4, Vector3 } from '../vendor/three.module.js';
import { materiale } from './materiali.js';

const RAD = Math.PI / 180;

export function nuovoProgetto(nome = 'Nuovo progetto') {
  return { versione: 1, nome, pezzi: [], prossimoN: 1 };
}

export function nuovoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function dimensioni(p) {
  const m = materiale(p.mat);
  if (p.tipo === 'listello') return { L: p.L, W: m.W, T: m.T };
  if (p.forma === 'cerchio') return { L: p.D, W: p.D, T: m.T };
  return { L: p.L, W: p.W, T: m.T };
}

export function matrice(p) {
  const e = new Euler(p.rot[0] * RAD, p.rot[1] * RAD, p.rot[2] * RAD, 'ZYX');
  return new Matrix4().makeRotationFromEuler(e).setPosition(p.pos[0], p.pos[1], p.pos[2]);
}

// Orientamenti rapidi, come rotazioni semplici (ordine X, Y, Z). Tra parentesi dove vanno
// lunghezza, larghezza e spessore del pezzo.
const ORIENTAMENTI = {
  orizzontale: [-90, 0, 0], // ripiano, piano, fondo (L → X, W → verso il fondo, T → in alto)
  fianco: [-90, 0, 90],     // fianco di un mobile (L → in alto, W → verso il fondo, T → verso sinistra)
  frontale: [0, 0, 0],      // anta, fascia (L → X, W → in alto, T → verso di te)
  verticale: [0, 0, 90],    // gamba, montante, schienale (L → in alto, W → verso sinistra, T → verso di te)
  profondita: [0, 90, 0],   // traverso verso il fondo (L → verso il fondo, W → in alto, T → verso destra)
};
export const NOMI_ORIENTAMENTI = { orizzontale: 'Orizzontale', fianco: 'Di fianco', frontale: 'Di fronte', verticale: 'In piedi', profondita: 'In profondità' };

export const rotazioneDa = nome => [...ORIENTAMENTI[nome]];

const pulisci = v => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? 0 : r; };

export function nuovoPezzo(progetto, tipo, vicinoA) {
  const p = tipo === 'listello'
    ? { tipo, mat: 'ab4545', forma: 'rett', L: 700, rot: rotazioneDa('verticale') }
    : { tipo, mat: 'mb18', forma: 'rett', L: 800, W: 400, D: 800, r: 0, rot: rotazioneDa('orizzontale') };
  p.id = nuovoId();
  p.n = progetto.prossimoN++;
  p.nome = `${tipo === 'listello' ? 'Listello' : 'Pannello'} ${p.n}`;
  p.tagli = [];
  // Orizzontale: la larghezza va verso il fondo (-Z), così il bordo davanti resta su z = 0.
  p.pos = [0, 0, 0];
  if (vicinoA) p.pos[0] = Math.round(ingombro(vicinoA).max.x + 100);
  progetto.pezzi.push(p);
  return p;
}

export function duplica(progetto, p) {
  const c = structuredClone(p);
  c.id = nuovoId();
  c.n = progetto.prossimoN++;
  c.nome = p.nome.replace(/\s\d+$/, '') + ' ' + c.n;
  const b = ingombro(p);
  c.pos = [p.pos[0] + (b.max.x - b.min.x) + 50, p.pos[1], p.pos[2]];
  c.tagli = c.tagli.map(t => ({ ...t, da: null }));
  progetto.pezzi.push(c);
  return c;
}

// Spigoli del parallelepipedo del pezzo, nel mondo.
export function spigoli(p) {
  const { L, W, T } = dimensioni(p), m = matrice(p), out = [];
  for (const x of [0, L]) for (const y of [0, W]) for (const z of [0, T]) out.push(new Vector3(x, y, z).applyMatrix4(m));
  return out;
}

export function ingombro(p, vertici) {
  const pts = vertici || spigoli(p);
  const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const v of pts) { min.min(v); max.max(v); }
  return { min, max };
}

// Le 6 facce del pezzo nel mondo: normale uscente e un punto.
function facce(p) {
  const { L, W, T } = dimensioni(p), m = matrice(p), r = new Matrix4().extractRotation(m);
  const lista = [
    [[-1, 0, 0], [0, 0, 0]], [[1, 0, 0], [L, 0, 0]],
    [[0, -1, 0], [0, 0, 0]], [[0, 1, 0], [0, W, 0]],
    [[0, 0, -1], [0, 0, 0]], [[0, 0, 1], [0, 0, T]],
  ];
  return lista.map(([n, q]) => ({ n: new Vector3(...n).applyMatrix4(r).normalize(), p: new Vector3(...q).applyMatrix4(m) }));
}

// Accosta: sposta il pezzo lungo la normale della faccia toccata finché la tocca, senza ruotarlo.
// vertici = vertici reali del pezzo (con i tagli), se disponibili.
export function accosta(p, faccia, vertici) {
  const n = faccia.normale.clone().normalize();
  const pts = vertici || spigoli(p);
  let min = Infinity;
  for (const v of pts) min = Math.min(min, v.clone().sub(faccia.punto).dot(n));
  const s = -min;
  p.pos = p.pos.map((c, i) => pulisci(c + n.getComponent(i) * s));
  return s;
}

// Adatta: allunga o accorcia il pezzo A lungo la sua lunghezza fino alla faccia giusta di B e la taglia con
// l'angolo di quella faccia. Restituisce { ok, msg }.
export function adatta(a, b) {
  const ma = matrice(a), ra = new Matrix4().extractRotation(ma);
  const asse = new Vector3(1, 0, 0).applyMatrix4(ra).normalize();
  const { L, W, T } = dimensioni(a);
  const centro = new Vector3(L / 2, W / 2, T / 2).applyMatrix4(ma);

  let scelta = null;
  for (const f of facce(b)) {
    const s = centro.clone().sub(f.p).dot(f.n);
    if (s <= 0) continue;
    const allineo = Math.abs(asse.dot(f.n));
    if (!scelta || allineo > scelta.allineo + 1e-6 || (Math.abs(allineo - scelta.allineo) <= 1e-6 && s < scelta.s)) {
      scelta = { ...f, s, allineo };
    }
  }
  if (!scelta || scelta.allineo < 0.05) {
    return { ok: false, msg: 'I due pezzi sono paralleli: qui serve Accosta, non Adatta.' };
  }
  const { n, p } = scelta;
  const versoFine = asse.dot(n) < 0;          // la testa x = L guarda verso B
  const e = versoFine ? asse.clone() : asse.clone().negate();
  const xTesta = versoFine ? L : 0;
  let delta = -Infinity;
  for (const y of [0, W]) for (const z of [0, T]) {
    const c = new Vector3(xTesta, y, z).applyMatrix4(ma);
    delta = Math.max(delta, -c.clone().sub(p).dot(n) / e.dot(n));
  }
  // Allunga solo se serve: se il pezzo entra già in B basta il taglio.
  a.tagli = a.tagli.filter(t => t.da !== b.id);
  if (delta > 0.01) {
    const allunga = Math.ceil(delta);
    if (a.forma === 'cerchio') return { ok: false, msg: 'Un pezzo rotondo non si allunga: avvicinalo prima.' };
    a.L = a.L + allunga;
    if (!versoFine) {
      a.pos = a.pos.map((c, i) => pulisci(c - asse.getComponent(i) * allunga));
      a.tagli = a.tagli.map(t => ({ ...t, d: t.d + t.n[0] * allunga }));
    }
  }
  const m2 = matrice(a), inv = new Matrix4().extractRotation(m2).transpose();
  const nl = n.clone().applyMatrix4(inv).normalize();
  const pos = new Vector3(...a.pos);
  const d = p.clone().sub(pos).dot(n);
  a.tagli.push({ n: [nl.x, nl.y, nl.z].map(v => Math.round(v * 1e9) / 1e9), d: Math.round(d * 1e6) / 1e6, da: b.id });
  return { ok: true, msg: descriviTaglio(a.tagli.at(-1)) };
}

export const fmt = (v, dec = 0) => Number(v).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: dec });

// Descrizione del taglio come la serve in laboratorio.
export function descriviTaglio(t) {
  const [nx, ny, nz] = t.n.map(Math.abs);
  const deg = (a, b) => Math.atan2(a, b) / RAD;
  const parti = [];
  let dove;
  if (nx >= ny && nx >= nz) {
    dove = t.n[0] < 0 ? 'Testa B' : 'Testa A';
    const obl = deg(ny, nx), lama = deg(nz, nx);
    if (obl > 0.05) parti.push(`obliquo ${fmt(obl, 1)}°`);
    if (lama > 0.05) parti.push(`lama inclinata ${fmt(lama, 1)}°`);
  } else if (ny >= nz) {
    dove = 'Bordo';
    const obl = deg(nx, ny), lama = deg(nz, ny);
    if (obl > 0.05) parti.push(`obliquo ${fmt(obl, 1)}°`);
    if (lama > 0.05) parti.push(`lama inclinata ${fmt(lama, 1)}°`);
  } else {
    dove = 'Faccia';
    parti.push(`inclinata ${fmt(deg(Math.hypot(nx, ny), nz), 1)}°`);
  }
  return `${dove}: ${parti.length ? parti.join(', ') : 'a squadra'}`;
}

// Storico per Annulla/Ripeti.
export class Storico {
  constructor() { this.indietro = []; this.avanti = []; }
  salva(stato) { this.indietro.push(JSON.stringify(stato)); if (this.indietro.length > 200) this.indietro.shift(); this.avanti = []; }
  annulla(stato) { if (!this.indietro.length) return null; this.avanti.push(JSON.stringify(stato)); return JSON.parse(this.indietro.pop()); }
  ripeti(stato) { if (!this.avanti.length) return null; this.indietro.push(JSON.stringify(stato)); return JSON.parse(this.avanti.pop()); }
}
