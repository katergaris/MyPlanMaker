// Progetti di esempio, costruiti con gli stessi comandi che usa l'interfaccia.
import { adatta, nuovoId, nuovoProgetto, rotazioneDa } from './modello.js';

function pezzo(pr, dati) {
  const p = { id: nuovoId(), n: pr.prossimoN++, forma: 'rett', r: 0, tagli: [], ...dati };
  if (typeof p.rot === 'string') p.rot = rotazioneDa(p.rot);
  pr.pezzi.push(p);
  return p;
}

export function mobilettoLeggio() {
  const pr = nuovoProgetto('Mobiletto con leggio');
  const W = 800, D = 500, HF = 750, HB = 900, T = 18;
  const incl = Math.atan2(HB - HF, D) * 180 / Math.PI;
  const fsx = pezzo(pr, { nome: 'Fianco sinistro', tipo: 'pannello', mat: 'mb18', L: 1000, W: D, rot: 'fianco', pos: [T, 0, 0] });
  const fdx = pezzo(pr, { nome: 'Fianco destro', tipo: 'pannello', mat: 'mb18', L: 1000, W: D, rot: 'fianco', pos: [W, 0, 0] });
  const piano = pezzo(pr, { nome: 'Piano inclinato', tipo: 'pannello', mat: 'mb18', L: W, W: Math.round(D / Math.cos(incl * Math.PI / 180)), rot: [Math.round((incl - 90) * 1000) / 1000, 0, 0], pos: [0, HF, 0] });
  pezzo(pr, { nome: 'Fondo', tipo: 'pannello', mat: 'mb18', L: W - 2 * T, W: D - 10, rot: 'orizzontale', pos: [T, 50, 0] });
  pezzo(pr, { nome: 'Ripiano', tipo: 'pannello', mat: 'mb18', L: W - 2 * T, W: D - 10, rot: 'orizzontale', pos: [T, 386, 0] });
  const sch = pezzo(pr, { nome: 'Schienale', tipo: 'pannello', mat: 'hdf3', L: 1000, W: W - 2 * T, rot: 'verticale', pos: [W - T, 50, -D] });
  pezzo(pr, { nome: 'Anta', tipo: 'pannello', mat: 'mb18', L: W - 4, W: 330, r: 0, rot: 'frontale', pos: [2, 52, 0],
    ferramenta: [{ tipo: 'cerniere', lato: 'A', modello: 'sovrapposta' }, { tipo: 'maniglia', interasse: 128, posizione: 'fine', direzione: 'parallela' }] });
  adatta(fsx, piano);
  adatta(fdx, piano);
  adatta(sch, piano);
  return pr;
}

export function tavoloRotondo() {
  const pr = nuovoProgetto('Tavolo rotondo');
  const D = 1000, H = 750, T = 27, c = D / 2, g = 280, s = 60;
  pezzo(pr, { nome: 'Piano rotondo', tipo: 'pannello', mat: 'ro27', forma: 'cerchio', D, L: D, W: D, rot: 'orizzontale', pos: [0, H - T, 0] });
  const gambe = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
  gambe.forEach(([sx, sz], i) => {
    const cx = c + sx * g, cz = -c + sz * g;
    pezzo(pr, { nome: `Gamba ${i + 1}`, tipo: 'listello', mat: 'ro6060', L: H - T, rot: 'verticale', pos: [cx + s / 2, 0, cz - s / 2] });
  });
  const x0 = c - g + s / 2, x1 = c + g - s / 2, z0 = -c + g - s / 2, z1 = -c - g + s / 2, y = H - T - 80;
  pezzo(pr, { nome: 'Fascia davanti', tipo: 'listello', mat: 'ro8020', L: x1 - x0, rot: 'frontale', pos: [x0, y, -c + g - 10] });
  pezzo(pr, { nome: 'Fascia dietro', tipo: 'listello', mat: 'ro8020', L: x1 - x0, rot: 'frontale', pos: [x0, y, -c - g - 10] });
  pezzo(pr, { nome: 'Fascia sinistra', tipo: 'listello', mat: 'ro8020', L: z0 - z1, rot: 'profondita', pos: [c - g - 10, y, z0] });
  pezzo(pr, { nome: 'Fascia destra', tipo: 'listello', mat: 'ro8020', L: z0 - z1, rot: 'profondita', pos: [c + g - 10, y, z0] });
  return pr;
}

export const ESEMPI = [
  { nome: 'Mobiletto con leggio', crea: mobilettoLeggio, nota: 'piano inclinato, fianchi e schienale adattati, anta con cerniere' },
  { nome: 'Tavolo rotondo', crea: tavoloRotondo, nota: 'piano Ø 100 in rovere, 4 gambe e fascia' },
];
