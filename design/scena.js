// Scena di prova per gli studi dell'interfaccia: mobiletto con piano inclinato (misure in mm).
// Proiezione isometrica disegnata in SVG, senza librerie.
(function () {
  const W = 800, D = 500, HF = 750, HB = 900, T = 18;
  const FACES = [[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
  const box = (x0,x1,y0,y1,z0,z1) => [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
  const side = (x0,x1) => [[x0,0,0],[x1,0,0],[x1,D,0],[x0,D,0],[x0,0,HF],[x1,0,HF],[x1,D,HB],[x0,D,HB]];
  const th = Math.atan2(HB - HF, D), oy = -Math.sin(th) * T, oz = Math.cos(th) * T;
  const slabBase = [[0,0,HF],[W,0,HF],[W,D,HB],[0,D,HB]];
  const slab = slabBase.concat(slabBase.map(([x,y,z]) => [x, y + oy, z + oz]));

  const PIECES = [
    { id: 'fsx', kind: 'legno', v: side(0, T) },
    { id: 'fondo', kind: 'legno', v: box(T, W-T, 18, D-8, 50, 68) },
    { id: 'schiena', kind: 'fondo', v: box(T, W-T, D-8, D, 50, HB-40) },
    { id: 'ripiano', kind: 'legno', v: box(T, W-T, 20, D-8, 386, 404) },
    { id: 'anta', kind: 'legno', v: box(T+2, W-T-2, 0, 18, 52, 382) },
    { id: 'maniglia', kind: 'metallo', v: box(336, 464, -30, 0, 342, 354) },
    { id: 'fdx', kind: 'legno', v: side(W-T, W) },
    { id: 'piano', kind: 'legno', v: slab },
  ];
  const SCREWS = [];
  [59, 395].forEach(z => [70, 250, 430].forEach(y => SCREWS.push([W, y, z])));

  const P = ([x,y,z]) => [(x + y) * 0.7071, -(z * 0.8165 + (y - x) * 0.4082)];
  const depth = ([x,y,z]) => x - y + z;
  const avg = pts => pts.reduce((a,p) => a.map((s,i) => s + p[i] / pts.length), [0,0,0]);
  const L = (() => { const l = [0.35, -0.55, 0.85], n = Math.hypot(...l); return l.map(c => c / n); })();

  function normal(pts, center) {
    let n = [0,0,0];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      n[0] += (a[1]-b[1])*(a[2]+b[2]); n[1] += (a[2]-b[2])*(a[0]+b[0]); n[2] += (a[0]-b[0])*(a[1]+b[1]);
    }
    const len = Math.hypot(...n); n = n.map(c => c / len);
    const fc = avg(pts), out = [fc[0]-center[0], fc[1]-center[1], fc[2]-center[2]];
    if (n[0]*out[0] + n[1]*out[1] + n[2]*out[2] < 0) n = n.map(c => -c);
    return n;
  }
  function shade(hex, f) {
    const c = parseInt(hex.slice(1), 16), ch = s => Math.min(255, Math.round(((c >> s) & 255) * f));
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  // opt: { colors: {legno, fondo, metallo}, stroke, strokeWidth, selected, selColor, screw, label, labelBg, labelText }
  window.disegnaScena = function (svg, opt) {
    const polys = [];
    const sorted = PIECES.slice().sort((a,b) => depth(avg(a.v)) - depth(avg(b.v)));
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const pc of sorted) {
      const c = avg(pc.v);
      for (const f of FACES) {
        const pts = f.map(i => pc.v[i]), n = normal(pts, c);
        if (n[0] - n[1] + n[2] <= 0.0001) continue;
        const lit = 0.62 + 0.38 * Math.max(0, n[0]*L[0] + n[1]*L[1] + n[2]*L[2]);
        const sp = pts.map(P);
        sp.forEach(([x,y]) => { minX = Math.min(minX,x); maxX = Math.max(maxX,x); minY = Math.min(minY,y); maxY = Math.max(maxY,y); });
        const sel = pc.id === opt.selected;
        const base = sel && opt.selFill ? opt.selFill : opt.colors[pc.kind];
        polys.push(`<polygon points="${sp.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="${shade(base, lit)}" stroke="${sel ? opt.selColor : opt.stroke}" stroke-width="${sel ? opt.strokeWidth * 2.2 : opt.strokeWidth}" stroke-linejoin="round"/>`);
      }
    }
    const screws = SCREWS.map(s => { const [x,y] = P(s); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${opt.screw}" stroke="#fff" stroke-width="2.5"/>`; });
    const [lx, ly] = P([W, 0, HF + oz]);
    const label = `<g transform="translate(${(lx + 24).toFixed(1)},${(ly - 40).toFixed(1)})">
      <rect x="0" y="-26" width="118" height="40" rx="${opt.labelRadius ?? 8}" fill="${opt.labelBg}"/>
      <text x="59" y="1" text-anchor="middle" font-size="22" font-weight="600" fill="${opt.labelText}" font-family="${opt.labelFont || 'inherit'}">↗ 16,7°</text></g>`;
    const pad = 70;
    svg.setAttribute('viewBox', `${(minX - pad).toFixed(0)} ${(minY - pad).toFixed(0)} ${(maxX - minX + 2*pad + 120).toFixed(0)} ${(maxY - minY + 2*pad).toFixed(0)}`);
    svg.innerHTML = polys.join('') + screws.join('') + label;
  };
})();
