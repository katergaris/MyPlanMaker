// Cassetti con guide a sfere: dato lo spazio tra due fianchi crea cassone (fianchi, fronte, retro, fondo),
// frontale sovrapposto con maniglia e guide. Misure di partenza (indicative, come le guide più comuni):
// 12,5 mm di gioco per lato per le guide, guide da 250 a 650 mm a passi di 50, frontali con 3 mm di fuga.
import { nuovoId, rotazioneDa } from './modello.js';
import { materiale } from './materiali.js';
import { t } from './lingua.js';

export const GIOCO_GUIDA = 12.5;
export const FUGA = 3;
const LUNGHEZZE_GUIDA = [250, 300, 350, 400, 450, 500, 550, 600, 650];

export const lunghezzaGuida = profondita => [...LUNGHEZZE_GUIDA].reverse().find(l => l <= profondita - 15) || null;

function pezzo(pr, dati) {
  const p = { id: nuovoId(), n: pr.prossimoN++, forma: 'rett', r: 0, tagli: [], ...dati };
  if (typeof p.rot === 'string') p.rot = rotazioneDa(p.rot);
  pr.pezzi.push(p);
  return p;
}

// v: { x0, x1 (facce interne dei fianchi), y0, y1 (spazio in altezza), zFronte (bordo davanti dei fianchi),
//      profondita, n, spessoreFianchi, matCassone, matFrontale, extraCassone/extraFrontale ({ spessore } su misura), frontale: 'sovrapposto'|'filo', maniglia }
export function creaCassetti(pr, v) {
  const tf0 = v.extraFrontale?.spessore || materiale(v.matFrontale).T, lg = lunghezzaGuida(v.profondita - (v.frontale === 'filo' ? tf0 : 0));
  if (!lg) return { ok: false, msg: t('Mobile troppo poco profondo ({p} mm): servono almeno 265 mm per le guide più corte.', { p: Math.round(v.profondita) }) };
  const largo = v.x1 - v.x0, alto = v.y1 - v.y0;
  if (largo < 150) return { ok: false, msg: t('Spazio troppo stretto per un cassetto.') };
  const n = Math.max(1, Math.round(v.n || 1)), hVano = alto / n;
  if (hVano < 70) return { ok: false, msg: t('{n} cassetti in {h} mm sono troppi: ogni cassetto avrebbe meno di 70 mm.', { n, h: Math.round(alto) }) };

  const tc = v.extraCassone?.spessore || materiale(v.matCassone).T, tf = tf0, ts = v.spessoreFianchi;
  const nuovi = [];
  for (let i = 0; i < n; i++) {
    const g = 'cassetto-' + nuovoId(), y = v.y0 + i * hVano, nome = n > 1 ? `${t('Cassetto')} ${i + 1}` : t('Cassetto');
    const hCassone = Math.max(50, Math.round(hVano - 40)), yc = y + 12;
    const xa = v.x0 + GIOCO_GUIDA, xb = v.x1 - GIOCO_GUIDA, zf = v.zFronte;
    const base = { mobile: true, gruppo: g };
    nuovi.push(
      pezzo(pr, { ...base, nome: `${nome} · ${t('fianco sinistro')}`, tipo: 'pannello', mat: v.matCassone, ...v.extraCassone, L: lg, W: hCassone, rot: 'profondita', pos: [xa, yc, zf], ferramenta: [{ tipo: 'guida', lunghezza: lg, faccia: 'z0' }] }),
      pezzo(pr, { ...base, nome: `${nome} · ${t('fianco destro')}`, tipo: 'pannello', mat: v.matCassone, ...v.extraCassone, L: lg, W: hCassone, rot: 'profondita', pos: [xb - tc, yc, zf], ferramenta: [{ tipo: 'guida', lunghezza: lg, faccia: 'zT' }] }),
      pezzo(pr, { ...base, nome: `${nome} · ${t('fronte')}`, tipo: 'pannello', mat: v.matCassone, ...v.extraCassone, L: xb - xa - 2 * tc, W: hCassone, rot: 'frontale', pos: [xa + tc, yc, zf - tc] }),
      pezzo(pr, { ...base, nome: `${nome} · ${t('retro')}`, tipo: 'pannello', mat: v.matCassone, ...v.extraCassone, L: xb - xa - 2 * tc, W: hCassone, rot: 'frontale', pos: [xa + tc, yc, zf - lg] }),
      pezzo(pr, { ...base, nome: `${nome} · ${t('fondo')}`, tipo: 'pannello', mat: 'hdf3', L: xb - xa, W: lg, rot: 'orizzontale', pos: [xa, yc - 3, zf] }),
    );
    // frontale: sovrapposto copre i fianchi del mobile (meno la fuga), a filo sta dentro il vano
    const fx0 = v.frontale === 'filo' ? v.x0 + FUGA / 2 : v.x0 - ts + FUGA / 2, fx1 = v.frontale === 'filo' ? v.x1 - FUGA / 2 : v.x1 + ts - FUGA / 2;
    const fz = v.frontale === 'filo' ? zf - tf : zf;
    const fr = pezzo(pr, { ...base, ruolo: 'frontale', nome: `${nome} · ${t('frontale')}`,
 tipo: 'pannello', mat: v.matFrontale, ...v.extraFrontale, L: fx1 - fx0, W: hVano - FUGA, rot: 'frontale', pos: [fx0, y + FUGA / 2, fz],
      ferramenta: v.maniglia === false ? [] : [{ tipo: 'maniglia', interasse: largo > 500 ? 192 : 128, posizione: 'centro', direzione: 'parallela', lato: 'alto', dalBordo: Math.min(40, (hVano - FUGA) / 2) }] });
    nuovi.push(fr);
    if (v.frontale === 'filo') for (const p of nuovi.slice(-6, -1)) p.pos[2] -= tf;
  }
  return { ok: true, nuovi, guida: lg };
}
