// Compositore: mobili descritti senza progettarli pezzo per pezzo.
// Una composizione è una fila di moduli affiancati, con il retro allineato (il muro):
// - modulo «mobile»: cassa con zoccolo e piano facoltativi, una o più colonne; ogni colonna ha i suoi livelli dal basso
//   (cassetti, vano a giorno, vano con ante, con altezza fissa o «auto»);
// - modulo «scrivania»: piano su fianchi o gambe; se accanto c'è un mobile abbastanza alto si appoggia a quello;
//   cassettiera sotto facoltativa.
// Da una composizione nascono pezzi veri; la composizione resta nel progetto (`progetto.composizioni[id]`) e i pezzi la
// ricordano (`p.comp`), così il mobile si può riaprire e ricomporre.
// Sistema della composizione: x da sinistra a destra, y in alto, il davanti del modulo più profondo su z = 0.
import { nuovoId, rotazioneDa } from './modello.js';
import { creaCassetti, FUGA, TIPI_GUIDA } from './cassetti.js';
import { t, tr } from './lingua.js';

export const TIPI_LIVELLO = {
  cassetti: { nome: tr('Cassetti'), h: 'auto' },
  giorno: { nome: tr('Vano a giorno'), h: 'auto' },
  ante: { nome: tr('Vano con ante'), h: 'auto' },
};
const FRONTALI = new Set(['cassetti', 'ante']);
const MINIMO = { cassetti: 90, giorno: 60, ante: 120 };
const GAMBA = 60, RIENTRO_GAMBE = 20;

export function nuovoLivello(tipo) {
  const extra = { cassetti: { n: 3, guida: 'sfere' }, giorno: { ripiani: 1 }, ante: { ante: 'auto', ripiani: 1 } }[tipo] || {};
  return { tipo, h: TIPI_LIVELLO[tipo].h, ...extra };
}
export const nuovaColonna = (livelli = [nuovoLivello('giorno')]) => ({ L: 'auto', livelli });
export function nuovoModulo(tipo) {
  return tipo === 'scrivania'
    ? { tipo, L: 1200, H: 750, P: 600, Tp: 25, sx: 'fianco', dx: 'fianco', cassettiera: null }
    : { tipo: 'mobile', L: 800, H: 900, P: 450, zoccolo: 60, piano: null, colonne: [nuovaColonna()] };
}

// Composizioni salvate prima del 0.18 (un solo mobile, livelli con zoccolo e piano): nella forma a moduli.
export function normalizza(c) {
  if (c.moduli) return c;
  const lv = c.livelli || [], z = lv[0]?.tipo === 'zoccolo' ? lv[0].h : 0, p = lv.at(-1)?.tipo === 'piano' ? lv.at(-1) : null;
  const { livelli, L, H, P, ...resto } = c;
  void livelli;
  return { ...resto, moduli: [{ tipo: 'mobile', L, H, P, zoccolo: z, piano: p ? { h: p.h, sporge: p.sporge || 0, lati: p.lati || 0 } : null,
    colonne: [nuovaColonna(lv.filter(x => x.tipo !== 'zoccolo' && x.tipo !== 'piano'))] }] };
}

