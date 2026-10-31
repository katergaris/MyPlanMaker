// Modelli pronti: poche misure → pezzi veri, poi tutto resta modificabile come se fosse fatto a mano.
// Ogni modello: { id, nome, descr, parametri: [{ k, nome, tipo: 'mm'|'n'|'mat'|'scelta', def, min, max, opzioni }], crea(pr, v, x0) }
// Ogni parametro 'mat' ha anche lo spessore (v[k + 'T']) e, per i listelli, la larghezza della sezione (v[k + 'W']):
// se l'utente li cambia, i pezzi diventano «su misura» (vedi materialePezzo).
import { adatta, nuovoId, rotazioneDa } from './modello.js';
import { materiale } from './materiali.js';
import { creaCassetti } from './cassetti.js';
import { t, tr } from './lingua.js';

// Nomi dei pezzi dei modelli (in italiano): si traducono quando il modello crea il pezzo, numero a parte.
const NOMI_PEZZI = [tr('Fianco sinistro'), tr('Fianco destro'), tr('Base'), tr('Cielo'), tr('Zoccolo'), tr('Schienale'), tr('Ripiano'), tr('Anta'),
  tr('Anta sinistra'), tr('Anta destra'), tr('Piano'), tr('Montante'), tr('Gamba'), tr('Fascia davanti'), tr('Fascia dietro'), tr('Fascia sinistra'),
  tr('Fascia destra'), tr('Seduta'), tr('Traverso')];
const nomeTradotto = nome => { const m = nome.match(/^(.*?)( \d+)?$/); return NOMI_PEZZI.includes(m[1]) ? t(m[1]) + (m[2] || '') : nome; };

function pezzo(pr, dati, x0 = 0) {
  const p = { id: nuovoId(), n: pr.prossimoN++, forma: 'rett', r: 0, tagli: [], ...dati };
  p.nome = nomeTradotto(p.nome);
  if (typeof p.rot === 'string') p.rot = rotazioneDa(p.rot);
  p.pos = [p.pos[0] + x0, p.pos[1], p.pos[2]];
  pr.pezzi.push(p);
  return p;
}

const mm = (k, nome, def, min, max) => ({ k, nome, tipo: 'mm', def, min, max });
const num = (k, nome, def, min, max) => ({ k, nome, tipo: 'n', def, min, max });
const mat = (k, nome, def, tipo = 'pannello') => ({ k, nome, tipo: 'mat', def, filtro: tipo });
const scelta = (k, nome, def, opzioni) => ({ k, nome, tipo: 'scelta', def, opzioni });

// Materiale scelto per il parametro k: { r: campi da mettere nel pezzo, W, T: sezione/spessore effettivi }.
export function scelto(v, k) {
  const m = materiale(v[k]), T = v[k + 'T'] || m.T, W = m.tipo === 'listello' ? v[k + 'W'] || m.W : m.W;
  const r = { mat: m.id };
  if (m.tipo === 'listello') { if (W !== m.W || T !== m.T) r.sezione = [W, T]; } else if (T !== m.T) r.spessore = T;
  return { r, W, T };
}

// Fianchi, base e cielo di un mobile a pannelli. Restituisce i pezzi e le quote interne.
function cassa(pr, v, x0, { zoccolo = 0, cielo = 'tra', schienale = true, nome = '' } = {}) {
  const M = scelto(v, 'mat'), T = M.T, { L, H, P } = v;
  const fs = pezzo(pr, { nome: `${nome}Fianco sinistro`, tipo: 'pannello', ...M.r, L: H, W: P, rot: 'fianco', pos: [T, 0, 0] }, x0);
  const fd = pezzo(pr, { nome: `${nome}Fianco destro`, tipo: 'pannello', ...M.r, L: H, W: P, rot: 'fianco', pos: [L, 0, 0] }, x0);
  const dietro = 0; // lo schienale è applicato dietro: base e cielo vanno a tutta profondità
  const base = pezzo(pr, { nome: `${nome}Base`, tipo: 'pannello', ...M.r, L: L - 2 * T, W: P - dietro, rot: 'orizzontale', pos: [T, zoccolo, 0] }, x0);
  let top = null;
  if (cielo === 'tra') top = pezzo(pr, { nome: `${nome}Cielo`, tipo: 'pannello', ...M.r, L: L - 2 * T, W: P - dietro, rot: 'orizzontale', pos: [T, H - T, 0] }, x0);
  if (zoccolo > 0) pezzo(pr, { nome: `${nome}Zoccolo`, tipo: 'pannello', ...M.r, L: L - 2 * T, W: zoccolo, rot: 'frontale', pos: [T, 0, -40] }, x0);
  if (schienale && v.schienale !== 'no') pezzo(pr, { nome: `${nome}Schienale`, tipo: 'pannello', mat: 'hdf3', L: L, W: H - zoccolo, rot: 'frontale', pos: [0, zoccolo, -P - 3] }, x0);
  return { fs, fd, base, top, T, yBase: zoccolo + T, yTop: cielo === 'tra' ? H - T : H, xi0: x0 + T, xi1: x0 + L - T };
}

