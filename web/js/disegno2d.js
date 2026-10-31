// Disegno 2D del pannello, sul modello di LightBurn: rettangoli, ellissi, poligoni e linee a punti, ognuno pieno o
// vuoto (passante o scasso). Il pezzo è l'unione dei pieni meno i vuoti (vedi sezioniDisegno in geometria.js).
// Si disegna trascinando, ci si aggancia alla griglia e ai punti notevoli delle altre forme (angoli, metà dei lati,
// centri); misure e posizione si scrivono a numero. Le coordinate dei campi partono dall'angolo in basso a sinistra
// dei pieni, così si leggono come distanze dai bordi del pezzo.
import { contornoForma, ingombroDisegno, poligoniDisegno } from './geometria.js';
import { fmt, fmtU, leggiMisura, unita } from './modello.js';
import { t, tr } from './lingua.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const arrot = v => Math.round(v * 100) / 100;
const ATTREZZI = [
  ['sel', tr('Seleziona'), '<path d="M8 4v20l5-5 4 9 3-1-4-9h7z"/>'],
  ['rett', tr('Rettangolo'), '<rect x="5" y="8" width="22" height="16" rx="1"/>'],
  ['ellisse', tr('Ellisse'), '<ellipse cx="16" cy="16" rx="11" ry="8"/>'],
  ['poligono', tr('Poligono'), '<path d="M16 5l10 7-4 12H10L6 12z"/>'],
  ['linea', tr('Linea'), '<path d="M5 25 11 9l8 10 8-12"/><circle cx="5" cy="25" r="1.5"/><circle cx="11" cy="9" r="1.5"/><circle cx="19" cy="19" r="1.5"/><circle cx="27" cy="7" r="1.5"/>'],
];
const NOMI = { rett: tr('Rettangolo'), ellisse: tr('Ellisse'), poligono: tr('Poligono'), linea: tr('Linea') };

// Forme di partenza dal pezzo com'è ora (rettangolo, cerchio, sagoma o disegno).
export function formeDaPezzo(p) {
  if (p.forma === 'disegno' && p.disegno?.forme?.length) return structuredClone(p.disegno.forme);
  if (p.forma === 'cerchio') return [{ tipo: 'ellisse', cx: p.D / 2, cy: p.D / 2, w: p.D, h: p.D, rot: 0, modo: 'pieno' }];
  if (p.forma === 'sagoma' && p.sagoma?.length >= 3) return [{ tipo: 'linea', cx: p.L / 2, cy: p.W / 2, w: p.L, h: p.W, rot: 0, modo: 'pieno', punti: p.sagoma.map(q => ({ x: q.x - p.L / 2, y: q.y - p.W / 2, b: q.b || 0 })) }];
  return [{ tipo: 'rett', cx: p.L / 2, cy: p.W / 2, w: p.L, h: p.W, r: p.r || 0, rot: 0, modo: 'pieno' }];
}

// Porta il disegno con l'angolo in basso a sinistra dei pieni in (0, 0). Restituisce { forme, L, W } o null.
export function normalizzaDisegno(forme) {
  const b = ingombroDisegno({ forme });
  if (!b) return null;
  return {
    forme: forme.map(f => ({ ...f, cx: arrot(f.cx - b.min[0]), cy: arrot(f.cy - b.min[1]) })),
    L: arrot(b.max[0] - b.min[0]), W: arrot(b.max[1] - b.min[1]),
  };
}

