// MyPlanMaker: collega modello, vista 3D, pannello delle proprietà e salvataggio.
import { Vector3 } from '../vendor/three.module.js';
import { avviaGeometria, geometriaPezzo } from './geometria.js';
import { Vista3D } from './vista3d.js';
import * as mod from './modello.js';
import { materiale, materialiPer } from './materiali.js';
import { euro, riepilogo, righeDistinta } from './distinta.js';
import * as archivio from './archivio.js';
import { ESEMPI } from './esempi.js';
import { IMPOSTAZIONI_TAGLIO, schemaDiTaglio } from './taglio.js';
import { descriviGiunto, unioni } from './unioni.js';
import { INTERASSI, LATI, MODELLI_CERNIERA, cerniere, maniglia } from './ferramenta.js';
import { listaSpesa } from './spesa.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const numero = s => { const v = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
const f1 = v => mod.fmt(v, 1);

const stato = { progetto: null, sel: null, modo: null, mostraViti: localStorage.getItem('mpm:viti') !== 'no' };
const storico = new mod.Storico();
let vista;

const pezzoSel = () => stato.progetto.pezzi.find(p => p.id === stato.sel) || null;

function verticiMondo(p) {
  const g = geometriaPezzo(p);
  if (!g) return null;
  const m = mod.matrice(p);
  return g.vertici.map(v => new Vector3(...v).applyMatrix4(m));
}

function modifica(fn) {
  storico.salva(stato.progetto);
  const r = fn();
  aggiorna();
  salvaPresto();
  return r;
}

function aggiorna() {
  const u = unioni(stato.progetto);
  vista.aggiorna(stato.progetto, stato.sel, { viti: u.viti, mostraViti: stato.mostraViti, vitiErrate: u.errate });
  document.querySelector('[data-vista="viti"]')?.classList.toggle('on', stato.mostraViti);
  $('#nome-progetto').textContent = stato.progetto.nome;
  document.title = `${stato.progetto.nome} — MyPlanMaker`;
  disegnaProprieta();
  disegnaPiede();
  aggiornaAttrezzi();
}

// ---------- messaggi ----------
let timerToast;
function avvisa(testo, errore = false, durata = 5000) {
  const t = $('#toast');
  $('#toast-testo').textContent = testo;
  t.classList.toggle('errore', errore);
  t.hidden = false;
  clearTimeout(timerToast);
  if (durata) timerToast = setTimeout(() => { t.hidden = true; }, durata);
}

// ---------- attrezzi ----------
function aggiornaAttrezzi() {
  const sel = !!pezzoSel();
  document.querySelectorAll('.tool').forEach(b => {
    if (b.hasAttribute('data-serve-sel')) b.disabled = !sel;
    b.classList.toggle('on', b.dataset.cmd === stato.modo);
  });
  $('#annulla').disabled = !storico.indietro.length;
  $('#ripeti').disabled = !storico.avanti.length;
}

function esciModo() {
  if (!stato.modo) return;
  stato.modo = null;
  $('#toast').hidden = true;
  aggiornaAttrezzi();
}

function comando(cmd) {
  const p = pezzoSel(), pr = stato.progetto;
  if (cmd === 'pannello' || cmd === 'listello') {
    esciModo();
    const vicino = p || pr.pezzi.reduce((a, b) => (!a || mod.ingombro(b).max.x > mod.ingombro(a).max.x ? b : a), null);
    modifica(() => { stato.sel = mod.nuovoPezzo(pr, cmd, vicino).id; });
    vista.vista(vista.nomeVista);
    avvisa(`Aggiunto: scrivi le misure a destra, poi usa Accosta per metterlo contro un altro pezzo.`);
  } else if (cmd === 'accosta' || cmd === 'adatta' || cmd === 'dividi') {
    if (stato.modo === cmd) return esciModo();
    stato.modo = cmd;
    aggiornaAttrezzi();
    avvisa(cmd === 'accosta'
      ? `Tocca la faccia dove appoggiare «${p.nome}». Esc per annullare.`
      : cmd === 'dividi' ? `Tocca il pezzo opposto a «${p.nome}» (per esempio il piano, o l'altro fianco): ti chiedo quanti pezzi mettere in mezzo.`
      : `Tocca il pezzo contro cui adattare «${p.nome}»: lo allungo o accorcio e lo taglio con l'angolo giusto.`, false, 0);
  } else if (cmd === 'duplica') {
    modifica(() => { stato.sel = mod.duplica(pr, p).id; });
    avvisa(`Duplicato. I tagli sono rimasti, ma non sono più legati al pezzo di prima.`);
  } else if (cmd === 'elimina') {
    modifica(() => { pr.pezzi = pr.pezzi.filter(x => x !== p); stato.sel = null; });
    avvisa(`Eliminato «${p.nome}». Puoi sempre annullare.`);
  }
}

