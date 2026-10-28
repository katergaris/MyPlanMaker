// Modelli pronti: poche misure → pezzi veri, poi tutto resta modificabile come se fosse fatto a mano.
// Ogni modello: { id, nome, descr, parametri: [{ k, nome, tipo: 'mm'|'n'|'mat'|'scelta', def, min, max, opzioni }], crea(pr, v, x0) }
import { adatta, nuovoId, rotazioneDa } from './modello.js';
import { materiale } from './materiali.js';
import { creaCassetti } from './cassetti.js';

function pezzo(pr, dati, x0 = 0) {
  const p = { id: nuovoId(), n: pr.prossimoN++, forma: 'rett', r: 0, tagli: [], ...dati };
  if (typeof p.rot === 'string') p.rot = rotazioneDa(p.rot);
  p.pos = [p.pos[0] + x0, p.pos[1], p.pos[2]];
  pr.pezzi.push(p);
  return p;
}

const mm = (k, nome, def, min, max) => ({ k, nome, tipo: 'mm', def, min, max });
const num = (k, nome, def, min, max) => ({ k, nome, tipo: 'n', def, min, max });
const mat = (k, nome, def, tipo = 'pannello') => ({ k, nome, tipo: 'mat', def, filtro: tipo });
const scelta = (k, nome, def, opzioni) => ({ k, nome, tipo: 'scelta', def, opzioni });

// Fianchi, base e cielo di un mobile a pannelli. Restituisce i pezzi e le quote interne.
function cassa(pr, v, x0, { zoccolo = 0, cielo = 'tra', schienale = true, nome = '' } = {}) {
  const T = materiale(v.mat).T, { L, H, P } = v;
  const fs = pezzo(pr, { nome: `${nome}Fianco sinistro`, tipo: 'pannello', mat: v.mat, L: H, W: P, rot: 'fianco', pos: [T, 0, 0] }, x0);
  const fd = pezzo(pr, { nome: `${nome}Fianco destro`, tipo: 'pannello', mat: v.mat, L: H, W: P, rot: 'fianco', pos: [L, 0, 0] }, x0);
  const dietro = 0; // lo schienale è applicato dietro: base e cielo vanno a tutta profondità
  const base = pezzo(pr, { nome: `${nome}Base`, tipo: 'pannello', mat: v.mat, L: L - 2 * T, W: P - dietro, rot: 'orizzontale', pos: [T, zoccolo, 0] }, x0);
  let top = null;
  if (cielo === 'tra') top = pezzo(pr, { nome: `${nome}Cielo`, tipo: 'pannello', mat: v.mat, L: L - 2 * T, W: P - dietro, rot: 'orizzontale', pos: [T, H - T, 0] }, x0);
  if (zoccolo > 0) pezzo(pr, { nome: `${nome}Zoccolo`, tipo: 'pannello', mat: v.mat, L: L - 2 * T, W: zoccolo, rot: 'frontale', pos: [T, 0, -40] }, x0);
  if (schienale) pezzo(pr, { nome: `${nome}Schienale`, tipo: 'pannello', mat: 'hdf3', L: L, W: H - zoccolo, rot: 'frontale', pos: [0, zoccolo, -P - 3] }, x0);
  return { fs, fd, base, top, T, yBase: zoccolo + T, yTop: cielo === 'tra' ? H - T : H, xi0: x0 + T, xi1: x0 + L - T };
}

function ripiani(pr, v, x0, y0, y1, n, T, prof, nome = 'Ripiano') {
  const passo = (y1 - y0 - n * T) / (n + 1);
  for (let i = 1; i <= n; i++) pezzo(pr, { nome: n > 1 ? `${nome} ${i}` : nome, tipo: 'pannello', mat: v.mat, L: v.L - 2 * T, W: prof, rot: 'orizzontale', pos: [T, y0 + i * passo + (i - 1) * T, -20] }, x0);
}

function ante(pr, v, x0, y0, y1, quante, T, nome = 'Anta') {
  const fuga = 3, largo = (v.L - fuga * (quante + 1)) / quante;
  for (let i = 0; i < quante; i++) {
    const lato = quante === 1 ? 'A' : i === 0 ? 'A' : 'B';
    pezzo(pr, { nome: quante > 1 ? `${nome} ${i === 0 ? 'sinistra' : 'destra'}` : nome, tipo: 'pannello', mat: v.matAnte || v.mat, L: largo, W: y1 - y0 - fuga, rot: 'frontale',
      pos: [fuga + i * (largo + fuga), y0 + fuga / 2, 0],
      ferramenta: [{ tipo: 'cerniere', lato, modello: 'sovrapposta' }, { tipo: 'maniglia', interasse: 128, posizione: v.pensile ? 'inizio' : 'fine', direzione: 'parallela' }] }, x0);
  }
}

