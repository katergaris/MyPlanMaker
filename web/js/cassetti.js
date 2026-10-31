// Cassetti: dato il vano (le due pareti, sopra e sotto, il davanti) crea cassone (fianchi, fronte, retro, fondo),
// frontale con maniglia e guide. Tre tipi di guida, con le misure impostabili (valori di partenza indicativi):
// - 'sfere': guide a sfere laterali, 12,5 mm di gioco per lato, lunghezze da 250 a 650 a passi di 50;
// - 'sotto': guide nascoste sotto il cassetto, 5 mm di gioco per lato e 14 mm di spazio sotto il cassone;
// - 'legno': listelli di scorrimento avvitati alle pareti, il cassetto ci appoggia sopra, 1 mm di gioco per lato.
// Frontali con 3 mm di fuga.
import { Matrix4 } from '../vendor/three.module.js';
import { nuovoId, rotazioneDa, trasforma } from './modello.js';
import { materiale } from './materiali.js';
import { t, tr } from './lingua.js';

export const GIOCO_GUIDA = 12.5;
export const FUGA = 3;
const LUNGHEZZE_GUIDA = [250, 300, 350, 400, 450, 500, 550, 600, 650];
export const TIPI_GUIDA = {
  sfere: { nome: tr('A sfere, sui fianchi'), gioco: 12.5, sotto: 0 },
  sotto: { nome: tr('Nascoste, sotto il cassetto'), gioco: 5, sotto: 14 },
  legno: { nome: tr('In legno (listelli di scorrimento)'), gioco: 1, sotto: 0, listello: [20, 20] },
};

export const lunghezzaGuida = profondita => [...LUNGHEZZE_GUIDA].reverse().find(l => l <= profondita - 15) || null;
// Lunghezza del cassetto per il tipo di guida: per le guide metalliche la misura commerciale, per il legno quasi tutta la profondità.
export const lunghezzaPer = (tipo, profondita) => (tipo === 'legno' ? (profondita - 15 >= 150 ? Math.floor((profondita - 10) / 10) * 10 : null) : lunghezzaGuida(profondita));

function pezzo(pr, dati) {
  const p = { id: nuovoId(), n: pr.prossimoN++, forma: 'rett', r: 0, tagli: [], ...dati };
  if (typeof p.rot === 'string') p.rot = rotazioneDa(p.rot);
  pr.pezzi.push(p);
  return p;
}

