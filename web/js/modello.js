// Modello del progetto: pezzi, orientamento, comandi Accosta e Adatta, descrizione dei tagli.
// Unità: millimetri. Assi del mondo: X verso destra, Y in alto, Z verso chi guarda.
// Rotazioni in gradi, applicate in quest'ordine sugli assi del mondo: prima X (inclina avanti/indietro),
// poi Y (gira in pianta), poi Z (inclina di lato). In three.js è l'ordine Euler 'ZYX'.
// Ogni pezzo ha un sistema locale: lunghezza lungo x (0..L), larghezza lungo y (0..W), spessore lungo z (0..T).
// I tagli sono semipiani nel sistema locale: si tiene la parte dove n·x >= d.
import { Euler, Matrix4, Quaternion, Vector3 } from '../vendor/three.module.js';
import { materialePezzo } from './materiali.js';
import { lingua, t, tr } from './lingua.js';

const RAD = Math.PI / 180;

export function nuovoProgetto(nome = t('Nuovo progetto')) {
  return { versione: 1, nome, pezzi: [], prossimoN: 1 };
}

export function nuovoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function dimensioni(p) {
  const m = materialePezzo(p);
  if (p.tipo === 'listello') return { L: p.L, W: m.W, T: m.T };
  if (p.forma === 'cerchio') return { L: p.D, W: p.D, T: m.T };
  if (p.forma === 'sagoma' && p.sagoma?.length) return { L: p.L, W: p.W, T: m.T }; // L e W = ingombro della sagoma (archi compresi)
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
export const NOMI_ORIENTAMENTI = { orizzontale: tr('Orizzontale'), fianco: tr('Di fianco'), frontale: tr('Di fronte'), verticale: tr('In piedi'), profondita: tr('In profondità') };

export const rotazioneDa = nome => [...ORIENTAMENTI[nome]];

const pulisci = v => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? 0 : r; };

export function nuovoPezzo(progetto, tipo, vicinoA) {
  const p = tipo === 'listello'
    ? { tipo, mat: 'ab4545', forma: 'rett', L: 700, rot: rotazioneDa('verticale') }
    : { tipo, mat: 'mb18', forma: 'rett', L: 800, W: 400, D: 800, r: 0, rot: rotazioneDa('orizzontale') };
  p.id = nuovoId();
  p.n = progetto.prossimoN++;
  p.nome = `${t(tipo === 'listello' ? 'Listello' : 'Pannello')} ${p.n}`;
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

// Accosta faccia contro faccia: fa = faccia scelta sul pezzo da muovere (o null), fb = faccia dell'altro pezzo,
// entrambe { normale, punto } nel mondo. Con fa il pezzo prima gira finché le due facce si guardano. Poi il centro
// del pezzo va sul punto toccato su fb (spostandosi solo lungo la faccia) e il punto più arretrato dei vertici
// (anche di più pezzi che si muovono insieme) tocca esattamente il piano di fb.
// Restituisce { delta: Matrix4 da applicare con trasforma, ruotato: gradi }.
export function deltaAccosta(fa, fb, vertici) {
  const nb = fb.normale.clone().normalize(), delta = new Matrix4();
  let ruotato = 0;
  if (fa) {
    const na = fa.normale.clone().normalize(), voluto = nb.clone().negate();
    ruotato = na.angleTo(voluto) / RAD;
    if (ruotato > 0.01) {
      const perno = fa.punto;
      delta.makeTranslation(perno.x, perno.y, perno.z)
        .multiply(new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromUnitVectors(na, voluto)))
        .multiply(new Matrix4().makeTranslation(-perno.x, -perno.y, -perno.z));
    } else ruotato = 0;
  }
  const lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const v of vertici) { const w = v.clone().applyMatrix4(delta); lo.min(w); hi.max(w); }
  const d = fb.punto.clone().sub(lo.add(hi).multiplyScalar(0.5));
  d.sub(nb.clone().multiplyScalar(d.dot(nb)));
  delta.premultiply(new Matrix4().makeTranslation(d.x, d.y, d.z));
  let min = Infinity;
  for (const v of vertici) min = Math.min(min, v.clone().applyMatrix4(delta).sub(fb.punto).dot(nb));
  delta.premultiply(new Matrix4().makeTranslation(-nb.x * min, -nb.y * min, -nb.z * min));
  return { delta, ruotato };
}