// ---------- galleria ----------
const lv = (tipo, h, extra = {}) => ({ ...nuovoLivello(tipo), ...(h !== undefined ? { h } : {}), ...extra });
const mob = (L, H, P, colonne, extra = {}) => ({ tipo: 'mobile', L, H, P, zoccolo: 60, piano: null, colonne: colonne.map(x => (Array.isArray(x) ? nuovaColonna(x) : x)), ...extra });
const scr = (L, extra = {}) => ({ ...nuovoModulo('scrivania'), L, ...extra });
export const COMPOSIZIONI = [
  { id: 'como', nome: tr('Comò'), descr: tr('Quattro cassetti su zoccolo.'), moduli: [mob(1000, 850, 450, [[lv('cassetti', 'auto', { n: 4 })]])] },
  { id: 'credenza', nome: tr('Credenza'), descr: tr('Ante con ripiano e una fila di cassetti sopra.'), moduli: [mob(1600, 850, 450, [[lv('ante'), lv('cassetti', 150, { n: 1 })]])] },
  { id: 'madia', nome: tr('Madia con cassettiera'), descr: tr('Due colonne: cassetti a sinistra, ante a destra.'), moduli: [mob(1400, 850, 450, [{ L: 450, livelli: [lv('cassetti', 'auto', { n: 4 })] }, nuovaColonna([lv('ante')])])] },
  { id: 'libreria-ante', nome: tr('Libreria con ante sotto'), descr: tr('Vano con ante in basso, ripiani a giorno sopra.'), moduli: [mob(800, 2000, 350, [[lv('ante', 800), lv('giorno', 'auto', { ripiani: 3 })]])] },
  { id: 'libreria', nome: tr('Libreria'), descr: tr('Ripiani a giorno su zoccolo.'), moduli: [mob(800, 1800, 300, [[lv('giorno', 'auto', { ripiani: 4 })]])] },
  { id: 'libreria-doppia', nome: tr('Libreria a due colonne'), descr: tr('Due colonne di ripiani con ante in basso.'), moduli: [mob(1600, 2000, 350, [[lv('ante', 700), lv('giorno', 'auto', { ripiani: 3 })], [lv('ante', 700), lv('giorno', 'auto', { ripiani: 3 })]])] },
  { id: 'base-cucina', nome: tr('Base cucina'), descr: tr('Cassetto in alto, ante sotto, piano di lavoro.'), moduli: [mob(600, 900, 580, [[lv('ante'), lv('cassetti', 140, { n: 1 })]], { zoccolo: 100, piano: { h: 40, sporge: 20, lati: 0 } })] },
  { id: 'cassettiera-cucina', nome: tr('Cassettiera da cucina'), descr: tr('Tre cassetti e piano di lavoro.'), moduli: [mob(600, 900, 580, [[lv('cassetti', 'auto', { n: 3 })]], { zoccolo: 100, piano: { h: 40, sporge: 20, lati: 0 } })] },
  { id: 'dispensa', nome: tr('Dispensa a colonna'), descr: tr('Due vani con ante, ripiani dentro.'), moduli: [mob(600, 2100, 580, [[lv('ante', 700), lv('ante', 'auto', { ripiani: 3 })]], { zoccolo: 100 })] },
  { id: 'pensile', nome: tr('Pensile'), descr: tr('Da appendere: ante e due ripiani.'), moduli: [mob(800, 720, 330, [[lv('ante', 'auto', { ripiani: 2 })]], { zoccolo: 0 })] },
  { id: 'bagno', nome: tr('Mobile bagno sospeso'), descr: tr('Due cassetti, da appendere.'), moduli: [mob(800, 500, 450, [[lv('cassetti', 'auto', { n: 2 })]], { zoccolo: 0 })] },
  { id: 'scrivania', nome: tr('Scrivania'), descr: tr('Piano su due fianchi, pannello dietro.'), moduli: [scr(1400, { P: 700 })] },
  { id: 'scrivania-cassettiera', nome: tr('Scrivania con cassettiera'), descr: tr('Fianchi e tre cassetti sotto il piano, a destra.'), moduli: [scr(1400, { P: 700, cassettiera: { lato: 'dx', n: 3, L: 420 } })] },
  { id: 'libreria-scrivania', nome: tr('Libreria con scrivania'), descr: tr('La scrivania si appoggia al fianco della libreria.'), moduli: [mob(800, 2000, 350, [[lv('ante', 700), lv('giorno', 'auto', { ripiani: 3 })]]), scr(1200, { dx: 'gambe' })] },
  { id: 'vuoto', nome: tr('Da zero'), descr: tr('Un vano a giorno: aggiungi tu livelli, colonne e moduli.'), moduli: [mob(800, 900, 450, [[lv('giorno')]])] },
];

export function composizioneDa(id) {
  const c = structuredClone(COMPOSIZIONI.find(x => x.id === id) || COMPOSIZIONI.at(-1));
  return { nome: t(c.nome), T: 18, schienale: true, moduli: c.moduli };
}