export const MODELLI = [
  {
    id: 'libreria', nome: 'Libreria', descr: 'Fianchi, base con zoccolo, cielo, ripiani e schienale.',
    parametri: [mm('L', 'Larghezza', 800, 300, 2400), mm('H', 'Altezza', 1800, 400, 2700), mm('P', 'Profondità', 300, 150, 600), num('n', 'Ripiani', 4, 0, 12), mm('zoccolo', 'Zoccolo', 60, 0, 150), mat('mat', 'Materiale', 'mb18')],
    crea(pr, v, x0) {
      const c = cassa(pr, v, x0, { zoccolo: v.zoccolo });
      ripiani(pr, v, x0, c.yBase, c.yTop, v.n, c.T, v.P - 23);
    },
  },
  {
    id: 'base', nome: 'Mobile base con ante', descr: 'Mobile da terra (cucina, bagno, ingresso) con ante, ripiano e piano sopra.',
    parametri: [mm('L', 'Larghezza', 800, 300, 1200), mm('H', 'Altezza (senza piano)', 720, 400, 1000), mm('P', 'Profondità', 560, 250, 650), scelta('ante', 'Ante', '2', { 1: '1 anta', 2: '2 ante' }), num('n', 'Ripiani', 1, 0, 3), mm('zoccolo', 'Zoccolo', 100, 0, 150), mat('mat', 'Materiale cassa', 'mb18'), mat('matAnte', 'Materiale ante', 'mdf18'), mat('matPiano', 'Piano', 'al27')],
    crea(pr, v, x0) {
      const c = cassa(pr, v, x0, { zoccolo: v.zoccolo });
      ripiani(pr, v, x0, c.yBase, c.yTop, v.n, c.T, v.P - 60);
      ante(pr, v, x0, v.zoccolo, v.H, +v.ante, c.T);
      pezzo(pr, { nome: 'Piano', tipo: 'pannello', mat: v.matPiano, L: v.L + 20, W: v.P + 30, rot: 'orizzontale', pos: [-10, v.H, 30] }, x0);
    },
  },
  {
    id: 'pensile', nome: 'Pensile', descr: 'Mobile da appendere con ante e ripiani.',
    parametri: [mm('L', 'Larghezza', 600, 300, 1200), mm('H', 'Altezza', 720, 300, 1000), mm('P', 'Profondità', 320, 200, 450), scelta('ante', 'Ante', '1', { 1: '1 anta', 2: '2 ante' }), num('n', 'Ripiani', 2, 0, 4), mat('mat', 'Materiale', 'mb18'), mat('matAnte', 'Materiale ante', 'mdf18')],
    crea(pr, v, x0) {
      const c = cassa(pr, v, x0, { zoccolo: 0 });
      ripiani(pr, v, x0, c.yBase, c.yTop, v.n, c.T, v.P - 23);
      ante(pr, { ...v, pensile: true }, x0, 0, v.H, +v.ante, c.T);
    },
  },
  {
    id: 'cassettiera', nome: 'Cassettiera', descr: 'Cassa con cassetti su guide a sfere e piano sopra.',
    parametri: [mm('L', 'Larghezza', 600, 300, 1200), mm('H', 'Altezza', 800, 300, 1400), mm('P', 'Profondità', 450, 300, 650), num('n', 'Cassetti', 4, 1, 8), mm('zoccolo', 'Zoccolo', 60, 0, 150), mat('mat', 'Materiale cassa', 'mb18'), mat('matCassone', 'Materiale cassetti', 'mb12'), mat('matAnte', 'Materiale frontali', 'mb18')],
    crea(pr, v, x0) {
      const c = cassa(pr, v, x0, { zoccolo: v.zoccolo });
      const r = creaCassetti(pr, { x0: c.xi0, x1: c.xi1, y0: c.yBase, y1: c.yTop, zFronte: 0, profondita: v.P, n: v.n, spessoreFianchi: c.T, matCassone: v.matCassone, matFrontale: v.matAnte, frontale: 'filo' });
      if (!r.ok) throw new Error(r.msg);
    },
  },
  {
    id: 'scaffale', nome: 'Scaffale a giorno', descr: 'Montanti in listello, ripiani in pannello: cantina, garage, dispensa.',
    parametri: [mm('L', 'Larghezza', 800, 400, 2000), mm('H', 'Altezza', 1800, 500, 2500), mm('P', 'Profondità', 400, 200, 800), num('n', 'Ripiani', 5, 2, 10), mat('mat', 'Ripiani', 'mb18'), mat('matL', 'Montanti', 'ab4545', 'listello')],
    crea(pr, v, x0) {
      const s = materiale(v.matL).W, T = materiale(v.mat).T;
      [[0, 0], [v.L - s, 0], [0, -v.P + s], [v.L - s, -v.P + s]].forEach(([x, z], i) =>
        pezzo(pr, { nome: `Montante ${i + 1}`, tipo: 'listello', mat: v.matL, L: v.H, rot: 'verticale', pos: [x + s, 0, z - s] }, x0));
      const passo = (v.H - 80 - T) / (v.n - 1);
      for (let i = 0; i < v.n; i++) pezzo(pr, { nome: `Ripiano ${i + 1}`, tipo: 'pannello', mat: v.mat, L: v.L - 2 * s, W: v.P, rot: 'orizzontale', pos: [s, 80 + i * passo, 0] }, x0);
    },
  },
  {
    id: 'tavolo', nome: 'Tavolo', descr: 'Piano rettangolare o rotondo, 4 gambe e fascia.',
    parametri: [scelta('forma', 'Forma', 'rett', { rett: 'Rettangolare', cerchio: 'Rotondo' }), mm('L', 'Lunghezza (o diametro)', 1600, 600, 3000), mm('P', 'Larghezza', 900, 500, 1200), mm('H', 'Altezza', 750, 400, 1100), mm('r', 'Raggio degli angoli', 10, 0, 300), mat('mat', 'Piano', 'al27'), mat('matL', 'Gambe', 'ab6060', 'listello'), mat('matF', 'Fascia', 'ro8020', 'listello')],
    crea(pr, v, x0) {
      const T = materiale(v.mat).T, s = materiale(v.matL).W, tondo = v.forma === 'cerchio';
      const LL = v.L, PP = tondo ? v.L : v.P, hg = v.H - T;
      pezzo(pr, { nome: 'Piano', tipo: 'pannello', mat: v.mat, forma: tondo ? 'cerchio' : 'rett', D: LL, L: LL, W: PP, r: tondo ? 0 : v.r, rot: 'orizzontale', pos: [0, hg, 0] }, x0);
      // gambe: rientrano di 80 mm (rettangolare) o stanno dentro il cerchio (rotondo)
      const rientro = tondo ? LL / 2 - LL * 0.35 : 80;
      const gx = [rientro, LL - rientro - s], gz = [-rientro - s, -PP + rientro];
      const gambe = [];
      for (const x of gx) for (const z of gz) gambe.push(pezzo(pr, { nome: `Gamba ${gambe.length + 1}`, tipo: 'listello', mat: v.matL, L: hg, rot: 'verticale', pos: [x + s, 0, z] }, x0));
      const hf = materiale(v.matF).W, tf = materiale(v.matF).T, yf = hg - hf;
      pezzo(pr, { nome: 'Fascia davanti', tipo: 'listello', mat: v.matF, L: gx[1] - gx[0] - s, rot: 'frontale', pos: [gx[0] + s, yf, -rientro - s / 2 - tf / 2] }, x0);
      pezzo(pr, { nome: 'Fascia dietro', tipo: 'listello', mat: v.matF, L: gx[1] - gx[0] - s, rot: 'frontale', pos: [gx[0] + s, yf, -PP + rientro + s / 2 - tf / 2] }, x0);
      pezzo(pr, { nome: 'Fascia sinistra', tipo: 'listello', mat: v.matF, L: (PP - 2 * rientro) - 2 * s, rot: 'profondita', pos: [gx[0] + s / 2 - tf / 2, yf, -rientro - s] }, x0);
      pezzo(pr, { nome: 'Fascia destra', tipo: 'listello', mat: v.matF, L: (PP - 2 * rientro) - 2 * s, rot: 'profondita', pos: [gx[1] + s / 2 - tf / 2, yf, -rientro - s] }, x0);
    },
  },
  {
    id: 'panca', nome: 'Panca', descr: 'Seduta con due fianchi pieni e un traverso sotto.',
    parametri: [mm('L', 'Lunghezza', 1200, 400, 2400), mm('P', 'Profondità', 350, 250, 500), mm('H', 'Altezza', 450, 300, 600), mat('mat', 'Materiale', 'al27')],
    crea(pr, v, x0) {
      const T = materiale(v.mat).T, rientro = 60;
      const seduta = pezzo(pr, { nome: 'Seduta', tipo: 'pannello', mat: v.mat, L: v.L, W: v.P, r: 10, rot: 'orizzontale', pos: [0, v.H - T, 0] }, x0);
      for (const [x, n] of [[rientro + T, 'Fianco sinistro'], [v.L - rientro, 'Fianco destro']]) {
        const f = pezzo(pr, { nome: n, tipo: 'pannello', mat: v.mat, L: v.H, W: v.P - 40, rot: 'fianco', pos: [x, 0, -20] }, x0);
        adatta(f, seduta);
      }
      pezzo(pr, { nome: 'Traverso', tipo: 'pannello', mat: v.mat, L: v.L - 2 * (rientro + T), W: 120, rot: 'frontale', pos: [rientro + T, v.H - T - 140, -v.P / 2] }, x0);
    },
  },
];

export const modello = id => MODELLI.find(m => m.id === id);

export function valoriDefault(m) {
  return Object.fromEntries(m.parametri.map(p => [p.k, p.def]));
}
