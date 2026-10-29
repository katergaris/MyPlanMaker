// Disegni dei pezzi per il laboratorio: contorno vero (sezione del solido, con tagli, curve e fori passanti),
// fori della ferramenta e punti dei fissaggi, quote d'ingombro e tabella dei fori. Dima 1:1 su fogli A4 ed
// etichette dei pezzi.
import { Matrix4, Vector3 } from '../vendor/three.module.js';
import { materiale } from './materiali.js';
import { bordatura, dimensioni, fmt, matrice, nomeBordo } from './modello.js';
import { geometriaPezzo, sezionePezzo } from './geometria.js';
import { cerniere, maniglia } from './ferramenta.js';
import { unioni } from './unioni.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f1 = v => fmt(v, 1);

function nomeFaccia(p, verso) {
  const n = new Vector3(0, 0, verso).applyMatrix4(new Matrix4().extractRotation(matrice(p)));
  const c = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)], k = c.indexOf(Math.max(...c));
  return [['verso sinistra', 'verso destra'], ['sotto', 'sopra'], ['dietro', 'davanti']][k][n.getComponent(k) > 0 ? 1 : 0];
}

// Fori e segni sul pezzo, nel suo sistema locale (x, y sulla faccia; z per sapere su quale faccia).
export function foriDelPezzo(progetto, p) {
  const fori = [], { T } = dimensioni(p), inv = matrice(p).clone().invert();
  const loc = v => v.clone().applyMatrix4(inv);
  const c = cerniere(p);
  if (c) for (const f of c.fori) fori.push({ x: f.c[0], y: f.c[1], d: 35, prof: 12.5, faccia: 0, nome: 'Scodella cerniera' });
  const m = maniglia(p);
  if (m) for (const f of m.fori) fori.push({ x: f.c[0], y: f.c[1], d: 5, prof: 'passante', faccia: T, nome: 'Foro maniglia' });
  for (const g of unioni(progetto).giunti) for (const el of g.viti) {
    if (g.passa?.id === p.id) {
      const t = loc(el.testa);
      const nomi = { viti: `Vite ${f1(g.vite.d)}×${g.vite.l}`, confirmat: 'Confirmat 7×50', spinotti: `Spinotto Ø ${el.d}`, eccentrici: 'Perno eccentrico' };
      const prof = { viti: 'passante', confirmat: 'passante Ø 7', spinotti: el.profPassa, eccentrici: el.profPassa }[el.tipo];
      const d = { viti: g.vite.preforo, confirmat: 7, spinotti: el.d, eccentrici: 5 }[el.tipo];
      fori.push({ x: t.x, y: t.y, d, prof, faccia: t.z > T / 2 ? T : 0, nome: nomi[el.tipo], fissaggio: el.tipo, verso: g.riceve.nome });
    }
    if (g.riceve?.id === p.id && el.camma) {
      const q = loc(el.camma.da);
      fori.push({ x: q.x, y: q.y, d: 15, prof: 12.5, faccia: q.z > T / 2 ? T : 0, nome: 'Eccentrico Ø 15', fissaggio: 'eccentrici', verso: g.passa.nome });
    }
    if (g.riceve?.id === p.id && !el.camma) {
      // foro nella testa o nel bordo: segnato sul bordo, con la posizione lungo il bordo
      const q = loc(el.punta), a = loc(el.testa);
      fori.push({ x: q.x, y: q.y, da: [a.x, a.y], d: el.tipo === 'confirmat' ? 5 : el.tipo === 'spinotti' ? el.d : g.vite?.preforo || 3, prof: el.testa.distanceTo(el.punta) - el.profPassa, faccia: 'bordo', nome: `Foro nel bordo (${{ viti: 'vite', confirmat: 'confirmat', spinotti: 'spinotto', eccentrici: 'perno' }[el.tipo]})`, fissaggio: el.tipo, verso: g.passa.nome });
    }
  }
  return fori;
}

