// Vista 3D: disegna i pezzi, gestisce viste, selezione (anche multipla), gizmo per spostare e ruotare,
// quote, vista esplosa, misura e tocco su un pezzo (con la faccia toccata).
import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { TransformControls } from '../vendor/TransformControls.js';
import { materiale } from './materiali.js';
import { assiManiglie, dimensioni, fmt, fmtU, matrice } from './modello.js';
import { geometriaPezzo } from './geometria.js';
import { cerniere, guide, maniglia } from './ferramenta.js';

const ACCENTO = new THREE.Color('#1f5fbf');
const METALLO = new THREE.MeshStandardMaterial({ color: '#9aa1a8', roughness: 0.4, metalness: 0.6 });
export const COLORI_FISSAGGIO = { viti: '#1f5fbf', confirmat: '#6a3fb5', spinotti: '#b07a2a', eccentrici: '#2f7d4f' };
const materialiFissaggio = Object.fromEntries(Object.entries(COLORI_FISSAGGIO).map(([k, c]) => [k, new THREE.MeshBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: 0.9 })]));
const ERRORE = new THREE.MeshBasicMaterial({ color: '#c0392b', depthTest: false, transparent: true, opacity: 0.95 });
const CONDIVISI = new Set([METALLO, ERRORE, ...Object.values(materialiFissaggio)]);