// Distanza (lungo n) tra il piano per `punto` e il vertice più arretrato: 0 = appoggiato.
export function distanzaDaFaccia(vertici, punto, n) {
  let min = Infinity;
  for (const v of vertici) min = Math.min(min, v.clone().sub(punto).dot(n));
  return min;
}

// Adatta: allunga o accorcia il pezzo A fino a una faccia di B e lo taglia con l'angolo di quella faccia.
// opz.faccia = faccia di B toccata { normale, punto } (senza: la faccia di B più adatta); opz.asse = 'x' (lunghezza)
// o 'y' (larghezza, solo pannelli rettangolari), scelto toccando la testa o il bordo di A (senza: quello che punta
// di più verso la faccia). Funziona con il pezzo ruotato in qualunque modo. Restituisce { ok, msg }.
export function adatta(a, b, opz = {}) {
  const ma = matrice(a), ra = new Matrix4().extractRotation(ma);
  const { L, W, T } = dimensioni(a);
  const centro = new Vector3(L / 2, W / 2, T / 2).applyMatrix4(ma);
  const allungabile = a.tipo === 'pannello' && a.forma !== 'cerchio' && a.forma !== 'sagoma' && a.forma !== 'disegno';
  const assi = opz.asse ? [opz.asse] : allungabile ? ['x', 'y'] : ['x'];
  const versore = k => new Vector3(k === 'x' ? 1 : 0, k === 'y' ? 1 : 0, 0).applyMatrix4(ra).normalize();

  let scelta = null;
  const candidate = opz.faccia ? [{ n: opz.faccia.normale.clone().normalize(), p: opz.faccia.punto.clone() }] : facce(b);
  for (const f of candidate) {
    const s = centro.clone().sub(f.p).dot(f.n);
    if (s <= 0 && !opz.faccia) continue;
    for (const k of assi) {
      const allineo = Math.abs(versore(k).dot(f.n));
      if (!scelta || allineo > scelta.allineo + 1e-6 || (Math.abs(allineo - scelta.allineo) <= 1e-6 && s < scelta.s)) scelta = { ...f, s, allineo, k };
    }
  }
  if (!scelta || scelta.allineo < 0.05) {
    return { ok: false, msg: opz.asse ? t(opz.asse === 'x' ? "La lunghezza del pezzo corre parallela a quella faccia: tocca un'altra testa o un altro bordo, oppure usa Accosta." : "La larghezza del pezzo corre parallela a quella faccia: tocca un'altra testa o un altro bordo, oppure usa Accosta.") : t('I due pezzi sono paralleli: qui serve Accosta, non Adatta.') };
  }
  const { n, p, k } = scelta, i = k === 'x' ? 0 : 1, D = k === 'x' ? L : W, asse = versore(k);
  if (k === 'y' && !allungabile) return { ok: false, msg: t('Questo pezzo si allunga solo in lunghezza.') };
  const versoFine = asse.dot(n) < 0;          // la testa (o il bordo) a coordinata D guarda verso B
  const e = versoFine ? asse.clone() : asse.clone().negate();
  const xTesta = versoFine ? D : 0, altro = k === 'x' ? W : L;
  let delta = -Infinity;
  for (const u of [0, altro]) for (const z of [0, T]) {
    const c = (k === 'x' ? new Vector3(xTesta, u, z) : new Vector3(u, xTesta, z)).applyMatrix4(ma);
    delta = Math.max(delta, -c.clone().sub(p).dot(n) / e.dot(n));
  }
  // Allunga solo se serve: se il pezzo entra già in B basta il taglio.
  a.tagli = a.tagli.filter(t => t.da !== b.id);
  if (delta > 0.01) {
    const allunga = Math.ceil(delta);
    if (a.forma === 'cerchio') return { ok: false, msg: t('Un pezzo rotondo non si allunga: avvicinalo prima.') };
    if (a.forma === 'sagoma' || a.forma === 'disegno') return { ok: false, msg: t('Un pezzo sagomato o disegnato non si allunga: avvicinalo prima.') };
    if (k === 'x') a.L = a.L + allunga; else a.W = a.W + allunga;
    if (!versoFine) {
      a.pos = a.pos.map((c, j) => pulisci(c - asse.getComponent(j) * allunga));
      a.tagli = a.tagli.map(t => ({ ...t, d: t.d + t.n[i] * allunga }));
    }
  }
  const m2 = matrice(a), inv = new Matrix4().extractRotation(m2).transpose();
  const nl = n.clone().applyMatrix4(inv).normalize();
  const pos = new Vector3(...a.pos);
  const d = p.clone().sub(pos).dot(n);
  a.tagli.push({ n: [nl.x, nl.y, nl.z].map(v => Math.round(v * 1e9) / 1e9), d: Math.round(d * 1e6) / 1e6, da: b.id });
  return { ok: true, msg: descriviTaglio(a.tagli.at(-1)) };
}