// v: { x0, x1 (facce interne dei fianchi), y0, y1 (spazio in altezza), zFronte (bordo davanti dei fianchi),
//      profondita, n, spessoreFianchi, matCassone, matFrontale, extraCassone/extraFrontale ({ spessore } su misura), frontale: 'sovrapposto'|'filo', maniglia }
// v.guida = { tipo: 'sfere' | 'sotto' | 'legno', gioco (mm per lato), lunghezza (null = scelta dalla profondità),
// sotto (spazio sotto il cassone, guide nascoste), listello [alto, largo] (legno) }.
// v.ruota = angolo (radianti) intorno alla verticale: il vano è descritto girato con il davanti verso +Z, poi i
// pezzi vengono girati al loro posto.
export function creaCassetti(pr, v) {
  const gd = { ...TIPI_GUIDA[v.guida?.tipo || 'sfere'], tipo: v.guida?.tipo || 'sfere', ...Object.fromEntries(Object.entries(v.guida || {}).filter(([, x]) => x !== null && x !== undefined)) };
  const tf0 = v.extraFrontale?.spessore || materiale(v.matFrontale).T, prof = v.profondita - (v.frontale === 'filo' ? tf0 : 0);
  const lg = gd.lunghezza || lunghezzaPer(gd.tipo, prof);
  if (!lg) return { ok: false, msg: gd.tipo === 'legno' ? t('Mobile troppo poco profondo per un cassetto ({p} mm).', { p: Math.round(v.profondita) }) : t('Mobile troppo poco profondo ({p} mm): servono almeno 265 mm per le guide più corte.', { p: Math.round(v.profondita) }) };
  if (lg > prof + 0.5) return { ok: false, msg: t('Guide da {l} mm troppo lunghe per una profondità di {p} mm.', { l: lg, p: Math.round(prof) }) };
  const largo = v.x1 - v.x0, alto = v.y1 - v.y0;
  if (largo < 150) return { ok: false, msg: t('Spazio troppo stretto per un cassetto.') };
  const n = Math.max(1, Math.round(v.n || 1)), hVano = alto / n;
  if (hVano < 70) return { ok: false, msg: t('{n} cassetti in {h} mm sono troppi: ogni cassetto avrebbe meno di 70 mm.', { n, h: Math.round(alto) }) };

  const tc = v.extraCassone?.spessore || materiale(v.matCassone).T, tf = tf0, ts = v.spessoreFianchi;
  const nuovi = [];
  for (let i = 0; i < n; i++) {
    const g = 'cassetto-' + nuovoId(), y = v.y0 + i * hVano, nome = n > 1 ? `${t('Cassetto')} ${i + 1}` : t('Cassetto');
    const [lAlto, lLargo] = gd.listello || [20, 20], sotto = gd.tipo === 'legno' ? lAlto + 2 : gd.tipo === 'sotto' ? gd.sotto : 12;
    const hCassone = Math.max(50, Math.round(hVano - sotto - 28)), yc = y + sotto;
    const xa = v.x0 + gd.gioco, xb = v.x1 - gd.gioco, zf = v.zFronte;
    if (gd.tipo === 'legno' && lLargo <= gd.gioco + 3) return { ok: false, msg: t('I listelli devono sporgere dalla parete più del gioco: larghezza almeno {l} mm.', { l: Math.ceil(gd.gioco + 4) }) };
    const base = { mobile: true, gruppo: g }, metallo = gd.tipo !== 'legno';
    const guida = faccia => (metallo ? [{ tipo: 'guida', modello: gd.tipo, lunghezza: lg, faccia, gioco: gd.gioco }] : []);
    nuovi.push(
      pezzo(pr, { ...base, nome: `${nome} · ${t('fianco sinistro')}`, tipo: 'pannello', mat: v.matCassone, ...v.extraCassone, L: lg, W: hCassone, rot: 'profondita', pos: [xa, yc, zf], ferramenta: guida('z0') }),
      pezzo(pr, { ...base, nome: `${nome} · ${t('fianco destro')}`, tipo: 'pannello', mat: v.matCassone, ...v.extraCassone, L: lg, W: hCassone, rot: 'profondita', pos: [xb - tc, yc, zf], ferramenta: guida('zT') }),
      // con i listelli il fondo sta tra i fianchi (sotto non c'è posto), e fronte e retro ci appoggiano sopra
      ...(() => {
        const dentro = gd.tipo === 'legno', yf = dentro ? yc + 3 : yc, hf = dentro ? hCassone - 3 : hCassone;
        return [
          pezzo(pr, { ...base, nome: `${nome} · ${t('fronte')}`, tipo: 'pannello', mat: v.matCassone, ...v.extraCassone, L: xb - xa - 2 * tc, W: hf, rot: 'frontale', pos: [xa + tc, yf, zf - tc] }),
          pezzo(pr, { ...base, nome: `${nome} · ${t('retro')}`, tipo: 'pannello', mat: v.matCassone, ...v.extraCassone, L: xb - xa - 2 * tc, W: hf, rot: 'frontale', pos: [xa + tc, yf, zf - lg] }),
          dentro
            ? pezzo(pr, { ...base, nome: `${nome} · ${t('fondo')}`, tipo: 'pannello', mat: 'hdf3', L: xb - xa - 2 * tc, W: lg, rot: 'orizzontale', pos: [xa + tc, yc, zf] })
            : pezzo(pr, { ...base, nome: `${nome} · ${t('fondo')}`, tipo: 'pannello', mat: 'hdf3', L: xb - xa, W: lg, rot: 'orizzontale', pos: [xa, yc - 3, zf] }),
        ];
      })(),
    );
    // frontale: sovrapposto copre i fianchi del mobile (meno la fuga), a filo sta dentro il vano
    const fx0 = v.frontale === 'filo' ? v.x0 + FUGA / 2 : v.x0 - ts + FUGA / 2, fx1 = v.frontale === 'filo' ? v.x1 - FUGA / 2 : v.x1 + ts - FUGA / 2;
    const fz = v.frontale === 'filo' ? zf - tf : zf;
    const fr = pezzo(pr, { ...base, ruolo: 'frontale', nome: `${nome} · ${t('frontale')}`,
 tipo: 'pannello', mat: v.matFrontale, ...v.extraFrontale, L: fx1 - fx0, W: hVano - FUGA, rot: 'frontale', pos: [fx0, y + FUGA / 2, fz],
      ferramenta: v.maniglia === false ? [] : [{ tipo: 'maniglia', interasse: largo > 500 ? 192 : 128, posizione: 'centro', direzione: 'parallela', lato: 'alto', dalBordo: Math.min(40, (hVano - FUGA) / 2) }] });
    nuovi.push(fr);
    if (v.frontale === 'filo') for (const p of nuovi.slice(-6, -1)) p.pos[2] -= tf;
    if (gd.tipo === 'legno') {
      // listelli di scorrimento: fissi alle pareti del mobile (non fanno parte del cassetto), il fianco ci appoggia sopra
      const lungo = Math.min(v.profondita, lg + 20), dz = v.frontale === 'filo' ? tf : 0;
      for (const [lato, x] of [[t('sinistro'), v.x0], [t('destro'), v.x1 - lLargo]]) {
        nuovi.push(pezzo(pr, { nome: `${nome} · ${t('listello di scorrimento {lato}', { lato })}`, tipo: 'listello', mat: 'ab2040', sezione: [lAlto, lLargo], L: lungo, rot: 'profondita', pos: [x, yc - lAlto, zf - dz] }));
      }
    }
  }
  if (v.ruota) {
    const R = new Matrix4().makeRotationY(v.ruota);
    for (const p of nuovi) trasforma(p, R);
  }
  return { ok: true, nuovi, guida: lg, tipo: gd.tipo };
}