// ---------- quote ----------
const nomeModulo = (c, mi) => (c.moduli.length > 1 ? `${t(c.moduli[mi].tipo === 'scrivania' ? 'Scrivania' : 'Mobile')} ${mi + 1}: ` : '');

function calcolaMobile(M, T, pre) {
  const errori = [], z = M.zoccolo || 0, pT = M.piano ? M.piano.h : 0, Hc = M.H - pT, nc = M.colonne.length;
  if (M.L < 150 || M.P < 100 || M.H < 150) errori.push(pre + t('Misure del mobile troppo piccole.'));
  const interno = M.L - 2 * T - T * (nc - 1);
  const fissiL = M.colonne.filter(x => x.L !== 'auto').reduce((s, x) => s + x.L, 0), autoL = M.colonne.filter(x => x.L === 'auto').length;
  const wAuto = autoL ? (interno - fissiL) / autoL : 0;
  if (!autoL && Math.abs(interno - fissiL) > 0.5) {
    errori.push(pre + (interno > fissiL ? t('Avanzano {d} mm in larghezza: metti «Auto» su una colonna.', { d: Math.round(interno - fissiL) }) : t('Mancano {d} mm in larghezza: metti «Auto» su una colonna, o stringile.', { d: Math.round(fissiL - interno) })));
  }
  let x = T;
  const colonne = M.colonne.map((col, ci) => {
    const w = col.L === 'auto' ? wAuto : col.L, x0 = x, x1 = x + w;
    x = x1 + T;
    if (w < 100) errori.push(pre + t('Colonna {n} troppo stretta ({w} mm).', { n: ci + 1, w: Math.round(w) }));
    const interni = col.livelli;
    if (!interni.length) errori.push(pre + t('Aggiungi almeno un livello con cassetti, ante o ripiani.'));
    const disponibile = Hc - z - 2 * T - T * Math.max(0, interni.length - 1);
    const fissi = interni.filter(l => l.h !== 'auto').reduce((s, l) => s + l.h, 0), auto = interni.filter(l => l.h === 'auto').length;
    const hAuto = auto ? (disponibile - fissi) / auto : 0;
    const pc = nc > 1 ? t('colonna {n}', { n: ci + 1 }) + ': ' : '';
    if (!auto && interni.length && Math.abs(disponibile - fissi) > 0.5) {
      errori.push(pre + pc + (disponibile > fissi
        ? t('Avanzano {d} mm in altezza: metti «Auto» su un livello, oppure allunga i livelli.', { d: Math.round(disponibile - fissi) })
        : t('Mancano {d} mm in altezza: metti «Auto» su un livello, oppure accorcia i livelli.', { d: Math.round(fissi - disponibile) })));
    }
    let y = z + T;
    const livelli = interni.map((l, i) => {
      const h = l.h === 'auto' ? hAuto : l.h, r = { ...l, h, y0: y, y1: y + h, i };
      y += h + T;
      if (h < (l.tipo === 'cassetti' ? Math.max(MINIMO.cassetti, 75 * (l.n || 1)) : MINIMO[l.tipo])) errori.push(pre + pc + t('«{nome}» è troppo basso ({h} mm).', { nome: t(TIPI_LIVELLO[l.tipo].nome), h: Math.round(h) }));
      return r;
    });
    return { ...col, w, x0, x1, livelli, ci };
  });
  return { errori, z, Hc, pT, colonne };
}