// Quale misura allunga Adatta se si tocca questa faccia del pezzo: 'x' (teste), 'y' (bordi lunghi) o null (faccia grande).
export function assePerFaccia(p, normale) {
  const nl = normale.clone().applyMatrix4(new Matrix4().extractRotation(matrice(p)).transpose());
  const [x, y, z] = [Math.abs(nl.x), Math.abs(nl.y), Math.abs(nl.z)];
  if (z >= x && z >= y) return null;
  return x >= y ? 'x' : 'y';
}

// Dividi: n copie di A distribuite alla stessa distanza nello spazio tra A e B (che devono essere paralleli).
// vertA/vertB = vertici reali nel mondo. Restituisce { ok, msg, asse, luce, passo }.
export function spazioTra(a, b, vertA, vertB, n) {
  const ra = new Matrix4().extractRotation(matrice(a)), rb = new Matrix4().extractRotation(matrice(b));
  const assiA = [0, 1, 2].map(i => new Vector3(...[0, 1, 2].map(j => (j === i ? 1 : 0))).applyMatrix4(ra));
  const assiB = [0, 1, 2].map(i => new Vector3(...[0, 1, 2].map(j => (j === i ? 1 : 0))).applyMatrix4(rb));
  const centro = pts => pts.reduce((c, v) => c.add(v), new Vector3()).multiplyScalar(1 / pts.length);
  const verso = centro(vertB).sub(centro(vertA));
  // l'asse di A più allineato alla direzione verso B, che deve essere parallelo a un asse di B
  let asse = null;
  for (const x of assiA) {
    if (!assiB.some(y => Math.abs(Math.abs(x.dot(y)) - 1) < 1e-4)) continue;
    if (!asse || Math.abs(x.dot(verso)) > Math.abs(asse.dot(verso))) asse = x.clone();
  }
  if (!asse) return { ok: false, msg: t('I due pezzi devono essere paralleli (per esempio fondo e piano, o i due fianchi).') };
  if (asse.dot(verso) < 0) asse.negate();
  const proj = pts => { let lo = Infinity, hi = -Infinity; for (const v of pts) { const t = v.dot(asse); lo = Math.min(lo, t); hi = Math.max(hi, t); } return [lo, hi]; };
  const [a0, a1] = proj(vertA), [b0] = proj(vertB);
  const spessore = a1 - a0, luce = b0 - a1;
  if (luce <= 0.5) return { ok: false, msg: t("Tra i due pezzi non c'è spazio libero.") };
  const passo = (luce - n * spessore) / (n + 1);
  if (passo < 5) return { ok: false, msg: t('Non ci stanno {n} pezzi da {s} mm in {luce} mm.', { n, s: fmt(spessore, 1), luce: fmt(luce, 1) }) };
  return { ok: true, asse, spessore, luce, passo };
}

