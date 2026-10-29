// Controlli del progetto: peso, stabilità (si ribalta?) e freccia dei ripiani. Valori indicativi.
import { Matrix4, Vector3 } from '../vendor/three.module.js';
import { materiale } from './materiali.js';
import { dimensioni, fmt, ingombro, matrice } from './modello.js';
import { geometriaPezzo, volumeComune } from './geometria.js';
import { unioni } from './unioni.js';

export const CARICO_RIPIANI = 30;   // kg per metro di ripiano (libri)
export const CARICO_BORDO = 25;     // kg di chi si appoggia sul bordo

// Freccia di un ripiano appoggiato alle due teste, con carico uniforme (trave appoggiata).
export function freccia(p, caricoKgM = CARICO_RIPIANI) {
  const g = geometriaPezzo(p), m = materiale(p.mat), { T } = dimensioni(p);
  if (!g || !m.E) return null;
  const L = g.max[0] - g.min[0], b = g.max[1] - g.min[1];
  const w = caricoKgM * 9.81 / 1000, I = b * T ** 3 / 12;
  const subito = 5 * w * L ** 4 / (384 * m.E * I), nelTempo = subito * (m.viscosita || 1.5);
  const giudizio = nelTempo <= L / 600 ? 'ottimo' : nelTempo <= L / 300 ? 'accettabile' : 'troppo';
  return { L, subito, nelTempo, giudizio, carico: caricoKgM };
}

function inviluppo(punti) {
  const p = punti.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const giu = [], su = [];
  for (const x of p) { while (giu.length >= 2 && cross(giu.at(-2), giu.at(-1), x) <= 0) giu.pop(); giu.push(x); }
  for (const x of p.reverse()) { while (su.length >= 2 && cross(su.at(-2), su.at(-1), x) <= 0) su.pop(); su.push(x); }
  return giu.slice(0, -1).concat(su.slice(0, -1));
}

// Distanza con segno di q dal lato (a, b) dell'inviluppo antiorario: positiva = fuori.
function fuori(a, b, q) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
  return -((dx * (q[1] - a[1]) - dy * (q[0] - a[0])) / l);
}

let ultimo = { k: null, r: null };
export function controlli(progetto) {
  const k = JSON.stringify([progetto.pezzi, progetto.caricoRipiani, progetto.fissaggi, progetto.unioniEscluse]);
  if (ultimo.k === k && ultimo.progetto === progetto && ultimo.pezzi.every((p, i) => p === progetto.pezzi[i])) return ultimo.r;
  const r = calcola(progetto);
  ultimo = { k, progetto, pezzi: progetto.pezzi.slice(), r };
  return r;
}

