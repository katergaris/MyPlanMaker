// Vista 3D: disegna i pezzi, gestisce le viste e il tocco su un pezzo (con la faccia toccata).
import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { materiale } from './materiali.js';
import { matrice } from './modello.js';
import { geometriaPezzo } from './geometria.js';
import { cerniere, maniglia } from './ferramenta.js';

const ACCENTO = new THREE.Color('#1f5fbf');
const METALLO = new THREE.MeshStandardMaterial({ color: '#9aa1a8', roughness: 0.4, metalness: 0.6 });
const VITE = new THREE.MeshBasicMaterial({ color: '#1f5fbf', depthTest: false, transparent: true, opacity: 0.9 });
const VITE_ERR = new THREE.MeshBasicMaterial({ color: '#c0392b', depthTest: false, transparent: true, opacity: 0.95 });

// Un cilindro (o una barra a sezione quadrata) dal punto a al punto b.
function asta(a, b, raggio, materiale, quadrata = false) {
  const dir = new THREE.Vector3().subVectors(b, a), l = dir.length();
  const geo = quadrata ? new THREE.BoxGeometry(raggio * 2, l, raggio * 2) : new THREE.CylinderGeometry(raggio, raggio, l, 12);
  const m = new THREE.Mesh(geo, materiale);
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
    const s = m.barra.sporgenza, a = v(m.barra.da), b = v(m.barra.a);
    const su = new THREE.Vector3(0, 0, s);
    g.add(asta(a, a.clone().add(su), 4, METALLO), asta(b, b.clone().add(su), 4, METALLO));
    const d = b.clone().sub(a).normalize().multiplyScalar(25);
    g.add(asta(a.clone().add(su).sub(d), b.clone().add(su).add(d), 6, METALLO));
  }
  return g;
}

export class Vista3D {
  constructor(contenitore, { onTocco }) {
    this.el = contenitore;
    this.onTocco = onTocco;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor('#f4f1ec');
    contenitore.appendChild(this.renderer.domElement);

    this.scena = new THREE.Scene();
    this.scena.add(new THREE.HemisphereLight('#ffffff', '#b9a98f', 2.1));
    const sole = new THREE.DirectionalLight('#ffffff', 1.6);
    sole.position.set(1500, 3000, 2200);
    this.scena.add(sole);
    const griglia = new THREE.GridHelper(6000, 60, '#d9d0c2', '#e7e0d5');
    this.scena.add(griglia);
    this.gruppo = new THREE.Group();
    this.scena.add(this.gruppo);

    this.prospettica = new THREE.PerspectiveCamera(35, 1, 10, 50000);
    this.prospettica.position.set(1800, 1500, 2400);
    this.ortogonale = new THREE.OrthographicCamera(-1, 1, 1, -1, -50000, 50000);
    this.camera = this.prospettica;
    this.controlli = new OrbitControls(this.camera, this.renderer.domElement);
    this.controlli.enableDamping = false;
    this.controlli.addEventListener('change', () => this.disegna());
    this.nomeVista = '3d';

    let giu = null;
    this.renderer.domElement.addEventListener('pointerdown', e => { giu = [e.clientX, e.clientY]; });
    this.renderer.domElement.addEventListener('pointerup', e => {
      if (!giu || Math.hypot(e.clientX - giu[0], e.clientY - giu[1]) > 6) return;
      giu = null;
      this.tocca(e);
    });
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

  aggiorna(progetto, selezionato, { viti = [], mostraViti = true, vitiErrate = new Set() } = {}) {
    for (const c of [...this.gruppo.children]) {
      this.gruppo.remove(c);
      c.traverse(o => { if (o.material && o.material !== METALLO && o.material !== VITE && o.material !== VITE_ERR) o.material.dispose(); if (o.geometry && o.userData.propria) o.geometry.dispose(); });
    }
    for (const p of progetto.pezzi) {
      const g = geometriaPezzo(p);
      if (!g) continue;
      const sel = p.id === selezionato;
      const colore = new THREE.Color(materiale(p.mat).colore);
      const mat = new THREE.MeshStandardMaterial({ color: sel ? colore.clone().lerp(new THREE.Color('#ffffff'), 0.3) : colore, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      const mesh = new THREE.Mesh(g.geometria, mat);
      mesh.userData.id = p.id;
      const linee = new THREE.LineSegments(g.bordi, new THREE.LineBasicMaterial({ color: sel ? ACCENTO : '#8a6b45', transparent: !sel, opacity: sel ? 1 : 0.55 }));
      const obj = new THREE.Group();
      obj.add(mesh, linee, ferramentaPezzo(p));
      obj.matrixAutoUpdate = false;
      obj.matrix.copy(matrice(p));
      obj.updateMatrixWorld(true);
      this.gruppo.add(obj);
    }
    if (mostraViti) {
      // Le viti si vedono anche attraverso il legno: sono disegnate sopra, come in trasparenza.
      for (const x of viti) {
        const mat = vitiErrate.has(x) ? VITE_ERR : VITE;
        const corpo = asta(x.testa, x.punta, x.d / 2, mat), testa = asta(x.testa, x.testa.clone().lerp(x.punta, 2.5 / x.testa.distanceTo(x.punta)), x.d, mat);
        for (const o of [corpo, testa]) { o.renderOrder = 10; o.material = mat; o.userData.propria = true; }
        this.gruppo.add(corpo, testa);
      }
    }
    this.disegna();
  }

  tocca(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const meshes = [];
    this.gruppo.traverse(o => { if (o.isMesh && o.userData.id) meshes.push(o); });
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit) return this.onTocco(null, null);
    const normale = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
    this.onTocco(hit.object.userData.id, { normale, punto: hit.point.clone() });
  }

  limiti() {
    const box = new THREE.Box3().setFromObject(this.gruppo);
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
    if (nome === '3d') this.camera.up.set(0, 1, 0);
    this.controlli.object = this.camera;
    this.controlli.target.copy(centro);
    this.camera.lookAt(centro);
    this.controlli.update();
    this.disegna();
  }

  disegna() {
    this.renderer.render(this.scena, this.camera);
  }
}