export function dividi(progetto, a, spazio, n) {
  const nuovi = [];
  const base = a.nome.replace(/\s\d+$/, '');
  for (let i = 1; i <= n; i++) {
    const c = structuredClone(a);
    c.id = nuovoId();
    c.n = progetto.prossimoN++;
    c.nome = `${base} ${c.n}`;
    const s = i * (spazio.passo + spazio.spessore);
    c.pos = a.pos.map((v, k) => pulisci(v + spazio.asse.getComponent(k) * s));
    c.tagli = c.tagli.map(t => ({ ...t, da: null }));
    progetto.pezzi.push(c);
    nuovi.push(c);
  }
  return nuovi;
}

// Applica una trasformazione del mondo (spostamento/rotazione dal gizmo) a un pezzo.
export function trasforma(p, delta) {
  const m = delta.clone().multiply(matrice(p));
  const pos = new Vector3().setFromMatrixPosition(m);
  const e = new Euler().setFromRotationMatrix(new Matrix4().extractRotation(m), 'ZYX');
  p.pos = [pos.x, pos.y, pos.z].map(pulisci);
  p.rot = [e.x, e.y, e.z].map(v => pulisci(v / RAD));
}

export function sposta(p, d) { p.pos = p.pos.map((c, i) => pulisci(c + d[i])); }

// Quali misure si cambiano con le maniglie: x (lunghezza) per tutti i pezzi rettangolari e rotondi, y (larghezza)
// per i pannelli rettangolari. Sagome e disegni no (le misure vengono dal disegno).
export function assiManiglie(p) {
  if (p.tipo === 'listello') return p.forma === 'rett' || !p.forma ? ['x'] : [];
  if (p.forma === 'cerchio') return ['x'];
  return p.forma === 'rett' ? ['x', 'y'] : [];
}

// Ridimensiona con una maniglia: asse 'x' (L, o D per i rotondi) o 'y' (W), lato 'max' (la testa a coordinata L/W)
// o 'min' (la testa a 0: il pezzo si sposta perché l'altra testa resti ferma). I tagli della testa che si muove
// la seguono; gli altri restano dove sono.
export function ridimensiona(p, asse, lato, nuovo) {
  const i = asse === 'x' ? 0 : 1, campo = p.forma === 'cerchio' ? 'D' : asse === 'x' ? 'L' : 'W';
  const prima = p[campo], d = Math.round(nuovo * 10) / 10 - prima;
  if (!(prima + d >= 1) || Math.abs(d) < 0.01) return 0;
  p[campo] = prima + d;
  if (campo === 'D') { p.L = p.D; p.W = p.D; }
  if (lato === 'min') {
    const e = new Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, 0).applyMatrix4(new Matrix4().extractRotation(matrice(p)));
    p.pos = p.pos.map((c, j) => pulisci(c - e.getComponent(j) * d));
    // il pezzo è "scivolato" di d lungo l'asse: i tagli lontani dalla testa mossa devono restare fermi nel mondo
    p.tagli = p.tagli.map(t => (t.n[i] > 1e-6 ? t : { ...t, d: t.d + t.n[i] * d }));
  } else p.tagli = p.tagli.map(t => (t.n[i] < -1e-6 ? { ...t, d: t.d + t.n[i] * d } : t));
  return d;
}