function calcola(progetto) {
  const pezzi = progetto.pezzi.filter(p => geometriaPezzo(p));
  const esito = { peso: 0, avvisi: [], note: [], frecce: [] };
  if (!pezzi.length) return esito;
  const u = unioni(progetto);

  // Peso e baricentro
  let massa = 0;
  const cg = new Vector3(), tutti = [];
  for (const p of pezzi) {
    const g = geometriaPezzo(p), m = matrice(p), kg = (g.volume / 1e9) * (materiale(p.mat).densita || 600);
    massa += kg;
    cg.addScaledVector(new Vector3(...g.centro).applyMatrix4(m), kg);
    tutti.push({ p, v: g.vertici.map(v => new Vector3(...v).applyMatrix4(m)) });
  }
  cg.multiplyScalar(1 / massa);
  esito.peso = massa;

  // Appoggi a terra: i vertici più bassi
  const yMin = Math.min(...tutti.flatMap(t => t.v.map(v => v.y)));
  const yMax = Math.max(...tutti.flatMap(t => t.v.map(v => v.y)));
  const base = inviluppo(tutti.flatMap(t => t.v.filter(v => v.y < yMin + 1).map(v => [v.x, -v.z])));
  if (base.length >= 3) {
    const dentro = q => base.every((a, i) => fuori(a, base[(i + 1) % base.length], q) <= 0.5);
    const cgq = [cg.x, -cg.z];
    if (!dentro(cgq)) esito.avvisi.push('Il baricentro cade fuori dalla base: così si ribalta da solo.');
    else {
      // Carico sul bordo: per ogni vertice in alto fuori dalla base, confronta i momenti attorno al lato più vicino.
      let peggiore = null;
      for (const { p, v } of tutti) for (const x of v) {
        if (x.y < yMin + (yMax - yMin) * 0.5) continue;
        const q = [x.x, -x.z];
        for (let i = 0; i < base.length; i++) {
          const a = base[i], b = base[(i + 1) % base.length], d = fuori(a, b, q);
          if (d <= 1) continue;
          const braccioCg = -fuori(a, b, cgq), rapporto = (CARICO_BORDO * d) / (massa * braccioCg);
          if (!peggiore || rapporto > peggiore.rapporto) peggiore = { rapporto, p, d };
        }
      }
      if (peggiore && peggiore.rapporto > 1) {
        esito.avvisi.push(`Se ci si appoggia con ${CARICO_BORDO} kg sul bordo di «${peggiore.p.nome}» (${fmt(peggiore.d)} mm oltre gli appoggi), si ribalta: allarga la base o avvicina il bordo agli appoggi.`);
      } else if (peggiore) {
        const margine = 1 / peggiore.rapporto;
        esito.note.push(`Stabile anche con ${CARICO_BORDO} kg sul bordo (${margine > 5 ? 'con ampio margine' : `margine ×${fmt(margine, 1)}`}).`);
      } else esito.note.push('Stabile: nessun bordo sporge oltre gli appoggi.');
    }
    // Mobili alti e stretti: da fissare al muro
    let profondita = Infinity;
    for (let i = 0; i < base.length; i++) {
      const a = base[i], b = base[(i + 1) % base.length];
      profondita = Math.min(profondita, Math.max(...base.map(q => -fuori(a, b, q))));
    }
    const altezza = yMax - yMin;
    if (altezza > 1000 && altezza > 3 * profondita) esito.avvisi.push(`Alto ${fmt(altezza)} mm su una base profonda ${fmt(profondita)} mm: va fissato al muro.`);
  }

  // Pezzi che si compenetrano (più di 1 cm³ in comune)
  const scatole = tutti.map(t => ({ ...t, b: ingombro(t.p, t.v) }));
  for (let i = 0; i < scatole.length; i++) for (let j = i + 1; j < scatole.length; j++) {
    const A = scatole[i], B = scatole[j];
    if (A.b.max.x <= B.b.min.x + 0.5 || B.b.max.x <= A.b.min.x + 0.5 || A.b.max.y <= B.b.min.y + 0.5 || B.b.max.y <= A.b.min.y + 0.5 || A.b.max.z <= B.b.min.z + 0.5 || B.b.max.z <= A.b.min.z + 0.5) continue;
    const v = volumeComune(geometriaPezzo(A.p), matrice(A.p), geometriaPezzo(B.p), matrice(B.p));
    if (v > 1000) esito.avvisi.push(`«${A.p.nome}» e «${B.p.nome}» si compenetrano (${fmt(v / 1000, 1)} cm³): spostane uno o usa Adatta.`);
  }

  // Freccia dei ripiani: pannelli orizzontali che ricevono viti in entrambe le teste
  for (const p of pezzi) {
    if (p.tipo !== 'pannello') continue;
    const T = new Vector3(0, 0, 1).applyMatrix4(new Matrix4().extractRotation(matrice(p)));
    if (Math.abs(T.y) < 0.95) continue;
    const appoggi = u.giunti.filter(g => g.riceve?.id === p.id && g.comeRiceve === 'testa');
    if (appoggi.length < 2) continue;
    // solo ripiani liberi: se sopra o sotto tocca un altro pezzo (zoccolo, piano, listello) è già sostenuto
    const coperto = u.giunti.some(g => (g.a.id === p.id || g.b.id === p.id) && Math.abs(g.normale?.y || 0) > 0.95);
    if (coperto) continue;
    const f = freccia(p, progetto.caricoRipiani ?? CARICO_RIPIANI);
    if (!f) continue;
    esito.frecce.push({ p, ...f });
    if (f.giudizio === 'troppo') esito.avvisi.push(`«${p.nome}» con ${f.carico} kg/m si piega di ${fmt(f.nelTempo, 1)} mm: troppo. Usa un pannello più spesso, accorcia la luce o aggiungi un listello sotto.`);
  }
  return esito;
}
