// Compositore: un mobile descritto a livelli, dal basso verso l'alto (zoccolo, cassetti, vano a giorno, vano con
// ante, piano sopra). Da una composizione nascono pezzi veri (cassa, ripiani fissi tra i livelli, contenuto di ogni
// livello); la composizione resta nel progetto (`progetto.composizioni[id]`) e i pezzi la ricordano (`p.comp`), così il
// mobile si può riaprire e ricomporre.
// Sistema del mobile: x da sinistra a destra (0 … L), y in alto, davanti su z = 0, fondo su z = −P.
import { nuovoId, rotazioneDa } from './modello.js';
import { creaCassetti, FUGA, TIPI_GUIDA } from './cassetti.js';
import { t, tr } from './lingua.js';

export const TIPI_LIVELLO = {
  zoccolo: { nome: tr('Zoccolo'), h: 80 },
  cassetti: { nome: tr('Cassetti'), h: 'auto' },
  giorno: { nome: tr('Vano a giorno'), h: 'auto' },
  ante: { nome: tr('Vano con ante'), h: 'auto' },
  piano: { nome: tr('Piano sopra'), h: 30 },
};
const FRONTALI = new Set(['cassetti', 'ante']);
// Altezza minima utile di un livello (mm).
const MINIMO = { cassetti: 90, giorno: 60, ante: 120 };

export function nuovoLivello(tipo) {
  const extra = { cassetti: { n: 3, guida: 'sfere' }, giorno: { ripiani: 1 }, ante: { ante: 'auto', ripiani: 1 }, piano: { sporge: 20, lati: 0 } }[tipo] || {};
  return { tipo, h: TIPI_LIVELLO[tipo].h, ...extra };
}

const L = (tipo, h, extra = {}) => ({ ...nuovoLivello(tipo), ...(h !== undefined ? { h } : {}), ...extra });
// Punti di partenza (galleria): tutto si cambia nel compositore.
export const COMPOSIZIONI = [
  { id: 'como', nome: tr('Comò'), descr: tr('Quattro cassetti su zoccolo.'), L: 1000, H: 850, P: 450, livelli: [L('zoccolo', 60), L('cassetti', 'auto', { n: 4 })] },
  { id: 'credenza', nome: tr('Credenza'), descr: tr('Ante con ripiano e una fila di cassetti sopra.'), L: 1600, H: 850, P: 450, livelli: [L('zoccolo', 60), L('ante'), L('cassetti', 150, { n: 1 })] },
  { id: 'libreria-ante', nome: tr('Libreria con ante sotto'), descr: tr('Vano con ante in basso, ripiani a giorno sopra.'), L: 800, H: 2000, P: 350, livelli: [L('zoccolo', 60), L('ante', 800), L('giorno', 'auto', { ripiani: 3 })] },
  { id: 'libreria', nome: tr('Libreria'), descr: tr('Ripiani a giorno su zoccolo.'), L: 800, H: 1800, P: 300, livelli: [L('zoccolo', 60), L('giorno', 'auto', { ripiani: 4 })] },
  { id: 'base-cucina', nome: tr('Base cucina'), descr: tr('Cassetto in alto, ante sotto, piano di lavoro.'), L: 600, H: 900, P: 580, livelli: [L('zoccolo', 100), L('ante'), L('cassetti', 140, { n: 1 }), L('piano', 40)] },
  { id: 'cassettiera-cucina', nome: tr('Cassettiera da cucina'), descr: tr('Tre cassetti e piano di lavoro.'), L: 600, H: 900, P: 580, livelli: [L('zoccolo', 100), L('cassetti', 'auto', { n: 3 }), L('piano', 40)] },
  { id: 'dispensa', nome: tr('Dispensa a colonna'), descr: tr('Due vani con ante, ripiani dentro.'), L: 600, H: 2100, P: 580, livelli: [L('zoccolo', 100), L('ante', 700), L('ante', 'auto', { ripiani: 3 })] },
  { id: 'pensile', nome: tr('Pensile'), descr: tr('Da appendere: ante e due ripiani.'), L: 800, H: 720, P: 330, livelli: [L('ante', 'auto', { ripiani: 2 })] },
  { id: 'bagno', nome: tr('Mobile bagno sospeso'), descr: tr('Due cassetti, da appendere.'), L: 800, H: 500, P: 450, livelli: [L('cassetti', 'auto', { n: 2 })] },
  { id: 'vuoto', nome: tr('Da zero'), descr: tr('Un vano a giorno: aggiungi tu i livelli.'), L: 800, H: 900, P: 450, livelli: [L('zoccolo', 60), L('giorno')] },
];