// Sostegni effettivi di una scrivania: «mobile» se accanto c'è un mobile alto almeno quanto il piano; se quel mobile è
// molto meno profondo, «mobile+gamba» (una gamba regge l'angolo davanti). `P` = profondità del mobile accanto.
function sostegni(c, mi) {
  const S = c.moduli[mi], alto = M => M && M.tipo === 'mobile' && M.H >= S.H - 0.5;
  const lato = (M, proprio) => (!alto(M) ? { s: proprio } : { s: M.P < S.P - 100 ? 'mobile+gamba' : 'mobile', P: Math.min(M.P, S.P) });
  const sx = lato(c.moduli[mi - 1], S.sx), dx = lato(c.moduli[mi + 1], S.dx);
  return { sx: sx.s, dx: dx.s, sxP: sx.P, dxP: dx.P };
}
// Spazio libero sotto il piano tra i sostegni (x dal bordo sinistro della scrivania).
function liberoScrivania(S, so, T) {
  const dentro = s => (s === 'fianco' ? T : s === 'gambe' || s === 'mobile+gamba' ? RIENTRO_GAMBE + GAMBA : 0);
  return [dentro(so.sx), S.L - dentro(so.dx)];
}
function calcolaScrivania(c, mi, T, pre) {
  const S = c.moduli[mi], errori = [], so = sostegni(c, mi), [a, b] = liberoScrivania(S, so, T);
  if (S.L < 400 || S.P < 300 || S.H < 400 || S.H > 1300) errori.push(pre + t('Misure della scrivania fuori misura (lunga almeno 400, profonda 300, alta da 400 a 1300 mm).'));
  if (S.cassettiera && S.cassettiera.L > b - a - 100) errori.push(pre + t('La cassettiera non sta sotto il piano: stringila o allunga la scrivania.'));
  return { errori, so, libero: [a, b] };
}

// Quote della composizione: { ok, errori, Pmax, L, H, moduli: [{ M, mi, x, zf, ... }] }.
export function calcola(c) {
  c = normalizza(c);
  const T = c.T, errori = [], Pmax = Math.max(0, ...c.moduli.map(M => M.P));
  let x = 0;
  const moduli = c.moduli.map((M, mi) => {
    const pre = nomeModulo(c, mi), q = M.tipo === 'scrivania' ? calcolaScrivania(c, mi, T, pre) : calcolaMobile(M, T, pre);
    errori.push(...q.errori);
    const r = { ...q, M, mi, x, zf: -(Pmax - M.P) };
    x += M.L;
    return r;
  });
  if (!c.moduli.length) errori.push(t('Aggiungi almeno un mobile o una scrivania.'));
  return { ok: !errori.length, errori, Pmax, moduli, L: x, H: Math.max(0, ...c.moduli.map(M => M.H)) };
}

// Bordi dei frontali di un livello (sistema del modulo): in altezza coprono base e cielo tutti, un ripiano fisso
// condiviso con un altro livello con frontali solo a metà; in larghezza i fianchi tutti, i divisori tra colonne a metà.
function bordiFrontali(M, col, nc, k, T) {
  const sotto = col.livelli[k - 1], sopra = col.livelli[k + 1], l = col.livelli[k];
  const y0 = sotto && FRONTALI.has(sotto.tipo) ? l.y0 - T / 2 + 1.5 : l.y0 - T + 1.5;
  const y1 = sopra && FRONTALI.has(sopra.tipo) ? l.y1 + T / 2 - 1.5 : l.y1 + T - 1.5;
  const x0 = col.ci === 0 ? 1.5 : col.x0 - T / 2 + 1.5, x1 = col.ci === nc - 1 ? M.L - 1.5 : col.x1 + T / 2 - 1.5;
  return { x0, x1, y0, y1 };
}
const quanteAnte = (l, w) => (l.ante === 'auto' ? (w > 600 ? 2 : 1) : +l.ante);

// ---------- pezzi ----------
const r1 = v => Math.round(v * 10) / 10;
function pezzo(pr, comp, dati) {
  const p = { id: nuovoId(), n: pr.prossimoN++, tipo: 'pannello', mat: 'pan', forma: 'rett', r: 0, tagli: [], comp, ...dati };
  if (typeof p.rot === 'string') p.rot = rotazioneDa(p.rot);
  p.L = r1(p.L); if (p.W !== undefined) p.W = r1(p.W); p.pos = p.pos.map(r1);
  pr.pezzi.push(p);
  return p;
}
const spessore = T => (T === 18 ? {} : { spessore: T });
const sposta = (pezzi, dx, dz) => pezzi.forEach(p => { p.pos = [r1(p.pos[0] + dx), p.pos[1], r1(p.pos[2] + dz)]; });