function tocco(id, faccia) {
  const p = pezzoSel();
  if (stato.modo && p) {
    if (!id || id === p.id) return avvisa('Tocca un altro pezzo, oppure premi di nuovo il comando per uscire.', true, 4000);
    const b = stato.progetto.pezzi.find(x => x.id === id);
    if (stato.modo === 'dividi') {
      stato.modo = null;
      aggiornaAttrezzi();
      $('#toast').hidden = true;
      return apriDividi(p, b);
    }
    if (stato.modo === 'accosta') {
      modifica(() => mod.accosta(p, faccia, verticiMondo(p)));
      avvisa(`«${p.nome}» accostato a «${b.nome}».`);
    } else {
      const prova = structuredClone(p);
      const r = mod.adatta(prova, b);
      if (r.ok && !geometriaPezzo(prova)) { r.ok = false; r.msg = 'Il taglio toglierebbe tutto il pezzo: controlla da che parte sta.'; }
      if (!r.ok) { avvisa(r.msg, true); } else {
        modifica(() => Object.assign(p, prova));
        avvisa(`«${p.nome}» adattato a «${b.nome}». ${r.msg}.`);
      }
    }
    stato.modo = null;
    aggiornaAttrezzi();
    return;
  }
  stato.sel = id;
  aggiorna();
}

// ---------- Dividi ----------
let dividiDa = null;
function apriDividi(a, b) {
  dividiDa = { a, b };
  $('#dividi-testo').innerHTML = `Quanti pezzi come «${esc(a.nome)}» vuoi mettere tra «${esc(a.nome)}» e «${esc(b.nome)}»? Saranno alla stessa distanza.`;
  $('#dividi-n').value = '1';
  anteprimaDividi();
  $('#dlg-dividi').showModal();
}
function anteprimaDividi() {
  const n = Math.max(1, Math.min(50, Math.round(numero($('#dividi-n').value) || 1)));
  const s = mod.spazioTra(dividiDa.a, dividiDa.b, verticiMondo(dividiDa.a), verticiMondo(dividiDa.b), n);
  const e = $('#dividi-esito');
  e.className = s.ok ? 'ok' : 'avviso';
  e.textContent = s.ok ? `Spazio libero ${f1(s.luce)} mm: ${n} pezz${n === 1 ? 'o' : 'i'} da ${f1(s.spessore)} mm, luce tra un pezzo e l'altro ${f1(s.passo)} mm.` : s.msg;
  $('#dividi-ok').disabled = !s.ok;
  return { n, s };
}

// ---------- pannello delle proprietà ----------
let chiavePannello = '';

const campoNum = (campo, etichetta, valore, unita = 'mm') =>
  `<div class="field"><label>${etichetta}</label><div class="input"><input data-campo="${campo}" inputmode="decimal" value="${esc(f1(valore))}"><small>${unita}</small></div></div>`;

function disegnaProprieta() {
  const el = $('#proprieta'), p = pezzoSel();
  const chiave = p ? JSON.stringify([p.id, p.tipo, p.forma, p.tagli.length, p.mat, p.ferramenta]) : 'progetto' + JSON.stringify(riepilogo(stato.progetto).materiali);
  if (chiave === chiavePannello) return aggiornaValori(el, p);
  chiavePannello = chiave;
  el.innerHTML = p ? htmlPezzo(p) : htmlProgetto();
  aggiornaValori(el, p);
}

function valoreCampo(p, campo) {
  if (campo === 'nomeProgetto') return stato.progetto.nome;
  if (campo === 'nome') return p.nome;
  if (campo === 'mat') return p.mat;
  const m = campo.match(/^(pos|rot)(\d)$/);
  if (m) return f1(p[m[1]][+m[2]]);
  return f1(p[campo] ?? 0);
}

function aggiornaValori(el, p) {
  el.querySelectorAll('[data-campo]').forEach(i => { if (i !== document.activeElement) i.value = valoreCampo(p, i.dataset.campo); });
  const info = el.querySelector('[data-info]');
  if (info && p) info.innerHTML = htmlInfo(p);
  const un = el.querySelector('[data-unioni]');
  if (un && p) un.innerHTML = htmlUnioni(p);
  el.querySelectorAll('[data-orient]').forEach(b => {
    const r = mod.rotazioneDa(b.dataset.orient);
    b.classList.toggle('on', r.every((v, i) => Math.abs(v - p.rot[i]) < 0.01));
  });
}

function htmlInfo(p) {
  const g = geometriaPezzo(p), { T } = mod.dimensioni(p);
  if (!g) return `<div class="avviso">I tagli hanno tolto tutto il pezzo. Togline uno o annulla.</div>`;
  const L = g.max[0] - g.min[0], W = g.max[1] - g.min[1];
  const prezzo = materiale(p.mat);
  const costo = p.tipo === 'listello' ? (L / 1000) * prezzo.prezzoM : (L * W / 1e6) * prezzo.prezzoM2;
  return `<div class="chipline"><span>Misura finita</span><b>${f1(L)} × ${f1(W)} × ${f1(T)}</b></div>
    <div class="chipline"><span>Costo del pezzo</span><b>${euro(costo)}</b></div>`;
}