export function composizioneDa(id) {
  const c = structuredClone(COMPOSIZIONI.find(x => x.id === id) || COMPOSIZIONI.at(-1));
  return { nome: t(c.nome), L: c.L, H: c.H, P: c.P, T: 18, schienale: true, livelli: c.livelli };
}

// Quote dei livelli: { ok, errori, z (zoccolo), Hc (altezza della cassa), pT (piano), livelli: [{ ..., y0, y1, h }] }.
export function calcola(c) {
  const errori = [], T = c.T, lv = c.livelli;
  const z = lv[0]?.tipo === 'zoccolo' ? lv[0].h : 0, piano = lv.at(-1)?.tipo === 'piano' ? lv.at(-1) : null, pT = piano ? piano.h : 0;
  const Hc = c.H - pT, interni = lv.filter(x => x.tipo !== 'zoccolo' && x.tipo !== 'piano');
  if (c.L < 150 || c.P < 100 || c.H < 150) errori.push(t('Misure del mobile troppo piccole.'));
  if (!interni.length) errori.push(t('Aggiungi almeno un livello con cassetti, ante o ripiani.'));
  const disponibile = Hc - z - 2 * T - T * Math.max(0, interni.length - 1);
  const fissi = interni.filter(x => x.h !== 'auto').reduce((s, x) => s + x.h, 0), auto = interni.filter(x => x.h === 'auto').length;
  const hAuto = auto ? (disponibile - fissi) / auto : 0;
  if (!auto && interni.length && Math.abs(disponibile - fissi) > 0.5) {
    errori.push(disponibile > fissi
      ? t('Avanzano {d} mm in altezza: metti «Auto» su un livello, oppure allunga i livelli.', { d: Math.round(disponibile - fissi) })
      : t('Mancano {d} mm in altezza: metti «Auto» su un livello, oppure accorcia i livelli.', { d: Math.round(fissi - disponibile) }));
  }
  let y = z + T;
  const out = interni.map((x, i) => {
    const h = x.h === 'auto' ? hAuto : x.h, r = { ...x, h, y0: y, y1: y + h, i: lv.indexOf(x) };
    y += h + T;
    if (h < (x.tipo === 'cassetti' ? Math.max(MINIMO.cassetti, 75 * (x.n || 1)) : MINIMO[x.tipo])) {
      errori.push(t('«{nome}» è troppo basso ({h} mm).', { nome: t(TIPI_LIVELLO[x.tipo].nome), h: Math.round(h) }));
    }
    return r;
  });
  return { ok: !errori.length, errori, z, Hc, pT, piano, livelli: out };
}

// Bordo basso e alto dei frontali di un livello: sulla base e sul cielo coprono tutto (1,5 mm di fuga), su un ripiano
// fisso condiviso con un altro livello con frontali solo metà; se il vicino è aperto lo coprono tutto.
function copertura(q, k, T) {
  const sotto = q.livelli[k - 1], sopra = q.livelli[k + 1], l = q.livelli[k];
  const y0 = !sotto ? l.y0 - T + 1.5 : FRONTALI.has(sotto.tipo) ? l.y0 - T / 2 + 1.5 : l.y0 - T + 1.5;
  const y1 = !sopra ? l.y1 + T - 1.5 : FRONTALI.has(sopra.tipo) ? l.y1 + T / 2 - 1.5 : l.y1 + T - 1.5;
  return [y0, y1];
}

const r1 = v => Math.round(v * 10) / 10;
function pezzo(pr, comp, dati) {
  const p = { id: nuovoId(), n: pr.prossimoN++, tipo: 'pannello', mat: 'pan', forma: 'rett', r: 0, tagli: [], comp, ...dati };
  if (typeof p.rot === 'string') p.rot = rotazioneDa(p.rot);
  p.L = r1(p.L); p.W = r1(p.W); p.pos = p.pos.map(r1);
  pr.pezzi.push(p);
  return p;
}
const spessore = T => (T === 18 ? {} : { spessore: T });