function ripiani(pr, v, x0, y0, y1, n, T, prof, nome = 'Ripiano') {
  const passo = (y1 - y0 - n * T) / (n + 1);
  for (let i = 1; i <= n; i++) pezzo(pr, { nome: n > 1 ? `${nome} ${i}` : nome, tipo: 'pannello', ...scelto(v, 'mat').r, L: v.L - 2 * T, W: prof, rot: 'orizzontale', pos: [T, y0 + i * passo + (i - 1) * T, -20] }, x0);
}

function ante(pr, v, x0, y0, y1, quante, T, nome = 'Anta') {
  const fuga = 3, largo = (v.L - fuga * (quante + 1)) / quante;
  for (let i = 0; i < quante; i++) {
    const lato = quante === 1 ? 'A' : i === 0 ? 'A' : 'B';
    pezzo(pr, { nome: quante > 1 ? `${nome} ${i === 0 ? 'sinistra' : 'destra'}` : nome, tipo: 'pannello', ...scelto(v, v.matAnte ? 'matAnte' : 'mat').r, L: largo, W: y1 - y0 - fuga, rot: 'frontale',
      pos: [fuga + i * (largo + fuga), y0 + fuga / 2, 0],
      ferramenta: [{ tipo: 'cerniere', lato, modello: 'sovrapposta' }, { tipo: 'maniglia', interasse: 128, posizione: v.pensile ? 'inizio' : 'fine', direzione: 'parallela' }] }, x0);
  }
}

