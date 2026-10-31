// Lista della spesa della ferramenta: viti, angolari, cerniere, maniglie.
import { CATALOGO, MODELLI_CERNIERA, cerniere, maniglia } from './ferramenta.js';
import { fmt } from './modello.js';
import { righeDistinta } from './distinta.js';
import { lingua, t } from './lingua.js';


const COLLA = () => t('Colla vinilica (flacone)'), CHIODINI = () => t('Chiodini o graffe per schienali (confezione)');

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
      if (g.fissaggio === 'confirmat') aggiungi(t('Vite confirmat 7×50'), n, 0.12, t('punta a gradino Ø 5/7, chiave esagonale 4'));
      else if (g.fissaggio === 'spinotti') aggiungi(t('Spinotto in faggio Ø {d}×{l}', { d: g.viti[0].d, l: g.viti[0].d === 8 ? 35 : 30 }), n, 0.04, t('con colla vinilica'));
      else if (g.fissaggio === 'eccentrici') aggiungi(t('Eccentrico Ø 15 con perno (minifix)'), n, 0.45, t('punta a tazza Ø 15'));
      else aggiungi(t('Vite {d}×{l}', { d: fmt(g.vite.d, 1), l: g.vite.l }), n, CATALOGO.vite.prezzo, t('preforo Ø {d}', { d: fmt(g.vite.preforo, 1) }));
    }
    if (g.fissaggio === 'colla' || g.fissaggio === 'spinotti') aggiungi(COLLA(), 0, 6);
    if (g.angolari) aggiungi(t(CATALOGO.angolare.nome), g.angolari, CATALOGO.angolare.prezzo);
    if (g.chiodini) aggiungi(CHIODINI(), 0, 3, '');
  }
  for (const k of [CHIODINI(), COLLA()]) if (righe.get(k)) righe.get(k).qta = 1;
  for (const p of progetto.pezzi) {
    const c = cerniere(p);
    if (c) aggiungi(`${t(CATALOGO.cerniera.nome)} · ${t(MODELLI_CERNIERA[c.modello] || MODELLI_CERNIERA.sovrapposta)}`, c.n, CATALOGO.cerniera.prezzo, t('con base e viti'));
    const g = (p.ferramenta || []).find(f => f.tipo === 'guida' && f.faccia === 'z0');
    if (g) aggiungi(`${t(CATALOGO.guida.nome)} ${g.lunghezza} mm`, 1, CATALOGO.guida.prezzo, t('con viti'));
    const m = maniglia(p);
    if (m) {
      aggiungi(t('{nome} interasse {i} mm', { nome: t(CATALOGO.maniglia.nome), i: m.interasse || 128 }), 1, CATALOGO.maniglia.prezzo);
      aggiungi(`${t(CATALOGO.viteManiglia.nome)} ${m.vite}`, 2, CATALOGO.viteManiglia.prezzo);

    }
  }
  // Bordo da applicare, per spessore (con 5 cm in più per ogni lato)
  const perSpessore = new Map();
  for (const r of righeDistinta(progetto)) if (r.metriBordo) perSpessore.set(r.spessoreBordo, (perSpessore.get(r.spessoreBordo) || 0) + r.metriBordo);
  for (const [sp, m] of perSpessore) aggiungi(t('Bordo preincollato {s} mm (metri)', { s: fmt(sp, 1) }), Math.ceil(m * 10) / 10, sp >= 2 ? 1.6 : 0.6, t('in rotolo, larghezza 22 o 43 mm'));
  const lista = [...righe.values()].sort((a, b) => a.voce.localeCompare(b.voce, lingua.cod));
  return { righe: lista, totale: lista.reduce((t, r) => t + r.qta * r.prezzo, 0) };
}
