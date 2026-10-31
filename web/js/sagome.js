// Editor delle sagome: punti da trascinare (passo 1 mm, 10 mm con la griglia), "+" a metà di ogni tratto per
// aggiungerne uno, tabella con le misure esatte e la freccia degli archi, forme di partenza.
import { contornoSagoma } from './geometria.js';
import { fmt } from './modello.js';
import { t, tr } from './lingua.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = s => { const v = parseFloat(String(s).replace(',', '.')); return Number.isFinite(v) ? v : null; };

export const FORME = {
  rettangolo: (L, W) => [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W }, { x: 0, y: W }],
  trapezio: (L, W) => [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L * 0.8, y: W }, { x: L * 0.2, y: W }],
  arco: (L, W) => [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W * 0.75, b: W * 0.25 }, { x: 0, y: W * 0.75 }],
  scaletta: (L, W) => [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W / 3 }, { x: L * 2 / 3, y: W / 3 }, { x: L * 2 / 3, y: W * 2 / 3 }, { x: L / 3, y: W * 2 / 3 }, { x: L / 3, y: W }, { x: 0, y: W }],
  onda: (L, W) => [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W * 0.8, b: W * 0.15 }, { x: L / 2, y: W * 0.8, b: -W * 0.15 }, { x: 0, y: W * 0.8 }],
  smussi: (L, W) => { const s = Math.min(L, W) * 0.12; return [{ x: s, y: 0 }, { x: L - s, y: 0 }, { x: L, y: s }, { x: L, y: W - s }, { x: L - s, y: W }, { x: s, y: W }, { x: 0, y: W - s }, { x: 0, y: s }]; },
  mensola: (L, W) => [{ x: 0, y: 0 }, { x: L * 0.2, y: 0, b: -Math.min(L, W) * 0.22 }, { x: L, y: W * 0.8 }, { x: L, y: W }, { x: 0, y: W }],
};
const NOMI_FORME = { rettangolo: tr('Rettangolo'), trapezio: tr('Trapezio'), arco: tr('Arco sopra'), onda: tr('Onda'), scaletta: tr('Scaletta'), smussi: tr('Angoli smussati'), mensola: tr('Reggimensola') };

const arrot = v => Math.round(v * 10) / 10;

// Porta la sagoma con il minimo a (0, 0), in senso antiorario. Restituisce { punti, L, W }.
export function normalizza(punti) {
  let pts = punti.map(q => ({ x: q.x, y: q.y, b: q.b || 0 }));
  const area = pts.reduce((t, q, i) => { const r = pts[(i + 1) % pts.length]; return t + q.x * r.y - r.x * q.y; }, 0);
  if (area < 0) {
    // inverti il verso: ogni arco passa al tratto opposto e cambia segno
    const n = pts.length, rev = [];
    for (let i = n - 1; i >= 0; i--) rev.push({ x: pts[i].x, y: pts[i].y, b: -(pts[(i - 1 + n) % n].b || 0) });
    pts = rev;
  }
  const c = contornoSagoma(pts), minX = Math.min(...c.map(q => q[0])), minY = Math.min(...c.map(q => q[1]));
  pts = pts.map(q => ({ x: arrot(q.x - minX), y: arrot(q.y - minY), ...(Math.abs(q.b) > 0.05 ? { b: arrot(q.b) } : {}) }));
  const c2 = contornoSagoma(pts);
  return { punti: pts, L: arrot(Math.max(...c2.map(q => q[0]))), W: arrot(Math.max(...c2.map(q => q[1]))) };
}