export const MODELLI = [
  {
    id: 'libreria', nome: tr('Libreria'), descr: tr('Fianchi, base con zoccolo, cielo, ripiani e schienale.'),
    parametri: [mm('L', tr('Larghezza'), 800, 300, 2400), mm('H', tr('Altezza'), 1800, 400, 2700), mm('P', tr('Profondità'), 300, 150, 600), num('n', tr('Ripiani'), 4, 0, 12), mm('zoccolo', tr('Zoccolo'), 60, 0, 150), scelta('schienale', tr('Schienale'), 'si', { si: tr('Sì'), no: tr('No') }), mat('mat', tr('Materiale'), 'mb18')],
    crea(pr, v, x0) {
      const c = cassa(pr, v, x0, { zoccolo: v.zoccolo });
      ripiani(pr, v, x0, c.yBase, c.yTop, v.n, c.T, v.P - (v.schienale === 'no' ? 20 : 23));
    },
  },
  {
    id: 'base', nome: tr('Mobile base con ante'), descr: tr('Mobile da terra (cucina, bagno, ingresso) con ante, ripiano e piano sopra.'),
    parametri: [mm('L', tr('Larghezza'), 800, 300, 1200), mm('H', tr('Altezza (senza piano)'), 720, 400, 1000), mm('P', tr('Profondità'), 560, 250, 650), scelta('ante', tr('Ante'), '2', { 1: tr('1 anta'), 2: tr('2 ante') }), num('n', tr('Ripiani'), 1, 0, 3), mm('zoccolo', tr('Zoccolo'), 100, 0, 150), mm('spD', tr('Sporgenza del piano davanti'), 30, 0, 100), mm('spL', tr('Sporgenza del piano ai lati'), 10, 0, 300), mat('mat', tr('Materiale cassa'), 'mb18'), mat('matAnte', tr('Materiale ante'), 'mdf18'), mat('matPiano', tr('Piano'), 'al27')],
    crea(pr, v, x0) {
      const c = cassa(pr, v, x0, { zoccolo: v.zoccolo });
      ripiani(pr, v, x0, c.yBase, c.yTop, v.n, c.T, v.P - 60);
      ante(pr, v, x0, v.zoccolo, v.H, +v.ante, c.T);
      pezzo(pr, { nome: 'Piano', tipo: 'pannello', ...scelto(v, 'matPiano').r, L: v.L + 2 * v.spL, W: v.P + v.spD, rot: 'orizzontale', pos: [-v.spL, v.H, v.spD] }, x0);
    },
  },
  {
    id: 'pensile', nome: tr('Pensile'), descr: tr('Mobile da appendere con ante e ripiani.'),
    parametri: [mm('L', tr('Larghezza'), 600, 300, 1200), mm('H', tr('Altezza'), 720, 300, 1000), mm('P', tr('Profondità'), 320, 200, 450), scelta('ante', tr('Ante'), '1', { 1: tr('1 anta'), 2: tr('2 ante') }), num('n', tr('Ripiani'), 2, 0, 4), mat('mat', tr('Materiale'), 'mb18'), mat('matAnte', tr('Materiale ante'), 'mdf18')],
    crea(pr, v, x0) {
      const c = cassa(pr, v, x0, { zoccolo: 0 });
      ripiani(pr, v, x0, c.yBase, c.yTop, v.n, c.T, v.P - 23);
      ante(pr, { ...v, pensile: true }, x0, 0, v.H, +v.ante, c.T);
    },
  },
  {
    id: 'cassettiera', nome: tr('Cassettiera'), descr: tr('Cassa con cassetti su guide a sfere e piano sopra.'),
    parametri: [mm('L', tr('Larghezza'), 600, 300, 1200), mm('H', tr('Altezza'), 800, 300, 1400), mm('P', tr('Profondità'), 450, 300, 650), num('n', tr('Cassetti'), 4, 1, 8), mm('zoccolo', tr('Zoccolo'), 60, 0, 150), mat('mat', tr('Materiale cassa'), 'mb18'), mat('matCassone', tr('Materiale cassetti'), 'mb12'), mat('matAnte', tr('Materiale frontali'), 'mb18')],
    crea(pr, v, x0) {
      const c = cassa(pr, v, x0, { zoccolo: v.zoccolo });
      const C = scelto(v, 'matCassone'), F = scelto(v, 'matAnte');
      const r = creaCassetti(pr, { x0: c.xi0, x1: c.xi1, y0: c.yBase, y1: c.yTop, zFronte: 0, profondita: v.P, n: v.n, spessoreFianchi: c.T, matCassone: v.matCassone, matFrontale: v.matAnte, extraCassone: C.r, extraFrontale: F.r, frontale: 'filo' });
      if (!r.ok) throw new Error(r.msg);
    },
  },
  {
    id: 'scaffale', nome: tr('Scaffale a giorno'), descr: tr('Montanti in listello, ripiani in pannello: cantina, garage, dispensa.'),
    parametri: [mm('L', tr('Larghezza'), 800, 400, 2000), mm('H', tr('Altezza'), 1800, 500, 2500), mm('P', tr('Profondità'), 400, 200, 800), num('n', tr('Ripiani'), 5, 2, 10), mm('y0', tr('Altezza del primo ripiano'), 80, 0, 600), mat('mat', tr('Ripiani'), 'mb18'), mat('matL', tr('Montanti'), 'ab4545', 'listello')],
    crea(pr, v, x0) {
      const ML = scelto(v, 'matL'), MR = scelto(v, 'mat'), s = ML.W, T = MR.T;
      [[0, 0], [v.L - s, 0], [0, -v.P + ML.T], [v.L - s, -v.P + ML.T]].forEach(([x, z], i) =>
        pezzo(pr, { nome: `Montante ${i + 1}`, tipo: 'listello', ...ML.r, L: v.H, rot: 'verticale', pos: [x + s, 0, z - ML.T] }, x0));
      const passo = (v.H - v.y0 - T) / (v.n - 1);
      for (let i = 0; i < v.n; i++) pezzo(pr, { nome: `Ripiano ${i + 1}`, tipo: 'pannello', ...MR.r, L: v.L - 2 * s, W: v.P, rot: 'orizzontale', pos: [s, v.y0 + i * passo, 0] }, x0);
    },
  },
  {
    id: 'tavolo', nome: tr('Tavolo'), descr: tr('Piano rettangolare o rotondo, 4 gambe e fascia.'),
    parametri: [scelta('forma', tr('Forma'), 'rett', { rett: tr('Rettangolare'), cerchio: tr('Rotondo') }), mm('L', tr('Lunghezza (o diametro)'), 1600, 600, 3000), mm('P', tr('Larghezza'), 900, 500, 1200), mm('H', tr('Altezza'), 750, 400, 1100), mm('r', tr('Raggio degli angoli'), 10, 0, 300), mm('rientro', tr('Rientro delle gambe dal bordo'), 80, 0, 400), scelta('fascia', tr('Fascia sotto il piano'), 'si', { si: tr('Sì'), no: tr('No') }), mat('mat', tr('Piano'), 'al27'), mat('matL', tr('Gambe'), 'ab6060', 'listello'), mat('matF', tr('Fascia'), 'ro8020', 'listello')],
    crea(pr, v, x0) {
      const MP = scelto(v, 'mat'), MG = scelto(v, 'matL'), MF = scelto(v, 'matF');
      const T = MP.T, sx = MG.W, sz = MG.T, tondo = v.forma === 'cerchio';
      const LL = v.L, PP = tondo ? v.L : v.P, hg = v.H - T;
      pezzo(pr, { nome: 'Piano', tipo: 'pannello', ...MP.r, forma: tondo ? 'cerchio' : 'rett', D: LL, L: LL, W: PP, r: tondo ? 0 : v.r, rot: 'orizzontale', pos: [0, hg, 0] }, x0);
      // gambe: rientrano dal bordo (rettangolare) o stanno dentro il cerchio (rotondo)
      const rientro = tondo ? Math.max(v.rientro, LL / 2 - LL * 0.35) : v.rientro;
      if (LL - 2 * rientro < 2 * sx + 100 || PP - 2 * rientro < 2 * sz + 100) throw new Error(t('Gambe troppo rientrate per questo piano.'));
      const gx = [rientro, LL - rientro - sx], gz = [-rientro - sz, -PP + rientro];
      const gambe = [];
      for (const x of gx) for (const z of gz) gambe.push(pezzo(pr, { nome: `Gamba ${gambe.length + 1}`, tipo: 'listello', ...MG.r, L: hg, rot: 'verticale', pos: [x + sx, 0, z] }, x0));
      if (v.fascia === 'no') return;
      const hf = MF.W, tf = MF.T, yf = hg - hf;
      pezzo(pr, { nome: 'Fascia davanti', tipo: 'listello', ...MF.r, L: gx[1] - gx[0] - sx, rot: 'frontale', pos: [gx[0] + sx, yf, -rientro - sz / 2 - tf / 2] }, x0);
      pezzo(pr, { nome: 'Fascia dietro', tipo: 'listello', ...MF.r, L: gx[1] - gx[0] - sx, rot: 'frontale', pos: [gx[0] + sx, yf, -PP + rientro + sz / 2 - tf / 2] }, x0);
      pezzo(pr, { nome: 'Fascia sinistra', tipo: 'listello', ...MF.r, L: PP - 2 * rientro - 2 * sz, rot: 'profondita', pos: [gx[0] + sx / 2 - tf / 2, yf, -rientro - sz] }, x0);
      pezzo(pr, { nome: 'Fascia destra', tipo: 'listello', ...MF.r, L: PP - 2 * rientro - 2 * sz, rot: 'profondita', pos: [gx[1] + sx / 2 - tf / 2, yf, -rientro - sz] }, x0);
    },
  },
  {
    id: 'panca', nome: tr('Panca'), descr: tr('Seduta con due fianchi pieni e un traverso sotto.'),
    parametri: [mm('L', tr('Lunghezza'), 1200, 400, 2400), mm('P', tr('Profondità'), 350, 250, 500), mm('H', tr('Altezza'), 450, 300, 600), mm('rientro', tr('Rientro dei fianchi'), 60, 0, 300), mm('hT', tr('Altezza del traverso'), 120, 40, 300), mat('mat', tr('Materiale'), 'al27')],
    crea(pr, v, x0) {
      const M = scelto(v, 'mat'), T = M.T, rientro = v.rientro;
      if (v.L - 2 * (rientro + T) < 100) throw new Error(t('Fianchi troppo rientrati per questa lunghezza.'));
      const seduta = pezzo(pr, { nome: 'Seduta', tipo: 'pannello', ...M.r, L: v.L, W: v.P, r: 10, rot: 'orizzontale', pos: [0, v.H - T, 0] }, x0);
      for (const [x, n] of [[rientro + T, 'Fianco sinistro'], [v.L - rientro, 'Fianco destro']]) {
        const f = pezzo(pr, { nome: n, tipo: 'pannello', ...M.r, L: v.H, W: v.P - 40, rot: 'fianco', pos: [x, 0, -20] }, x0);
        adatta(f, seduta);
      }
      pezzo(pr, { nome: 'Traverso', tipo: 'pannello', ...M.r, L: v.L - 2 * (rientro + T), W: v.hT, rot: 'frontale', pos: [rientro + T, v.H - T - 20 - v.hT, -v.P / 2] }, x0);
    },
  },
];

export const modello = id => MODELLI.find(m => m.id === id);

export function valoriDefault(m) {
  return Object.fromEntries(m.parametri.map(p => [p.k, p.def]));
}