// Calamita: dopo uno spostamento, avvicina la selezione alle facce degli altri pezzi se sono entro `soglia` mm
// (per ogni asse separatamente). `box` = funzione che dà l'ingombro { min, max } di un pezzo.
export function calamita(progetto, ids, box, soglia = 12) {
  const sel = progetto.pezzi.filter(p => ids.has(p.id)), altri = progetto.pezzi.filter(p => !ids.has(p.id));
  if (!sel.length || !altri.length) return [0, 0, 0];
  const S = sel.map(box).reduce((a, b) => ({ min: a.min.clone().min(b.min), max: a.max.clone().max(b.max) }));
  const spinta = [0, 0, 0], assi = ['x', 'y', 'z'];
  assi.forEach((k, i) => {
    let migliore = null;
    for (const o of altri) {
      const O = box(o);
      // deve stare vicino anche sugli altri due assi
      if (!assi.every(j => j === k || (S.min[j] < O.max[j] + soglia && S.max[j] > O.min[j] - soglia))) continue;
      for (const d of [O.max[k] - S.min[k], O.min[k] - S.max[k], O.min[k] - S.min[k], O.max[k] - S.max[k]]) {
        if (Math.abs(d) <= soglia && Math.abs(d) > 0.01 && (!migliore || Math.abs(d) < Math.abs(migliore))) migliore = d;
      }
    }
    if (migliore !== null) spinta[i] = migliore;
  });
  if (spinta.some(v => v)) for (const p of sel) sposta(p, spinta);
  return spinta;
}

// Copia specchiata della selezione rispetto al piano verticale x = asse (di solito il bordo destro).
// Il pezzo specchiato resta un pezzo vero: si capovolge la sua lunghezza (x locale → L - x).
export function copiaSpecchiata(progetto, pezzi, asse) {
  const S = new Matrix4().makeTranslation(2 * asse, 0, 0).multiply(new Matrix4().makeScale(-1, 1, 1));
  const ids = new Map(pezzi.map(p => [p.id, nuovoId()]));
  return pezzi.map(p => {
    const c = structuredClone(p), { L } = dimensioni(p);
    c.id = ids.get(p.id);
    c.n = progetto.prossimoN++;
    c.nome = `${p.nome.replace(/\s\d+$/, '')} ${c.n}`;
    const F = new Matrix4().makeTranslation(L, 0, 0).multiply(new Matrix4().makeScale(-1, 1, 1));
    const m = S.clone().multiply(matrice(p)).multiply(F);
    const pos = new Vector3().setFromMatrixPosition(m), e = new Euler().setFromRotationMatrix(new Matrix4().extractRotation(m), 'ZYX');
    c.pos = [pos.x, pos.y, pos.z].map(pulisci);
    c.rot = [e.x, e.y, e.z].map(v => pulisci(v / RAD));
    c.tagli = p.tagli.map(t => ({ n: [-t.n[0], t.n[1], t.n[2]], d: t.d - t.n[0] * L, da: ids.get(t.da) || null }));
    const scambia = { A: 'B', B: 'A' };
    c.ferramenta = (p.ferramenta || []).map(f => ({ ...f, ...(f.lato && scambia[f.lato] ? { lato: scambia[f.lato] } : {}) }));
    progetto.pezzi.push(c);
    return c;
  });
}

// Bordi di un pannello (nel sistema locale) e come si chiamano visti nel mobile.
export const LATI_BORDO = { A: [-1, 0, 0], B: [1, 0, 0], basso: [0, -1, 0], alto: [0, 1, 0] };
export function nomeBordo(p, lato) {
  const n = new Vector3(...LATI_BORDO[lato]).applyMatrix4(new Matrix4().extractRotation(matrice(p)));
  const c = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)], k = c.indexOf(Math.max(...c));
  return t([[tr('a sinistra'), tr('a destra')], [tr('sotto'), tr('sopra')], [tr('dietro'), tr('davanti')]][k][n.getComponent(k) > 0 ? 1 : 0]);
}
// Misura da tagliare: la misura finita meno lo spessore dei bordi applicati.
export function bordatura(p) {
  const b = p.bordatura || {}, s = b.spessore || 0, lati = new Set(b.lati || []);
  const meno = l => (lati.has(l) ? s : 0);
  return { s, lati, menoL: meno('A') + meno('B'), menoW: meno('basso') + meno('alto') };
}