function htmlPezzo(p) {
  const mats = materialiPer(p.tipo).map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('');
  const rotondo = p.tipo === 'pannello' && p.forma === 'cerchio';
  const misure = p.tipo === 'listello'
    ? `${campoNum('L', 'Lunghezza', p.L)}<p class="nota">Sezione ${materiale(p.mat).W} × ${materiale(p.mat).T} mm: dipende dal materiale.</p>`
    : rotondo ? campoNum('D', 'Diametro', p.D)
    : `<div class="row">${campoNum('L', 'Lunghezza', p.L)}${campoNum('W', 'Larghezza', p.W)}</div>${campoNum('r', 'Raggio degli angoli (0 = spigolo vivo)', p.r || 0)}`;
  const forma = p.tipo === 'pannello'
    ? `<div class="field"><label>Forma</label><div class="seg"><button data-forma="rett" class="${rotondo ? '' : 'on'}">Rettangolo</button><button data-forma="cerchio" class="${rotondo ? 'on' : ''}">Rotondo</button></div></div>` : '';
  const orient = Object.entries(mod.NOMI_ORIENTAMENTI).map(([k, v]) => `<button data-orient="${k}">${v}</button>`).join('');
  const tagli = p.tagli.length
    ? p.tagli.map((t, i) => {
      const da = stato.progetto.pezzi.find(x => x.id === t.da);
      return `<div class="chipline"><span>${esc(mod.descriviTaglio(t))}${da ? `<br><small class="nota">contro «${esc(da.nome)}»</small>` : ''}</span><button class="link" data-togli="${i}">Togli</button></div>`;
    }).join('')
    : `<p class="nota">Nessun taglio. Con <b>Adatta</b> lo tagli contro un altro pezzo con l'angolo giusto.</p>`;
  return `
    <div><div class="kicker">Pezzo ${p.n} · ${p.tipo}</div><input class="titolo" data-campo="nome" aria-label="Nome del pezzo"></div>
    <div class="field"><label>Materiale</label><div class="input"><select data-campo="mat">${mats}</select><small>▾</small></div></div>
    ${forma}
    ${misure}
    <div data-info class="group"></div>
    <div class="group"><h3>Orientamento</h3><div class="seg">${orient}</div>
      <div class="field"><label>Rotazione attorno agli assi X, Y, Z</label><div class="row3">
        <div class="input"><input data-campo="rot0" inputmode="decimal"><small>°</small></div>
        <div class="input"><input data-campo="rot1" inputmode="decimal"><small>°</small></div>
        <div class="input"><input data-campo="rot2" inputmode="decimal"><small>°</small></div></div></div>
      <div class="stepper"><button class="btn icon" data-inclina="-1" title="Inclina indietro di 1°">−</button><div class="input"><span class="nota">Inclina (asse X) di 1°</span></div><button class="btn icon" data-inclina="1" title="Inclina avanti di 1°">+</button></div>
    </div>
    <div class="group"><h3>Posizione</h3>
      <div class="row3">
        <div class="field"><label>X destra</label><div class="input"><input data-campo="pos0" inputmode="decimal"></div></div>
        <div class="field"><label>Y altezza</label><div class="input"><input data-campo="pos1" inputmode="decimal"></div></div>
        <div class="field"><label>Z verso di te</label><div class="input"><input data-campo="pos2" inputmode="decimal"></div></div>
      </div>
      <button class="btn" data-azione="terra">Appoggia a terra</button>
    </div>
    <div class="group"><h3>Tagli</h3>${tagli}</div>
    ${p.tipo === 'pannello' ? htmlFerramenta(p) : ''}
    <div class="group" data-unioni></div>
    <div class="azioni"><button class="btn" data-azione="duplica">Duplica</button><button class="btn danger" data-azione="elimina">Elimina</button></div>`;
}

function htmlFerramenta(p) {
  const c = cerniere(p), m = maniglia(p);
  const seg = (attr, voci, attivo) => `<div class="seg">${Object.entries(voci).map(([k, v]) => `<button data-${attr}="${k}" class="${k === attivo ? 'on' : ''}">${v}</button>`).join('')}</div>`;
  let h = '<div class="group"><h3>Ferramenta</h3>';
  if (c) {
    h += `<div class="field"><label>Cerniere: su quale lato (visti di fronte)</label>${seg('cern-lato', LATI, c.lato)}</div>
      ${seg('cern-modello', MODELLI_CERNIERA, c.modello || 'sovrapposta')}
      <div class="stepper"><button class="btn icon" data-cern-n="-1">−</button><div class="input"><span>${c.n} cerniere${c.numero ? '' : ' (scelte dall\'altezza)'}</span></div><button class="btn icon" data-cern-n="1">+</button></div>
      ${c.avvisi.map(a => `<div class="avviso">${esc(a)}</div>`).join('')}
      <button class="link" data-togli-ferr="cerniere">Togli le cerniere</button>`;
  } else h += `<button class="btn" data-aggiungi-ferr="cerniere">+ Cerniere (diventa un'anta)</button>`;
  if (m) {
    const verticale = m.lato === 'A' || m.lato === 'B';
    const pos = verticale ? { inizio: 'In basso', centro: 'Al centro', fine: 'In alto' } : { inizio: 'A sinistra', centro: 'Al centro', fine: 'A destra' };
    h += `<div class="field"><label>Maniglia: interasse</label><div class="input"><select data-man-interasse>${INTERASSI.map(i => `<option value="${i}" ${i === (m.interasse || 128) ? 'selected' : ''}>${i} mm</option>`).join('')}</select><small>▾</small></div></div>
      <div class="field"><label>Posizione della maniglia${c ? ' (sul lato opposto alle cerniere)' : ''}</label>${seg('man-pos', pos, m.posizione || 'fine')}</div>
      ${seg('man-dir', { parallela: 'Parallela al bordo', perpendicolare: 'Perpendicolare' }, m.direzione || 'parallela')}
      <p class="nota">2 fori Ø 5 passanti, viti ${esc(m.vite)}.</p>
      ${m.avvisi.map(a => `<div class="avviso">${esc(a)}</div>`).join('')}
      <button class="link" data-togli-ferr="maniglia">Togli la maniglia</button>`;
  } else h += `<button class="btn" data-aggiungi-ferr="maniglia">+ Maniglia</button>`;
  return h + '</div>';
}