// Crea i pezzi della composizione nel progetto (sistema del mobile, origine nello spigolo davanti in basso a sinistra).
// Restituisce { ok, pezzi } oppure { ok: false, msg }.
export function genera(pr, c, comp) {
  const q = calcola(c);
  if (!q.ok) return { ok: false, msg: q.errori[0] };
  const { T, P } = c, Lm = c.L, { z, Hc } = q, prima = pr.pezzi.length, sp = spessore(T);
  pezzo(pr, comp, { nome: t('Fianco sinistro'), ...sp, L: Hc, W: P, rot: 'fianco', pos: [T, 0, 0] });
  pezzo(pr, comp, { nome: t('Fianco destro'), ...sp, L: Hc, W: P, rot: 'fianco', pos: [Lm, 0, 0] });
  pezzo(pr, comp, { nome: t('Base'), ...sp, L: Lm - 2 * T, W: P, rot: 'orizzontale', pos: [T, z, 0] });
  pezzo(pr, comp, { nome: t('Cielo'), ...sp, L: Lm - 2 * T, W: P, rot: 'orizzontale', pos: [T, Hc - T, 0] });
  if (z) pezzo(pr, comp, { nome: t('Zoccolo'), ...sp, L: Lm - 2 * T, W: z, rot: 'frontale', pos: [T, 0, -40] });
  if (c.schienale) pezzo(pr, comp, { nome: t('Schienale'), spessore: 3, L: Lm, W: Hc - z, rot: 'frontale', pos: [0, z, -P - 3] });
  let nRip = 0;
  const ripiani = (l, n) => {
    const passo = (l.h - n * T) / (n + 1);
    for (let i = 1; i <= n; i++) pezzo(pr, comp, { nome: `${t('Ripiano')} ${++nRip}`, ...sp, L: Lm - 2 * T, W: P, rot: 'orizzontale', pos: [T, l.y0 + i * passo + (i - 1) * T, 0] });
  };
  for (const [k, l] of q.livelli.entries()) {
    if (k > 0) pezzo(pr, comp, { nome: `${t('Ripiano fisso')} ${k}`, ...sp, L: Lm - 2 * T, W: P, rot: 'orizzontale', pos: [T, l.y0 - T, 0] });
    if (l.tipo === 'giorno') ripiani(l, l.ripiani || 0);
    if (l.tipo === 'ante') {
      ripiani(l, l.ripiani || 0);
      const [y0, y1] = copertura(q, k, T), quante = l.ante === 'auto' ? (Lm > 600 ? 2 : 1) : +l.ante;
      const x0 = 1.5, largo = (Lm - 3 - FUGA * (quante - 1)) / quante;
      const maniglia = { tipo: 'maniglia', interasse: 128, posizione: (y0 + y1) / 2 > 1400 ? 'inizio' : 'fine', direzione: 'parallela' };
      for (let i = 0; i < quante; i++) {
        pezzo(pr, comp, { nome: quante === 1 ? t('Anta') : i === 0 ? t('Anta sinistra') : t('Anta destra'), ...sp, L: largo, W: y1 - y0, rot: 'frontale', pos: [x0 + i * (largo + FUGA), y0, 0],
          ferramenta: [{ tipo: 'cerniere', lato: i === 0 ? 'A' : 'B', modello: 'sovrapposta' }, maniglia] });
      }
    }
    if (l.tipo === 'cassetti') {
      const gd = TIPI_GUIDA[l.guida || 'sfere'];
      const r = creaCassetti(pr, { x0: T, x1: Lm - T, y0: l.y0, y1: l.y1, zFronte: 0, profondita: P, n: l.n || 1, spessoreFianchi: T, frontale: 'sovrapposto',
        matCassone: 'pan', matFrontale: 'pan', extraCassone: { spessore: 12 }, extraFrontale: sp, guida: { tipo: l.guida || 'sfere', gioco: gd.gioco } });
      if (!r.ok) { pr.pezzi.splice(prima); return { ok: false, msg: `${t(TIPI_LIVELLO.cassetti.nome)}: ${r.msg}` }; }
      // frontali allineati alle ante: coprono base, cielo e metà dei ripiani fissi condivisi
      const [y0, y1] = copertura(q, k, T), fronti = r.nuovi.filter(p => p.ruolo === 'frontale').sort((a, b) => a.pos[1] - b.pos[1]);
      const hf = (y1 - y0 - FUGA * (fronti.length - 1)) / fronti.length;
      fronti.forEach((p, i) => {
        p.pos[1] = r1(y0 + i * (hf + FUGA)); p.W = r1(hf);
        const m = p.ferramenta?.find(f => f.tipo === 'maniglia');
        if (m) m.dalBordo = Math.min(40, hf / 2);
      });
      for (const p of r.nuovi) p.comp = comp;
    }
  }
  if (q.piano) {
    const pz = q.piano;
    pezzo(pr, comp, { nome: t('Piano'), ...spessore(pz.h), L: Lm + 2 * (pz.lati || 0), W: P + (pz.sporge || 0), rot: 'orizzontale', pos: [-(pz.lati || 0), Hc, pz.sporge || 0] });
  }
  return { ok: true, pezzi: pr.pezzi.slice(prima) };
}