function generaMobile(pr, M, q, T, schienale, comp) {
  const { P } = M, Lm = M.L, { z, Hc } = q, sp = spessore(T), nc = q.colonne.length;
  pezzo(pr, comp, { nome: t('Fianco sinistro'), ...sp, L: Hc, W: P, rot: 'fianco', pos: [T, 0, 0] });
  pezzo(pr, comp, { nome: t('Fianco destro'), ...sp, L: Hc, W: P, rot: 'fianco', pos: [Lm, 0, 0] });
  pezzo(pr, comp, { nome: t('Base'), ...sp, L: Lm - 2 * T, W: P, rot: 'orizzontale', pos: [T, z, 0] });
  pezzo(pr, comp, { nome: t('Cielo'), ...sp, L: Lm - 2 * T, W: P, rot: 'orizzontale', pos: [T, Hc - T, 0] });
  if (z) pezzo(pr, comp, { nome: t('Zoccolo'), ...sp, L: Lm - 2 * T, W: z, rot: 'frontale', pos: [T, 0, -40] });
  if (schienale) pezzo(pr, comp, { nome: t('Schienale'), spessore: 3, L: Lm, W: Hc - z, rot: 'frontale', pos: [0, z, -P - 3] });
  q.colonne.slice(0, -1).forEach((col, ci) => pezzo(pr, comp, { nome: `${t('Divisorio')} ${ci + 1}`, ...sp, L: Hc - z - 2 * T, W: P, rot: 'fianco', pos: [col.x1 + T, z + T, 0] }));
  let nRip = 0, nFisso = 0;
  for (const col of q.colonne) {
    const w = col.w;
    const ripiani = (l, n) => {
      const passo = (l.h - n * T) / (n + 1);
      for (let i = 1; i <= n; i++) pezzo(pr, comp, { nome: `${t('Ripiano')} ${++nRip}`, ...sp, L: w, W: P, rot: 'orizzontale', pos: [col.x0, l.y0 + i * passo + (i - 1) * T, 0] });
    };
    for (const [k, l] of col.livelli.entries()) {
      if (k > 0) pezzo(pr, comp, { nome: `${t('Ripiano fisso')} ${++nFisso}`, ...sp, L: w, W: P, rot: 'orizzontale', pos: [col.x0, l.y0 - T, 0] });
      const b = bordiFrontali(M, col, nc, k, T);
      if (l.tipo === 'giorno') ripiani(l, l.ripiani || 0);
      if (l.tipo === 'ante') {
        ripiani(l, l.ripiani || 0);
        const quante = quanteAnte(l, w), largo = (b.x1 - b.x0 - FUGA * (quante - 1)) / quante;
        const maniglia = { tipo: 'maniglia', interasse: 128, posizione: (b.y0 + b.y1) / 2 > 1400 ? 'inizio' : 'fine', direzione: 'parallela' };
        for (let i = 0; i < quante; i++) {
          const esterno = i === 0 ? col.ci === 0 : col.ci === nc - 1;
          pezzo(pr, comp, { nome: quante === 1 ? t('Anta') : i === 0 ? t('Anta sinistra') : t('Anta destra'), ...sp, L: largo, W: b.y1 - b.y0, rot: 'frontale', pos: [b.x0 + i * (largo + FUGA), b.y0, 0],
            ferramenta: [{ tipo: 'cerniere', lato: i === 0 ? 'A' : 'B', modello: esterno ? 'sovrapposta' : 'semi' }, maniglia] });
        }
      }
      if (l.tipo === 'cassetti') {
        const gd = TIPI_GUIDA[l.guida || 'sfere'];
        const r = creaCassetti(pr, { x0: col.x0, x1: col.x1, y0: l.y0, y1: l.y1, zFronte: 0, profondita: P, n: l.n || 1, spessoreFianchi: T, frontale: 'sovrapposto',
          matCassone: 'pan', matFrontale: 'pan', extraCassone: { spessore: 12 }, extraFrontale: sp, guida: { tipo: l.guida || 'sfere', gioco: gd.gioco } });
        if (!r.ok) return { ok: false, msg: `${t(TIPI_LIVELLO.cassetti.nome)}: ${r.msg}` };
        // frontali allineati alle ante: stessi bordi in altezza e in larghezza
        const fronti = r.nuovi.filter(p => p.ruolo === 'frontale').sort((a, c) => a.pos[1] - c.pos[1]);
        const hf = (b.y1 - b.y0 - FUGA * (fronti.length - 1)) / fronti.length;
        fronti.forEach((p, i) => {
          p.pos = [r1(b.x0), r1(b.y0 + i * (hf + FUGA)), p.pos[2]]; p.L = r1(b.x1 - b.x0); p.W = r1(hf);
          const m = p.ferramenta?.find(f => f.tipo === 'maniglia');
          if (m) m.dalBordo = Math.min(40, hf / 2);
        });
        for (const p of r.nuovi) p.comp = comp;
      }
    }
  }
  if (M.piano) {
    const pz = M.piano;
    pezzo(pr, comp, { nome: t('Piano'), ...spessore(pz.h), L: Lm + 2 * (pz.lati || 0), W: P + (pz.sporge || 0), rot: 'orizzontale', pos: [-(pz.lati || 0), Hc, pz.sporge || 0] });
  }
  return { ok: true };
}