function htmlUnioni(p) {
  const u = unioni(stato.progetto), miei = u.giunti.filter(g => g.a.id === p.id || g.b.id === p.id);
  const righe = miei.map(g => {
    const altro = g.a.id === p.id ? g.b : g.a;
    const puo = g.vite && g.tipo !== 'cerniere';
    return `<div class="giunto"><div class="chipline"><span>con «${esc(altro.nome)}»</span>${puo ? `<button class="link" data-escludi="${g.chiave}">${g.escluso ? 'Rimetti le viti' : 'Niente viti'}</button>` : ''}</div>
      <div class="nota">${esc(descriviGiunto(g))}</div>${g.note.map(n => `<div class="nota avviso-mini">${esc(n)}</div>`).join('')}</div>`;
  }).join('');
  const avvisi = u.avvisi.filter(a => a.includes(`«${p.nome}»`)).map(a => `<div class="avviso">${esc(a)}</div>`).join('');
  return `<h3>Unioni e viti</h3>${righe || '<p class="nota">Non tocca altri pezzi. Usa Accosta per appoggiarlo: le viti arrivano da sole.</p>'}${avvisi}`;
}

function htmlProgetto() {
  const r = riepilogo(stato.progetto);
  const mats = r.materiali.map(m => `<div class="chipline"><span>${esc(m.nome)}</span><b>${f1(m.qta)} ${m.tipo === 'listello' ? 'm' : 'm²'}</b></div>`).join('');
  return `
    <div><div class="kicker">Progetto</div><input class="titolo" data-campo="nomeProgetto" aria-label="Nome del progetto"></div>
    <p class="nota">Tocca un pezzo per modificarlo, oppure aggiungi un <b>Pannello</b> o un <b>Listello</b> con gli attrezzi a sinistra.</p>
    <div class="group"><h3>Come si costruisce</h3>
      <p class="nota"><b>Accosta</b>: scegli un pezzo, poi tocca la faccia di un altro: ci si appoggia sopra.</p>
      <p class="nota"><b>Adatta</b>: scegli un pezzo, poi tocca quello contro cui deve finire: si allunga o accorcia e prende il taglio con l'angolo giusto.</p></div>
    <div class="group"><h3>Materiali</h3>${mats || '<p class="nota">Ancora nessun pezzo.</p>'}</div>`;
}

function applicaCampo(campo, valore) {
  const p = pezzoSel(), pr = stato.progetto;
  if (campo === 'nomeProgetto') { const v = valore.trim(); if (v && v !== pr.nome) modifica(() => { pr.nome = v; }); return; }
  if (!p) return;
  if (campo === 'nome') { const v = valore.trim(); if (v && v !== p.nome) modifica(() => { p.nome = v; }); return; }
  if (campo === 'mat') return modifica(() => { p.mat = valore; });
  const v = numero(valore);
  if (v === null) { avvisa('Scrivi un numero, per esempio 600 o 16,5.', true); return disegnaProprieta(); }
  const m = campo.match(/^(pos|rot)(\d)$/);
  if (m) { if (p[m[1]][+m[2]] !== v) modifica(() => { p[m[1]][+m[2]] = v; }); return; }
  if (campo === 'r' ? v < 0 : v <= 0) { avvisa('La misura deve essere maggiore di zero.', true); return disegnaProprieta(); }
  if (p[campo] === v) return;
  modifica(() => { p[campo] = v; if (campo === 'D') { p.L = v; p.W = v; } });
  if (p.tagli.length && ['L', 'W', 'D'].includes(campo)) avvisa('Il pezzo ha dei tagli: restano dove sono. Se serve, toglili e rifai Adatta.');
}

const ferr = (p, tipo) => p.ferramenta.find(f => f.tipo === tipo);