// Ingombro allineato agli assi di una forma: { x0, y0, x1, y1 }.
function box(f) {
  const c = contornoForma(f), xs = c.map(q => q[0]), ys = c.map(q => q[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
// Angoli, metà dei lati e centro: i punti a cui ci si aggancia.
function puntiNotevoli(b) {
  const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
  return [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1], [mx, b.y0], [b.x1, my], [mx, b.y1], [b.x0, my], [mx, my]];
}
function dentro(pt, poli) {
  let s = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [xi, yi] = poli[i], [xj, yj] = poli[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) s = !s;
  }
  return s;
}
// Linea a punti assoluti → forma con i punti rispetto al centro dell'ingombro.
function formaLinea(assoluti, modo) {
  const xs = assoluti.map(q => q[0]), ys = assoluti.map(q => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return { tipo: 'linea', cx, cy, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), rot: 0, modo, punti: assoluti.map(([x, y]) => ({ x: arrot(x - cx), y: arrot(y - cy), b: 0 })) };
}

// pezzo: per nome e spessore; onSalva({ forme, L, W }).
export function apriDisegno2D(pezzo, spessore, onSalva) {
  let forme = formeDaPezzo(pezzo), scelta = -1, attrezzo = 'sel', passo = 5;
  let vista = null, azione = null, linea = null, aggancio = null, cursore = null;
  const storia = [];
  const salvaStoria = () => { storia.push(JSON.stringify(forme)); if (storia.length > 100) storia.shift(); };

  // dialogo nuovo a ogni apertura: così i gestori degli eventi non si accumulano
  document.getElementById('dlg-disegno')?.remove();
  const d = document.createElement('dialog');
  d.id = 'dlg-disegno';
  d.className = 'dlg larga disegno2d';
  document.body.appendChild(d);
  d.innerHTML = `<div class="dlg-testa"><h2>${t('Disegno di «{nome}»', { nome: esc(pezzo.nome) })}</h2><span class="nota">${t('spessore {s}', { s: fmtU(spessore, true) })}</span><span class="sp"></span><button class="btn icon" data-x>✕</button></div>
    <div class="dlg-corpo d2">
      <div class="d2-attrezzi">${ATTREZZI.map(([k, nome, svg]) => `<button class="tool" data-attrezzo="${k}" title="${t(nome)}"><svg viewBox="0 0 32 32">${svg}</svg>${t(nome)}</button>`).join('')}
        <hr><button class="tool" data-azione="annulla" title="${t('Annulla (Ctrl+Z)')}"><svg viewBox="0 0 32 32"><path d="M10 12H20a6 6 0 0 1 0 12h-6M10 12l5-5M10 12l5 5"/></svg>${t('Annulla')}</button>
        <button class="tool" data-azione="inquadra" title="${t('Inquadra tutto')}"><svg viewBox="0 0 32 32"><path d="M5 11V5h6M21 5h6v6M27 21v6h-6M11 27H5v-6"/></svg>${t('Inquadra')}</button></div>
      <div class="d2-foglio"><svg id="d2-svg"><g id="d2-g" transform="scale(1,-1)"></g></svg><p class="nota" id="d2-aiuto"></p></div>
      <div class="d2-lato" id="d2-lato"></div>
    </div>`;
  const svg = d.querySelector('#d2-svg'), g = d.querySelector('#d2-g'), lato = d.querySelector('#d2-lato'), aiuto = d.querySelector('#d2-aiuto');

  // ---------- vista: centro e mm per pixel ----------
  const inquadra = () => {
    const bb = forme.length ? forme.map(box).reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) })) : { x0: 0, y0: 0, x1: 600, y1: 400 };
    const w = svg.clientWidth || 600, h = svg.clientHeight || 400;
    vista = { cx: (bb.x0 + bb.x1) / 2, cy: (bb.y0 + bb.y1) / 2, mm: Math.max((bb.x1 - bb.x0) / w, (bb.y1 - bb.y0) / h, 0.05) * 1.25 };
  };
  const mmPx = () => vista.mm;
  const inMm = e => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(g.getScreenCTM().inverse()); return [q.x, q.y]; };
  // riferimento dei campi: angolo in basso a sinistra dei pieni
  const origine = () => { const b = ingombroDisegno({ forme }); return b ? b.min : [0, 0]; };

  // Aggancio di un punto: ai punti notevoli delle altre forme (entro 10 px), altrimenti alla griglia.
  const notevoli = (salta = -1) => forme.flatMap((f, i) => (i === salta ? [] : puntiNotevoli(box(f))));
  function aggancia(pt, salta = -1) {
    const soglia = 10 * mmPx();
    let meglio = null;
    for (const q of notevoli(salta)) { const dd = Math.hypot(q[0] - pt[0], q[1] - pt[1]); if (dd < soglia && (!meglio || dd < meglio.d)) meglio = { q, d: dd }; }
    aggancio = meglio ? meglio.q : null;
    if (meglio) return [...meglio.q];
    const o = origine();
    return [Math.round((pt[0] - o[0]) / passo) * passo + o[0], Math.round((pt[1] - o[1]) / passo) * passo + o[1]];
  }
  // Spostamento di una forma: i suoi punti notevoli si agganciano a quelli delle altre, altrimenti passo della griglia.
  function agganciaSpostamento(f0, i, dx, dy) {
    const soglia = 10 * mmPx(), b = box(f0), miei = puntiNotevoli(b), altri = notevoli(i);
    let meglio = null;
    for (const m of miei) for (const q of altri) {
      const ex = q[0] - (m[0] + dx), ey = q[1] - (m[1] + dy), dd = Math.hypot(ex, ey);
      if (dd < soglia && (!meglio || dd < meglio.d)) meglio = { d: dd, ex, ey, q };
    }
    aggancio = meglio ? meglio.q : null;
    if (meglio) return [dx + meglio.ex, dy + meglio.ey];
    const o = origine();
    return [Math.round((b.x0 + dx - o[0]) / passo) * passo + o[0] - b.x0, Math.round((b.y0 + dy - o[1]) / passo) * passo + o[1] - b.y0];
  }

  // ---------- disegno ----------
  function disegna() {
    const w = svg.clientWidth || 600, h = svg.clientHeight || 400, s = mmPx();
    svg.setAttribute('viewBox', `${vista.cx - w * s / 2} ${-vista.cy - h * s / 2} ${w * s} ${h * s}`);
    const o = origine(), x0 = vista.cx - w * s / 2, x1 = vista.cx + w * s / 2, y0 = vista.cy - h * s / 2, y1 = vista.cy + h * s / 2;
    // griglia: almeno 12 px tra le righe
    let gp = passo; while (gp / s < 12) gp *= gp === passo && passo === 5 ? 2 : 5;
    const righe = [];
    for (let x = Math.floor((x0 - o[0]) / gp) * gp + o[0]; x <= x1; x += gp) righe.push(`M${x},${y0}V${y1}`);
    for (let y = Math.floor((y0 - o[1]) / gp) * gp + o[1]; y <= y1; y += gp) righe.push(`M${x0},${y}H${x1}`);
    const r = poligoniDisegno({ forme }), path = poli => poli.map(c => `M${c.map(q => `${q[0]},${q[1]}`).join('L')}Z`).join('');
    const sc = forme[scelta], hs = 6 * s;
    const maniglie = sc ? maniglieDi(sc).map((m, j) => `<rect class="d2-maniglia" data-maniglia="${j}" x="${m[0] - hs}" y="${m[1] - hs}" width="${2 * hs}" height="${2 * hs}"/>`).join('') : '';
    const nodi = sc?.tipo === 'linea' && !sc.rot ? sc.punti.map((q, j) => `<circle class="d2-nodo" data-nodo="${j}" cx="${sc.cx + q.x}" cy="${sc.cy + q.y}" r="${hs * 0.9}"/>`).join('') : '';
    g.innerHTML = `<path class="d2-griglia" d="${righe.join('')}"/>
      <path class="d2-assi" d="M${o[0]},${y0}V${y1}M${x0},${o[1]}H${x1}"/>
      <path class="d2-pieno" d="${path(r.pieno)}"/>
      ${r.scassi.map(x => `<path class="d2-scasso" d="${path(x.poli)}"/>`).join('')}
      ${forme.map((f, i) => `<path class="d2-forma ${f.modo === 'vuoto' ? (f.prof > 0 ? 'scasso' : 'vuoto') : 'pieno'} ${i === scelta ? 'on' : ''}" data-forma="${i}" d="M${contornoForma(f).map(q => `${q[0]},${q[1]}`).join('L')}Z"/>`).join('')}
      ${linea ? `<path class="d2-forma on" d="M${[...linea.punti, ...(cursore ? [cursore] : [])].map(q => `${q[0]},${q[1]}`).join('L')}"/>${linea.punti.map(q => `<circle class="d2-nodo" cx="${q[0]}" cy="${q[1]}" r="${hs * 0.9}"/>`).join('')}` : ''}
      ${maniglie}${nodi}
      ${aggancio ? `<circle class="d2-aggancio" cx="${aggancio[0]}" cy="${aggancio[1]}" r="${hs * 1.4}"/>` : ''}`;
    d.querySelectorAll('[data-attrezzo]').forEach(b => b.classList.toggle('on', b.dataset.attrezzo === attrezzo));
    aiuto.textContent = t({
      sel: 'Tocca una forma per sceglierla, trascinala per spostarla, usa i quadratini per cambiarne le misure. Trascina il foglio vuoto per scorrere, rotellina per lo zoom.',
      linea: linea ? 'Tocca per aggiungere punti; tocca il primo punto (o premi Invio) per chiudere la forma. Esc per annullare.' : 'Tocca il primo punto della linea.',
    }[attrezzo] || 'Trascina per disegnare (Maiusc = quadrato o cerchio). Un tocco senza trascinare crea una forma da 100 mm.');
  }

  // Maniglie agli angoli del rettangolo della forma (nel suo sistema ruotato).
  function maniglieDi(f) {
    const a = (f.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const x = u * f.w / 2, y = v * f.h / 2; return [f.cx + x * c - y * s, f.cy + x * s + y * c]; });
  }

  // ---------- pannello laterale ----------
  function htmlLato() {
    const f = forme[scelta], U = unita.u;
    const campo = (k, nome, v, unitaCampo = U, extra = '') => `<div class="field"><label>${t(nome)}</label><div class="input"><input data-campo="${k}" inputmode="decimal" value="${esc(unitaCampo === U ? fmtU(v) : fmt(v, 1))}" ${extra}><small>${unitaCampo}</small></div></div>`;
    const piede = `<div class="group"><h3>${t('Griglia')}</h3><div class="seg">${[1, 5, 10].map(p => `<button data-passo="${p}" class="${p === passo ? 'on' : ''}">${fmtU(p, true)}</button>`).join('')}</div></div>
      <div class="chipline"><span>${t('Ingombro del pezzo')}</span><b id="d2-ingombro"></b></div>
      <div class="azioni"><button class="btn" data-x>${t('Annulla')}</button><button class="btn primary" data-azione="usa">${t('Usa questo disegno')}</button></div>`;
    if (!f) return `<p class="nota">${t("Scegli un attrezzo a sinistra e disegna. Ogni forma è <b>piena</b> (diventa legno) o <b>vuota</b> (un foro passante o uno scasso): il pezzo è l'unione dei pieni meno i vuoti.")}</p>
      <p class="nota">${t("Le posizioni si leggono dall'angolo in basso a sinistra del pezzo: X verso destra, Y verso l'alto.")}</p>${piede}`;
    const b = box(f), o = origine();
    return `<div class="kicker">${t(NOMI[f.tipo])}</div>
      <div class="seg"><button data-modo="pieno" class="${f.modo !== 'vuoto' ? 'on' : ''}">${t('Pieno')}</button><button data-modo="passante" class="${f.modo === 'vuoto' && !(f.prof > 0) ? 'on' : ''}">${t('Foro passante')}</button><button data-modo="scasso" class="${f.modo === 'vuoto' && f.prof > 0 ? 'on' : ''}">${t('Scasso')}</button></div>
      ${f.modo === 'vuoto' && f.prof > 0 ? `<div class="row">${campo('prof', 'Profondità', f.prof)}<div class="field"><label>${t('Da')}</label><div class="seg"><button data-lato="sopra" class="${f.lato !== 'sotto' ? 'on' : ''}">${t('Sopra')}</button><button data-lato="sotto" class="${f.lato === 'sotto' ? 'on' : ''}">${t('Sotto')}</button></div></div></div>` : ''}
      <div class="row">${campo('x', 'X dal bordo sinistro', b.x0 - o[0])}${campo('y', 'Y dal bordo in basso', b.y0 - o[1])}</div>
      <div class="row">${campo('w', 'Larghezza', f.w)}${campo('h', 'Altezza', f.h)}</div>
      <div class="row">${campo('rot', 'Rotazione', f.rot || 0, '°')}${f.tipo === 'rett' ? campo('r', 'Raggio angoli', f.r || 0) : f.tipo === 'poligono' ? campo('lati', 'Lati', f.lati || 6, '') : '<div></div>'}</div>
      <div class="row"><button class="btn" data-centra="x">${t('Al centro')} ↔</button><button class="btn" data-centra="y">${t('Al centro')} ↕</button></div>
      <details class="d2-serie"><summary>${t('Ripeti in serie…')}</summary>
        <div class="row">${campo('serieN', 'Quante in tutto', 3, '')}${campo('serieX', 'Passo X', b.x1 - b.x0 + 20)}</div>
        <div class="row">${campo('serieY', 'Passo Y', 0)}<div class="field"><label>&nbsp;</label><button class="btn" data-azione="serie">${t('Crea la serie')}</button></div></div></details>
      <div class="azioni"><button class="btn" data-azione="duplica">${t('Duplica')}</button><button class="btn danger" data-azione="elimina">${t('Elimina')}</button></div>${piede}`;
  }
  function aggiornaLato() {
    if (lato.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const aperto = lato.querySelector('.d2-serie')?.open;
    lato.innerHTML = htmlLato();
    if (aperto) lato.querySelector('.d2-serie').open = true;
    const b = ingombroDisegno({ forme });
    lato.querySelector('#d2-ingombro').textContent = b ? `${fmtU(b.max[0] - b.min[0])} × ${fmtU(b.max[1] - b.min[1])} ${unita.u}` : t('nessun pieno');
  }
  const tutto = () => { disegna(); aggiornaLato(); };

  // ---------- puntatore ----------
  svg.addEventListener('pointerdown', e => {
    if (e.button > 0 && e.pointerType === 'mouse' && e.button !== 1) return;
    try { svg.setPointerCapture(e.pointerId); } catch { /* puntatore già rilasciato */ }
    const pt = inMm(e);
    if (e.button === 1 || (attrezzo === 'sel' && !e.target.closest('[data-maniglia],[data-nodo],[data-forma]') && !forme.some(f => dentro(pt, contornoForma(f))))) {
      if (attrezzo === 'sel' && e.button !== 1) { scelta = -1; tutto(); }
      azione = { tipo: 'scorri', x: e.clientX, y: e.clientY, cx: vista.cx, cy: vista.cy };
      return;
    }
    if (attrezzo === 'linea') {
      const q = aggancia(pt);
      if (!linea) linea = { punti: [q] };
      else if (linea.punti.length >= 3 && Math.hypot(q[0] - linea.punti[0][0], q[1] - linea.punti[0][1]) < 10 * mmPx()) return chiudiLinea();
      else linea.punti.push(q);
      return disegna();
    }
    if (attrezzo !== 'sel') { azione = { tipo: 'nuova', da: aggancia(pt), a: null }; return; }
    const man = e.target.closest('[data-maniglia]'), nodo = e.target.closest('[data-nodo]');
    if (man && scelta >= 0) { salvaStoria(); azione = { tipo: 'misura', j: +man.dataset.maniglia, f0: structuredClone(forme[scelta]) }; return; }
    if (nodo && scelta >= 0) { salvaStoria(); azione = { tipo: 'nodo', j: +nodo.dataset.nodo }; return; }
    // la forma più in alto sotto il dito (le ultime disegnate stanno sopra)
    let i = -1;
    for (let k = forme.length - 1; k >= 0; k--) if (dentro(pt, contornoForma(forme[k]))) { i = k; break; }
    scelta = i;
    if (i >= 0) { salvaStoria(); azione = { tipo: 'sposta', da: pt, f0: structuredClone(forme[i]), mosso: false }; }
    tutto();
  });
  svg.addEventListener('pointermove', e => {
    const pt = inMm(e);
    if (attrezzo === 'linea' && linea) { cursore = aggancia(pt); return disegna(); }
    if (!azione) return;
    if (azione.tipo === 'scorri') { vista.cx = azione.cx - (e.clientX - azione.x) * mmPx(); vista.cy = azione.cy + (e.clientY - azione.y) * mmPx(); return disegna(); }
    if (azione.tipo === 'nuova') { azione.a = aggancia(pt); if (e.shiftKey) { const l = Math.max(Math.abs(azione.a[0] - azione.da[0]), Math.abs(azione.a[1] - azione.da[1])); azione.a = [azione.da[0] + Math.sign(azione.a[0] - azione.da[0] || 1) * l, azione.da[1] + Math.sign(azione.a[1] - azione.da[1] || 1) * l]; } anteprimaNuova(); return disegna(); }
    const f = forme[scelta];
    if (azione.tipo === 'sposta') {
      const [dx, dy] = agganciaSpostamento(azione.f0, scelta, pt[0] - azione.da[0], pt[1] - azione.da[1]);
      if (Math.hypot(dx, dy) > 0) azione.mosso = true;
      f.cx = arrot(azione.f0.cx + dx); f.cy = arrot(azione.f0.cy + dy);
    } else if (azione.tipo === 'misura') {
      // l'angolo opposto resta fermo; misure nel sistema ruotato della forma
      const f0 = azione.f0, m = maniglieDi(f0), fermo = m[(azione.j + 2) % 4], q = aggancia(pt, scelta);
      const a = (f0.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      const vx = q[0] - fermo[0], vy = q[1] - fermo[1], lx = vx * c + vy * s, ly = -vx * s + vy * c;
      let w = Math.max(1, Math.abs(lx)), h = Math.max(1, Math.abs(ly));
      if (e.shiftKey) w = h = Math.max(w, h);
      cambiaMisura(f, w, h);
      const ux = Math.sign(lx) || 1, uy = Math.sign(ly) || 1, mx = ux * w / 2, my = uy * h / 2;
      f.cx = arrot(fermo[0] + mx * c - my * s); f.cy = arrot(fermo[1] + mx * s + my * c);
    } else if (azione.tipo === 'nodo') {
      const q = aggancia(pt, scelta);
      f.punti[azione.j] = { ...f.punti[azione.j], x: arrot(q[0] - f.cx), y: arrot(q[1] - f.cy) };
      ricentraLinea(f);
    }
    disegna();
  });
  const fine = () => {
    if (azione?.tipo === 'nuova') {
      const nuova = azione.anteprima || formaBase(attrezzo, azione.da);
      if (azione.anteprima) forme.pop();
      salvaStoria();
      forme.push(nuova);
      scelta = forme.length - 1;
      attrezzo = 'sel';
    } else if (azione?.tipo === 'sposta' && !azione.mosso) storia.pop();
    azione = null; aggancio = null;
    tutto();
  };
  svg.addEventListener('pointerup', fine);
  svg.addEventListener('pointercancel', fine);
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const pt = inMm(e), k = Math.exp(e.deltaY * 0.0015);
    vista.cx = pt[0] + (vista.cx - pt[0]) * k; vista.cy = pt[1] + (vista.cy - pt[1]) * k; vista.mm *= k;
    disegna();
  }, { passive: false });
  svg.addEventListener('dblclick', () => { if (linea) chiudiLinea(); });

  const formaBase = (tipo, c) => ({ tipo, cx: c[0], cy: c[1], w: 100, h: 100, rot: 0, modo: forme.some(f => f.modo !== 'vuoto') ? 'vuoto' : 'pieno', ...(tipo === 'poligono' ? { lati: 6 } : {}), ...(tipo === 'rett' ? { r: 0 } : {}) });
  function anteprimaNuova() {
    const { da, a } = azione;
    if (azione.anteprima) forme.pop();
    azione.anteprima = null;
    if (!a || (Math.abs(a[0] - da[0]) < 1 && Math.abs(a[1] - da[1]) < 1)) return;
    const f = { ...formaBase(attrezzo, [(da[0] + a[0]) / 2, (da[1] + a[1]) / 2]), w: Math.max(1, Math.abs(a[0] - da[0])), h: Math.max(1, Math.abs(a[1] - da[1])) };
    forme.push(f);
    azione.anteprima = f;
  }
  function chiudiLinea() {
    if (!linea || linea.punti.length < 3) return;
    salvaStoria();
    forme.push(formaLinea(linea.punti, forme.some(f => f.modo !== 'vuoto') ? 'vuoto' : 'pieno'));
    scelta = forme.length - 1; linea = null; cursore = null; attrezzo = 'sel';
    tutto();
  }
  function ricentraLinea(f) {
    const ass = f.punti.map(q => [f.cx + q.x, f.cy + q.y]), n = formaLinea(ass, f.modo);
    n.punti = n.punti.map((q, i) => ({ ...q, b: f.punti[i].b || 0 }));
    Object.assign(f, { cx: n.cx, cy: n.cy, w: n.w, h: n.h, punti: n.punti });
  }
  // Nuove misure: per le linee si scalano i punti (e le curve), per le altre forme basta w × h.
  function cambiaMisura(f, w, h) {
    if (f.tipo === 'linea' && f.w > 0 && f.h > 0) {
      const sx = w / f.w, sy = h / f.h;
      f.punti = f.punti.map(q => ({ x: arrot(q.x * sx), y: arrot(q.y * sy), b: arrot((q.b || 0) * (sx + sy) / 2) }));
    }
    f.w = arrot(w); f.h = arrot(h);
  }

  // ---------- campi e pulsanti ----------
  lato.addEventListener('change', e => {
    const k = e.target.dataset.campo, f = forme[scelta];
    if (!k || !f || k.startsWith('serie')) return;
    const v = k === 'rot' || k === 'lati' ? parseFloat(String(e.target.value).replace(',', '.')) : leggiMisura(e.target.value);
    if (v === null || !Number.isFinite(v)) return aggiornaLato();
    salvaStoria();
    const b = box(f), o = origine();
    if (k === 'x') f.cx = arrot(f.cx + (o[0] + v) - b.x0);
    else if (k === 'y') f.cy = arrot(f.cy + (o[1] + v) - b.y0);
    else if (k === 'w' && v > 0) cambiaMisura(f, v, f.h);
    else if (k === 'h' && v > 0) cambiaMisura(f, f.w, v);
    else if (k === 'rot') f.rot = arrot(v);
    else if (k === 'r') f.r = Math.max(0, v);
    else if (k === 'lati') f.lati = Math.max(3, Math.min(64, Math.round(v)));
    else if (k === 'prof' && v > 0) f.prof = Math.min(v, spessore);
    else storia.pop();
    e.target.blur();
    tutto();
  });
  lato.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
  d.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const f = forme[scelta];
    if (b.hasAttribute('data-x')) return d.close();
    if (b.dataset.attrezzo) { attrezzo = b.dataset.attrezzo; linea = null; cursore = null; return disegna(); }
    if (b.dataset.passo) { passo = +b.dataset.passo; return tutto(); }
    if (b.dataset.azione === 'annulla') { if (storia.length) { forme = JSON.parse(storia.pop()); scelta = Math.min(scelta, forme.length - 1); } return tutto(); }
    if (b.dataset.azione === 'inquadra') { inquadra(); return disegna(); }
    if (b.dataset.azione === 'usa') {
      const n = normalizzaDisegno(forme);
      if (!n) { aiuto.textContent = t('Serve almeno una forma piena: è quella che diventa legno.'); aiuto.classList.add('errore'); return; }
      d.close();
      return onSalva(n);
    }
    if (!f) return;
    salvaStoria();
    if (b.dataset.modo) Object.assign(f, b.dataset.modo === 'pieno' ? { modo: 'pieno', prof: 0 } : b.dataset.modo === 'passante' ? { modo: 'vuoto', prof: 0 } : { modo: 'vuoto', prof: f.prof > 0 ? f.prof : Math.min(10, spessore / 2) });
    else if (b.dataset.lato) f.lato = b.dataset.lato;
    else if (b.dataset.centra) {
      const o = ingombroDisegno({ forme: forme.filter((x, i) => i !== scelta) }) || ingombroDisegno({ forme }), bx = box(f), k = b.dataset.centra === 'x' ? 0 : 1;
      if (o) { const centro = (o.min[k] + o.max[k]) / 2; if (k === 0) f.cx = arrot(f.cx + centro - (bx.x0 + bx.x1) / 2); else f.cy = arrot(f.cy + centro - (bx.y0 + bx.y1) / 2); }
    } else if (b.dataset.azione === 'duplica') { const c = structuredClone(f); c.cx += passo * 4; c.cy -= passo * 4; forme.push(c); scelta = forme.length - 1; }
    else if (b.dataset.azione === 'elimina') { forme.splice(scelta, 1); scelta = -1; }
    else if (b.dataset.azione === 'serie') {
      const val = k => lato.querySelector(`[data-campo="${k}"]`).value;
      const n = Math.round(parseFloat(val('serieN').replace(',', '.'))), px = leggiMisura(val('serieX')), py = leggiMisura(val('serieY'));
      if (!(n >= 2 && n <= 200) || px === null || py === null) { storia.pop(); aiuto.textContent = t('Serie: scrivi quante forme (da 2 a 200) e i passi.'); return; }
      for (let i = 1; i < n; i++) forme.push({ ...structuredClone(f), cx: arrot(f.cx + i * px), cy: arrot(f.cy + i * py) });
    } else storia.pop();
    tutto();
  });
  d.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const f = forme[scelta];
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (storia.length) { forme = JSON.parse(storia.pop()); scelta = Math.min(scelta, forme.length - 1); tutto(); } }
    else if (e.key === 'Escape' && (linea || azione || scelta >= 0)) { e.preventDefault(); linea = null; cursore = null; scelta = -1; attrezzo = 'sel'; tutto(); }
    else if (e.key === 'Enter' && linea) chiudiLinea();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && f) { salvaStoria(); forme.splice(scelta, 1); scelta = -1; tutto(); }
    else if (e.key.startsWith('Arrow') && f) {
      e.preventDefault(); salvaStoria();
      const s = e.shiftKey ? passo * 10 : passo;
      f.cx = arrot(f.cx + (e.key === 'ArrowRight' ? s : e.key === 'ArrowLeft' ? -s : 0));
      f.cy = arrot(f.cy + (e.key === 'ArrowUp' ? s : e.key === 'ArrowDown' ? -s : 0));
      tutto();
    }
  });

  d.showModal();
  inquadra();
  tutto();
  const ro = new ResizeObserver(() => { if (d.open) disegna(); });
  ro.observe(svg);
  d.addEventListener('close', () => { ro.disconnect(); d.remove(); }, { once: true });
}