function generaScrivania(pr, S, q, T, comp) {
  const { L, H, P, Tp } = S, sp = spessore(T), so = q.so, gamba = { tipo: 'listello', mat: 'lis', sezione: [GAMBA, GAMBA] };
  pezzo(pr, comp, { nome: t('Piano della scrivania'), ...spessore(Tp), L, W: P, rot: 'orizzontale', pos: [0, H - Tp, 0] });
  const hSotto = H - Tp;
  for (const lato of ['sx', 'dx']) {
    const s = so[lato], sx = lato === 'sx';
    if (s === 'fianco') pezzo(pr, comp, { nome: sx ? t('Fianco sinistro') : t('Fianco destro'), ...sp, L: hSotto, W: P, rot: 'fianco', pos: [sx ? T : L, 0, 0] });
    const gambe = s === 'gambe' ? [[sx ? tr('Gamba davanti sinistra') : tr('Gamba davanti destra'), -RIENTRO_GAMBE - GAMBA], [sx ? tr('Gamba dietro sinistra') : tr('Gamba dietro destra'), -P + RIENTRO_GAMBE]]
      : s === 'mobile+gamba' ? [[sx ? tr('Gamba davanti sinistra') : tr('Gamba davanti destra'), -RIENTRO_GAMBE - GAMBA]] : [];
    for (const [nome, z] of gambe) pezzo(pr, comp, { ...gamba, nome: t(nome), L: hSotto, rot: 'verticale', pos: [sx ? RIENTRO_GAMBE + GAMBA : L - RIENTRO_GAMBE, 0, z] });
    if (s.startsWith('mobile')) {
      // listello avvitato al fianco del mobile accanto, sotto il piano, lungo quanto il mobile è profondo
      const Pm = so[lato + 'P'];
      pezzo(pr, comp, { tipo: 'listello', mat: 'lis', sezione: [40, 20], nome: sx ? t('Listello di appoggio sinistro') : t('Listello di appoggio destro'), L: Pm - 40, rot: 'profondita', pos: [sx ? 0 : L - 20, hSotto - 40, -(P - Pm) - 20] });
    }
  }
  // pannello dietro (sotto il piano, tra i sostegni): tiene ferma la scrivania
  const [a, b] = q.libero, hp = Math.min(350, hSotto - 50);
  pezzo(pr, comp, { nome: t('Pannello dietro'), ...sp, L: b - a, W: hp, rot: 'frontale', pos: [a, hSotto - hp, -P + RIENTRO_GAMBE] });
  if (S.cassettiera) {
    const C = S.cassettiera, Mc = { tipo: 'mobile', L: C.L, H: hSotto, P: P - 80, zoccolo: 60, piano: null, colonne: [nuovaColonna([{ ...nuovoLivello('cassetti'), n: C.n || 3 }])] };
    const qc = calcolaMobile(Mc, T, '');
    if (qc.errori.length) return { ok: false, msg: t('Cassettiera: {msg}', { msg: qc.errori[0] }) };
    const prima = pr.pezzi.length, r = generaMobile(pr, Mc, qc, T, false, comp);
    if (!r.ok) return r;
    sposta(pr.pezzi.slice(prima), C.lato === 'sx' ? a : b - C.L, -40);
  }
  return { ok: true };
}