function eventiProprieta() {
  const el = $('#proprieta');
  el.addEventListener('change', e => {
    const c = e.target.dataset.campo, p = pezzoSel();
    if (c) applicaCampo(c, e.target.value);
    else if (e.target.hasAttribute('data-man-interasse') && p) modifica(() => { ferr(p, 'maniglia').interasse = +e.target.value; });
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.campo) e.target.blur(); });
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const p = pezzoSel();
    if (b.dataset.forma && p) modifica(() => { p.forma = b.dataset.forma; if (p.forma === 'cerchio') { p.D = p.D || Math.max(p.L, p.W); } });
    else if (b.dataset.orient && p) modifica(() => { p.rot = mod.rotazioneDa(b.dataset.orient); });
    else if (b.dataset.inclina && p) modifica(() => { p.rot[0] = Math.round((p.rot[0] + +b.dataset.inclina) * 1000) / 1000; });
    else if (b.dataset.togli && p) modifica(() => { p.tagli.splice(+b.dataset.togli, 1); });
    else if (b.dataset.aggiungiFerr && p) modifica(() => {
      p.ferramenta = (p.ferramenta || []).filter(f => f.tipo !== b.dataset.aggiungiFerr);
      p.ferramenta.push(b.dataset.aggiungiFerr === 'cerniere' ? { tipo: 'cerniere', lato: 'A', modello: 'sovrapposta' } : { tipo: 'maniglia', interasse: 128, posizione: 'fine', direzione: 'parallela' });
    });
    else if (b.dataset.togliFerr && p) modifica(() => { p.ferramenta = p.ferramenta.filter(f => f.tipo !== b.dataset.togliFerr); });
    else if (b.dataset.cernLato && p) modifica(() => { ferr(p, 'cerniere').lato = b.dataset.cernLato; });
    else if (b.dataset.cernModello && p) modifica(() => { ferr(p, 'cerniere').modello = b.dataset.cernModello; });
    else if (b.dataset.cernN && p) modifica(() => { const f = ferr(p, 'cerniere'); f.numero = Math.max(1, Math.min(8, cerniere(p).n + +b.dataset.cernN)); });
    else if (b.dataset.manPos && p) modifica(() => { ferr(p, 'maniglia').posizione = b.dataset.manPos; });
    else if (b.dataset.manDir && p) modifica(() => { ferr(p, 'maniglia').direzione = b.dataset.manDir; });
    else if (b.dataset.escludi) modifica(() => {
      const l = new Set(stato.progetto.unioniEscluse || []);
      l.has(b.dataset.escludi) ? l.delete(b.dataset.escludi) : l.add(b.dataset.escludi);
      stato.progetto.unioniEscluse = [...l];
    });
    else if (b.dataset.azione === 'terra' && p) {
      const min = Math.min(...verticiMondo(p).map(v => v.y));
      modifica(() => { p.pos[1] = Math.round((p.pos[1] - min) * 1000) / 1000; });
    } else if (b.dataset.azione) comando(b.dataset.azione);
  });
}

// ---------- piede e distinta ----------
function disegnaPiede() {
  const r = riepilogo(stato.progetto);
  const comprare = schemaDiTaglio(stato.progetto), lastre = comprare.filter(g => g.tipo === 'pannello').reduce((t, g) => t + g.fogli.length, 0);
  const barre = comprare.filter(g => g.tipo === 'listello').reduce((t, g) => t + g.fogli.length, 0);
  const totale = comprare.reduce((t, g) => t + g.totale, 0);
  const u = unioni(stato.progetto), spesa = listaSpesa(stato.progetto, u);
  $('#piede').innerHTML = `<span><b>${r.pezzi}</b> pezzi</span><span>Da comprare: <b>${lastre}</b> lastr${lastre === 1 ? 'a' : 'e'} · <b>${barre}</b> barr${barre === 1 ? 'a' : 'e'}</span>
    <span>Viti: <b>${u.viti.length}</b></span>${u.avvisi.length ? `<button class="link avviso-link" id="vedi-avvisi">⚠ ${u.avvisi.length} da controllare</button>` : ''}
    <span class="sp"></span><span>Costo dei pezzi <b>${euro(r.costo)}</b></span><span class="costo">Da comprare <b>${euro(totale + spesa.totale)}</b></span>`;
  $('#vedi-avvisi')?.addEventListener('click', () => { mostraDistinta('ferramenta'); $('#dlg-distinta').showModal(); });
}

