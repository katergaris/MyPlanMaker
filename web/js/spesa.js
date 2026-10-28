// Lista della spesa della ferramenta: viti, angolari, cerniere, maniglie.
import { CATALOGO, MODELLI_CERNIERA, cerniere, maniglia } from './ferramenta.js';
import { fmt } from './modello.js';
import { righeDistinta } from './distinta.js';

export function listaSpesa(progetto, u) {
  const righe = new Map();
  const aggiungi = (voce, qta, prezzo, nota = '') => {
    const r = righe.get(voce) || { voce, qta: 0, prezzo, nota };
    r.qta += qta;
    righe.set(voce, r);
  };
  for (const g of u.giunti) {
    if (g.escluso) continue;
    if (g.vite && g.viti.length) {
      const n = g.viti.length;
      if (g.fissaggio === 'confirmat') aggiungi('Vite confirmat 7×50', n, 0.12, 'punta a gradino Ø 5/7, chiave esagonale 4');
      else if (g.fissaggio === 'spinotti') aggiungi(`Spinotto in faggio Ø ${g.viti[0].d}×${g.viti[0].d === 8 ? 35 : 30}`, n, 0.04, 'con colla vinilica');
      else if (g.fissaggio === 'eccentrici') aggiungi('Eccentrico Ø 15 con perno (minifix)', n, 0.45, 'punta a tazza Ø 15');
      else aggiungi(`Vite ${fmt(g.vite.d, 1)}×${g.vite.l}`, n, CATALOGO.vite.prezzo, `preforo Ø ${fmt(g.vite.preforo, 1)}`);
    }
    if (g.fissaggio === 'colla' || g.fissaggio === 'spinotti') aggiungi('Colla vinilica (flacone)', 0, 6);
    if (g.angolari) aggiungi(CATALOGO.angolare.nome, g.angolari, CATALOGO.angolare.prezzo);
    if (g.chiodini) aggiungi('Chiodini o graffe per schienali (confezione)', 0, 3, '');
  }
  for (const k of ['Chiodini o graffe per schienali (confezione)', 'Colla vinilica (flacone)']) if (righe.get(k)) righe.get(k).qta = 1;
  for (const p of progetto.pezzi) {
    const c = cerniere(p);
    if (c) aggiungi(`${CATALOGO.cerniera.nome} · ${MODELLI_CERNIERA[c.modello] || MODELLI_CERNIERA.sovrapposta}`, c.n, CATALOGO.cerniera.prezzo, 'con base e viti');
    const g = (p.ferramenta || []).find(f => f.tipo === 'guida' && f.faccia === 'z0');
    if (g) aggiungi(`${CATALOGO.guida.nome} ${g.lunghezza} mm`, 1, CATALOGO.guida.prezzo, 'con viti');
    const m = maniglia(p);
    if (m) {
      aggiungi(`${CATALOGO.maniglia.nome} interasse ${m.interasse || 128} mm`, 1, CATALOGO.maniglia.prezzo);
      aggiungi(`${CATALOGO.viteManiglia.nome} ${m.vite}`, 2, CATALOGO.viteManiglia.prezzo);
    }
  }
  // Bordo da applicare, per spessore (con 5 cm in più per ogni lato)
  const perSpessore = new Map();
  for (const r of righeDistinta(progetto)) if (r.metriBordo) perSpessore.set(r.spessoreBordo, (perSpessore.get(r.spessoreBordo) || 0) + r.metriBordo);
  for (const [sp, m] of perSpessore) aggiungi(`Bordo preincollato ${fmt(sp, 1)} mm (metri)`, Math.ceil(m * 10) / 10, sp >= 2 ? 1.6 : 0.6, 'in rotolo, larghezza 22 o 43 mm');
  const lista = [...righe.values()].sort((a, b) => a.voce.localeCompare(b.voce, 'it'));
  return { righe: lista, totale: lista.reduce((t, r) => t + r.qta * r.prezzo, 0) };
}
