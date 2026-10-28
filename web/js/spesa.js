// Lista della spesa della ferramenta: viti, angolari, cerniere, maniglie.
import { CATALOGO, MODELLI_CERNIERA, cerniere, maniglia } from './ferramenta.js';
import { fmt } from './modello.js';

export function listaSpesa(progetto, u) {
  const righe = new Map();
  const aggiungi = (voce, qta, prezzo, nota = '') => {
    const r = righe.get(voce) || { voce, qta: 0, prezzo, nota };
    r.qta += qta;
    righe.set(voce, r);
  };
  for (const g of u.giunti) {
    if (g.escluso) continue;
    if (g.vite && g.viti.length) aggiungi(`Vite ${fmt(g.vite.d, 1)}×${g.vite.l}`, g.viti.length, CATALOGO.vite.prezzo, `preforo Ø ${fmt(g.vite.preforo, 1)}`);
    if (g.angolari) aggiungi(CATALOGO.angolare.nome, g.angolari, CATALOGO.angolare.prezzo);
    if (g.chiodini) aggiungi('Chiodini o graffe per schienali (confezione)', 0, 3, '');
  }
  const chiodini = righe.get('Chiodini o graffe per schienali (confezione)');
  if (chiodini) chiodini.qta = 1;
  for (const p of progetto.pezzi) {
    const c = cerniere(p);
    if (c) aggiungi(`${CATALOGO.cerniera.nome} · ${MODELLI_CERNIERA[c.modello] || MODELLI_CERNIERA.sovrapposta}`, c.n, CATALOGO.cerniera.prezzo, 'con base e viti');
    const m = maniglia(p);
    if (m) {
      aggiungi(`${CATALOGO.maniglia.nome} interasse ${m.interasse || 128} mm`, 1, CATALOGO.maniglia.prezzo);
      aggiungi(`${CATALOGO.viteManiglia.nome} ${m.vite}`, 2, CATALOGO.viteManiglia.prezzo);
    }
  }
  const lista = [...righe.values()].sort((a, b) => a.voce.localeCompare(b.voce, 'it'));
  return { righe: lista, totale: lista.reduce((t, r) => t + r.qta * r.prezzo, 0) };
}