function htmlDistinta() {
  const righe = righeDistinta(stato.progetto), r = riepilogo(stato.progetto);
  const tr = righe.map(x => `<tr><td class="n">${x.n}</td><td>${esc(x.nome)}</td><td>${esc(x.materiale)}</td>
    <td class="num">${x.vuoto ? '—' : `${x.L} × ${x.W} × ${x.T}`}</td>
    <td>${x.forma.length || x.tagli.length ? `<ul>${[...x.forma, ...x.tagli].map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : 'a squadra'}</td>
    <td class="num">${euro(x.costo)}</td></tr>`).join('');
  return `<div class="distinta-totali"><span><b>${r.pezzi}</b> pezzi</span>${r.materiali.map(m => `<span>${esc(m.nome)}: <b>${f1(m.qta)} ${m.tipo === 'listello' ? 'm' : 'm²'}</b></span>`).join('')}<span>Costo stimato: <b>${euro(r.costo)}</b></span></div>
    <table class="distinta"><thead><tr><th>N°</th><th>Pezzo</th><th>Materiale</th><th style="text-align:right">Misura finita (mm)</th><th>Forma e tagli</th><th style="text-align:right">Costo</th></tr></thead><tbody>${tr}</tbody></table>
    <p class="nota">Misure finite dopo i tagli (L × larghezza × spessore). Testa A = inizio del pezzo, Testa B = fine. Costi indicativi, senza sfrido.</p>`;
}

function svgLastra(f, larghezza) {
  const sc = larghezza / f.L, barra = !f.H, alto = barra ? 30 : f.H * sc;
  const pezzi = f.pezzi.map(p => {
    const x = p.x * sc, w = p.w * sc, y = barra ? 3 : p.y * sc, h = barra ? 24 : p.h * sc, cx = x + w / 2, cy = y + h / 2;
    let testo = '';
    if (barra) testo = w > 18 ? `<text x="${cx}" y="${cy + 4}" text-anchor="middle">${w > 70 ? `${p.n} · ${Math.round(p.w)}` : p.n}</text>` : '';
    else if (w > 18 && h > 14) {
      testo = `<text x="${cx}" y="${cy + (h > 34 ? -2 : 4)}" text-anchor="middle">${p.n}</text>`;
      if (w > 70 && h > 34) testo += `<text class="mis" x="${cx}" y="${cy + 12}" text-anchor="middle">${Math.round(p.w)}×${Math.round(p.h)}${p.ruotato ? ' ↻' : ''}</text>`;
    }
    const forma = p.rotondo ? `<ellipse class="pz" cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}"><title>${esc(p.nome)}</title></ellipse>`
      : `<rect class="pz" x="${x}" y="${y}" width="${w}" height="${h}" rx="${(p.raggio || 0) * sc}"><title>${esc(p.nome)}</title></rect>`;
    return forma + testo;
  }).join('');
  return `<svg width="${larghezza}" height="${alto}" viewBox="0 0 ${larghezza} ${alto}">${pezzi}</svg>`;
}

function htmlSchema(perStampa = false) {
  const imp = { ...IMPOSTAZIONI_TAGLIO, ...(stato.progetto.taglio || {}) };
  const gruppi = schemaDiTaglio(stato.progetto);
  const totale = gruppi.reduce((s, g) => s + g.totale, 0);
  const html = gruppi.map(g => {
    const m = g.materiale, lastra = g.tipo === 'pannello';
    const unita = lastra ? `lastr${g.fogli.length === 1 ? 'a' : 'e'} ${m.lastra[0]}×${m.lastra[1]}` : `barr${g.fogli.length === 1 ? 'a' : 'e'} da ${mod.fmt(m.barra)} mm`;
    const fuori = g.fuori.length ? `<div class="avviso">Non ${g.fuori.length === 1 ? 'entra' : 'entrano'} in ${lastra ? 'una lastra' : 'una barra'}: ${g.fuori.map(p => `n° ${p.n} ${esc(p.nome)} (${p.L}${lastra ? `×${p.W}` : ''})`).join(', ')}. Va giuntato o comprato a parte.</div>` : '';
    const disegni = g.fogli.map((f, i) => `<div class="lastra">${svgLastra(f, lastra ? 460 : 640)}<span>${lastra ? 'Lastra' : 'Barra'} ${i + 1} · usata al ${Math.round(f.uso * 100)}%</span></div>`).join('');
    return `<div class="gruppo-taglio"><h3>${esc(m.nome)}</h3>
      <div class="riga"><span>Da comprare: <b>${g.fogli.length} ${unita}</b></span><span>Costo: <b>${euro(g.totale)}</b></span>${lastra ? `<span>${m.venatura ? 'Venatura rispettata: pezzi non ruotati' : 'Pezzi ruotabili (↻ = ruotato)'}</span>` : ''}</div>
      ${fuori}<div class="lastre">${disegni}</div></div>`;
  }).join('');
  if (perStampa) return `<p class="nota">Lama ${f1(imp.lama)} mm · rifilo ${f1(imp.rifilo)} mm · totale da comprare ${euro(totale)}</p>${html}`;
  return `<div class="impost">
      <div class="field"><label>Spessore della lama</label><div class="input"><input data-taglio="lama" inputmode="decimal" value="${f1(imp.lama)}"><small>mm</small></div></div>
      <div class="field"><label>Rifilo dei bordi</label><div class="input"><input data-taglio="rifilo" inputmode="decimal" value="${f1(imp.rifilo)}"><small>mm</small></div></div>
      <p class="nota" style="flex:1;min-width:220px">Totale da comprare: <b>${euro(totale)}</b>. I numeri sui disegni sono quelli della distinta.</p></div>
    ${html || '<p class="nota">Ancora nessun pezzo.</p>'}`;
}

