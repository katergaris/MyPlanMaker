// Vista 3D: disegna i pezzi, gestisce viste, selezione (anche multipla), gizmo per spostare e ruotare,
// quote, vista esplosa, misura e tocco su un pezzo (con la faccia toccata).
import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { TransformControls } from '../vendor/TransformControls.js';
import { materiale } from './materiali.js';
import { fmt, matrice } from './modello.js';
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

export class Vista3D {
  constructor(contenitore, { onTocco, onTrasforma }) {
    this.el = contenitore;
    this.onTocco = onTocco;
    this.onTrasforma = onTrasforma;
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

    let giu = null;
    this.renderer.domElement.addEventListener('pointerdown', e => { giu = this.gizmo.axis ? null : [e.clientX, e.clientY]; });
    this.renderer.domElement.addEventListener('pointerup', e => {
      if (!giu || Math.hypot(e.clientX - giu[0], e.clientY - giu[1]) > 6) return;
      giu = null;
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
    const { selezione = new Set(), primario = null, viti = [], mostraViti = true, vitiErrate = new Set(), esploso = false, gizmo = 'translate', misura = null } = opzioni;
    this.progetto = progetto;
    this.stato = { selezione, primario, esploso, gizmo, misura };
    for (const c of [...this.gruppo.children, ...this.extra.children]) {
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
    const box = new THREE.Box3();
    for (const o of sel) box.expandByObject(o);
    this.perno.position.copy(box.getCenter(new THREE.Vector3()));
    this.perno.rotation.set(0, 0, 0);
    this.perno.updateMatrixWorld(true);
    this.gizmo.camera = this.camera;
    this.gizmo.setMode(this.stato.gizmo);
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
      : [['X', t.x], ['Y', t.y], ['Z', t.z]].filter(([, v]) => Math.abs(v) > 0.05).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${fmt(v)}`).join('  ');
    this.disegnaSovra();
  }

  fineGizmo() {
    if (!this.selInizio) return;
    const d = this.deltaGizmo();
    this.selInizio = null;
    this.etichettaMovimento = '';
    if (!d.equals(new THREE.Matrix4())) this.onTrasforma(d);
  }

  // ---------- tocco, misura ----------
  tocca(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const meshes = [];
    this.gruppo.traverse(o => { if (o.isMesh && o.userData.id) meshes.push(o); });
    const hit = ray.intersectObjects(meshes, false)[0];
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
    const etichetta = (v, testo, cls = '') => { const [x, y, z] = this.proietta(v); if (z < 1) parti.push(`<span class="quota ${cls}" style="left:${x}px;top:${y}px">${testo}</span>`); };
    const { primario, misura, esploso } = this.stato;
    const p = this.progetto.pezzi.find(x => x.id === primario);
    if (p && !esploso && this.oggetti?.get(p.id) && !this.selInizio) {
      const g = geometriaPezzo(p), m = this.oggetti.get(p.id).matrix;
      if (g) {
        const [x0, y0, z0] = g.min, [x1, y1, z1] = g.max, V = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(m);
        etichetta(V((x0 + x1) / 2, y0, z1), fmt(x1 - x0, 1));
        etichetta(V(x1, (y0 + y1) / 2, z1), fmt(y1 - y0, 1));
      }
    }
    if (misura?.b) {
      const d = misura.a.distanceTo(misura.b), dd = misura.b.clone().sub(misura.a);
      etichetta(misura.a.clone().lerp(misura.b, 0.5), `${fmt(d, 1)} mm<small>ΔX ${fmt(Math.abs(dd.x), 1)} · ΔY ${fmt(Math.abs(dd.y), 1)} · ΔZ ${fmt(Math.abs(dd.z), 1)}</small>`, 'misura');
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
      parti.push(`<span class="quota tot" style="left:${(x0 + x1) / 2}px;top:${y0}px">${fmt(b[o] - a[o])}</span>`);
      parti.push(`<span class="quota tot" style="left:${xr}px;top:${(yr0 + yr1) / 2}px">${fmt(b[v] - a[v])}</span>`);
    }
    if (this.etichettaMovimento && this.selInizio) parti.push(`<span class="quota movimento" style="left:50%;top:76px">${this.etichettaMovimento}</span>`);
    this.sovra.innerHTML = `<svg class="quote-linee">${linee.join('')}</svg>${parti.join('')}`;
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
    const h = this.gizmo.getHelper();
    h.visible = false;
    this.renderer.render(this.scena, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    h.visible = true;
    this.disegna();
    return url;
  }

  disegna() {
    this.renderer.render(this.scena, this.camera);
    this.disegnaSovra();
  }
}