// SVG del pezzo in mm. opzioni: { quote: true, fori: true, unoAUno: false, margine }
export function svgPezzo(progetto, p, { quote = true, conFori = true, margine = 40, classe = '' } = {}) {
  const poli = sezionePezzo(p);
  if (!poli.length) return '';
  const xs = poli.flat().map(q => q[0]), ys = poli.flat().map(q => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const m = margine, s = Math.max(x1 - x0, y1 - y0) / 120;
  const fori = conFori ? foriDelPezzo(progetto, p) : [];
  const dentro = fori.filter(f => f.faccia !== 'bordo');
  const vb = [x0 - m, -(y1 + m), x1 - x0 + 2 * m, y1 - y0 + 2 * m];
  const testo = (x, y, t, size = s * 3.2, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" ${extra}>${t}</text>`;
  let h = `<path class="pz-contorno" d="${poli.map(pl => `M${pl.map(q => `${q[0]},${-q[1]}`).join('L')}Z`).join('')}" fill-rule="evenodd"/>`;
  for (const f of dentro) {
    const cls = f.fissaggio ? `foro f-${f.fissaggio}` : 'foro';
    h += `<circle class="${cls}" cx="${f.x}" cy="${-f.y}" r="${Math.max(f.d / 2, s * 0.8)}"/><path class="croce" d="M${f.x - s * 2},${-f.y}h${s * 4}M${f.x},${-f.y - s * 2}v${s * 4}"/>`;
  }
  for (const f of fori.filter(f => f.faccia === 'bordo')) h += `<path class="tacca" d="M${f.da[0]},${-f.da[1]}L${f.x},${-f.y}"/>`;
  if (quote) {
    const yq = -(y0 - m * 0.45), xq = x1 + m * 0.45;
    h += `<path class="quota-l" d="M${x0},${yq}H${x1}M${x0},${yq - s * 2}v${s * 4}M${x1},${yq - s * 2}v${s * 4}M${xq},${-y0}V${-y1}M${xq - s * 2},${-y0}h${s * 4}M${xq - s * 2},${-y1}h${s * 4}"/>`;
    h += testo((x0 + x1) / 2, yq - s * 1.5, f1(x1 - x0), s * 4, 'text-anchor="middle" class="quota-t"');
    h += testo(xq + s * 1.5, (-y0 - y1) / 2, f1(y1 - y0), s * 4, `class="quota-t" transform="rotate(-90 ${xq + s * 1.5} ${(-y0 - y1) / 2})" text-anchor="middle"`);
    dentro.forEach((f, i) => { h += testo(f.x + Math.max(f.d / 2, s) + s, -f.y - s, i + 1, s * 3, 'class="num-foro"'); });
  }
  return { svg: `<svg class="disegno ${classe}" viewBox="${vb.join(' ')}" data-w="${vb[2]}" data-h="${vb[3]}">${h}</svg>`, vb, fori, x0, y0, x1, y1 };
}

export function htmlDisegno(progetto, p) {
  const d = svgPezzo(progetto, p);
  if (!d) return '';
  const { L, W, T } = dimensioni(p), mt = materiale(p.mat), bo = p.tipo === 'pannello' ? bordatura(p) : null;
  const dentro = d.fori.filter(f => f.faccia !== 'bordo'), bordo = d.fori.filter(f => f.faccia === 'bordo');
  const riga = (f, i) => `<tr><td class="n">${i}</td><td>${esc(f.nome)}${f.verso ? `<br><small class="nota">per «${esc(f.verso)}»</small>` : ''}</td><td class="num">${f1(f.x - d.x0)}</td><td class="num">${f1(f.y - d.y0)}</td><td class="num">Ø ${f1(f.d)}</td><td class="num">${typeof f.prof === 'number' ? f1(f.prof) : esc(f.prof)}</td><td>${f.faccia === 'bordo' ? 'bordo' : esc(nomeFaccia(p, f.faccia > 0 ? 1 : -1))}</td></tr>`;
  const tabella = d.fori.length ? `<table class="distinta fori"><thead><tr><th>N°</th><th>Foro</th><th style="text-align:right">X</th><th style="text-align:right">Y</th><th style="text-align:right">Ø</th><th style="text-align:right">Prof.</th><th>Faccia</th></tr></thead>
    <tbody>${dentro.map((f, i) => riga(f, i + 1)).join('')}${bordo.map((f, i) => riga(f, `b${i + 1}`)).join('')}</tbody></table>
    <p class="nota">X e Y dal vertice in basso a sinistra del disegno. Fori nel bordo: posizione lungo il bordo, profondità indicata.</p>` : '<p class="nota">Nessun foro.</p>';
  return `<div class="foglio-pezzo"><h3><span class="n">${p.n}</span> ${esc(p.nome)}</h3>
    <p class="nota">${esc(mt.nome)} · ${f1(d.x1 - d.x0)} × ${f1(d.y1 - d.y0)} × ${f1(T)} mm${bo?.lati.size ? ` · bordo ${f1(bo.s)} mm: ${[...bo.lati].map(l => nomeBordo(p, l)).join(', ')}` : ''}${p.forma === 'sagoma' || p.forma === 'cerchio' || p.tagli.length ? ' · <b>usa la dima 1:1</b>' : ''}</p>
    <div class="disegno-box">${d.svg}</div>${tabella}</div>`;
}

// Dima 1:1 divisa in fogli A4 (area utile 190 × 277 mm), con 10 mm di sovrapposizione e croci per allinearli.
export function htmlDima(progetto, p) {
  const d = svgPezzo(progetto, p, { margine: 15 });
  if (!d) return '';
  const [vx, vy, vw, vh] = d.vb, LW = 190, LH = 272, sov = 10;
  const col = Math.max(1, Math.ceil((vw - sov) / (LW - sov))), righe = Math.max(1, Math.ceil((vh - sov) / (LH - sov)));
  const interno = d.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const fogli = [];
  for (let r = 0; r < righe; r++) for (let c = 0; c < col; c++) {
    const x = vx + c * (LW - sov), y = vy + r * (LH - sov);
    const croci = [[x + sov / 2, y + sov / 2], [x + LW - sov / 2, y + sov / 2], [x + sov / 2, y + LH - sov / 2], [x + LW - sov / 2, y + LH - sov / 2]]
      .map(([cx, cy]) => `<path class="croce-all" d="M${cx - 4},${cy}h8M${cx},${cy - 4}v8"/><circle class="croce-all" cx="${cx}" cy="${cy}" r="2.5"/>`).join('');
    const prova = r === 0 && c === 0 ? `<g class="scala"><path d="M${x + 15},${y + LH - 18}h100M${x + 15},${y + LH - 21}v6M${x + 115},${y + LH - 21}v6"/><text x="${x + 65}" y="${y + LH - 22}" font-size="3.5" text-anchor="middle">questa riga deve misurare 100 mm</text></g>` : '';
    fogli.push(`<div class="foglio-dima"><div class="intestazione-dima">${esc(progetto.nome)} · n° ${p.n} ${esc(p.nome)} · foglio ${r * col + c + 1} di ${col * righe} (riga ${r + 1}, colonna ${c + 1}) · scala 1:1</div>
      <svg class="dima" width="${LW}mm" height="${LH}mm" viewBox="${x} ${y} ${LW} ${LH}">${interno}${croci}${prova}<rect class="bordo-foglio" x="${x}" y="${y}" width="${LW}" height="${LH}"/></svg></div>`);
  }
  return `<div class="dima-istruzioni"><h1>Dima 1:1 · ${esc(p.nome)}</h1><p>${col * righe} fogli A4. Stampa al <b>100%</b> (non «adatta alla pagina»), controlla la riga da 100 mm, poi sovrapponi i fogli facendo combaciare le croci e fissali con il nastro. I cerchi sono i fori, le croci il loro centro.</p></div>${fogli.join('')}`;
}

// Etichette 70 × 37 mm, 3 × 8 per foglio A4 (fogli di etichette adesive comuni).
export function htmlEtichette(progetto, righe) {
  const html = righe.filter(r => !r.vuoto).map(r => {
    const p = progetto.pezzi.find(x => x.n === r.n);
    const bo = p?.tipo === 'pannello' ? bordatura(p) : null;
    return `<div class="etichetta"><b class="n">${r.n}</b><div><b>${esc(r.nome)}</b><br>${r.Ltaglio} × ${r.Wtaglio} × ${r.T}<br><small>${esc(r.materiale)}</small>${bo?.lati.size ? `<br><small>bordo: ${[...bo.lati].map(l => nomeBordo(p, l)).join(', ')}</small>` : ''}${r.vena === 'W' ? '<br><small>venatura in larghezza</small>' : ''}<br><small class="prog">${esc(progetto.nome)}</small></div></div>`;
  });
  const fogli = [];
  for (let i = 0; i < html.length; i += 24) fogli.push(`<div class="foglio-etichette">${html.slice(i, i + 24).join('')}</div>`);
  return fogli.join('');
}