function htmlFerramentaProgetto() {
  const u = unioni(stato.progetto), sp = listaSpesa(stato.progetto, u);
  const avvisi = u.avvisi.map(a => `<div class="avviso">⚠ ${esc(a)}</div>`).join('');
  const spesa = sp.righe.map(r => `<tr><td>${esc(r.voce)}${r.nota ? `<br><small class="nota">${esc(r.nota)}</small>` : ''}</td><td class="num">${r.qta}</td><td class="num">${euro(r.qta * r.prezzo)}</td></tr>`).join('');
  const giunti = u.giunti.map(g => `<tr><td>${esc(g.a.nome)} + ${esc(g.b.nome)}</td><td>${esc(g.tipo || '')}</td><td>${esc(descriviGiunto(g))}${g.note.map(n => `<br><small class="nota">${esc(n)}</small>`).join('')}</td></tr>`).join('');
  return `${avvisi}
    <h3>Lista della spesa</h3>
    <table class="distinta"><thead><tr><th>Voce</th><th style="text-align:right">Quantità</th><th style="text-align:right">Costo</th></tr></thead><tbody>${spesa || '<tr><td colspan="3" class="nota">Ancora niente.</td></tr>'}</tbody></table>
    <p class="nota">Totale ferramenta: <b>${euro(sp.totale)}</b> (prezzi indicativi).</p>
    <h3>Unioni trovate</h3>
    <table class="distinta"><thead><tr><th>Pezzi</th><th>Come si toccano</th><th>Fissaggio proposto</th></tr></thead><tbody>${giunti || '<tr><td colspan="3" class="nota">Nessun pezzo tocca un altro.</td></tr>'}</tbody></table>
    <p class="nota">Le viti sono proposte con regole indicative: controllale prima di forare. Le blu sono nel 3D (pulsante Viti), le rosse si scontrano con qualcosa.</p>`;
}

function mostraDistinta(scheda) {
  document.querySelectorAll('#schede-distinta button').forEach(b => b.classList.toggle('on', b.dataset.scheda === scheda));
  $('#distinta').innerHTML = scheda === 'schema' ? htmlSchema() : scheda === 'ferramenta' ? htmlFerramentaProgetto() : htmlDistinta();
  $('#distinta').dataset.scheda = scheda;
}

function stampa() {
  $('#stampa-area').innerHTML = `<h1>${esc(stato.progetto.nome)}</h1><p class="nota">MyPlanMaker · ${new Date().toLocaleDateString('it-IT')}</p>${htmlDistinta()}<div class="stampa-schema"><h1>Schema di taglio</h1>${htmlSchema(true)}</div><div class="stampa-schema"><h1>Ferramenta e viti</h1>${htmlFerramentaProgetto()}</div>`;
  window.print();
}

// ---------- progetti e salvataggio ----------
let timerSalva;
function salvaPresto() {
  clearTimeout(timerSalva);
  $('#stato-salvataggio').textContent = 'Salvo…';
  timerSalva = setTimeout(salvaOra, 700);
}

async function salvaOra() {
  const r = await archivio.salva(stato.progetto);
  const s = $('#stato-salvataggio');
  s.classList.toggle('attenzione', r !== 'salvato');
  if (r === 'salvato') s.textContent = 'Salvato';
  else if (r === 'locale') s.textContent = 'Salvato solo su questo dispositivo';
  else if (r.conflitto) {
    s.textContent = 'Aggiornato da un altro dispositivo';
    apri(r.conflitto);
    avvisa('Questo progetto era stato cambiato su un altro dispositivo: ho caricato quella versione.', true, 8000);
  }
}

function apri(progetto) {
  stato.progetto = progetto;
  stato.sel = null;
  stato.modo = null;
  storico.indietro = []; storico.avanti = [];
  chiavePannello = '';
  localStorage.setItem('mpm:ultimo', progetto.id);
  aggiorna();
  vista.vista('3d');
  document.querySelectorAll('#viste button:not([data-vista="viti"]):not([data-vista="inquadra"])').forEach(b => b.classList.toggle('on', b.dataset.vista === '3d'));
}

function crea(progetto) {
  progetto.id = mod.nuovoId();
  apri(progetto);
  salvaOra();
}

async function dialogoProgetti() {
  const d = $('#dlg-progetti');
  const lista = await archivio.elenco();
  $('#lista-progetti').innerHTML = lista.map(p => `<li class="${p.id === stato.progetto.id ? 'attivo' : ''}"><span class="nome"><b>${esc(p.nome)}</b><span>${new Date(p.aggiornato).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })}</span></span>
    <button class="btn" data-apri="${p.id}">Apri</button><button class="btn icon danger" data-elimina="${p.id}" title="Elimina">✕</button></li>`).join('') || '<li><span class="nome nota">Nessun progetto salvato.</span></li>';
  $('#lista-esempi').innerHTML = ESEMPI.map((e, i) => `<li><span class="nome"><b>${esc(e.nome)}</b><span>${esc(e.nota)}</span></span><button class="btn" data-esempio="${i}">Usa</button></li>`).join('');
  if (!d.open) d.showModal();
}