// Crea i pezzi della composizione nel progetto (sistema della composizione). { ok, pezzi } oppure { ok: false, msg }.
export function genera(pr, c, comp) {
  c = normalizza(c);
  const q = calcola(c);
  if (!q.ok) return { ok: false, msg: q.errori[0] };
  const prima = pr.pezzi.length;
  for (const m of q.moduli) {
    const da = pr.pezzi.length;
    const r = m.M.tipo === 'scrivania' ? generaScrivania(pr, m.M, m, c.T, comp) : generaMobile(pr, m.M, m, c.T, c.schienale, comp);
    if (!r.ok) { pr.pezzi.splice(prima); return { ok: false, msg: nomeModulo(c, m.mi) + r.msg }; }
    sposta(pr.pezzi.slice(da), m.x, m.zf);
  }
  return { ok: true, pezzi: pr.pezzi.slice(prima) };
}

// ---------- disegno di fronte ----------
// SVG per l'anteprima. `sel` = { m, c, l }: modulo, colonna e livello scelti. Gli elementi toccabili hanno data-m
// (e data-c, data-l per i livelli).
export function svgFronte(c, sel = {}) {
  c = normalizza(c);
  const q = calcola(c), T = c.T, H = q.H, Ltot = q.L, fs = Math.max(20, Math.round(Math.max(H, Ltot) / 40));
  const sxMax = c.moduli[0]?.tipo === 'mobile' && c.moduli[0].piano ? c.moduli[0].piano.lati || 0 : 0;
  const Y = y => H + 20 - y;
  const r = (x, y, w, h, cls, extra = '') => `<rect x="${x}" y="${Y(y + h)}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" class="${cls}" ${extra}/>`;
  const testo = (x, y, s, extra = '') => `<text x="${x}" y="${Y(y)}" class="q-fronte" font-size="${fs}" ${extra}>${s}</text>`;
  let s = '';
  for (const m of q.moduli) {
    const M = m.M, X = m.x, dm = `data-m="${m.mi}"`, modScelto = sel.m === m.mi;
    if (M.tipo === 'scrivania') {
      const { L, H: h, Tp } = M, hs = h - Tp;
      s += r(X, 0, L, h, 'vano' + (modScelto ? ' scelto' : ''), dm);
      s += r(X, hs, L, Tp, 'legno', dm);
      for (const lato of ['sx', 'dx']) {
        const so = m.so[lato], sx = lato === 'sx';
        if (so === 'fianco') s += r(X + (sx ? 0 : L - T), 0, T, hs, 'legno', dm);
        if (so === 'gambe' || so === 'mobile+gamba') s += r(X + (sx ? RIENTRO_GAMBE : L - RIENTRO_GAMBE - GAMBA), 0, GAMBA, hs, 'legno', dm);
      }
      const [a, b] = m.libero, hp = Math.min(350, hs - 50);
      s += r(X + a, hs - hp, b - a, hp, 'dentro', dm);
      if (M.cassettiera) {
        const C = M.cassettiera, x0 = X + (C.lato === 'sx' ? a : b - C.L), n = C.n || 3, hf = (hs - 60 - FUGA * (n - 1) - 1.5) / n;
        s += r(x0, 0, C.L, 60, 'zoccolo', dm);
        for (let i = 0; i < n; i++) s += r(x0 + 1.5, 61.5 + i * (hf + FUGA), C.L - 3, hf, 'frontale', dm);
      }
      continue;
    }
    const { z, Hc } = m, Lm = M.L;
    s += r(X, 0, T, Hc, 'legno', dm) + r(X + Lm - T, 0, T, Hc, 'legno', dm) + r(X + T, z, Lm - 2 * T, T, 'legno', dm) + r(X + T, Hc - T, Lm - 2 * T, T, 'legno', dm);
    if (z) s += r(X + T, 0, Lm - 2 * T, z, 'zoccolo', dm);
    if (M.piano) s += r(X - (M.piano.lati || 0), Hc, Lm + 2 * (M.piano.lati || 0), M.piano.h, 'legno', dm);
    const nc = m.colonne.length;
    for (const col of m.colonne) {
      if (col.ci < nc - 1) s += r(X + col.x1, z + T, T, Hc - z - 2 * T, 'legno', dm);
      for (const [k, l] of col.livelli.entries()) {
        const d = `${dm} data-c="${col.ci}" data-l="${k}"`, scelto = modScelto && sel.c === col.ci && sel.l === k;
        if (k > 0) s += r(X + col.x0, l.y0 - T, col.w, T, 'legno');
        s += r(X + col.x0, l.y0, col.w, l.h, 'vano' + (scelto ? ' scelto' : ''), d);
        const passo = n => (l.h - n * T) / (n + 1);
        if (l.tipo === 'giorno' || l.tipo === 'ante') for (let i = 1; i <= (l.ripiani || 0); i++) s += r(X + col.x0, l.y0 + i * passo(l.ripiani) + (i - 1) * T, col.w, T, l.tipo === 'ante' ? 'dentro' : 'legno', d);
        const b = bordiFrontali(M, col, nc, k, T);
        if (l.tipo === 'ante') {
          const quante = quanteAnte(l, col.w), largo = (b.x1 - b.x0 - FUGA * (quante - 1)) / quante;
          for (let i = 0; i < quante; i++) {
            const x = X + b.x0 + i * (largo + FUGA), mx = quante > 1 && i > 0 ? x + 40 : x + largo - 40;
            s += r(x, b.y0, largo, b.y1 - b.y0, 'frontale' + (scelto ? ' scelto' : ''), d);
            const my = (b.y0 + b.y1) / 2 > 1400 ? b.y0 + 120 : b.y1 - 120;
            s += `<line x1="${mx}" x2="${mx}" y1="${Y(my - 64)}" y2="${Y(my + 64)}" class="maniglia"/>`;
          }
        }
        if (l.tipo === 'cassetti') {
          const n = l.n || 1, hf = (b.y1 - b.y0 - FUGA * (n - 1)) / n, cx = X + (b.x0 + b.x1) / 2, mz = Math.min(80, (b.x1 - b.x0) / 6);
          for (let i = 0; i < n; i++) {
            const y = b.y0 + i * (hf + FUGA), ym = Y(y + hf - Math.min(40, hf / 2));
            s += r(X + b.x0, y, b.x1 - b.x0, hf, 'frontale' + (scelto ? ' scelto' : ''), d);
            s += `<line x1="${cx - mz}" x2="${cx + mz}" y1="${ym}" y2="${ym}" class="maniglia"/>`;
          }
        }
        if (l.h > fs * 1.6 && col.w > fs * 2.5) s += `<text x="${X + col.x0 + col.w / 2}" y="${Y((l.y0 + l.y1) / 2) + fs * 0.35}" class="q-dentro" font-size="${fs}" text-anchor="middle">${Math.round(l.h)}</text>`;
      }
    }
  }
  s += testo(Ltot / 2, -fs * 1.3, `${Math.round(Ltot)}`, 'text-anchor="middle"');
  s += testo(-sxMax - fs * 0.6, H / 2, `${Math.round(H)}`, 'text-anchor="end"');
  return `<svg viewBox="${-sxMax - fs * 4} 0 ${Ltot + sxMax + fs * 6} ${H + 20 + fs * 2}" class="fronte-mobile" preserveAspectRatio="xMidYMid meet">${s}</svg>`;
}