export function apriEditorSagoma(pezzo, dim, onSalva) {
  let pts = (pezzo.forma === 'sagoma' && pezzo.sagoma?.length ? pezzo.sagoma : FORME.rettangolo(dim.L, dim.W)).map(q => ({ ...q }));
  let scelto = 0, griglia = false;
  // dialogo nuovo a ogni apertura: così i gestori degli eventi non si accumulano
  document.getElementById('dlg-sagoma')?.remove();
  const d = document.createElement('dialog');
  d.id = 'dlg-sagoma';
  d.className = 'dlg larga';
  document.body.appendChild(d);
  d.addEventListener('close', () => d.remove(), { once: true });
  d.innerHTML = `<div class="dlg-testa"><h2>${t('Sagoma di «{nome}»', { nome: esc(pezzo.nome) })}</h2><span class="sp"></span><button class="btn icon" data-x>✕</button></div>
    <div class="dlg-corpo sagoma">
      <div class="sagoma-disegno"><svg id="sg-svg"></svg><p class="nota">${t('Trascina i punti · tocca «+» per aggiungere un punto · le misure sono in mm, vista di faccia.')}</p></div>
      <div class="sagoma-lato">
        <div class="field"><label>${t('Parti da una forma')}</label><div class="seg">${Object.entries(NOMI_FORME).map(([k, testo]) => `<button data-forma="${k}">${t(testo)}</button>`).join('')}</div></div>
        <div class="chipline"><label class="nota"><input type="checkbox" id="sg-griglia"> ${t('Passo 10 mm')}</label><span class="nota" id="sg-misure"></span></div>
        <div class="sg-tabella"><table class="distinta"><thead><tr><th>${t('Punto')}</th><th>X</th><th>Y</th><th title="${t('Quanto sporge al centro il tratto verso il punto dopo: 0 = dritto')}">${t('Curva')}</th><th></th></tr></thead><tbody id="sg-righe"></tbody></table></div>
        <p class="nota">${t("«Curva» è la freccia dell'arco verso il punto successivo: quanto sporge al centro (in fuori se positiva, in dentro se negativa). 0 = tratto dritto.")}</p>
        <div class="azioni"><button class="btn" data-x>${t('Annulla')}</button><button class="btn primary" id="sg-ok">${t('Usa questa sagoma')}</button></div>
      </div>
    </div>`;

  const svg = d.querySelector('#sg-svg');
  const disegna = () => {
    const c = contornoSagoma(pts), xs = c.map(q => q[0]), ys = c.map(q => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const m = Math.max(x1 - x0, y1 - y0) * 0.08 + 10;
    svg.setAttribute('viewBox', `${x0 - m} ${-(y1 + m)} ${x1 - x0 + 2 * m} ${y1 - y0 + 2 * m}`);
    const r = Math.max(x1 - x0, y1 - y0) / 70;
    const meta = pts.map((q, i) => { const b = pts[(i + 1) % pts.length]; return [(q.x + b.x) / 2, (q.y + b.y) / 2]; });
    svg.innerHTML = `<path d="M${c.map(q => `${q[0]},${-q[1]}`).join('L')}Z" class="sg-forma"/>
      ${meta.map(([x, y], i) => `<g class="sg-piu" data-piu="${i}"><circle cx="${x}" cy="${-y}" r="${r * 0.9}"/><text x="${x}" y="${-y + r * 0.45}" font-size="${r * 1.4}" text-anchor="middle">+</text></g>`).join('')}
      ${pts.map((q, i) => `<circle class="sg-punto ${i === scelto ? 'on' : ''}" data-punto="${i}" cx="${q.x}" cy="${-q.y}" r="${r}"/>`).join('')}`;
    svg.style.setProperty('--tratto', `${r / 3}px`);
    d.querySelector('#sg-righe').innerHTML = pts.map((q, i) => `<tr class="${i === scelto ? 'scelto' : ''}"><td class="n">${i + 1}</td>
      <td><input class="mini-num" data-k="x" data-i="${i}" value="${fmt(q.x, 1)}" inputmode="decimal"></td>
      <td><input class="mini-num" data-k="y" data-i="${i}" value="${fmt(q.y, 1)}" inputmode="decimal"></td>
      <td><input class="mini-num" data-k="b" data-i="${i}" value="${fmt(q.b || 0, 1)}" inputmode="decimal"></td>
      <td>${pts.length > 3 ? `<button class="link" data-togli="${i}">${t('Togli')}</button>` : ''}</td></tr>`).join('');
    d.querySelector('#sg-misure').textContent = t('Ingombro {misure} mm', { misure: `${fmt(x1 - x0, 1)} × ${fmt(y1 - y0, 1)}` });
  };

  const inMm = e => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); const passo = griglia ? 10 : 1; return { x: Math.round(q.x / passo) * passo, y: Math.round(-q.y / passo) * passo }; };
  let trascina = null;
  svg.addEventListener('pointerdown', e => {
    const p = e.target.closest('[data-punto]'), piu = e.target.closest('[data-piu]');
    if (p) { scelto = +p.dataset.punto; trascina = scelto; svg.setPointerCapture(e.pointerId); disegna(); }
    else if (piu) {
      const i = +piu.dataset.piu, a = pts[i], b = pts[(i + 1) % pts.length];
      pts.splice(i + 1, 0, { x: arrot((a.x + b.x) / 2), y: arrot((a.y + b.y) / 2) });
      a.b = 0; scelto = i + 1; disegna();
    }
  });
  svg.addEventListener('pointermove', e => { if (trascina === null) return; Object.assign(pts[trascina], inMm(e)); disegna(); });
  svg.addEventListener('pointerup', () => { trascina = null; });
  d.addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'sg-griglia') { griglia = el.checked; return; }
    if (el.dataset.k) { const v = num(el.value); if (v !== null) pts[+el.dataset.i][el.dataset.k] = v; scelto = +el.dataset.i; disegna(); }

  });
  d.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-x')) d.close();
    if (b.dataset.forma) { pts = FORME[b.dataset.forma](dim.L, dim.W).map(q => ({ ...q })); scelto = 0; disegna(); }
    if (b.dataset.togli) { pts.splice(+b.dataset.togli, 1); scelto = 0; disegna(); }
    if (b.id === 'sg-ok') {
      const n = normalizza(pts);
      if (n.L < 5 || n.W < 5) return;
      d.close();
      onSalva(n);
    }
  });
  disegna();
  d.showModal();
}