// Disegno di fronte (SVG) per l'anteprima del compositore. `sel` = indice del livello scelto (in c.livelli).
export function svgFronte(c, sel = -1) {
  const q = calcola(c), T = c.T, Lm = c.L, { z, Hc } = q, pz = q.piano, lati = pz?.lati || 0;
  const W = Lm + 2 * lati + 160, H = c.H + 80, Y = y => c.H + 20 - y, fs = Math.round(Math.max(c.H, Lm) / 40);
  const r = (x, y, w, h, cls, extra = '') => `<rect x="${x}" y="${Y(y + h)}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" class="${cls}" ${extra}/>`;
  let s = '';
  // cassa
  s += r(0, 0, T, Hc, 'legno') + r(Lm - T, 0, T, Hc, 'legno') + r(T, z, Lm - 2 * T, T, 'legno') + r(T, Hc - T, Lm - 2 * T, T, 'legno');
  if (z) s += r(T, 0, Lm - 2 * T, z, 'zoccolo');
  if (pz) s += r(-lati, Hc, Lm + 2 * lati, pz.h, 'legno');
  const bocca = (h, n) => `<line x1="${Lm / 2 - Math.min(80, Lm / 6)}" x2="${Lm / 2 + Math.min(80, Lm / 6)}" y1="${Y(h)}" y2="${Y(h)}" class="maniglia"/>`;
  for (const [k, l] of q.livelli.entries()) {
    if (k > 0) s += r(T, l.y0 - T, Lm - 2 * T, T, 'legno');
    s += r(T, l.y0, Lm - 2 * T, l.h, 'vano' + (l.i === sel ? ' scelto' : ''), `data-livello="${l.i}"`);
    const passo = n => (l.h - n * T) / (n + 1);
    if (l.tipo === 'giorno' || l.tipo === 'ante') for (let i = 1; i <= (l.ripiani || 0); i++) s += r(T, l.y0 + i * passo(l.ripiani) + (i - 1) * T, Lm - 2 * T, T, l.tipo === 'ante' ? 'dentro' : 'legno');
    if (l.tipo === 'ante') {
      const [y0, y1] = copertura(q, k, T), quante = l.ante === 'auto' ? (Lm > 600 ? 2 : 1) : +l.ante, largo = (Lm - 3 - FUGA * (quante - 1)) / quante;
      for (let i = 0; i < quante; i++) {
        const x = 1.5 + i * (largo + FUGA), mx = quante === 1 ? x + largo - 40 : i === 0 ? x + largo - 40 : x + 40;
        s += r(x, y0, largo, y1 - y0, 'frontale', `data-livello="${l.i}"`);
        const my = (y0 + y1) / 2 > 1400 ? y0 + 120 : y1 - 120;
        s += `<line x1="${mx}" x2="${mx}" y1="${Y(my - 64)}" y2="${Y(my + 64)}" class="maniglia"/>`;
      }
    }
    if (l.tipo === 'cassetti') {
      const [y0, y1] = copertura(q, k, T), n = l.n || 1, hf = (y1 - y0 - FUGA * (n - 1)) / n;
      for (let i = 0; i < n; i++) { const y = y0 + i * (hf + FUGA); s += r(1.5, y, Lm - 3, hf, 'frontale', `data-livello="${l.i}"`) + bocca(y + hf - Math.min(40, hf / 2)); }
    }
    s += `<text x="${Lm + lati + 24}" y="${Y((l.y0 + l.y1) / 2) + 14}" class="q-fronte" font-size="${fs}">${Math.round(l.h)}</text>`;
  }
  // quote d'ingombro
  s += `<text x="${Lm / 2}" y="${Y(0) + fs * 1.4}" class="q-fronte" font-size="${fs}" text-anchor="middle">${Math.round(Lm + 2 * lati)}</text>`;
  s += `<text x="${-lati - 24}" y="${Y(c.H / 2)}" class="q-fronte" font-size="${fs}" text-anchor="end">${Math.round(c.H)}</text>`;
  return `<svg viewBox="${-lati - 3 * fs} 0 ${W + 6 * fs} ${H + fs}" class="fronte-mobile" preserveAspectRatio="xMidYMid meet">${s}</svg>`;
}