// Numeri nella lingua scelta (virgola o punto decimale), senza separatore delle migliaia: così si rileggono dai campi.
export const fmt = (v, dec = 0) => (Math.abs(v) < 0.5 / 10 ** dec ? 0 : Number(v)).toLocaleString(lingua.locale, { minimumFractionDigits: 0, maximumFractionDigits: dec, useGrouping: false });

// Unità con cui si scrivono e si leggono le misure nell'interfaccia (dentro il progetto è sempre tutto in mm).
export const unita = { u: 'mm' };
export const inUnita = mm => (unita.u === 'cm' ? mm / 10 : mm);
// Misura nell'unità scelta, con l'unità scritta accanto se serve: 760 → «760 mm» o «76 cm».
export const fmtU = (mm, conUnita = false) => fmt(inUnita(mm), unita.u === 'cm' ? 2 : 1) + (conUnita ? ` ${unita.u}` : '');
// Legge una misura scritta: «76», «76 cm», «760mm», «0,76 m», «30 in» o «30"». Senza unità vale quella scelta. In mm.
export function leggiMisura(s) {
  const t = String(s).trim().toLowerCase().replace(/\s/g, '').replace(',', '.');
  const m = t.match(/^(-?\d*\.?\d+)(mm|cm|m|in|"|pollici)?$/);
  if (!m) return null;
  const v = parseFloat(m[1]), u = m[2] || unita.u;
  return v * ({ mm: 1, cm: 10, m: 1000, in: 25.4, '"': 25.4, pollici: 25.4 }[u]);
}

// Descrizione del taglio come la serve in laboratorio.
export function descriviTaglio(tg) {
  const [nx, ny, nz] = tg.n.map(Math.abs);
  const deg = (a, b) => Math.atan2(a, b) / RAD;
  const parti = [];
  let dove;
  if (nx >= ny && nx >= nz) {
    dove = t(tg.n[0] < 0 ? 'Testa B' : 'Testa A');
    const obl = deg(ny, nx), lama = deg(nz, nx);
    if (obl > 0.05) parti.push(t('obliquo {g}°', { g: fmt(obl, 1) }));
    if (lama > 0.05) parti.push(t('lama inclinata {g}°', { g: fmt(lama, 1) }));
  } else if (ny >= nz) {
    dove = t('Bordo');
    const obl = deg(nx, ny), lama = deg(nz, ny);
    if (obl > 0.05) parti.push(t('obliquo {g}°', { g: fmt(obl, 1) }));
    if (lama > 0.05) parti.push(t('lama inclinata {g}°', { g: fmt(lama, 1) }));
  } else {
    dove = t('Faccia');
    parti.push(t('inclinata {g}°', { g: fmt(deg(Math.hypot(nx, ny), nz), 1) }));
  }
  return `${dove}: ${parti.length ? parti.join(', ') : t('a squadra')}`;

}

// Storico per Annulla/Ripeti.
export class Storico {
  constructor() { this.indietro = []; this.avanti = []; }
  salva(stato) { this.indietro.push(JSON.stringify(stato)); if (this.indietro.length > 200) this.indietro.shift(); this.avanti = []; }
  annulla(stato) { if (!this.indietro.length) return null; this.avanti.push(JSON.stringify(stato)); return JSON.parse(this.indietro.pop()); }
  ripeti(stato) { if (!this.avanti.length) return null; this.indietro.push(JSON.stringify(stato)); return JSON.parse(this.avanti.pop()); }
}