// Un cilindro (o una barra a sezione quadrata) dal punto a al punto b.
function asta(a, b, raggio, mat, quadrata = false) {
  const dir = new THREE.Vector3().subVectors(b, a), l = dir.length() || 0.01;
  const geo = quadrata ? new THREE.BoxGeometry(raggio * 2, l, raggio * 2) : new THREE.CylinderGeometry(raggio, raggio, l, 12);
  const m = new THREE.Mesh(geo, mat);
  m.userData.propria = true;
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

function ferramentaPezzo(p) {
  const g = new THREE.Group(), v = a => new THREE.Vector3(...a);
  const c = cerniere(p);
  if (c) for (const b of c.bracci) g.add(asta(v(b.da), v(b.a), b.largo / 2, METALLO, true));
  const m = maniglia(p);
  if (m) {
    const s = m.barra.sporgenza, a = v(m.barra.da), b = v(m.barra.a), su = new THREE.Vector3(0, 0, s);
    g.add(asta(a, a.clone().add(su), 4, METALLO), asta(b, b.clone().add(su), 4, METALLO));
    const d = b.clone().sub(a).normalize().multiplyScalar(25);
    g.add(asta(a.clone().add(su).sub(d), b.clone().add(su).add(d), 6, METALLO));
  }
  for (const r of guide(p) || []) g.add(asta(v(r.da), v(r.a), r.alto / 2, METALLO, true));
  return g;
}

// Campo delle proprietà che corrisponde a ogni quota del pezzo (x = lunghezza, y = larghezza, z = spessore).
function campiQuote(p) {
  if (p.tipo === 'listello') return { x: 'L', y: 'sezW', z: 'sezT' };
  if (p.forma === 'cerchio') return { x: 'D', y: 'D', z: 'spessore' };
  if (p.forma === 'rett') return { x: 'L', y: 'W', z: 'spessore' };
  return { z: 'spessore' };
}

export class Vista3D {
  constructor(contenitore, { onTocco, onTrasforma, onAfferra, onRidimensiona, onQuota }) {
    this.el = contenitore;
    this.onTocco = onTocco;
    this.onTrasforma = onTrasforma;
    this.onAfferra = onAfferra;
    this.onRidimensiona = onRidimensiona;
    this.onQuota = onQuota;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor('#f4f1ec');
    contenitore.appendChild(this.renderer.domElement);
    this.sovra = document.createElement('div');
    this.sovra.className = 'sovra';
    contenitore.appendChild(this.sovra);

    this.scena = new THREE.Scene();
    this.scena.add(new THREE.HemisphereLight('#ffffff', '#b9a98f', 2.1));
    const sole = new THREE.DirectionalLight('#ffffff', 1.6);
    sole.position.set(1500, 3000, 2200);
    this.scena.add(sole);
    this.griglia = new THREE.GridHelper(6000, 60, '#d9d0c2', '#e7e0d5');
    this.scena.add(this.griglia);
    this.gruppo = new THREE.Group();
    this.scena.add(this.gruppo);
    this.extra = new THREE.Group();
    this.scena.add(this.extra);
    this.maniglie = new THREE.Group();
    this.scena.add(this.maniglie);

    this.prospettica = new THREE.PerspectiveCamera(35, 1, 10, 50000);
    this.prospettica.position.set(1800, 1500, 2400);
    this.ortogonale = new THREE.OrthographicCamera(-1, 1, 1, -1, -50000, 50000);
    this.camera = this.prospettica;
    this.controlli = new OrbitControls(this.camera, this.renderer.domElement);
    this.controlli.enableDamping = false;
    this.controlli.addEventListener('change', () => this.disegna());
    this.nomeVista = '3d';

    // Gizmo per spostare/ruotare la selezione intorno a un perno al centro della selezione.
    this.perno = new THREE.Object3D();
    this.scena.add(this.perno);
    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.gizmo.setSpace('world');
    this.gizmo.setTranslationSnap(5);
    this.gizmo.setRotationSnap(THREE.MathUtils.degToRad(5));
    this.gizmo.setSize(0.9);
    this.scena.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('change', () => this.disegna());
    this.gizmo.addEventListener('dragging-changed', e => {
      this.controlli.enabled = !e.value;
      if (e.value) this.inizioGizmo();
      else this.fineGizmo();
    });
    this.gizmo.addEventListener('objectChange', () => this.muoviGizmo());

    // Trascinamento libero dei pezzi (come in Tinkercad): ascoltato sul contenitore in fase di cattura, così parte
    // prima di OrbitControls e TransformControls e li esclude quando il dito o il mouse è su un pezzo.
    contenitore.addEventListener('pointerdown', e => this.afferra(e), true);
    // Quote del pezzo selezionato: si toccano per scrivere la misura (come in Tinkercad).
    this.sovra.addEventListener('click', e => { const q = e.target.closest('[data-quota]'); if (q) this.apriQuota(q); });
    this.giu = null;
    this.renderer.domElement.addEventListener('pointerdown', e => { this.giu = this.gizmo.axis ? null : [e.clientX, e.clientY]; });
    this.renderer.domElement.addEventListener('pointerup', e => {
      const giu = this.giu;
      this.giu = null;
      if (!giu || Math.hypot(e.clientX - giu[0], e.clientY - giu[1]) > 6) return;
      this.tocca(e);
    });
    this.stato = { selezione: new Set(), esploso: false };
    new ResizeObserver(() => this.ridimensiona()).observe(contenitore);
    this.ridimensiona();
  }

  ridimensiona() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.prospettica.aspect = w / h;
    this.prospettica.updateProjectionMatrix();
    this.aggiornaOrtogonale();
    this.disegna();
  }

  aggiornaOrtogonale() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1, mezzo = this.mezzaAltezza || 1000;
    Object.assign(this.ortogonale, { left: -mezzo * w / h, right: mezzo * w / h, top: mezzo, bottom: -mezzo });
    this.ortogonale.updateProjectionMatrix();
  }

  // opzioni: { selezione: Set di id, primario, viti, mostraViti, vitiErrate, esploso, gizmo: 'translate'|'rotate'|null, misura }
  aggiorna(progetto, opzioni = {}) {
    const { selezione = new Set(), primario = null, viti = [], mostraViti = true, vitiErrate = new Set(), esploso = false, gizmo = 'translate', misura = null, segno = null, maniglie = false } = opzioni;
    this.progetto = progetto;
    this.opzioni = opzioni;
    this.stato = { selezione, primario, esploso, gizmo, misura, maniglie };
    for (const c of [...this.gruppo.children, ...this.extra.children, ...this.maniglie.children]) {
      c.parent.remove(c);
      c.traverse(o => {
        if (o.material && !CONDIVISI.has(o.material)) o.material.dispose();
        if (o.geometry && o.userData.propria) o.geometry.dispose();
      });
    }
    this.oggetti = new Map();
    const centro = esploso ? this.centroProgetto(progetto) : null;
    for (const p of progetto.pezzi) {
      const g = geometriaPezzo(p);
      if (!g) continue;
      const sel = selezione.has(p.id);
      const colore = new THREE.Color(materiale(p.mat).colore);
      const mat = new THREE.MeshStandardMaterial({ color: sel ? colore.clone().lerp(new THREE.Color('#ffffff'), 0.3) : colore, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      const mesh = new THREE.Mesh(g.geometria, mat);
      mesh.userData.id = p.id;
      const linee = new THREE.LineSegments(g.bordi, new THREE.LineBasicMaterial({ color: sel ? ACCENTO : '#8a6b45', transparent: !sel, opacity: sel ? 1 : 0.55 }));
      const obj = new THREE.Group();
      obj.add(mesh, linee, ferramentaPezzo(p));
      obj.userData.linee = linee;
      obj.matrixAutoUpdate = false;
      const m = matrice(p);
      if (centro) {
        const d = new THREE.Vector3(...g.centro).applyMatrix4(m).sub(centro).multiplyScalar(0.7);
        m.premultiply(new THREE.Matrix4().makeTranslation(d.x, d.y, d.z));
      }
      obj.matrix.copy(m);
      obj.userData.base = m.clone();
      obj.updateMatrixWorld(true);
      this.gruppo.add(obj);
      this.oggetti.set(p.id, obj);
    }
    if (mostraViti && !esploso) {
      // I fissaggi si vedono anche attraverso il legno: sono disegnati sopra, come in trasparenza.
      for (const x of viti) {
        const mat = vitiErrate.has(x) ? ERRORE : materialiFissaggio[x.tipo] || materialiFissaggio.viti;
        const pezzi = [asta(x.testa, x.punta, x.d / 2, mat)];
        if (x.tipo === 'viti' || x.tipo === 'confirmat') pezzi.push(asta(x.testa, x.testa.clone().lerp(x.punta, 2.5 / x.testa.distanceTo(x.punta)), x.d, mat));
        if (x.camma) pezzi.push(asta(x.camma.da, x.camma.a, 7.5, mat));
        for (const o of pezzi) { o.renderOrder = 10; this.extra.add(o); }
      }
    }
    if (misura) this.disegnaMisura(misura);
    if (segno) this.disegnaSegno(segno);
    if (maniglie && primario && !esploso) this.creaManiglie(progetto.pezzi.find(p => p.id === primario));
    this.aggiornaGizmo();
    this.disegna();
  }

  centroProgetto(progetto) {
    const box = new THREE.Box3();
    for (const p of progetto.pezzi) {
      const g = geometriaPezzo(p);
      if (g) box.expandByPoint(new THREE.Vector3(...g.centro).applyMatrix4(matrice(p)));
    }
    return box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  }

  // ---------- gizmo ----------
  aggiornaGizmo() {
    const sel = [...this.stato.selezione].map(id => this.oggetti.get(id)).filter(Boolean);
    if (!sel.length || !this.stato.gizmo || this.stato.esploso) { this.gizmo.detach(); return; }
    // Spostare: il pezzo si trascina direttamente; il gizmo resta solo come freccia per alzare/abbassare, sopra
    // la selezione (nelle viste di fronte, di lato e dall'alto non serve). Ruotare: gizmo completo al centro.
    const sposta = this.stato.gizmo === 'translate';
    if (sposta && this.camera.isOrthographicCamera) { this.gizmo.detach(); return; }
    const box = new THREE.Box3();
    for (const o of sel) box.expandByObject(o);
    this.perno.position.copy(box.getCenter(new THREE.Vector3()));
    if (sposta) this.perno.position.y = box.max.y;
    this.perno.rotation.set(0, 0, 0);
    this.perno.updateMatrixWorld(true);
    this.gizmo.camera = this.camera;
    this.gizmo.setMode(this.stato.gizmo);
    this.gizmo.showX = this.gizmo.showZ = !sposta;
    this.gizmo.attach(this.perno);
  }

  inizioGizmo() {
    this.pernoIniziale = this.perno.matrixWorld.clone();
    this.selInizio = [...this.stato.selezione].map(id => this.oggetti.get(id)).filter(Boolean);
  }

  deltaGizmo() {
    this.perno.updateMatrixWorld(true);
    return this.perno.matrixWorld.clone().multiply(this.pernoIniziale.clone().invert());
  }

  muoviGizmo() {
    if (!this.selInizio) return;
    const d = this.deltaGizmo();
    for (const o of this.selInizio) { o.matrix.copy(d.clone().multiply(o.userData.base)); o.updateMatrixWorld(true); }
    const t = new THREE.Vector3().setFromMatrixPosition(d), e = new THREE.Euler().setFromRotationMatrix(d, 'ZYX');
    this.etichettaMovimento = this.stato.gizmo === 'rotate'
      ? ['x', 'y', 'z'].map(k => [k.toUpperCase(), THREE.MathUtils.radToDeg(e[k])]).filter(([, v]) => Math.abs(v) > 0.05).map(([k, v]) => `${k} ${fmt(v, 1)}°`).join('  ')
      : [['X', t.x], ['Y', t.y], ['Z', t.z]].filter(([, v]) => Math.abs(v) > 0.05).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${fmtU(v, true)}`).join('  ');
    this.disegnaSovra();
  }

  fineGizmo() {
    if (!this.selInizio) return;
    const d = this.deltaGizmo();
    this.selInizio = null;
    this.etichettaMovimento = '';
    if (!d.equals(new THREE.Matrix4())) this.onTrasforma(d);
  }

  // ---------- maniglie per cambiare le misure (come in Tinkercad) ----------
  // Quadratini sulle teste (lunghezza), sui bordi (larghezza) e negli angoli (tutte e due) del pezzo selezionato.
  creaManiglie(p) {
    const obj = p && this.oggetti.get(p.id), g = p && geometriaPezzo(p), assi = p ? assiManiglie(p) : [];
    if (!obj || !g || !assi.length) return;
    const { L, W } = dimensioni(p), zc = (g.min[2] + g.max[2]) / 2, m = obj.matrix, r = new THREE.Matrix4().extractRotation(m);
    const dir = k => new THREE.Vector3(k === 'x' ? 1 : 0, k === 'y' ? 1 : 0, 0).applyMatrix4(r).normalize();
    const lato = (k, s) => ({ k, lato: s, e: dir(k).multiplyScalar(s === 'max' ? 1 : -1), len: k === 'x' ? (p.forma === 'cerchio' ? p.D : L) : W });
    const xs = { min: g.min[0], max: g.max[0], c: (g.min[0] + g.max[0]) / 2 }, ys = { min: g.min[1], max: g.max[1], c: (g.min[1] + g.max[1]) / 2 };
    const posti = [];
    if (p.forma === 'cerchio') posti.push([xs.max, ys.c, [lato('x', 'max')]]);
    else {
      for (const s of ['min', 'max']) posti.push([xs[s], ys.c, [lato('x', s)]]);
      if (assi.includes('y')) {
        for (const s of ['min', 'max']) posti.push([xs.c, ys[s], [lato('y', s)]]);
        for (const sx of ['min', 'max']) for (const sy of ['min', 'max']) posti.push([xs[sx], ys[sy], [lato('x', sx), lato('y', sy)], true]);
      }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1), bordo = new THREE.MeshBasicMaterial({ color: ACCENTO, depthTest: false, transparent: true });
    const dentro = new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true }), presa = new THREE.MeshBasicMaterial({ visible: false });
    for (const [x, y, lati, angolo] of posti) {
      const h = new THREE.Group();
      h.position.copy(new THREE.Vector3(x, y, zc).applyMatrix4(m));
      h.quaternion.setFromRotationMatrix(r);
      const a = new THREE.Mesh(geo, bordo), b = new THREE.Mesh(geo, dentro), c = new THREE.Mesh(geo, presa);
      a.renderOrder = 30; b.renderOrder = 31; b.scale.setScalar(0.62); c.scale.setScalar(2);
      if (angolo) b.material = bordo, a.material = dentro; // gli angoli al contrario: pieni di blu
      for (const x of [a, b, c]) x.userData.propria = true;
      h.add(a, b, c);
      h.userData = { lati, id: p.id, presa: c, piano: new THREE.Vector3(0, 0, 1).applyMatrix4(r).normalize() };
      this.maniglie.add(h);
    }
    this.maniglie.visible = true;
  }

  mmPerPixel(punto) {
    const h = this.el.clientHeight || 1;
    if (this.camera.isOrthographicCamera) return (this.ortogonale.top - this.ortogonale.bottom) / this.ortogonale.zoom / h;
    return 2 * this.camera.position.distanceTo(punto) * Math.tan(THREE.MathUtils.degToRad(this.prospettica.fov / 2)) / h;
  }

  scalaManiglie() {
    for (const h of this.maniglie.children) h.scale.setScalar(13 * this.mmPerPixel(h.position));
  }

  manigliaSotto(ray) {
    if (!this.maniglie.visible || !this.maniglie.children.length) return null;
    this.maniglie.updateMatrixWorld(true);
    const hit = ray.intersectObjects(this.maniglie.children.map(h => h.userData.presa), false)[0];
    return hit ? hit.object.parent : null;
  }

  // Altri pezzi come intervalli lungo una direzione: per l'aggancio delle maniglie.
  intervalli(esclusi, dirs) {
    const out = [], v = new THREE.Vector3();
    for (const [id, o] of this.oggetti) {
      if (esclusi.has(id)) continue;
      const pos = o.children[0].geometry.attributes.position, r = dirs.map(() => [Infinity, -Infinity]);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrix);
        dirs.forEach((d, j) => { const t = v.dot(d); if (t < r[j][0]) r[j][0] = t; if (t > r[j][1]) r[j][1] = t; });
      }
      out.push({ id, r });
    }
    return out;
  }

  trascinaManiglia(e, h) {
    e.stopPropagation();
    this.giu = null;
    const { lati, id, piano: n } = h.userData, obj = this.oggetti.get(id), p = this.progetto.pezzi.find(x => x.id === id);
    const tela = this.renderer.domElement, H0 = h.position.clone();
    try { tela.setPointerCapture(e.pointerId); } catch { /* alcuni browser non lo permettono qui */ }
    // direzioni dei lati del pezzo (locali x, y, z nel mondo) per l'aggancio agli altri pezzi
    const r = new THREE.Matrix4().extractRotation(obj.matrix), ax = [0, 1, 2].map(i => new THREE.Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0).applyMatrix4(r));
    const propri = (() => { const pos = obj.children[0].geometry.attributes.position, v = new THREE.Vector3(), rr = ax.map(() => [Infinity, -Infinity]);
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrix); ax.forEach((d, j) => { const t = v.dot(d); rr[j][0] = Math.min(rr[j][0], t); rr[j][1] = Math.max(rr[j][1], t); }); }
      return rr; })();
    const altri = this.intervalli(new Set([id]), ax);
    const pianoTr = new THREE.Plane().setFromNormalAndCoplanarPoint(n, H0);
    this.selInizio = [obj];
    const d = { mosso: false, x: e.clientX, y: e.clientY };
    const muovi = ev => {
      if (ev.pointerId !== e.pointerId) return;
      if (!d.mosso && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 4) return;
      d.mosso = true;
      const ray = this.raggio(ev).ray, soglia = 10 * this.mmPerPixel(H0);
      let P;
      if (lati.length === 1) {
        // punto della retta della maniglia più vicino al raggio del mouse
        const e1 = lati[0].e, w0 = H0.clone().sub(ray.origin), b = e1.dot(ray.direction), den = 1 - b * b;
        if (den < 1e-6) return;
        const s = (b * w0.dot(ray.direction) - w0.dot(e1)) / den;
        P = H0.clone().addScaledVector(e1, s);
      } else {
        P = ray.intersectPlane(pianoTr, new THREE.Vector3());
        if (!P) return;
      }
      const spinta = P.sub(H0);
      d.esiti = lati.map(l => {
        const i = l.k === 'x' ? 0 : 1, segno = l.lato === 'max' ? 1 : -1, delta = spinta.dot(l.e);
        // dove arriva la testa lungo l'asse locale (coordinata con segno sul versore locale)
        const fine = (segno > 0 ? propri[i][1] : propri[i][0]) + segno * delta;
        let migliore = null;
        for (const o of altri) {
          const sopra = [0, 1, 2].every(j => j === i || (o.r[j][0] < propri[j][1] - 0.5 && o.r[j][1] > propri[j][0] + 0.5));
          if (!sopra) continue;
          for (const [t, vicino] of [[o.r[i][0], segno > 0], [o.r[i][1], segno < 0]]) {
            const dd = t - fine;
            if (Math.abs(dd) <= soglia && (!migliore || Math.abs(dd) < Math.abs(migliore.dd))) migliore = { dd, id: o.id, vicino };
          }
        }
        let valore = l.len + delta + (migliore ? segno * migliore.dd : 0);
        if (!migliore) valore = Math.round(valore);
        valore = Math.max(1, valore);
        return { k: l.k, lato: l.lato, valore, len: l.len, aggancio: migliore ? { id: migliore.id, vicino: migliore.vicino } : null };
      });
      // anteprima: il pezzo si stira tenendo ferma la testa opposta
      const M = new THREE.Matrix4();
      for (const x of d.esiti) {
        const i = x.k === 'x' ? 0 : 1, sc = x.valore / x.len, fermo = x.lato === 'max' ? 0 : x.len;
        const S = new THREE.Matrix4().makeScale(i === 0 || p.forma === 'cerchio' ? sc : 1, i === 1 || p.forma === 'cerchio' ? sc : 1, 1);
        const T = v => new THREE.Matrix4().makeTranslation(i === 0 ? v : 0, i === 1 ? v : 0, 0);
        M.multiply(T(fermo)).multiply(S).multiply(T(-fermo));
      }
      obj.matrix.copy(obj.userData.base.clone().multiply(M)); obj.updateMatrixWorld(true);
      this.maniglie.visible = false;
      this.evidenzia(d.esiti.map(x => x.aggancio?.id).filter(Boolean));
      const nomi = { x: p.forma === 'cerchio' ? 'Ø' : 'L', y: 'W' };
      this.etichettaMovimento = d.esiti.map(x => `${nomi[x.k]} ${fmtU(x.valore, true)}${x.aggancio ? ' ⇥' : ''}`).join('  ');
      this.disegna();
    };
    const fine = ev => {
      if (ev.pointerId !== e.pointerId) return;
      tela.removeEventListener('pointermove', muovi);
      tela.removeEventListener('pointerup', fine);
      tela.removeEventListener('pointercancel', fine);
      try { tela.releasePointerCapture(e.pointerId); } catch { /* già rilasciato */ }
      this.selInizio = null;
      this.etichettaMovimento = '';
      this.evidenzia([]);
      const esiti = d.esiti?.filter(x => Math.abs(x.valore - x.len) > 0.05);
      if (d.mosso && esiti?.length && ev.type === 'pointerup') this.onRidimensiona(id, esiti);
      else this.aggiorna(this.progetto, this.opzioni);
    };
    tela.addEventListener('pointermove', muovi);
    tela.addEventListener('pointerup', fine);
    tela.addEventListener('pointercancel', fine);
  }

  // Bordi verdi sui pezzi a cui ci si sta agganciando.
  evidenzia(ids) {
    const s = new Set(ids);
    for (const [id, o] of this.oggetti) {
      const l = o.userData.linee;
      if (!l) continue;
      if (s.has(id)) { if (!l.userData.prima) l.userData.prima = { c: l.material.color.clone(), o: l.material.opacity, t: l.material.transparent }; l.material.color.set('#2f7d4f'); l.material.opacity = 1; l.material.transparent = false; }
      else if (l.userData.prima) { const q = l.userData.prima; l.material.color.copy(q.c); l.material.opacity = q.o; l.material.transparent = q.t; delete l.userData.prima; }
    }
  }

  // ---------- trascinamento libero ----------
  raggio(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    return ray;
  }

  pezzoSotto(ray) {
    const meshes = [];
    this.gruppo.traverse(o => { if (o.isMesh && o.userData.id) meshes.push(o); });
    return ray.intersectObjects(meshes, false)[0] || null;
  }

  // Sul gizmo (anche al tocco, quando non c'è il passaggio del mouse a dirlo prima)?
  sulGizmo(ray) {
    if (!this.gizmo.object || !this.gizmo.enabled) return false;
    if (this.gizmo.axis) return true;
    const picker = this.gizmo._gizmo?.picker?.[this.gizmo.mode];
    if (!picker) return false;
    picker.updateMatrixWorld(true);
    return ray.intersectObject(picker, true).length > 0;
  }

  // Si trascina un pezzo quando è attivo «Sposta», senza comandi in corso e fuori dalla vista esplosa. Col mouse
  // qualunque pezzo (si seleziona trascinandolo); col dito solo quelli già selezionati, così un dito su un pezzo non
  // selezionato continua a girare la vista. Il piano di scorrimento: orizzontale nella vista 3D (per alzare c'è la
  // freccia), quello dello schermo nelle viste ortogonali. Maiusc = solo lungo la direzione principale.
  afferra(e) {
    if (e.target.closest?.('[data-quota], .editor-quota') || e.button > 0 || !e.isPrimary || !this.progetto) return;
    const ray = this.raggio(e), maniglia = this.manigliaSotto(ray);
    if (maniglia) return this.trascinaManiglia(e, maniglia);
    if (this.stato.gizmo !== 'translate' || this.stato.esploso) return;
    if (this.sulGizmo(ray)) return;
    const hit = this.pezzoSotto(ray);
    if (!hit) return;
    const id = hit.object.userData.id, selezionato = this.stato.selezione.has(id);
    if (!selezionato && e.pointerType !== 'mouse') return;
    if (this.opzioni.bloccati?.has(id) || (selezionato && [...this.stato.selezione].some(x => this.opzioni.bloccati?.has(x)))) return; // i pezzi bloccati non si trascinano
    e.stopPropagation();
    this.giu = null;
    const normale = this.camera.isOrthographicCamera ? this.camera.getWorldDirection(new THREE.Vector3()).negate() : new THREE.Vector3(0, 1, 0);
    const piano = new THREE.Plane().setFromNormalAndCoplanarPoint(normale, hit.point);
    const d = { id, selezionato, piano, inizio: hit.point.clone(), x: e.clientX, y: e.clientY, mosso: false, evento: e };
    // assi su cui si scorre (quelli del piano di trascinamento): lì agisce la calamita dal vivo
    const assiPiano = ['x', 'y', 'z'].filter(k => Math.abs(normale[k]) < 0.5);
    const tela = this.renderer.domElement;
    try { tela.setPointerCapture(e.pointerId); } catch { /* alcuni browser non lo permettono qui */ }
    const muovi = ev => {
      if (ev.pointerId !== e.pointerId) return;
      if (!d.mosso) {
        if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 6) return;
        d.mosso = true;
        if (!d.selezionato) this.onAfferra(d.id, ev); // l'app seleziona e ridisegna: da qui si muove la nuova selezione
        this.selInizio = [...this.stato.selezione].map(x => this.oggetti.get(x)).filter(Boolean);
        this.gizmo.getHelper().visible = false;
        this.maniglie.visible = false;
        const box = o => new THREE.Box3().setFromObject(o.children[0]);
        d.S = this.selInizio.map(box).reduce((a, b) => a.union(b));
        const sel = new Set(this.stato.selezione);
        d.altri = [...this.oggetti].filter(([x]) => !sel.has(x)).map(([x, o]) => ({ id: x, B: box(o) }));
      }
      const p = this.raggio(ev).ray.intersectPlane(d.piano, new THREE.Vector3());
      if (!p) return;
      const v = p.sub(d.inizio);
      if (ev.shiftKey) { const k = ['x', 'y', 'z'].reduce((a, b) => (Math.abs(v[b]) > Math.abs(v[a]) ? b : a)); for (const a of ['x', 'y', 'z']) if (a !== k) v[a] = 0; }
      for (const a of ['x', 'y', 'z']) v[a] = Math.round(v[a] / 5) * 5;
      // Calamita dal vivo: facce, bordi e centri si allineano a quelli dei pezzi vicini (entro ~10 pixel).
      const soglia = 10 * this.mmPerPixel(d.inizio), S = d.S.clone().translate(v), agganci = [];
      const entra = (A, B) => ['x', 'y', 'z'].every(j => A.min[j] < B.max[j] - 0.5 && A.max[j] > B.min[j] + 0.5);
      const dentro = new Set(d.altri.filter(q => entra(S, q.B)));
      if (!ev.altKey) for (const k of assiPiano) {
        let migliore = null;
        for (const o of d.altri) {
          const B = o.B;
          if (!['x', 'y', 'z'].every(j => j === k || (S.min[j] < B.max[j] + soglia && S.max[j] > B.min[j] - soglia))) continue;
          for (const dd of [B.max[k] - S.min[k], B.min[k] - S.max[k], B.min[k] - S.min[k], B.max[k] - S.max[k], (B.min[k] + B.max[k] - S.min[k] - S.max[k]) / 2]) {
            if (Math.abs(dd) > soglia || (migliore && Math.abs(dd) >= Math.abs(migliore.dd) - 1e-6)) continue;
            // niente aggancio che fa entrare il pezzo in quello a cui si aggancia, o in un pezzo che prima non toccava
            const T = S.clone(); T.min[k] += dd; T.max[k] += dd;
            if (d.altri.some(q => (q === o || !dentro.has(q)) && entra(T, q.B))) continue;
            migliore = { dd, id: o.id };
          }
        }
        if (migliore) { v[k] += migliore.dd; S.min[k] += migliore.dd; S.max[k] += migliore.dd; agganci.push(migliore.id); }
      }
      this.evidenzia(agganci);
      d.delta = new THREE.Matrix4().makeTranslation(v.x, v.y, v.z);
      for (const o of this.selInizio) { o.matrix.copy(d.delta.clone().multiply(o.userData.base)); o.updateMatrixWorld(true); }
      this.etichettaMovimento = [['X', v.x], ['Y', v.y], ['Z', v.z]].filter(([, x]) => Math.abs(x) > 0.05).map(([k, x]) => `${k} ${x > 0 ? '+' : ''}${fmtU(x, true)}`).join('  ');
      this.disegna();
    };
    const fine = ev => {
      if (ev.pointerId !== e.pointerId) return;
      tela.removeEventListener('pointermove', muovi);
      tela.removeEventListener('pointerup', fine);
      tela.removeEventListener('pointercancel', fine);
      try { tela.releasePointerCapture(e.pointerId); } catch { /* già rilasciato */ }
      this.gizmo.getHelper().visible = true;
      this.maniglie.visible = true;
      if (!d.mosso) return ev.type === 'pointerup' && this.tocca(ev);
      this.selInizio = null;
      this.etichettaMovimento = '';
      this.evidenzia([]);
      if (d.delta && !d.delta.equals(new THREE.Matrix4())) this.onTrasforma(d.delta, { libero: true });
      else this.aggiorna(this.progetto, this.opzioni);
    };
    tela.addEventListener('pointermove', muovi);
    tela.addEventListener('pointerup', fine);
    tela.addEventListener('pointercancel', fine);
  }

  // ---------- tocco, misura ----------
  tocca(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = this.raggio(e);
    const hit = this.pezzoSotto(ray);
    if (!hit) return this.onTocco(null, null, e);
    const normale = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
    // vertice più vicino, per misurare da spigolo a spigolo
    const pos = hit.object.geometry.attributes.position, v = new THREE.Vector3();
    let vicino = null, dmin = Infinity;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(hit.object.matrixWorld);
      const d = v.distanceTo(hit.point);
      if (d < dmin) { dmin = d; vicino = v.clone(); }
    }
    const mmPerPixel = this.camera.isOrthographicCamera
      ? (this.ortogonale.top - this.ortogonale.bottom) / this.ortogonale.zoom / r.height
      : (2 * hit.distance * Math.tan(THREE.MathUtils.degToRad(this.prospettica.fov / 2))) / r.height;
    const spigolo = dmin < 16 * mmPerPixel ? vicino : null;
    this.onTocco(hit.object.userData.id, { normale, punto: hit.point.clone(), spigolo }, e);
  }

  // Segno blu sulla faccia scelta (primo tocco di Accosta): un disco appoggiato alla faccia e un trattino in fuori.
  disegnaSegno({ punto, normale }) {
    const n = normale.clone().normalize();
    const disco = new THREE.Mesh(new THREE.CircleGeometry(22, 32), new THREE.MeshBasicMaterial({ color: ACCENTO, depthTest: false, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    disco.position.copy(punto).addScaledVector(n, 0.5);
    disco.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    disco.renderOrder = 22; disco.userData.propria = true;
    const asse = new THREE.Line(new THREE.BufferGeometry().setFromPoints([punto, punto.clone().addScaledVector(n, 60)]), new THREE.LineBasicMaterial({ color: ACCENTO, depthTest: false }));
    asse.renderOrder = 22; asse.userData.propria = true;
    this.extra.add(disco, asse);
  }

  disegnaMisura(m) {
    const pts = m.b ? [m.a, m.b] : [m.a];
    if (m.b) {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#c0392b', depthTest: false }));
      l.renderOrder = 20; l.userData.propria = true;
      this.extra.add(l);
    }
    for (const p of pts) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8), new THREE.MeshBasicMaterial({ color: '#c0392b', depthTest: false }));
      s.position.copy(p); s.renderOrder = 21; s.userData.propria = true;
      this.extra.add(s);
    }
  }

  // ---------- quote e scritte sopra la vista ----------
  proietta(v) {
    const p = v.clone().project(this.camera), w = this.el.clientWidth, h = this.el.clientHeight;
    return [(p.x + 1) / 2 * w, (1 - p.y) / 2 * h, p.z];
  }

  disegnaSovra() {
    if (!this.progetto) { this.sovra.innerHTML = ''; return; }
    const parti = [], linee = [];
    const etichetta = (v, testo, cls = '', attr = '') => { const [x, y, z] = this.proietta(v); if (z < 1) parti.push(`<span class="quota ${cls}"${attr} style="left:${x}px;top:${y}px">${testo}</span>`); };
    const { primario, misura, esploso } = this.stato;
    const p = this.progetto.pezzi.find(x => x.id === primario);
    if (p && !esploso && this.oggetti?.get(p.id) && !this.selInizio) {
      const g = geometriaPezzo(p), m = this.oggetti.get(p.id).matrix;
      if (g) {
        const [x0, y0, z0] = g.min, [x1, y1, z1] = g.max, V = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(m);
        const c = campiQuote(p), attr = k => (c[k] ? ` data-quota="${c[k]}" data-asse="${k}"` : '');
        etichetta(V((x0 + x1) / 2, y0, z1), fmtU(x1 - x0, true), c.x ? 'edit' : '', attr('x'));
        etichetta(V(x1, (y0 + y1) / 2, z1), fmtU(y1 - y0, true), c.y ? 'edit' : '', attr('y'));
        etichetta(V(x1, y0, (z0 + z1) / 2), fmtU(z1 - z0, true), 'spess' + (c.z ? ' edit' : ''), attr('z'));
      }
    }
    if (!esploso && this.opzioni.bloccati?.size && !this.selInizio) for (const id of this.opzioni.bloccati) {
      const o = this.oggetti?.get(id);
      if (o) etichetta(new THREE.Box3().setFromObject(o.children[0]).getCenter(new THREE.Vector3()), '🔒', 'lucchetto');
    }
    if (misura?.b) {
      const d = misura.a.distanceTo(misura.b), dd = misura.b.clone().sub(misura.a);
      etichetta(misura.a.clone().lerp(misura.b, 0.5), `${fmtU(d, true)}<small>ΔX ${fmtU(Math.abs(dd.x))} · ΔY ${fmtU(Math.abs(dd.y))} · ΔZ ${fmtU(Math.abs(dd.z))}</small>`, 'misura');
    }
    // Quote d'ingombro nelle viste ortogonali
    const assi = { fronte: ['x', 'y'], lato: ['z', 'y'], sopra: ['x', 'z'] }[this.nomeVista];
    if (this.camera.isOrthographicCamera && assi && this.gruppo.children.length) {
      const box = this.ingombroPezzi(), a = box.min, b = box.max;
      const [o, v] = assi, t = 'xyz'.replace(o, '').replace(v, '');
      const P = (oo, vv) => { const q = new THREE.Vector3(); q[o] = oo; q[v] = vv; q[t] = (a[t] + b[t]) / 2; return this.proietta(q); };
      const off = (b[v] - a[v]) * 0.05 + 40, offO = (b[o] - a[o]) * 0.05 + 40;
      // riga orizzontale sotto il disegno, riga verticale alla sua destra (sullo schermo)
      const vBasso = P(a[o], a[v] - off)[1] > P(a[o], b[v] + off)[1] ? a[v] - off : b[v] + off;
      const oDestra = P(b[o] + offO, a[v])[0] > P(a[o] - offO, a[v])[0] ? b[o] + offO : a[o] - offO;
      const [x0, y0] = P(a[o], vBasso), [x1] = P(b[o], vBasso);
      const [xr, yr0] = P(oDestra, a[v]), [, yr1] = P(oDestra, b[v]);
      linee.push(`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}"/><line x1="${x0}" y1="${y0 - 8}" x2="${x0}" y2="${y0 + 8}"/><line x1="${x1}" y1="${y0 - 8}" x2="${x1}" y2="${y0 + 8}"/>`);
      linee.push(`<line x1="${xr}" y1="${yr0}" x2="${xr}" y2="${yr1}"/><line x1="${xr - 8}" y1="${yr0}" x2="${xr + 8}" y2="${yr0}"/><line x1="${xr - 8}" y1="${yr1}" x2="${xr + 8}" y2="${yr1}"/>`);
      parti.push(`<span class="quota tot" style="left:${(x0 + x1) / 2}px;top:${y0}px">${fmtU(b[o] - a[o], true)}</span>`);
      parti.push(`<span class="quota tot" style="left:${xr}px;top:${(yr0 + yr1) / 2}px">${fmtU(b[v] - a[v], true)}</span>`);
    }
    if (this.etichettaMovimento && this.selInizio) parti.push(`<span class="quota movimento" style="left:50%;top:76px">${this.etichettaMovimento}</span>`);
    this.sovra.innerHTML = `<svg class="quote-linee">${linee.join('')}</svg>${parti.join('')}`;
  }

  // Campo per scrivere una quota toccata: compare al posto dell'etichetta, Invio conferma, Esc annulla.
  apriQuota(q) {
    this.editorQuota?.remove();
    const campo = q.dataset.quota, r = q.getBoundingClientRect(), base = this.el.getBoundingClientRect();
    const box = document.createElement('div');
    box.className = 'editor-quota';
    box.style.left = `${r.left + r.width / 2 - base.left}px`;
    box.style.top = `${r.top + r.height / 2 - base.top}px`;
    box.innerHTML = `<input inputmode="decimal" value="${q.textContent.replace(/\s*(mm|cm)$/, '')}"><small>${q.textContent.match(/(mm|cm)$/)?.[1] || ''}</small>`;
    this.el.appendChild(box);
    this.editorQuota = box;
    const input = box.querySelector('input');
    let fatto = false;
    const chiudi = conferma => {
      if (fatto) return;
      fatto = true;
      box.remove();
      if (this.editorQuota === box) this.editorQuota = null;
      if (conferma) this.onQuota?.(campo, input.value, q.dataset.asse);
    };
    input.addEventListener('keydown', ev => { if (ev.key === 'Enter') chiudi(true); else if (ev.key === 'Escape') { ev.stopPropagation(); chiudi(false); } });
    input.addEventListener('blur', () => chiudi(true));
    input.focus();
    input.select();
  }

  // Ingombro dei soli pezzi di legno (senza ferramenta né viti).
  ingombroPezzi() {
    const box = new THREE.Box3();
    this.gruppo.traverse(o => { if (o.isMesh && o.userData.id) box.expandByObject(o); });
    return box;
  }

  limiti() {
    const box = this.ingombroPezzi();
    if (box.isEmpty()) box.set(new THREE.Vector3(-400, 0, -400), new THREE.Vector3(400, 800, 400));
    return box;
  }

  vista(nome) {
    this.nomeVista = nome;
    const box = this.limiti(), centro = box.getCenter(new THREE.Vector3()), dim = box.getSize(new THREE.Vector3());
    const raggio = Math.max(dim.x, dim.y, dim.z, 300);
    if (nome === '3d') {
      this.camera = this.prospettica;
      // Distanza per far stare tutta la sfera che contiene i pezzi, con un po' di margine.
      const sfera = Math.max(dim.length() / 2, 200);
      const fov = Math.min(this.prospettica.fov, this.prospettica.fov * this.prospettica.aspect) * Math.PI / 180;
      const distanza = (sfera / Math.sin(fov / 2)) * 1.08;
      this.camera.position.copy(centro).add(new THREE.Vector3(0.75, 0.6, 1).normalize().multiplyScalar(distanza));
      this.camera.up.set(0, 1, 0);
      this.controlli.enableRotate = true;
    } else {
      this.camera = this.ortogonale;
      const dir = { fronte: [0, 0, 1], lato: [1, 0, 0], sopra: [0, 1, 0] }[nome];
      this.camera.position.copy(centro).add(new THREE.Vector3(...dir).multiplyScalar(raggio * 3));
      this.camera.up.set(0, nome === 'sopra' ? 0 : 1, nome === 'sopra' ? -1 : 0);
      this.mezzaAltezza = raggio * 0.72;
      this.ortogonale.zoom = 1;
      this.aggiornaOrtogonale();
      this.controlli.enableRotate = false;
    }
    this.griglia.visible = nome !== 'fronte' && nome !== 'lato';
    this.controlli.object = this.camera;
    this.gizmo.camera = this.camera;
    this.controlli.target.copy(centro);
    this.camera.lookAt(centro);
    this.controlli.update();
    this.disegna();
  }

  immagine() {
    const h = this.gizmo.getHelper(), mv = this.maniglie.visible;
    h.visible = false; this.maniglie.visible = false;
    this.renderer.render(this.scena, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    h.visible = true; this.maniglie.visible = mv;
    this.disegna();
    return url;
  }

  disegna() {
    this.scalaManiglie();
    this.renderer.render(this.scena, this.camera);
    this.disegnaSovra();
  }
}