function eventiDialoghi() {
  document.querySelectorAll('[data-chiudi]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  $('#apri-progetti').addEventListener('click', dialogoProgetti);
  $('#nuovo-progetto').addEventListener('click', () => { $('#dlg-progetti').close(); crea(mod.nuovoProgetto()); });
  $('#dlg-progetti').addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.apri) { const p = await archivio.carica(b.dataset.apri); $('#dlg-progetti').close(); if (p) apri(p); }
    if (b.dataset.esempio) { $('#dlg-progetti').close(); crea(ESEMPI[+b.dataset.esempio].crea()); }
    if (b.dataset.elimina) {
      if (b.dataset.elimina === stato.progetto.id) return avvisa('Non puoi eliminare il progetto aperto: aprine prima un altro.', true);
      if (!confirm('Eliminare questo progetto? Non si può annullare.')) return;
      await archivio.elimina(b.dataset.elimina);
      dialogoProgetti();
    }
  });
  $('#esporta-file').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([archivio.versoFile(stato.progetto)], { type: 'application/json' }));
    a.download = `${stato.progetto.nome.replace(/[\\/:*?"<>|]+/g, '-')}.mpm.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('#importa').addEventListener('click', () => $('#file-importa').click());
  $('#file-importa').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const p = archivio.daFile(await f.text());
      $('#dlg-progetti').close();
      crea(p);
      avvisa(`Importato «${p.nome}» come nuovo progetto.`);
    } catch (err) { avvisa(err.message, true, 8000); }
  });
  $('#apri-distinta').addEventListener('click', () => { mostraDistinta('pezzi'); $('#dlg-distinta').showModal(); });
  $('#dividi-n').addEventListener('input', anteprimaDividi);
  $('#dividi-meno').addEventListener('click', () => { $('#dividi-n').value = Math.max(1, (numero($('#dividi-n').value) || 1) - 1); anteprimaDividi(); });
  $('#dividi-piu').addEventListener('click', () => { $('#dividi-n').value = Math.min(50, (numero($('#dividi-n').value) || 1) + 1); anteprimaDividi(); });
  $('#dividi-ok').addEventListener('click', () => {
    const { n, s } = anteprimaDividi();
    if (!s.ok) return;
    const { a } = dividiDa;
    modifica(() => { const nuovi = mod.dividi(stato.progetto, a, s, n); stato.sel = nuovi[0].id; });
    $('#dlg-dividi').close();
    avvisa(`Aggiunt${n === 1 ? 'o 1 pezzo' : `i ${n} pezzi`} alla stessa distanza (luce ${f1(s.passo)} mm). Viti e distinta sono già aggiornate.`);
  });
  $('#schede-distinta').addEventListener('click', e => { const b = e.target.closest('button'); if (b) mostraDistinta(b.dataset.scheda); });
  $('#distinta').addEventListener('change', e => {
    const k = e.target.dataset.taglio;
    if (!k) return;
    const v = numero(e.target.value);
    if (v === null || v < 0 || v > 100) { avvisa('Scrivi un numero tra 0 e 100.', true); return mostraDistinta('schema'); }
    modifica(() => { stato.progetto.taglio = { ...IMPOSTAZIONI_TAGLIO, ...(stato.progetto.taglio || {}), [k]: v }; });
    mostraDistinta('schema');
  });
  $('#stampa').addEventListener('click', stampa);
  $('#esporta').addEventListener('click', stampa);
}

// ---------- avvio ----------
async function avvio() {
  await avviaGeometria();
  vista = new Vista3D($('#vista3d'), { onTocco: tocco });
  document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => comando(b.dataset.cmd)));
  $('#viste').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.vista === 'inquadra') return vista.vista(vista.nomeVista);
    if (b.dataset.vista === 'viti') { stato.mostraViti = !stato.mostraViti; localStorage.setItem('mpm:viti', stato.mostraViti ? 'si' : 'no'); return aggiorna(); }
    document.querySelectorAll('#viste button:not([data-vista="viti"]):not([data-vista="inquadra"])').forEach(x => x.classList.toggle('on', x === b));
    vista.vista(b.dataset.vista);
  });
  const annulla = () => { const s = storico.annulla(stato.progetto); if (s) { stato.progetto = s; aggiorna(); salvaPresto(); } };
  const ripeti = () => { const s = storico.ripeti(stato.progetto); if (s) { stato.progetto = s; aggiorna(); salvaPresto(); } };
  $('#annulla').addEventListener('click', annulla);
  $('#ripeti').addEventListener('click', ripeti);
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? ripeti() : annulla(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); ripeti(); }
    else if (e.key === 'Escape') esciModo();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && pezzoSel()) comando('elimina');
  });
  eventiProprieta();
  eventiDialoghi();
  window.addEventListener('online', () => archivio.sincronizza());

  const ultimo = localStorage.getItem('mpm:ultimo');
  let p = ultimo ? await archivio.carica(ultimo) : null;
  if (!p) { const l = await archivio.elenco(); if (l.length) p = await archivio.carica(l[0].id); }
  if (p) apri(p);
  else { crea(ESEMPI[0].crea()); avvisa('Ti ho aperto un esempio: tocca un pezzo per vedere come è fatto. Nuovi progetti dal menu Progetto.', false, 9000); }
  archivio.sincronizza();
  // Segnale di vita: la versione portable per Windows si chiude da sola quando nessuna pagina è aperta.
  setInterval(() => fetch('/api/ping', { cache: 'no-store' }).catch(() => {}), 60000);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.mpm = { stato, comando, tocco, apri, mod, righeDistinta }; // per le prove automatiche
}

avvio().catch(err => { console.error(err); avvisa(`Errore all'avvio: ${err.message}`, true, 0); });
