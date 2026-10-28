// Ferramenta montata su un pezzo (cerniere e maniglie): posizioni, fori da fare, pezzi da disegnare.
// Tutto nel sistema locale del pezzo (L lungo x, W lungo y, T lungo z). La faccia interna è z = 0
// (per un'anta "Di fronte" è quella verso il mobile), quella esterna z = T.
import { dimensioni } from './modello.js';

export const CATALOGO = {
  cerniera: { nome: 'Cerniera a scodella Ø 35, apertura 110°', prezzo: 2.8 },
  maniglia: { nome: 'Maniglia', prezzo: 4.5 },
  vite: { nome: 'Vite truciolare', prezzo: 0.06 },
  viteManiglia: { nome: 'Vite per maniglia', prezzo: 0.1 },
  angolare: { nome: 'Angolare 40×40 con 4 viti 3,5×16', prezzo: 0.7 },
  guida: { nome: 'Coppia di guide a sfere, estrazione totale', prezzo: 9 },
};

export const MODELLI_CERNIERA = { sovrapposta: 'Sovrapposta', semi: 'Semi sovrapposta', filo: 'A filo (interna)' };
export const LATI = { A: 'Lato A (sinistro)', B: 'Lato B (destro)', basso: 'Bordo basso', alto: 'Bordo alto' };
export const INTERASSI = [96, 128, 160, 192, 256, 320];

const SCODELLA = { r: 17.5, profondita: 12.5, dalBordo: 22.5 };

// Quante cerniere servono per un'anta lunga `l` mm sul lato delle cerniere (valori indicativi dei produttori).
export const numeroCerniere = l => (l <= 900 ? 2 : l <= 1600 ? 3 : l <= 2000 ? 4 : 5);

// Il lato delle cerniere: dove sta (asse e valore) e lungo quale asse corre.
function lato(nome, L, W) {
  return {
    A: { asse: 0, val: 0, lungo: 1, len: W, verso: 1 },
    B: { asse: 0, val: L, lungo: 1, len: W, verso: -1 },
    basso: { asse: 1, val: 0, lungo: 0, len: L, verso: 1 },
    alto: { asse: 1, val: W, lungo: 0, len: L, verso: -1 },
  }[nome];
}

const punto = (asse, a, lungo, b, z) => { const v = [0, 0, z]; v[asse] = a; v[lungo] = b; return v; };
const opposto = { A: 'B', B: 'A', basso: 'alto', alto: 'basso' };

export function cerniere(p) {
  const c = (p.ferramenta || []).find(f => f.tipo === 'cerniere');
  if (!c) return null;
  const { L, W, T } = dimensioni(p), s = lato(c.lato, L, W);
  const n = c.numero || numeroCerniere(s.len);
  const margine = Math.min(100, s.len / 4);
  const pos = Array.from({ length: n }, (_, i) => (n === 1 ? s.len / 2 : margine + (i * (s.len - 2 * margine)) / (n - 1)));
  const a = s.val + s.verso * SCODELLA.dalBordo;
  const avvisi = [];
  if (T < 15) avvisi.push(`Anta da ${T} mm: per le scodelle da 35 servono almeno 15-16 mm.`);
  return {
    ...c, n, avvisi,
    punti: pos.map(b => punto(s.asse, a, s.lungo, b, 0)),
    fori: pos.map(b => ({ c: punto(s.asse, a, s.lungo, b, 0), r: SCODELLA.r, z0: 0, z1: SCODELLA.profondita, nome: 'scodella Ø 35' })),
    // braccio della cerniera: dalla scodella verso l'interno del mobile, dove va la base sul fianco
    bracci: pos.map(b => ({ da: punto(s.asse, a, s.lungo, b, -1), a: punto(s.asse, a, s.lungo, b, -45), largo: 8, alto: 10 })),
  };
}

export function maniglia(p) {
  const m = (p.ferramenta || []).find(f => f.tipo === 'maniglia');
  if (!m) return null;
  const { L, W, T } = dimensioni(p);
  const c = cerniere(p);
  const latoManiglia = c ? opposto[c.lato] : (m.lato || 'B');
  const s = lato(latoManiglia, L, W);
  const parallela = m.direzione !== 'perpendicolare';
  const i = m.interasse || 128;
  const dalBordo = m.dalBordo ?? 40;
  const quota = { inizio: Math.min(s.len, 60 + i / 2), centro: s.len / 2, fine: Math.max(0, s.len - 60 - i / 2) }[m.posizione || 'fine'];
  const a = s.val + s.verso * dalBordo;
  let fori;
  if (parallela) fori = [quota - i / 2, quota + i / 2].map(b => punto(s.asse, a, s.lungo, b, 0));
  else fori = [a, a + s.verso * i].map(x => punto(s.asse, x, s.lungo, quota, 0));
  const avvisi = [];
  for (const f of fori) if (f[0] < 8 || f[0] > L - 8 || f[1] < 8 || f[1] > W - 8) { avvisi.push(`La maniglia da ${i} mm non sta sull'anta: scegli un interasse più corto o un'altra posizione.`); break; }
  return {
    ...m, lato: latoManiglia, avvisi,
    fori: fori.map(c => ({ c, r: 2.5, z0: -1, z1: T + 1, nome: 'foro Ø 5 passante' })),
    barra: { da: [fori[0][0], fori[0][1], T], a: [fori[1][0], fori[1][1], T], sporgenza: 32 },
    vite: `M4 × ${[20, 22, 25, 30, 35].find(l => l >= T + 6) || 40}`,
  };
}

// Tutti i fori della ferramenta del pezzo, per toglierli dal solido.
export function foriPezzo(p) {
  return [...(cerniere(p)?.fori || []), ...(maniglia(p)?.fori || [])];
}

// Guide del cassetto, montate sul fianco del cassetto (lungo la lunghezza, a metà altezza, sulla faccia esterna).
export function guide(p) {
  const g = (p.ferramenta || []).find(f => f.tipo === 'guida');
  if (!g) return null;
  const { W, T } = dimensioni(p), z = g.faccia === 'z0' ? -6.5 : T + 6.5;
  return [{ da: [0, W / 2, z], a: [g.lunghezza, W / 2, z], alto: 12 }];
}

export function haCerniere(p) {
  return (p.ferramenta || []).some(f => f.tipo === 'cerniere');
}
