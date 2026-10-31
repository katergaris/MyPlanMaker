// MyPlanMaker: collega modello, vista 3D, pannello delle proprietà e salvataggio.
import { Box3, Matrix4, Vector3 } from '../vendor/three.module.js';
import { avviaGeometria, geometriaPezzo } from './geometria.js';
import { Vista3D } from './vista3d.js';
import * as mod from './modello.js';
import { MATERIALI, applicaCatalogo, materiale, materialeBase, materialePezzo, materialiPer } from './materiali.js';
import { euro, riepilogo, righeDistinta } from './distinta.js';
import * as archivio from './archivio.js';
import { ESEMPI } from './esempi.js';
import { IMPOSTAZIONI_TAGLIO, schemaDiTaglio } from './taglio.js';
import { FISSAGGI, descriviGiunto, descriviTipo, unioni } from './unioni.js';

import { INTERASSI, LATI, MODELLI_CERNIERA, cerniere, maniglia } from './ferramenta.js';
import { listaSpesa } from './spesa.js';
import { MODELLI, modello, valoriDefault } from './modelli.js';
import { creaCassetti, lunghezzaGuida } from './cassetti.js';
import { apriEditorSagoma } from './sagome.js';
import { apriDisegno2D } from './disegno2d.js';
import { htmlDima, htmlDisegno, htmlEtichette } from './disegni.js';
import { csvDistinta, dxfPezzi, scarica, stlProgetto } from './esporta.js';
import { htmlIstruzioni, istruzioni } from './montaggio.js';
import { CARICO_RIPIANI, controlli } from './controlli.js';
import { LINGUE, caricaLingua, lingua, salvaLingua, t, tn, tr, traduciPagina } from './lingua.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const numero = s => { const v = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
const f1 = v => mod.fmt(v, 1);
// Misure di lunghezza nell'unità scelta (mm o cm): fU per scriverle nei campi, U() per l'etichetta.
const fU = mm => mod.fmtU(mm), U = () => mod.unita.u;
const LUNGHEZZE = new Set(['L', 'W', 'D', 'r', 'spessore', 'sezW', 'sezT', 'pos0', 'pos1', 'pos2']);

const stato = {
  progetto: null, sel: null, multi: new Set(), modo: null, misura: null, esploso: false, gizmo: 'translate', aggiungiSel: false,
  mostraViti: localStorage.getItem('mpm:viti') !== 'no',
};
const storico = new mod.Storico();
let vista;

let impostazioni = {};
const schema = () => schemaDiTaglio(stato.progetto, impostazioni.avanzi || []);
const pezzoSel = () => stato.progetto.pezzi.find(p => p.id === stato.sel) || null;
const selezione = () => { const s = new Set([...stato.multi].filter(id => stato.progetto.pezzi.some(p => p.id === id))); if (pezzoSel()) s.add(stato.sel); return s; };
const pezziSel = () => { const s = selezione(); return stato.progetto.pezzi.filter(p => s.has(p.id)); };
function seleziona(id, aggiungi = false) {
  if (!aggiungi) { stato.sel = id; stato.multi = new Set(id ? [id] : []); return; }
  if (!id) return;
  const s = selezione();
  if (s.has(id)) { s.delete(id); stato.sel = s.size ? [...s].at(-1) : null; } else { s.add(id); stato.sel = id; }
  stato.multi = s;
}
const ingombroMondo = p => { const v = verticiMondo(p); return v ? mod.ingombro(p, v) : mod.ingombro(p); };

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
  vista.aggiorna(stato.progetto, {
    selezione: selezione(), primario: stato.sel, viti: u.viti, mostraViti: stato.mostraViti, vitiErrate: u.errate,
    esploso: stato.esploso, gizmo: stato.modo ? null : stato.gizmo, misura: stato.misura, segno: stato.modo === 'accosta' || stato.modo === 'adatta' ? stato.accostaDa : null,
    maniglie: !stato.modo && stato.gizmo !== 'rotate' && selezione().size === 1,
  });
  disegnaAccostato();
  document.querySelector('[data-vista="esploso"]')?.classList.toggle('on', stato.esploso);
  disegnaBarraSel();
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
  if (stato.modo === 'misura') { stato.misura = null; stato.modo = null; $('#toast').hidden = true; aggiornaAttrezzi(); return aggiorna(); }
  const segno = stato.accostaDa;
  stato.modo = null;
  stato.accostaDa = null;
  $('#toast').hidden = true;
  aggiornaAttrezzi();
  if (segno) aggiorna();
}

function comando(cmd) {
  const p = pezzoSel(), pr = stato.progetto;
  if (cmd === 'pannello' || cmd === 'listello') {
    esciModo();
    const vicino = p || pr.pezzi.reduce((a, b) => (!a || mod.ingombro(b).max.x > mod.ingombro(a).max.x ? b : a), null);
    modifica(() => seleziona(mod.nuovoPezzo(pr, cmd, vicino).id));
    vista.vista(vista.nomeVista);
    avvisa(t('Aggiunto: trascinalo al suo posto (si aggancia agli altri pezzi). Per le misure trascina i quadratini blu, oppure tocca una misura e scrivila.'));
  } else if (cmd === 'disegno') {
    // Nuovo pannello disegnato in 2D: si crea solo se il disegno viene usato.
    esciModo();
    const vicino = p || pr.pezzi.reduce((a, b) => (!a || mod.ingombro(b).max.x > mod.ingombro(a).max.x ? b : a), null);
    const prova = mod.nuovoProgetto(), bozza = mod.nuovoPezzo(prova, 'pannello');
    bozza.nome = t('Pannello disegnato'); bozza.L = 600; bozza.W = 400;
    apriDisegno2D(bozza, mod.dimensioni(bozza).T, n => {
      modifica(() => {
        const nuovo = mod.nuovoPezzo(pr, 'pannello', vicino);
        Object.assign(nuovo, { nome: `${t('Pannello disegnato')} ${nuovo.n}`, forma: 'disegno', disegno: { forme: n.forme }, L: n.L, W: n.W });
        seleziona(nuovo.id);
      });
      vista.vista(vista.nomeVista);
      avvisa(t('Pannello disegnato: {misure}. Ora mettilo al suo posto con Accosta o trascinandolo.', { misure: `${mod.fmtU(n.L)} × ${mod.fmtU(n.W, true)}` }));
    });
  } else if (cmd === 'modelli') {
    esciModo();
    apriModelli();
  } else if (cmd === 'accosta' || cmd === 'adatta' || cmd === 'dividi' || cmd === 'cassetto') {
    if (!p) return;
    if (stato.modo === cmd) return esciModo();
    stato.modo = cmd;
    aggiornaAttrezzi();
    stato.accostaDa = null;
    stato.accostato = null;
    avvisa(t(cmd === 'accosta'
      ? "Tocca la faccia di «{nome}» da appoggiare, poi la faccia dell'altro pezzo. (Se tocchi subito l'altro pezzo, «{nome}» ci si appoggia senza girarsi.) Esc per annullare."
      : cmd === 'cassetto' ? "Tocca l'altro fianco del vano: i cassetti vanno tra «{nome}» e quello."
      : cmd === 'dividi' ? 'Tocca il pezzo opposto a «{nome}» (per esempio il piano, o l\'altro fianco): ti chiedo quanti pezzi mettere in mezzo.'
      : "Tocca la testa o il bordo di «{nome}» da allungare, poi la faccia dell'altro pezzo dove deve arrivare: lo allungo o accorcio e lo taglio con l'angolo giusto. (Se tocchi subito l'altro pezzo, scelgo io.)", { nome: p.nome }), false, 0);
  } else if (cmd === 'duplica') {
    const sel = pezziSel();
    if (sel.length > 1) {
      const b = sel.map(ingombroMondo).reduce((a, x) => ({ min: a.min.clone().min(x.min), max: a.max.clone().max(x.max) }));
      const dx = Math.round(b.max.x - b.min.x + 50);
      modifica(() => {
        const copie = sel.map(x => { const c = mod.duplica(pr, x); c.pos = [x.pos[0] + dx, x.pos[1], x.pos[2]]; return c; });
        stato.multi = new Set(copie.map(c => c.id)); stato.sel = copie[0].id;
      });
      avvisa(t('Duplicati {n} pezzi, {d} più a destra.', { n: sel.length, d: mod.fmtU(dx, true) }));
    } else {
      modifica(() => seleziona(mod.duplica(pr, p).id));
      avvisa(t('Duplicato. I tagli sono rimasti, ma non sono più legati al pezzo di prima.'));
    }
  } else if (cmd === 'elimina') {
    const sel = selezione();
    modifica(() => { pr.pezzi = pr.pezzi.filter(x => !sel.has(x.id)); seleziona(null); });
    avvisa(sel.size > 1 ? t('Eliminati {n} pezzi. Puoi sempre annullare.', { n: sel.size }) : t('Eliminato «{nome}». Puoi sempre annullare.', { nome: p.nome }));
  } else if (cmd === 'specchia') {
    const sel = pezziSel();
    const asse = Math.max(...sel.map(x => ingombroMondo(x).max.x));
    modifica(() => { const c = mod.copiaSpecchiata(pr, sel, asse); stato.multi = new Set(c.map(x => x.id)); stato.sel = c[0].id; });
    avvisa(sel.length === 1 ? t('Copia specchiata a destra di «{nome}»: lati delle cerniere e tagli sono girati.', { nome: p.nome }) : t('Copia specchiata a destra di {n} pezzi: lati delle cerniere e tagli sono girati.', { n: sel.length }));
  } else if (cmd === 'sposta' || cmd === 'ruota') {
    stato.gizmo = stato.gizmo === (cmd === 'sposta' ? 'translate' : 'rotate') ? null : (cmd === 'sposta' ? 'translate' : 'rotate');
    aggiorna();
  } else if (cmd === 'multipla') {
    stato.aggiungiSel = !stato.aggiungiSel;
    disegnaBarraSel();
    avvisa(stato.aggiungiSel ? t('Selezione multipla: ogni pezzo che tocchi si aggiunge o si toglie. (Sul PC: Maiusc + clic.)') : t('Selezione singola.'));
  } else if (cmd === 'misura') {
    if (stato.modo === 'misura') { stato.misura = null; esciModo(); return aggiorna(); }
    stato.modo = 'misura'; stato.misura = null;
    aggiornaAttrezzi(); aggiorna();
    avvisa(t('Misura: tocca il primo punto e poi il secondo. Vicino a uno spigolo il punto si aggancia allo spigolo. Esc per uscire.'), false, 0);
  }
}

function tocco(id, faccia, evento) {
  const p = pezzoSel();
  if (stato.modo === 'misura') {
    if (!id) return;
    const punto = faccia.spigolo || faccia.punto;
    stato.misura = !stato.misura || stato.misura.b ? { a: punto } : { a: stato.misura.a, b: punto };
    if (stato.misura.b) {
      const d = stato.misura.a.distanceTo(stato.misura.b);
      avvisa(t('Distanza {d}. Tocca di nuovo per una nuova misura, Esc per uscire.', { d: mod.fmtU(d, true) }), false, 0);
    }
    return aggiorna();
  }
  if (stato.modo === 'accosta') return toccoAccosta(id, faccia);
  if (stato.modo === 'adatta' && p && id === p.id) {
    const asse = mod.assePerFaccia(p, faccia.normale);
    if (!asse) return avvisa(t('Questa è la faccia grande: tocca la testa o il bordo da allungare.'), true, 5000);
    if (asse === 'y' && (p.tipo !== 'pannello' || p.forma !== 'rett')) return avvisa(t('Questo pezzo si allunga solo in lunghezza: tocca una delle teste.'), true, 5000);
    stato.accostaDa = { normale: faccia.normale, punto: faccia.punto, asse, lato: mod.latoPerFaccia(p, faccia.normale, asse) };
    aggiorna();
    return avvisa(t(asse === 'x' ? "Allungo la lunghezza di «{nome}». Ora tocca la faccia dell'altro pezzo dove deve arrivare." : "Allungo la larghezza di «{nome}». Ora tocca la faccia dell'altro pezzo dove deve arrivare.", { nome: p.nome }), false, 0);
  }
  if (stato.modo && p) {
    if (!id || id === p.id) return avvisa(t('Tocca un altro pezzo, oppure premi di nuovo il comando per uscire.'), true, 4000);
    const b = stato.progetto.pezzi.find(x => x.id === id);
    if (stato.modo === 'cassetto') {
      stato.modo = null;
      aggiornaAttrezzi();
      $('#toast').hidden = true;
      return apriCassetto(p, b);
    }
    if (stato.modo === 'dividi') {
      stato.modo = null;
      aggiornaAttrezzi();
      $('#toast').hidden = true;
      return apriDividi(p, b);
    }
    {
      const prova = structuredClone(p);
      const r = mod.adatta(prova, b, { faccia, asse: stato.accostaDa?.asse, lato: stato.accostaDa?.lato });
      stato.accostaDa = null;
      if (r.ok && !geometriaPezzo(prova)) { r.ok = false; r.msg = t('Il taglio toglierebbe tutto il pezzo: controlla da che parte sta.'); }
      if (!r.ok) { avvisa(r.msg, true); } else {
        modifica(() => Object.assign(p, prova));
        avvisa(t('«{a}» adattato a «{b}». {taglio}.', { a: p.nome, b: b.nome, taglio: r.msg }));
      }
    }
    stato.modo = null;
    aggiornaAttrezzi();
    return;
  }
  seleziona(id, stato.aggiungiSel || evento?.shiftKey || evento?.ctrlKey || evento?.metaKey);
  aggiorna();
}

// ---------- Accosta ----------
// Primo tocco (facoltativo) su una faccia della selezione, secondo tocco sulla faccia dell'altro pezzo. Si muove
// tutta la selezione insieme; poi il pannello «Allinea» sistema la posizione sulla faccia e la distanza.
function toccoAccosta(id, faccia) {
  const p = pezzoSel(), sel = selezione();
  if (!p) return esciModo();
  if (!id) return avvisa(t('Tocca una faccia di un pezzo. Esc per annullare.'), true, 4000);
  if (sel.has(id)) {
    stato.accostaDa = { normale: faccia.normale, punto: faccia.punto };
    aggiorna();
    return avvisa(t("Faccia scelta (il segno blu). Ora tocca la faccia dell'altro pezzo dove appoggiarla."), false, 0);
  }
  const b = stato.progetto.pezzi.find(x => x.id === id), muovi = pezziSel();
  const { delta, ruotato } = mod.deltaAccosta(stato.accostaDa, faccia, muovi.flatMap(x => verticiMondo(x) || []));
  const n = faccia.normale.clone().normalize();
  stato.accostaDa = null;
  stato.modo = null;
  aggiornaAttrezzi();
  stato.accostato = { ids: muovi.map(x => x.id), b: b.id, n: n.toArray(), punto: faccia.punto.toArray() };
  modifica(() => {
    for (const x of muovi) mod.trasforma(x, delta);
    agganciaNelPiano(muovi, b, n);
  });
  avvisa((muovi.length > 1 ? t('{n} pezzi accostati a «{b}».', { n: muovi.length, b: b.nome }) : t('«{a}» accostato a «{b}».', { a: p.nome, b: b.nome }))
    + (ruotato ? ' ' + t('Girato di {g}°.', { g: f1(ruotato) }) : '') + ' ' + t('Allinea dal riquadro in alto a destra.'));
}

// Dopo l'accostamento: lungo gli assi che stanno sulla faccia, se un bordo (o il centro) è a meno di 20 mm da
// quello dell'altro pezzo, lo allinea esattamente.
function agganciaNelPiano(muovi, b, n) {
  const A = ingombroSel(muovi), B = ingombroMondo(b);
  const d = [0, 0, 0];
  ['x', 'y', 'z'].forEach((k, i) => {
    if (Math.abs(n.getComponent(i)) >= 0.7) return;
    const c = [B.min[k] - A.min[k], B.max[k] - A.max[k], (B.min[k] + B.max[k] - A.min[k] - A.max[k]) / 2].sort((u, v) => Math.abs(u) - Math.abs(v))[0];
    if (Math.abs(c) <= 20) d[i] = c;
  });
  if (d.some(v => v)) for (const x of muovi) mod.sposta(x, d);
}

const ingombroSel = pezzi => pezzi.map(ingombroMondo).reduce((a, x) => ({ min: a.min.clone().min(x.min), max: a.max.clone().max(x.max) }));
const LATI_ALLINEA = { x: [tr('A sinistra'), tr('Al centro'), tr('A destra')], y: [tr('In basso'), tr('Al centro'), tr('In alto')], z: [tr('Dietro'), tr('Al centro'), tr('Davanti')] }; // tradotti con t() quando si disegnano
const NOMI_ASSI = { x: tr('In larghezza'), y: tr('In altezza'), z: tr('In profondità') };
const NOMI_MARGINI = { x: [tr('Da sinistra'), tr('Da destra')], y: [tr('Dal basso'), tr("Dall'alto")], z: [tr('Da dietro'), tr('Dal davanti')] };

function datiAccostato() {
  const a = stato.accostato;
  if (!a) return null;
  const b = stato.progetto.pezzi.find(x => x.id === a.b), muovi = a.ids.map(id => stato.progetto.pezzi.find(x => x.id === id));
  const sel = selezione();
  if (!b || muovi.some(x => !x) || sel.size !== a.ids.length || a.ids.some(id => !sel.has(id))) return null;
  return { a, b, muovi, n: new Vector3(...a.n), punto: new Vector3(...a.punto) };
}

function disegnaAccostato() {
  const el = $('#pannello-accosta'), d = datiAccostato();
  if (!d) { stato.accostato = null; el.hidden = true; return; }
  if (el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  const A = ingombroSel(d.muovi), B = ingombroMondo(d.b), uguale = (u, v) => Math.abs(u - v) < 0.05;
  const righe = ['x', 'y', 'z'].filter((k, i) => Math.abs(d.a.n[i]) < 0.7).map(k => {
    const on = [uguale(A.min[k], B.min[k]), uguale(A.min[k] + A.max[k], B.min[k] + B.max[k]), uguale(A.max[k], B.max[k])];
    const campo = (lato, nome, v) => `<div class="field"><label>${t(nome)}</label><div class="input"><input data-margine="${k}:${lato}" inputmode="decimal" value="${esc(fU(v))}"><small>${U()}</small></div></div>`;
    return `<div class="riga"><span>${t(NOMI_ASSI[k])}</span><div class="seg">${['min', 'centro', 'max'].map((m, j) => `<button data-allinea="${k}:${m}" class="${on[j] ? 'on' : ''}">${t(LATI_ALLINEA[k][j])}</button>`).join('')}</div>
      <div class="row">${campo('min', NOMI_MARGINI[k][0], A.min[k] - B.min[k])}${campo('max', NOMI_MARGINI[k][1], B.max[k] - A.max[k])}</div></div>`;
  }).join('');
  const assi = ['x', 'y', 'z'].filter((k, i) => Math.abs(d.a.n[i]) < 0.7);
  const gap = mod.distanzaDaFaccia(d.muovi.flatMap(x => verticiMondo(x) || []), d.punto, d.n);
  el.innerHTML = `<h3>${t('Allinea a «{nome}»', { nome: esc(d.b.nome) })}</h3>${righe}
    <div class="field"><label>${t('Distanza dalla faccia (0 = appoggiato)')}</label><div class="input"><input data-distanza inputmode="decimal" value="${esc(fU(gap))}"><small>${U()}</small></div></div>
    <div class="azioni">${assi.length === 2 ? `<button class="btn" data-angoli title="${t('Copie con le stesse distanze dai bordi negli altri angoli')}">${t('Copia negli altri angoli')}</button>` : ''}<button class="btn primary" data-fatto>${t('Fatto')}</button></div>`;
  el.hidden = false;
}

// Copia la selezione negli altri angoli della faccia, con le stesse distanze dai bordi (es. le 4 gambe di un tavolo).
// Le copie sono uguali, non specchiate: per pezzi con tagli asimmetrici usa Specchia.
function copiaNegliAngoli(d) {
  const A = ingombroSel(d.muovi), B = ingombroMondo(d.b);
  const assi = ['x', 'y', 'z'].filter((k, i) => Math.abs(d.a.n[i]) < 0.7);
  // per ogni asse: spostamento che porta il pezzo dalla parte opposta, a pari distanza dal bordo
  const salti = assi.map(k => (B.min[k] + B.max[k]) - (A.min[k] + A.max[k]));
  if (salti.every(v => Math.abs(v) < 1)) return avvisa(t('Il pezzo è al centro della faccia: non ci sono altri angoli dove copiarlo.'), true);
  const combinazioni = [[1, 0], [0, 1], [1, 1]].filter(([u, v]) => Math.abs(u * salti[0]) + Math.abs(v * salti[1]) >= 1 && (u === 0 || Math.abs(salti[0]) >= 1) && (v === 0 || Math.abs(salti[1]) >= 1));
  const nuovi = [];
  modifica(() => {
    for (const [u, v] of combinazioni) {
      const s = [0, 0, 0];
      s['xyz'.indexOf(assi[0])] = u * salti[0];
      s['xyz'.indexOf(assi[1])] = v * salti[1];
      for (const x of d.muovi) {
        const c = mod.duplica(stato.progetto, x);
        c.pos = [...x.pos];
        mod.sposta(c, s);
        nuovi.push(c);
      }
    }
  });
  avvisa(tn(nuovi.length, 'Aggiunta 1 copia negli altri angoli di «{b}», alla stessa distanza dai bordi.', 'Aggiunte {n} copie negli altri angoli di «{b}», alla stessa distanza dai bordi.', { b: d.b.nome }));
}

function eventiAccostato() {
  const el = $('#pannello-accosta');
  el.addEventListener('click', e => {
    const b = e.target.closest('button'), d = datiAccostato();
    if (!b || !d) return;
    if (b.hasAttribute('data-fatto')) { stato.accostato = null; return disegnaAccostato(); }
    if (b.hasAttribute('data-angoli')) return copiaNegliAngoli(d);
    const [k, m] = b.dataset.allinea.split(':'), A = ingombroSel(d.muovi), B = ingombroMondo(d.b);
    const v = m === 'min' ? B.min[k] - A.min[k] : m === 'max' ? B.max[k] - A.max[k] : (B.min[k] + B.max[k] - A.min[k] - A.max[k]) / 2;
    if (Math.abs(v) < 0.001) return;
    const s = [0, 0, 0]; s['xyz'.indexOf(k)] = v;
    modifica(() => d.muovi.forEach(x => mod.sposta(x, s)));
  });
  el.addEventListener('change', e => {
    const d = datiAccostato();
    if (e.target.dataset.margine && d) {
      const v = mod.leggiMisura(e.target.value), [k, lato] = e.target.dataset.margine.split(':');
      if (v === null) return avvisa(t('Scrivi la distanza dal bordo, per esempio 80.'), true);
      const A = ingombroSel(d.muovi), B = ingombroMondo(d.b);
      const sp = lato === 'min' ? B.min[k] + v - A.min[k] : B.max[k] - v - A.max[k], s = [0, 0, 0];
      s['xyz'.indexOf(k)] = sp;
      e.target.blur();
      if (Math.abs(sp) > 0.001) modifica(() => d.muovi.forEach(x => mod.sposta(x, s))); else disegnaAccostato();
      return;
    }
    if (!e.target.hasAttribute('data-distanza') || !d) return;
    const v = mod.leggiMisura(e.target.value);
    if (v === null) return avvisa(t('Scrivi un numero, per esempio 0 o 3.'), true);
    const ora = mod.distanzaDaFaccia(d.muovi.flatMap(x => verticiMondo(x) || []), d.punto, d.n), s = d.n.clone().multiplyScalar(v - ora);
    e.target.blur();
    if (Math.abs(v - ora) > 0.001) modifica(() => d.muovi.forEach(x => mod.sposta(x, s.toArray())));
    else disegnaAccostato();
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
}

// Fine di uno spostamento: applica la trasformazione a tutti i pezzi selezionati. Col gizmo poi la calamita (nel
// trascinamento libero agisce già dal vivo). Se alla fine la selezione appoggia su un altro pezzo, compare il
// riquadro «Allinea» per scrivere le distanze dai bordi.
function trasformato(delta, { libero = false } = {}) {
  const sel = pezziSel();
  if (!sel.length) return aggiorna();
  let spinta = [0, 0, 0];
  modifica(() => {
    for (const p of sel) mod.trasforma(p, delta);
    if (stato.gizmo === 'translate' && !libero) spinta = mod.calamita(stato.progetto, new Set(sel.map(p => p.id)), ingombroMondo);
    if (stato.gizmo === 'translate') stato.accostato = contatto(sel);
  });
  if (spinta.some(v => v)) avvisa(t('Agganciato al pezzo vicino ({spinta}).', { spinta: spinta.map((v, i) => (v ? `${'XYZ'[i]} ${v > 0 ? '+' : ''}${mod.fmtU(v)}` : '')).filter(Boolean).join(', ') + ' ' + U() }), false, 3000);
}

// Il pezzo su cui appoggia la selezione (faccia contro faccia, con un po' di sovrapposizione), per il riquadro «Allinea».
function contatto(sel) {
  const A = ingombroSel(sel), ids = new Set(sel.map(p => p.id));
  let migliore = null;
  for (const b of stato.progetto.pezzi) {
    if (ids.has(b.id)) continue;
    const B = ingombroMondo(b);
    ['x', 'y', 'z'].forEach((k, i) => {
      const altri = ['x', 'y', 'z'].filter(j => j !== k), area = altri.reduce((a, j) => a * Math.max(0, Math.min(A.max[j], B.max[j]) - Math.max(A.min[j], B.min[j])), 1);
      if (area < 1) return;
      for (const [gap, segno] of [[A.min[k] - B.max[k], 1], [B.min[k] - A.max[k], -1]]) {
        if (Math.abs(gap) > 0.5 || (migliore && migliore.area >= area)) continue;
        const n = [0, 0, 0]; n[i] = segno;
        const punto = B.min.clone().add(B.max).multiplyScalar(0.5); punto[k] = segno > 0 ? B.max[k] : B.min[k];
        migliore = { area, v: { ids: [...ids], b: b.id, n, punto: punto.toArray() } };
      }
    });
  }
  return migliore?.v || null;
}

// Quota scritta sul pezzo nel 3D. Lunghezza e larghezza sono quelle finite (dopo i tagli): il pezzo cresce o cala
// della differenza, e i tagli della testa che si muove la seguono. Così un pezzo adattato si porta alla misura voluta.
function quotaScritta(campo, valore, asse) {
  const p = pezzoSel();
  if (!p || !((campo === 'L' || campo === 'W') && (p.forma || 'rett') === 'rett')) { applicaCampo(campo, valore); return aggiorna(); }
  const v = mod.leggiMisura(valore), g = geometriaPezzo(p), i = asse === 'y' ? 1 : 0;
  if (v === null || v <= 0 || !g) { avvisa(t('La misura deve essere maggiore di zero.'), true); return aggiorna(); }
  const finita = g.max[i] - g.min[i], diff = v - finita;
  if (Math.abs(diff) < 0.05) return aggiorna();
  // si muove la testa con un taglio (se c'è solo all'inizio, quella), altrimenti la testa B / il bordo alto
  const lato = p.tagli.some(x => x.n[i] < -1e-6) || !p.tagli.some(x => x.n[i] > 1e-6) ? 'max' : 'min';
  const prova = structuredClone(p);
  mod.ridimensiona(prova, asse === 'y' ? 'y' : 'x', lato, p[campo] + diff);
  const g2 = geometriaPezzo(prova);
  if (!g2) { avvisa(t('Il taglio toglierebbe tutto il pezzo: controlla da che parte sta.'), true); return aggiorna(); }
  modifica(() => Object.assign(p, prova));
  const ora = g2.max[i] - g2.min[i];
  if (Math.abs(ora - v) > 0.5) avvisa(t('Misura finita {ora}: i tagli del pezzo non permettono di arrivare a {voluta}. Controllali nella sezione Tagli.', { ora: mod.fmtU(ora, true), voluta: mod.fmtU(v, true) }), true);
}

// Fine del trascinamento di una maniglia: nuove misure. Se la testa si è fermata contro una faccia obliqua di un
// altro pezzo, Adatta la taglia con l'angolo giusto.
function ridimensionato(id, esiti) {
  const p = stato.progetto.pezzi.find(x => x.id === id);
  if (!p) return aggiorna();
  const prova = structuredClone(p);
  for (const x of esiti) mod.ridimensiona(prova, x.k, x.lato, x.valore);
  let msg = esiti.map(x => `${x.k === 'x' ? (p.forma === 'cerchio' ? t('Diametro') : t('Lunghezza')) : t('Larghezza')} ${mod.fmtU(x.valore, true)}`).join(', ');
  for (const x of esiti) {
    const b = x.aggancio?.vicino && stato.progetto.pezzi.find(q => q.id === x.aggancio.id);
    if (!b || p.forma === 'cerchio') continue;
    // faccia di b a squadra con l'asse? allora basta la misura, niente taglio
    const e = new Vector3(x.k === 'x' ? 1 : 0, x.k === 'y' ? 1 : 0, 0).applyMatrix4(new Matrix4().extractRotation(mod.matrice(prova)));
    const rb = new Matrix4().extractRotation(mod.matrice(b));
    const squadra = [0, 1, 2].some(i => Math.abs(new Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0).applyMatrix4(rb).dot(e)) > 0.9999);
    if (squadra) continue;
    const r = mod.adatta(prova, b, { asse: x.k, lato: x.lato });
    if (r.ok && geometriaPezzo(prova)) msg += ' · ' + t('adattato a «{b}». {taglio}.', { b: b.nome, taglio: r.msg });
  }
  modifica(() => Object.assign(p, prova));
  avvisa(msg, false, 3500);
}

function disegnaBarraSel() {
  const b = $('#barra-sel'), n = selezione().size;
  b.hidden = !n || !!stato.modo;
  if (b.hidden) return;
  b.querySelector('[data-cmd="sposta"]').classList.toggle('on', stato.gizmo === 'translate');
  b.querySelector('[data-cmd="ruota"]').classList.toggle('on', stato.gizmo === 'rotate');
  b.querySelector('[data-cmd="multipla"]').classList.toggle('on', stato.aggiungiSel);
  b.querySelector('.conta').textContent = n > 1 ? t('{n} pezzi', { n }) : '';
}

// ---------- Modelli ----------
let modelloScelto = MODELLI[0].id, valoriModello = valoriDefault(MODELLI[0]);
// Un materiale del modello: tendina più spessore (pannelli) o sezione (listelli), già scritti con i valori del catalogo.
function campoMateriale(par, v) {
  const m = materiale(v), T = valoriModello[par.k + 'T'] || m.T, W = valoriModello[par.k + 'W'] || m.W;
  const num = (k, nome, x) => `<div class="field"><label>${nome}</label><div class="input"><input data-par="${k}" inputmode="decimal" value="${esc(fU(x))}"><small>${U()}</small></div></div>`;
  return `<div class="mat-riga"><div class="field"><label>${t(par.nome)}</label><div class="input"><select data-par="${par.k}" data-mat-modello>${materialiPer(par.filtro).map(x => `<option value="${x.id}" ${x.id === v ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select><small>▾</small></div></div>
    ${m.tipo === 'listello' ? num(par.k + 'W', t('Larghezza'), W) + num(par.k + 'T', t('Spessore'), T) : num(par.k + 'T', t('Spessore'), T)}</div>`;
}
function campoParametro(par, v) {
  if (par.tipo === 'mat') return campoMateriale(par, v);
  if (par.tipo === 'scelta') return `<div class="field"><label>${t(par.nome)}</label><div class="input"><select data-par="${par.k}">${Object.entries(par.opzioni).map(([k, testo]) => `<option value="${k}" ${k === String(v) ? 'selected' : ''}>${t(testo)}</option>`).join('')}</select><small>▾</small></div></div>`;
  return `<div class="field"><label>${t(par.nome)}</label><div class="input"><input data-par="${par.k}" inputmode="decimal" value="${esc(par.tipo === 'mm' ? fU(v) : f1(v))}"><small>${par.tipo === 'mm' ? U() : ''}</small></div></div>`;
}
function apriModelli() {
  $('#lista-modelli').innerHTML = MODELLI.map(m => `<li><button data-modello="${m.id}" class="${m.id === modelloScelto ? 'on' : ''}"><b>${esc(t(m.nome))}</b><span>${esc(t(m.descr))}</span></button></li>`).join('');
  const m = modello(modelloScelto);
  $('#form-modello').innerHTML = `<h3 style="font-size:18px;color:var(--text);margin:0">${esc(t(m.nome))}</h3><p class="nota">${esc(t(m.descr))} ${t('Dopo puoi cambiare ogni pezzo come vuoi.')}</p>
    <div class="griglia">${m.parametri.filter(p => p.tipo !== 'mat').map(p => campoParametro(p, valoriModello[p.k] ?? p.def)).join('')}</div>
    <details class="materiali-modello"><summary>${t('Materiali e spessori')}</summary><p class="nota">${t('Lo spessore parte da quello del materiale: puoi scriverne un altro.')}</p>
      <div class="griglia">${m.parametri.filter(p => p.tipo === 'mat').map(p => campoParametro(p, valoriModello[p.k] ?? p.def)).join('')}</div></details>
    <div class="azioni"><button class="btn" data-crea="nuovo">${t('Crea in un nuovo progetto')}</button><button class="btn primary" data-crea="qui">${t('Aggiungi a questo progetto')}</button></div>`;
  if (!$('#dlg-modelli').open) $('#dlg-modelli').showModal();
}
function leggiModello() {
  const m = modello(modelloScelto), v = {};
  for (const p of m.parametri) {
    const el = document.querySelector(`#form-modello [data-par="${p.k}"]`);
    if (p.tipo === 'mm' || p.tipo === 'n') {
      const x = p.tipo === 'mm' ? mod.leggiMisura(el.value) : numero(el.value);
      if (x === null || x < p.min || x > p.max) throw new Error(p.tipo === 'mm' ? t('{nome}: scrivi una misura tra {min} e {max}.', { nome: t(p.nome), min: mod.fmtU(p.min), max: mod.fmtU(p.max, true) }) : t('{nome}: scrivi un valore tra {min} e {max}.', { nome: t(p.nome), min: f1(p.min), max: f1(p.max) }));
      v[p.k] = p.tipo === 'n' ? Math.round(x) : x;
    } else v[p.k] = el.value;
    if (p.tipo === 'mat') for (const k of [p.k + 'W', p.k + 'T']) {
      const c = document.querySelector(`#form-modello [data-par="${k}"]`);
      if (!c) continue;
      const x = mod.leggiMisura(c.value);
      if (x === null || x < 1 || x > 500) throw new Error(t('{nome}: scrivi uno spessore tra {min} e {max}.', { nome: t(p.nome), min: mod.fmtU(1), max: mod.fmtU(500, true) }));
      v[k] = x;
    }
  }
  return v;
}
function creaModello(dove) {
  let v;
  try { v = leggiModello(); } catch (err) { return avvisa(err.message, true); }
  valoriModello = v;
  const m = modello(modelloScelto);
  const costruisci = pr => {
    const destra = pr.pezzi.length ? Math.max(...pr.pezzi.map(x => ingombroMondo(x).max.x)) + 200 : 0;
    const prima = pr.pezzi.length;
    m.crea(pr, v, Math.round(destra));
    return pr.pezzi.slice(prima);
  };
  try {
    if (dove === 'nuovo') {
      const pr = mod.nuovoProgetto(t(m.nome));
      const nuovi = costruisci(pr);
      $('#dlg-modelli').close();
      crea(pr);
      avvisa(t('Creato «{nome}» con {n} pezzi. Viti, distinta e tagli sono già pronti.', { nome: t(m.nome), n: nuovi.length }));
    } else {
      const prova = structuredClone(stato.progetto);
      costruisci(prova);
      modifica(() => { const nuovi = costruisci(stato.progetto); stato.multi = new Set(nuovi.map(x => x.id)); stato.sel = nuovi[0]?.id || null; });
      $('#dlg-modelli').close();
      vista.vista(vista.nomeVista);
      avvisa(t('Aggiunto «{nome}» a destra. È tutto selezionato: trascinalo dove vuoi.', { nome: t(m.nome) }));
    }
  } catch (err) { avvisa(t('Non riesco a creare il modello: {errore}', { errore: err.message }), true, 8000); }
}

// ---------- Cassetti ----------
let cassettoTra = null;
function vanoTra(a, b) {
  const va = verticiMondo(a), vb = verticiMondo(b), s = mod.spazioTra(a, b, va, vb, 1);
  if (!s.ok) return { ok: false, msg: s.msg };
  if (Math.abs(s.asse.x) < 0.99) return { ok: false, msg: t('Per ora i cassetti vanno tra due fianchi affiancati in larghezza (sinistra e destra).') };

  const A = mod.ingombro(a, va), B = mod.ingombro(b, vb);
  const x0 = Math.min(A.max.x, B.max.x), x1 = Math.max(A.min.x, B.min.x);
  const y0 = Math.max(A.min.y, B.min.y), y1 = Math.min(A.max.y, B.max.y), z0 = Math.max(A.min.z, B.min.z), z1 = Math.min(A.max.z, B.max.z);
  // spazi già occupati da pezzi orizzontali tra i due fianchi
  const occupati = stato.progetto.pezzi.filter(p => p !== a && p !== b).map(ingombroMondo)
    .filter(q => q.min.x < x1 - 1 && q.max.x > x0 + 1 && q.min.z < z1 - 1 && q.max.z > z0 + 1 && q.max.y > y0 && q.min.y < y1)
    .map(q => [q.min.y, q.max.y]).sort((p, q) => p[0] - q[0]);
  let liberi = [], y = y0;
  for (const [lo, hi] of occupati) { if (lo > y + 1) liberi.push([y, lo]); y = Math.max(y, hi); }
  if (y1 > y + 1) liberi.push([y, y1]);
  const vano = liberi.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0] || [y0, y1];
  return { ok: true, x0, x1, y0: vano[0], y1: vano[1], zFronte: z1, profondita: z1 - z0, spessore: Math.min(A.max.x - A.min.x, B.max.x - B.min.x) };
}
function apriCassetto(a, b) {
  const v = vanoTra(a, b);
  if (!v.ok) return avvisa(v.msg, true, 8000);
  cassettoTra = v;
  const lg = lunghezzaGuida(v.profondita);
  $('#form-cassetto').innerHTML = `<p>${t('Spazio tra i fianchi: <b>{largo}</b>, profondità {prof}', { largo: mod.fmtU(v.x1 - v.x0, true), prof: mod.fmtU(v.profondita, true) })}${lg ? ' → ' + t('guide da <b>{l} mm</b>', { l: lg }) : ''}.</p>
    <div class="row"><div class="field"><label>${t('Dal basso (Y)')}</label><div class="input"><input data-cas="y0" inputmode="decimal" value="${fU(v.y0)}"><small>${U()}</small></div></div>
    <div class="field"><label>${t('Fino a (Y)')}</label><div class="input"><input data-cas="y1" inputmode="decimal" value="${fU(v.y1)}"><small>${U()}</small></div></div></div>
    <div class="row"><div class="field"><label>${t('Quanti cassetti')}</label><div class="input"><input data-cas="n" inputmode="numeric" value="${Math.max(1, Math.min(6, Math.floor((v.y1 - v.y0) / 160)))}"></div></div>
    <div class="field"><label>${t('Frontali')}</label><div class="input"><select data-cas="frontale"><option value="sovrapposto">${t('Sovrapposti ai fianchi')}</option><option value="filo">${t('A filo, dentro il vano')}</option></select><small>▾</small></div></div></div>
    <div class="row"><div class="field"><label>${t('Cassone')}</label><div class="input"><select data-cas="matCassone">${materialiPer('pannello').map(m => `<option value="${m.id}" ${m.id === 'mb12' ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select><small>▾</small></div></div>
    <div class="field"><label>${t('Frontali')}</label><div class="input"><select data-cas="matFrontale">${materialiPer('pannello').map(m => `<option value="${m.id}" ${m.id === 'mb18' ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select><small>▾</small></div></div></div>
    <p class="nota">${t('Gioco per le guide {g} mm per lato, fuga tra i frontali 3 mm. Ogni cassetto è una parte mobile: niente viti verso il mobile.', { g: f1(12.5) })}</p>
    <div class="azioni"><button class="btn" data-chiudi-cassetto>${t('Annulla')}</button><button class="btn primary" id="crea-cassetti">${t('Crea i cassetti')}</button></div>`;
  $('#dlg-cassetto').showModal();
}
function creaCassettiOra() {
  const q = k => document.querySelector(`#form-cassetto [data-cas="${k}"]`).value;
  const v = { ...cassettoTra, y0: mod.leggiMisura(q('y0')), y1: mod.leggiMisura(q('y1')), n: numero(q('n')), frontale: q('frontale'), matCassone: q('matCassone'), matFrontale: q('matFrontale'), spessoreFianchi: cassettoTra.spessore };
  if ([v.y0, v.y1, v.n].some(x => x === null) || v.y1 <= v.y0) return avvisa(t('Controlla le misure: «Fino a» deve essere più in alto di «Dal basso».'), true);
  const prova = structuredClone(stato.progetto), r = creaCassetti(prova, v);
  if (!r.ok) return avvisa(r.msg, true, 8000);
  modifica(() => { const x = creaCassetti(stato.progetto, v); stato.multi = new Set(x.nuovi.map(p => p.id)); stato.sel = x.nuovi.at(-1).id; });
  $('#dlg-cassetto').close();
  avvisa(tn(v.n, 'Creato il cassetto con guide da {g} mm.', 'Creati {n} cassetti con guide da {g} mm.', { g: r.guida }));
}

// ---------- Dividi ----------
let dividiDa = null;
function apriDividi(a, b) {
  dividiDa = { a, b };
  $('#dividi-testo').innerHTML = t('Quanti pezzi come «{a}» vuoi mettere tra «{a}» e «{b}»? Saranno alla stessa distanza.', { a: esc(a.nome), b: esc(b.nome) });
  $('#dividi-n').value = '1';
  anteprimaDividi();
  $('#dlg-dividi').showModal();
}
function anteprimaDividi() {
  const n = Math.max(1, Math.min(50, Math.round(numero($('#dividi-n').value) || 1)));
  const s = mod.spazioTra(dividiDa.a, dividiDa.b, verticiMondo(dividiDa.a), verticiMondo(dividiDa.b), n);
  const e = $('#dividi-esito');
  e.className = s.ok ? 'ok' : 'avviso';
  e.textContent = s.ok ? tn(n, "Spazio libero {luce}: {n} pezzo da {s}, luce tra un pezzo e l'altro {passo}.", "Spazio libero {luce}: {n} pezzi da {s}, luce tra un pezzo e l'altro {passo}.", { luce: mod.fmtU(s.luce, true), s: mod.fmtU(s.spessore, true), passo: mod.fmtU(s.passo, true) }) : s.msg;
  $('#dividi-ok').disabled = !s.ok;
  return { n, s };
}

// ---------- pannello delle proprietà ----------
let chiavePannello = '';

const campoNum = (campo, etichetta, valore) =>
  `<div class="field"><label>${t(etichetta)}</label><div class="input"><input data-campo="${campo}" inputmode="decimal" value="${esc(fU(valore))}"><small>${U()}</small></div></div>`;

function disegnaProprieta() {
  const el = $('#proprieta'), p = pezzoSel(), sel = selezione();
  if (sel.size > 1) {
    const k = 'multi' + [...sel].join();
    if (k !== chiavePannello) { chiavePannello = k; el.innerHTML = htmlMulti(pezziSel()); }
    return;
  }
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
  if (campo === 'spessore' || campo === 'sezT') return fU(mod.dimensioni(p).T);
  if (campo === 'sezW') return fU(mod.dimensioni(p).W);
  const m = campo.match(/^(pos|rot)(\d)$/);
  if (m) return m[1] === 'pos' ? fU(p.pos[+m[2]]) : f1(p.rot[+m[2]]);
  return fU(p[campo] ?? 0);
}

function aggiornaValori(el, p) {
  el.querySelectorAll('[data-campo]').forEach(i => { if (i !== document.activeElement) i.value = valoreCampo(p, i.dataset.campo); });
  const info = el.querySelector('[data-info]');
  if (info && p) info.innerHTML = htmlInfo(p);
  const ct = el.querySelector('[data-controlli]');
  if (ct && !p) ct.innerHTML = htmlControlli();
  const un = el.querySelector('[data-unioni]');
  if (un && p) un.innerHTML = htmlUnioni(p);
  el.querySelectorAll('[data-orient]').forEach(b => {
    const r = mod.rotazioneDa(b.dataset.orient);
    b.classList.toggle('on', r.every((v, i) => Math.abs(v - p.rot[i]) < 0.01));
  });
}

function htmlInfo(p) {
  const g = geometriaPezzo(p), { T } = mod.dimensioni(p);
  if (!g) return `<div class="avviso">${t('I tagli hanno tolto tutto il pezzo. Togline uno o annulla.')}</div>`;
  const L = g.max[0] - g.min[0], W = g.max[1] - g.min[1];
  const prezzo = materialePezzo(p), cat = materiale(p.mat);
  const costo = p.tipo === 'listello' ? (L / 1000) * prezzo.prezzoM : (L * W / 1e6) * prezzo.prezzoM2;
  const fr = controlli(stato.progetto).frecce.find(x => x.p.id === p.id);
  const testoFreccia = fr ? `<div class="${fr.giudizio === 'troppo' ? 'avviso' : 'ok'}">${fr.giudizio === 'troppo' ? '⚠' : '✓'} ${t('Con {carico} kg/m si piega di {f} mm nel tempo ({giudizio}).', { carico: fr.carico, f: f1(fr.nelTempo), giudizio: t({ ottimo: tr('ottimo'), accettabile: tr('si nota appena'), troppo: tr('troppo') }[fr.giudizio]) })}</div>` : '';
  const suMisura = prezzo !== cat
    ? `<div class="chipline"><span>${p.tipo === 'listello' ? t('Sezione su misura (a catalogo {w} × {t})', { w: cat.W, t: cat.T }) : t('Spessore su misura (a catalogo {t} mm)', { t: cat.T })}</span><button class="link" data-azione="catalogo">${t('Torna a catalogo')}</button></div>` : '';
  const d = mod.dimensioni(p), piuCorto = p.tagli.length && (p.forma || 'rett') === 'rett' && (d.L - L > 0.5 || (p.tipo !== 'listello' && d.W - W > 0.5));
  const notaTagli = piuCorto ? `<p class="nota">${t('Più piccola dei campi qui sopra per via dei tagli. Per arrivare a una misura finita, tocca la misura sul pezzo nel 3D e scrivila: il taglio si sposta con la testa.')}</p>` : '';
  return `<div class="chipline"><span>${t('Misura finita')}</span><b>${fU(L)} × ${fU(W)} × ${fU(T)} ${U()}</b></div>${notaTagli}${suMisura}
    ${prezzi() ? `<div class="chipline"><span>${t('Costo del pezzo')}</span><b>${euro(costo)}</b></div>` : ''}${testoFreccia}`;
}

function htmlPezzo(p) {
  const mats = materialiPer(p.tipo).map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('');
  const rotondo = p.tipo === 'pannello' && p.forma === 'cerchio';
  const misure = p.tipo === 'listello'
    ? `${campoNum('L', 'Lunghezza', p.L)}<div class="row">${campoNum('sezW', 'Sezione: larghezza', mod.dimensioni(p).W)}${campoNum('sezT', 'Sezione: spessore', mod.dimensioni(p).T)}</div>`
    : rotondo ? campoNum('D', 'Diametro', p.D)
    : p.forma === 'disegno' ? `<div class="chipline"><span>${t('Ingombro del disegno')}</span><b>${fU(p.L)} × ${fU(p.W)} ${U()}</b></div><div class="azioni"><button class="btn" data-azione="disegno">${t('Modifica…')}</button><button class="btn" data-azione="dima">${t('Dima 1:1')}</button></div>`
    : p.forma === 'sagoma' ? `<div class="chipline"><span>${t('Ingombro della sagoma')}</span><b>${fU(p.L)} × ${fU(p.W)} ${U()}</b></div><div class="azioni"><button class="btn" data-azione="sagoma">${t('Modifica…')}</button><button class="btn" data-azione="dima">${t('Dima 1:1')}</button></div>`
    : `<div class="row">${campoNum('L', 'Lunghezza', p.L)}${campoNum('W', 'Larghezza', p.W)}</div>${campoNum('r', 'Raggio degli angoli (0 = spigolo vivo)', p.r || 0)}`;
  const forma = p.tipo === 'pannello'
    ? `<div class="field"><label>${t('Forma')}</label><div class="seg"><button data-forma="rett" class="${rotondo || p.forma === 'sagoma' || p.forma === 'disegno' ? '' : 'on'}">${t('Rettangolo')}</button><button data-forma="cerchio" class="${rotondo ? 'on' : ''}">${t('Rotondo')}</button><button data-forma="sagoma" class="${p.forma === 'sagoma' ? 'on' : ''}">${t('Sagoma')}</button><button data-forma="disegno" class="${p.forma === 'disegno' ? 'on' : ''}" title="${t('Disegno 2D con forme piene e vuote')}">${t('Disegno')}</button></div></div>` : '';
  const orient = Object.entries(mod.NOMI_ORIENTAMENTI).map(([k, v]) => `<button data-orient="${k}">${t(v)}</button>`).join('');
  const tagli = p.tagli.length
    ? p.tagli.map((tg, i) => {
      const da = stato.progetto.pezzi.find(x => x.id === tg.da);
      return `<div class="chipline"><span>${esc(mod.descriviTaglio(tg))}${da ? `<br><small class="nota">${t('contro «{nome}»', { nome: esc(da.nome) })}</small>` : ''}</span><button class="link" data-togli="${i}">${t('Togli')}</button></div>`;
    }).join('')
    : `<p class="nota">${t("Nessun taglio. Con <b>Adatta</b> lo tagli contro un altro pezzo con l'angolo giusto.")}</p>`;
  return `
    <div><div class="kicker">${t('Pezzo {n} · {tipo}', { n: p.n, tipo: t(p.tipo) })}</div><input class="titolo" data-campo="nome" aria-label="${t('Nome del pezzo')}"></div>
    ${forma}
    ${misure}
    ${p.tipo === 'pannello' ? campoNum('spessore', 'Spessore', mod.dimensioni(p).T) : ''}
    <div data-info class="group"></div>
    <div class="field"><label>${t('Materiale')}</label><div class="input"><select data-campo="mat">${mats}</select><small>▾</small></div></div>
    <div class="group"><h3>${t('Orientamento')}</h3><div class="seg">${orient}</div>
      <div class="field"><label>${t('Rotazione attorno agli assi X, Y, Z')}</label><div class="row3">
        <div class="input"><input data-campo="rot0" inputmode="decimal"><small>°</small></div>
        <div class="input"><input data-campo="rot1" inputmode="decimal"><small>°</small></div>
        <div class="input"><input data-campo="rot2" inputmode="decimal"><small>°</small></div></div></div>
      <div class="stepper"><button class="btn icon" data-inclina="-1" title="${t('Inclina indietro di 1°')}">−</button><div class="input"><span class="nota">${t('Inclina (asse X) di 1°')}</span></div><button class="btn icon" data-inclina="1" title="${t('Inclina avanti di 1°')}">+</button></div>
    </div>
    <div class="group"><h3>${t('Posizione')}</h3>
      <div class="row3">
        <div class="field"><label>${t('X destra')}</label><div class="input"><input data-campo="pos0" inputmode="decimal"><small>${U()}</small></div></div>
        <div class="field"><label>${t('Y altezza')}</label><div class="input"><input data-campo="pos1" inputmode="decimal"><small>${U()}</small></div></div>
        <div class="field"><label>${t('Z verso di te')}</label><div class="input"><input data-campo="pos2" inputmode="decimal"><small>${U()}</small></div></div>
      </div>
      <button class="btn" data-azione="terra">${t('Appoggia a terra')}</button>
    </div>
    <div class="group"><h3>${t('Tagli')}</h3>${tagli}</div>
    ${p.tipo === 'pannello' ? htmlBordi(p) : ''}
    ${p.tipo === 'pannello' ? htmlFerramenta(p) : ''}
    <div class="group" data-unioni></div>
    ${p.gruppo ? `<button class="btn" data-azione="gruppo">${t('Seleziona tutto «{nome}»', { nome: esc(nomeGruppo(p)) })}</button>` : ''}
    <div class="azioni"><button class="btn" data-azione="duplica">${t('Duplica')}</button><button class="btn danger" data-azione="elimina">${t('Elimina')}</button></div>`;
}

function htmlFerramenta(p) {
  const c = cerniere(p), m = maniglia(p);
  const seg = (attr, voci, attivo) => `<div class="seg">${Object.entries(voci).map(([k, v]) => `<button data-${attr}="${k}" class="${k === attivo ? 'on' : ''}">${t(v)}</button>`).join('')}</div>`;
  let h = `<div class="group"><h3>${t('Ferramenta')}</h3>`;
  if (c) {
    h += `<div class="field"><label>${t('Cerniere: su quale lato (visti di fronte)')}</label>${seg('cern-lato', LATI, c.lato)}</div>
      ${seg('cern-modello', MODELLI_CERNIERA, c.modello || 'sovrapposta')}
      <div class="stepper"><button class="btn icon" data-cern-n="-1">−</button><div class="input"><span>${t(c.numero ? '{n} cerniere' : "{n} cerniere (scelte dall'altezza)", { n: c.n })}</span></div><button class="btn icon" data-cern-n="1">+</button></div>
      ${c.avvisi.map(a => `<div class="avviso">${esc(a)}</div>`).join('')}
      <button class="link" data-togli-ferr="cerniere">${t('Togli le cerniere')}</button>`;
  } else h += `<button class="btn" data-aggiungi-ferr="cerniere">${t("+ Cerniere (diventa un'anta)")}</button>`;
  if (m) {
    const verticale = m.lato === 'A' || m.lato === 'B';
    const pos = verticale ? { inizio: tr('In basso'), centro: tr('Al centro'), fine: tr('In alto') } : { inizio: tr('A sinistra'), centro: tr('Al centro'), fine: tr('A destra') };
    h += `<div class="field"><label>${t('Maniglia: interasse')}</label><div class="input"><select data-man-interasse>${INTERASSI.map(i => `<option value="${i}" ${i === (m.interasse || 128) ? 'selected' : ''}>${i} mm</option>`).join('')}</select><small>▾</small></div></div>
      <div class="field"><label>${t(c ? 'Posizione della maniglia (sul lato opposto alle cerniere)' : 'Posizione della maniglia')}</label>${seg('man-pos', pos, m.posizione || 'fine')}</div>
      ${seg('man-dir', { parallela: tr('Parallela al bordo'), perpendicolare: tr('Perpendicolare') }, m.direzione || 'parallela')}
      <p class="nota">${t('2 fori Ø 5 passanti, viti {vite}.', { vite: esc(m.vite) })}</p>
      ${m.avvisi.map(a => `<div class="avviso">${esc(a)}</div>`).join('')}
      <button class="link" data-togli-ferr="maniglia">${t('Togli la maniglia')}</button>`;
  } else h += `<button class="btn" data-aggiungi-ferr="maniglia">${t('+ Maniglia')}</button>`;
  return h + '</div>';
}

function htmlBordi(p) {
  const m = materiale(p.mat), bo = mod.bordatura(p), rotondo = p.forma === 'cerchio';
  const lati = rotondo ? '' : `<div class="seg">${Object.keys(mod.LATI_BORDO).map(l => `<button data-bordo="${l}" class="${bo.lati.has(l) ? 'on' : ''}">${mod.nomeBordo(p, l)}</button>`).join('')}</div>
    <div class="chipline"><button class="link" data-bordi-tutti="si">${t('Tutti')}</button><button class="link" data-bordi-tutti="no">${t('Nessuno')}</button>
    <span class="input" style="height:40px;width:130px"><select data-bordo-spessore>${[0.4, 1, 2].map(x => `<option value="${x}" ${x === (bo.s || 1) ? 'selected' : ''}>${f1(x)} mm</option>`).join('')}</select><small>▾</small></span></div>
    ${bo.lati.size ? `<p class="nota">${t('Da tagliare: {misure} mm (misura finita meno il bordo).', { misure: `${f1((geometriaPezzo(p)?.max[0] - geometriaPezzo(p)?.min[0]) - bo.menoL)} × ${f1((geometriaPezzo(p)?.max[1] - geometriaPezzo(p)?.min[1]) - bo.menoW)}` })}</p>` : ''}`;
  const vena = m.venatura ? `<div class="field"><label>${t('Venatura')}</label><div class="seg">${[['L', tr('Lungo la lunghezza')], ['W', tr('Lungo la larghezza')], ['libera', tr('Non importa')]].map(([k, testo]) => `<button data-vena="${k}" class="${(p.venatura || 'L') === k ? 'on' : ''}">${t(testo)}</button>`).join('')}</div></div>` : '';
  return `<div class="group"><h3>${t('Bordi e venatura')}</h3>${rotondo ? `<p class="nota">${t('Bordo rotondo: si borda a mano dopo il taglio.')}</p>` : `<p class="nota">${t('Bordi da rivestire (tocca per scegliere):')}</p>${lati}`}${vena}</div>`;
}

function htmlUnioni(p) {
  const u = unioni(stato.progetto), miei = u.giunti.filter(g => g.a.id === p.id || g.b.id === p.id);
  const righe = miei.map(g => {
    const altro = g.a.id === p.id ? g.b : g.a;
    const puo = g.vite && g.passa;
    const scelta = puo ? `<select class="mini" data-fissaggio="${g.chiave}">${Object.entries(FISSAGGI).map(([k, testo]) => `<option value="${k}" ${k === (g.escluso ? 'nessuno' : g.fissaggio) ? 'selected' : ''}>${t(testo)}</option>`).join('')}</select>` : '';
    return `<div class="giunto"><div class="chipline"><span>${t('con «{nome}»', { nome: esc(altro.nome) })}</span>${scelta}</div>
      <div class="nota">${esc(descriviGiunto(g))}</div>${g.note.map(n => `<div class="nota avviso-mini">${esc(n)}</div>`).join('')}</div>`;
  }).join('');
  const avvisi = u.avvisi.filter(a => a.includes(`«${p.nome}»`)).map(a => `<div class="avviso">${esc(a)}</div>`).join('');
  return `<h3>${t('Unioni e viti')}</h3>${righe || `<p class="nota">${t('Non tocca altri pezzi. Usa Accosta per appoggiarlo: le viti arrivano da sole.')}</p>`}${avvisi}`;
}

function htmlControlli() {
  const c = controlli(stato.progetto);
  if (!stato.progetto.pezzi.length) return `<h3>${t('Controlli')}</h3><p class="nota">${t('Ancora nessun pezzo.')}</p>`;
  const frecce = c.frecce.map(f => `<div class="chipline"><span>${esc(f.p.nome)}</span><b class="${f.giudizio === 'troppo' ? 'avviso-mini' : ''}">${f1(f.nelTempo)} mm</b></div>`).join('');
  return `<h3>${t('Controlli')}</h3>
    <div class="chipline"><span>${t('Peso stimato')}</span><b>${f1(c.peso)} kg</b></div>
    ${c.avvisi.map(a => `<div class="avviso">⚠ ${esc(a)}</div>`).join('')}${c.note.map(n => `<div class="ok">✓ ${esc(n)}</div>`).join('')}
    ${c.frecce.length ? `<div class="field"><label>${t('Carico sui ripiani (libri ≈ 30)')}</label><div class="input"><input data-carico inputmode="decimal" value="${f1(stato.progetto.caricoRipiani ?? CARICO_RIPIANI)}"><small>kg/m</small></div></div>
      <p class="nota">${t('Quanto si piegano i ripiani nel tempo:')}</p>${frecce}` : ''}`;

}

function htmlMulti(pezzi) {
  const b = pezzi.map(ingombroMondo).reduce((a, x) => ({ min: a.min.clone().min(x.min), max: a.max.clone().max(x.max) }));
  return `<div><div class="kicker">${t('Selezione')}</div><h2 class="titolo-fisso">${t('{n} pezzi', { n: pezzi.length })}</h2></div>
    <p class="nota">${pezzi.map(p => esc(p.nome)).join(', ')}</p>
    <div class="chipline"><span>${t('Ingombro')}</span><b>${fU(b.max.x - b.min.x)} × ${fU(b.max.y - b.min.y)} × ${fU(b.max.z - b.min.z)} ${U()}</b></div>
    <div class="group"><h3>${t('Sposta tutti di')}</h3>
      <div class="row3">
        <div class="field"><label>${t('X destra')}</label><div class="input"><input data-sposta="0" inputmode="decimal" value="0"><small>${U()}</small></div></div>
        <div class="field"><label>${t('Y altezza')}</label><div class="input"><input data-sposta="1" inputmode="decimal" value="0"><small>${U()}</small></div></div>
        <div class="field"><label>${t('Z verso di te')}</label><div class="input"><input data-sposta="2" inputmode="decimal" value="0"><small>${U()}</small></div></div>
      </div>
      <p class="nota">${t('Oppure trascina i pezzi nel 3D (passo 5 mm, poi si agganciano ai pezzi vicini); la freccia sopra li alza.')}</p></div>
    <div class="group"><h3>${t('Materiale per tutti')}</h3><div class="input"><select data-mat-multi><option value="">${t('— scegli —')}</option>${['pannello', 'listello'].filter(tp => pezzi.some(p => p.tipo === tp)).map(tp => materialiPer(tp).map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('')).join('')}</select><small>▾</small></div></div>
    <div class="azioni"><button class="btn" data-azione="duplica">${t('Duplica')}</button><button class="btn" data-azione="specchia">${t('Copia specchiata')}</button></div>
    <div class="azioni"><button class="btn" data-azione="raggruppa">${t('Raggruppa')}</button>${pezzi.some(p => p.gruppo) ? `<button class="btn" data-azione="separa">${t('Separa il gruppo')}</button>` : ''}</div>
    <div class="azioni"><button class="btn danger" data-azione="elimina">${t('Elimina tutti')}</button></div>`;
}

function htmlProgetto() {
  const r = riepilogo(stato.progetto);
  const mats = r.materiali.map(m => `<div class="chipline"><span>${esc(m.nome)}</span><b>${f1(m.qta)} ${m.tipo === 'listello' ? 'm' : 'm²'}</b></div>`).join('');
  return `
    <div><div class="kicker">${t('Progetto')}</div><input class="titolo" data-campo="nomeProgetto" aria-label="${t('Nome del progetto')}"></div>
    <p class="nota">${t('Tocca un pezzo per modificarlo, oppure aggiungi un <b>Pannello</b> o un <b>Listello</b> con gli attrezzi a sinistra.')}</p>
    <div class="group"><h3>${t('Come si costruisce')}</h3>
      <p class="nota">${t('<b>Trascina</b> un pezzo per spostarlo: si allinea da solo ai pezzi vicini. Trascina i <b>quadratini blu</b> per cambiarne le misure (si fermano contro gli altri pezzi), oppure tocca una misura sul pezzo e scrivila.')}</p>
      <p class="nota">${t("<b>Accosta</b>: scegli un pezzo, tocca la sua faccia da appoggiare e poi il punto sull'altro pezzo dove metterlo. Poi scrivi la distanza dai bordi.")}</p>
      <p class="nota">${t("<b>Adatta</b>: scegli un pezzo, tocca la sua testa o il bordo da allungare, poi la faccia dell'altro pezzo dove deve finire: si allunga o accorcia e prende il taglio con l'angolo giusto, anche se è ruotato.")}</p></div>
    <div class="group"><h3>${t('Materiali')}</h3>${mats || `<p class="nota">${t('Ancora nessun pezzo.')}</p>`}</div>
    <div class="group"><h3>${t('Fissaggio predefinito')}</h3><div class="input"><select data-fissaggio-def>${Object.entries(FISSAGGI).filter(([k]) => k !== 'nessuno').map(([k, testo]) => `<option value="${k}" ${k === (stato.progetto.fissaggioPredefinito || 'viti') ? 'selected' : ''}>${t(testo)}</option>`).join('')}</select><small>▾</small></div>
      <p class="nota">${t('Vale per tutte le unioni; ogni unione si può cambiare dal pannello del pezzo.')}</p></div>
    <div class="group" data-controlli></div>`;
}

function applicaCampo(campo, valore) {
  const p = pezzoSel(), pr = stato.progetto;
  if (campo === 'nomeProgetto') { const v = valore.trim(); if (v && v !== pr.nome) modifica(() => { pr.nome = v; }); return; }
  if (!p) return;
  if (campo === 'nome') { const v = valore.trim(); if (v && v !== p.nome) modifica(() => { p.nome = v; }); return; }
  if (campo === 'mat') return modifica(() => { p.mat = valore; delete p.spessore; delete p.sezione; });
  const v = LUNGHEZZE.has(campo) ? mod.leggiMisura(valore) : numero(valore);
  if (v === null) { avvisa(t('Scrivi un numero, per esempio {esempio} (in {u}; puoi anche scrivere «60 cm» o «600 mm»).', { esempio: U() === 'cm' ? `60 ${t('o')} ${mod.fmt(1.8, 1)}` : `600 ${t('o')} ${mod.fmt(16.5, 1)}`, u: U() }), true); return disegnaProprieta(); }
  const m = campo.match(/^(pos|rot)(\d)$/);
  if (m) { if (p[m[1]][+m[2]] !== v) modifica(() => { p[m[1]][+m[2]] = v; }); return; }
  if (campo === 'r' ? v < 0 : v <= 0) { avvisa(t('La misura deve essere maggiore di zero.'), true); return disegnaProprieta(); }
  if (campo === 'spessore' || campo === 'sezW' || campo === 'sezT') {
    if (v > 500) { avvisa(t('Spessore troppo grande: al massimo {max}.', { max: mod.fmtU(500, true) }), true); return disegnaProprieta(); }
    const cat = materiale(p.mat), d = mod.dimensioni(p);
    if (campo === 'spessore') { if (v !== d.T) modifica(() => { if (v === cat.T) delete p.spessore; else p.spessore = v; }); return; }
    const sez = campo === 'sezW' ? [v, d.T] : [d.W, v];
    if (sez[0] !== d.W || sez[1] !== d.T) modifica(() => { if (sez[0] === cat.W && sez[1] === cat.T) delete p.sezione; else p.sezione = sez; });
    return;
  }
  if (p[campo] === v) return;
  // Lunghezza e larghezza dei pezzi rettangolari: cresce la testa B (o il bordo alto) e i suoi tagli la seguono.
  if ((campo === 'L' || campo === 'W') && (p.forma || 'rett') === 'rett') return modifica(() => mod.ridimensiona(p, campo === 'L' ? 'x' : 'y', 'max', v));
  modifica(() => { p[campo] = v; if (campo === 'D') { p.L = v; p.W = v; } });
  if (p.tagli.length && ['L', 'W', 'D'].includes(campo)) avvisa(t('Il pezzo ha dei tagli: restano dove sono. Se serve, toglili e rifai Adatta.'));
}

const nomeGruppo = p => p.nomeGruppo || (p.mobile ? p.nome.split(' · ')[0] : t('gruppo'));

function apriSagoma(p) {
  const g = geometriaPezzo(p), dim = { L: g ? g.max[0] - g.min[0] : p.L, W: g ? g.max[1] - g.min[1] : p.W };
  apriEditorSagoma(p, dim, n => {
    modifica(() => { p.forma = 'sagoma'; p.sagoma = n.punti; p.L = n.L; p.W = n.W; });
    avvisa(t('Sagoma salvata: {misure}. Dalla distinta (scheda Disegni) o dal pulsante «Dima 1:1» stampi la dima in scala reale.', { misure: `${mod.fmtU(n.L)} × ${mod.fmtU(n.W, true)}` }));
  });
}

function apriDisegno(p) {
  apriDisegno2D(p, mod.dimensioni(p).T, n => {
    modifica(() => { p.forma = 'disegno'; p.disegno = { forme: n.forme }; p.L = n.L; p.W = n.W; });
    avvisa(t('Disegno salvato: {misure}.', { misure: `${mod.fmtU(n.L)} × ${mod.fmtU(n.W, true)}` }) + (p.tagli.length ? ' ' + t('Il pezzo ha dei tagli: restano dove sono. Se serve, toglili e rifai Adatta.') : '') + ' ' + t('Dalla distinta (scheda Disegni) stampi la dima 1:1.'));
  });
}

const ferr = (p, tipo) => p.ferramenta.find(f => f.tipo === tipo);

function eventiProprieta() {
  const el = $('#proprieta');
  el.addEventListener('change', e => {
    const c = e.target.dataset.campo, p = pezzoSel();
    if (c) applicaCampo(c, e.target.value);
    else if (e.target.hasAttribute('data-man-interasse') && p) modifica(() => { ferr(p, 'maniglia').interasse = +e.target.value; });
    else if (e.target.dataset.fissaggio) modifica(() => {
      const k = e.target.dataset.fissaggio, v = e.target.value, pr = stato.progetto;
      pr.fissaggi = { ...(pr.fissaggi || {}), [k]: v };
      pr.unioniEscluse = (pr.unioniEscluse || []).filter(x => x !== k);
    });
    else if (e.target.hasAttribute('data-fissaggio-def')) modifica(() => { stato.progetto.fissaggioPredefinito = e.target.value; });
    else if (e.target.hasAttribute('data-bordo-spessore') && p) modifica(() => { p.bordatura = { ...(p.bordatura || { lati: [] }), spessore: numero(e.target.value) || 0 }; });
    else if (e.target.dataset.sposta !== undefined) {
      const v = mod.leggiMisura(e.target.value);
      if (!v) return;
      const d = [0, 0, 0]; d[+e.target.dataset.sposta] = v;
      modifica(() => pezziSel().forEach(x => mod.sposta(x, d)));
      e.target.value = '0';
    } else if (e.target.hasAttribute('data-mat-multi') && e.target.value) {
      const id = e.target.value, tipo = materiale(id).tipo;
      modifica(() => pezziSel().filter(x => x.tipo === tipo).forEach(x => { x.mat = id; delete x.spessore; delete x.sezione; }));
      chiavePannello = '';
    }
    else if (e.target.hasAttribute('data-carico')) {
      const v = numero(e.target.value);
      if (v === null || v < 0 || v > 500) return avvisa(t('Scrivi un carico tra 0 e 500 kg/m.'), true);
      modifica(() => { stato.progetto.caricoRipiani = v; });
    }
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.campo) e.target.blur(); });
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const p = pezzoSel();
    if (b.dataset.forma === 'sagoma' && p) apriSagoma(p);
    else if (b.dataset.forma === 'disegno' && p) apriDisegno(p);
    else if (b.dataset.forma && p) modifica(() => { p.forma = b.dataset.forma; if (p.forma === 'cerchio') { p.D = p.D || Math.max(p.L, p.W); } });
    else if (b.dataset.orient && p) modifica(() => { p.rot = mod.rotazioneDa(b.dataset.orient); });
    else if (b.dataset.inclina && p) modifica(() => { p.rot[0] = Math.round((p.rot[0] + +b.dataset.inclina) * 1000) / 1000; });
    else if (b.dataset.togli && p) modifica(() => { p.tagli.splice(+b.dataset.togli, 1); });
    else if (b.dataset.aggiungiFerr && p) modifica(() => {
      p.ferramenta = (p.ferramenta || []).filter(f => f.tipo !== b.dataset.aggiungiFerr);
      p.ferramenta.push(b.dataset.aggiungiFerr === 'cerniere' ? { tipo: 'cerniere', lato: 'A', modello: 'sovrapposta' } : { tipo: 'maniglia', interasse: 128, posizione: 'fine', direzione: 'parallela' });
    });
    else if (b.dataset.bordo && p) modifica(() => {
      const bo = p.bordatura || { spessore: 1, lati: [] }, l = new Set(bo.lati);
      l.has(b.dataset.bordo) ? l.delete(b.dataset.bordo) : l.add(b.dataset.bordo);
      p.bordatura = { spessore: bo.spessore || 1, lati: [...l] };
    });
    else if (b.dataset.bordiTutti && p) modifica(() => { p.bordatura = { spessore: (p.bordatura || {}).spessore || 1, lati: b.dataset.bordiTutti === 'si' ? ['A', 'B', 'basso', 'alto'] : [] }; });
    else if (b.dataset.vena && p) modifica(() => { p.venatura = b.dataset.vena; });
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
    else if (b.dataset.azione === 'catalogo' && p) modifica(() => { delete p.spessore; delete p.sezione; });
    else if (b.dataset.azione === 'terra' && p) {
      const min = Math.min(...verticiMondo(p).map(v => v.y));
      modifica(() => { p.pos[1] = Math.round((p.pos[1] - min) * 1000) / 1000; });
    } else if (b.dataset.azione === 'gruppo' && p) { stato.multi = new Set(stato.progetto.pezzi.filter(x => x.gruppo === p.gruppo).map(x => x.id)); aggiorna(); }
    else if (b.dataset.azione === 'raggruppa') {
      const nome = prompt(t('Nome del gruppo (es. «Cassetto in alto», «Modulo sinistro»):'), t('Gruppo'));
      if (nome === null) return;
      const g = 'gruppo-' + mod.nuovoId();
      modifica(() => pezziSel().forEach(x => { x.gruppo = g; x.nomeGruppo = nome.trim() || t('Gruppo'); }));
      avvisa(t('Raggruppati: tocca un pezzo e poi «Seleziona tutto» per muoverli insieme.'));
    } else if (b.dataset.azione === 'separa') modifica(() => pezziSel().forEach(x => { if (!x.mobile) { delete x.gruppo; delete x.nomeGruppo; } }));
    else if (b.dataset.azione === 'sagoma' && p) apriSagoma(p);
    else if (b.dataset.azione === 'disegno' && p) apriDisegno(p);
    else if (b.dataset.azione === 'dima' && p) stampaHtml(htmlDima(stato.progetto, p), 'dima');
    else if (b.dataset.azione) comando(b.dataset.azione);
  });
}

// ---------- piede e distinta ----------
function disegnaPiede() {
  const r = riepilogo(stato.progetto);
  const comprare = schema(), lastre = comprare.filter(g => g.tipo === 'pannello').reduce((t, g) => t + g.nuovi, 0);
  const barre = comprare.filter(g => g.tipo === 'listello').reduce((t, g) => t + g.nuovi, 0);
  const totale = comprare.reduce((t, g) => t + g.totale, 0);
  const u = unioni(stato.progetto), spesa = listaSpesa(stato.progetto, u), ctr = controlli(stato.progetto);
  $('#piede').innerHTML = `<span>${tn(r.pezzi, '<b>{n}</b> pezzo', '<b>{n}</b> pezzi')}</span><span>${t('Da comprare:')} ${tn(lastre, '<b>{n}</b> lastra', '<b>{n}</b> lastre')} · ${tn(barre, '<b>{n}</b> barra', '<b>{n}</b> barre')}</span>
    <span>${t('Viti:')} <b>${u.viti.length}</b></span>${u.avvisi.length + ctr.avvisi.length ? `<button class="link avviso-link" id="vedi-avvisi">⚠ ${t('{n} da controllare', { n: u.avvisi.length + ctr.avvisi.length })}</button>` : ''}
    <span class="sp"></span>${prezzi() ? `<span>${t('Costo dei pezzi')} <b>${euro(r.costo)}</b></span><span class="costo">${t('Da comprare')} <b>${euro(totale + spesa.totale)}</b></span>` : ''}`;
  $('#vedi-avvisi')?.addEventListener('click', () => { mostraDistinta('ferramenta'); $('#dlg-distinta').showModal(); });
}

function htmlDistinta() {
  const righe = righeDistinta(stato.progetto), r = riepilogo(stato.progetto);
  const tr = righe.map(x => `<tr><td class="n">${x.n}</td><td>${esc(x.nome)}</td><td>${esc(x.materiale)}</td>
    <td class="num">${x.vuoto ? '—' : `${x.L} × ${x.W} × ${x.T}`}</td>
    <td class="num">${x.vuoto ? '—' : x.Ltaglio !== x.L || x.Wtaglio !== x.W ? `<b>${f1(x.Ltaglio)} × ${f1(x.Wtaglio)}</b>` : '='}${x.vena === 'W' ? `<br><small class="nota">${t('venatura in larghezza')}</small>` : ''}</td>
    <td>${x.forma.length || x.tagli.length ? `<ul>${[...x.forma, ...x.tagli].map(v => `<li>${esc(v)}</li>`).join('')}</ul>` : t('a squadra')}</td>
    ${prezzi() ? `<td class="num">${euro(x.costo)}</td>` : ''}</tr>`).join('');
  return `<div class="distinta-totali"><span>${tn(r.pezzi, '<b>{n}</b> pezzo', '<b>{n}</b> pezzi')}</span>${r.materiali.map(m => `<span>${esc(m.nome)}: <b>${f1(m.qta)} ${m.tipo === 'listello' ? 'm' : 'm²'}</b></span>`).join('')}${prezzi() ? `<span>${t('Costo stimato:')} <b>${euro(r.costo)}</b></span>` : ''}</div>
    <table class="distinta"><thead><tr><th>${t('N°')}</th><th>${t('Pezzo')}</th><th>${t('Materiale')}</th><th style="text-align:right">${t('Misura finita (mm)')}</th><th style="text-align:right">${t('Da tagliare')}</th><th>${t('Forma e tagli')}</th>${prezzi() ? `<th style="text-align:right">${t('Costo')}</th>` : ''}</tr></thead><tbody>${tr}</tbody></table>
    <p class="nota">${t('Misure finite dopo i tagli (L × larghezza × spessore). Testa A = inizio del pezzo, Testa B = fine. «Da tagliare» = misura finita meno i bordi applicati (= se uguale).')}${prezzi() ? ' ' + t('Costi indicativi, senza sfrido.') : ''}</p>`;
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
  const gruppi = schema();
  const totale = gruppi.reduce((s, g) => s + g.totale, 0);
  const html = gruppi.map(g => {
    const m = g.materiale, lastra = g.tipo === 'pannello';
    const unita = lastra ? tn(g.nuovi, 'lastra {mis}', 'lastre {mis}', { mis: `${m.lastra[0]}×${m.lastra[1]}` }) : tn(g.nuovi, 'barra da {l} mm', 'barre da {l} mm', { l: mod.fmt(m.barra) });
    const fuori = g.fuori.length ? `<div class="avviso">${t(lastra ? (g.fuori.length === 1 ? 'Non entra in una lastra: {pezzi}. Va giuntato o comprato a parte.' : 'Non entrano in una lastra: {pezzi}. Va giuntato o comprato a parte.') : (g.fuori.length === 1 ? 'Non entra in una barra: {pezzi}. Va giuntato o comprato a parte.' : 'Non entrano in una barra: {pezzi}. Va giuntato o comprato a parte.'), { pezzi: g.fuori.map(p => `n° ${p.n} ${esc(p.nome)} (${p.L}${lastra ? `×${p.W}` : ''})`).join(', ') })}</div>` : '';
    const disegni = g.fogli.map((f, i) => `<div class="lastra">${svgLastra(f, lastra ? 460 : 640)}<span>${f.avanzo ? `<b class="avanzo">${t('Avanzo del magazzino {mis}', { mis: `${f1(f.L)}${lastra ? `×${f1(f.H)}` : ''}` })}</b>` : `${t(lastra ? 'Lastra' : 'Barra')} ${i + 1 - g.daAvanzi}`} · ${t('usata al {p}%', { p: Math.round(f.uso * 100) })}</span></div>`).join('');
    const formato = lastra
      ? `<div class="field"><label>${t('Lastra (L × H)')}</label><div class="input"><input data-formato="${esc(m.id)}" inputmode="decimal" value="${m.lastra[0]} × ${m.lastra[1]}"><small>mm</small></div></div>`
      : `<div class="field"><label>${t('Lunghezza della barra')}</label><div class="input"><input data-formato="${esc(m.id)}" inputmode="decimal" value="${m.barra}"><small>mm</small></div></div>`;
    const torna = g.formatoProgetto ? `<button class="btn" data-formato-catalogo="${esc(m.id)}">${t('Torna a {mis} del catalogo', { mis: lastra ? `${g.catalogo.lastra[0]}×${g.catalogo.lastra[1]}` : g.catalogo.barra })}</button>` : '';
    return `<div class="gruppo-taglio"><h3>${esc(m.nome)}</h3>
      <div class="impost formato">${formato}${torna}<p class="nota">${t(g.formatoProgetto ? 'Misura scelta per questo progetto.' : 'Misura del catalogo: cambiala qui per questo progetto (per esempio un avanzo o una lastra già tagliata dal negozio).')}</p></div>
      <div class="riga"><span>${t('Da comprare:')} <b>${g.nuovi} ${unita}</b></span>${g.daAvanzi ? `<span>${t('Dal magazzino:')} <b>${tn(g.daAvanzi, '{n} avanzo', '{n} avanzi')}</b></span>` : ''}${prezzi() ? `<span>${t('Costo:')} <b>${euro(g.totale)}</b></span>` : ''}${lastra ? `<span>${t(m.venatura ? 'Venatura rispettata: pezzi non ruotati' : 'Pezzi ruotabili (↻ = ruotato)')}</span>` : ''}</div>
      ${fuori}<div class="lastre">${disegni}</div></div>`;
  }).join('');
  if (perStampa) return `<p class="nota">${t('Lama {lama} mm · rifilo {rifilo} mm', { lama: f1(imp.lama), rifilo: f1(imp.rifilo) })}${prezzi() ? ' · ' + t('totale da comprare {tot}', { tot: euro(totale) }) : ''}</p>${html}`;
  return `<div class="impost">
      <div class="field"><label>${t('Spessore della lama')}</label><div class="input"><input data-taglio="lama" inputmode="decimal" value="${f1(imp.lama)}"><small>mm</small></div></div>
      <div class="field"><label>${t('Rifilo dei bordi')}</label><div class="input"><input data-taglio="rifilo" inputmode="decimal" value="${f1(imp.rifilo)}"><small>mm</small></div></div>
      <label class="nota"><input type="checkbox" data-usa-avanzi ${stato.progetto.usaAvanzi === false ? '' : 'checked'}> ${t('Usa prima gli avanzi del magazzino ({n})', { n: (impostazioni.avanzi || []).length })}</label>
      <p class="nota" style="flex:1;min-width:220px">${prezzi() ? t('Totale da comprare: <b>{tot}</b>.', { tot: euro(totale) }) + ' ' : ''}${t('I numeri sui disegni sono quelli della distinta.')}</p></div>
    ${html || `<p class="nota">${t('Ancora nessun pezzo.')}</p>`}`;
}

function htmlFerramentaProgetto() {
  const u = unioni(stato.progetto), sp = listaSpesa(stato.progetto, u);
  const ctr = controlli(stato.progetto);
  const avvisi = [...ctr.avvisi, ...u.avvisi].map(a => `<div class="avviso">⚠ ${esc(a)}</div>`).join('') + ctr.note.map(n => `<div class="ok">✓ ${esc(n)}</div>`).join('')
    + `<p class="nota">${t('Peso stimato: <b>{kg} kg</b>.', { kg: f1(ctr.peso) })}${ctr.frecce.length ? ' ' + t('Ripiani: {elenco} (carico {carico} kg/m, nel tempo).', { elenco: ctr.frecce.map(f => `${esc(f.p.nome)} ${f1(f.nelTempo)} mm`).join(', '), carico: f1(stato.progetto.caricoRipiani ?? CARICO_RIPIANI) }) : ''}</p>`;
  const spesa = sp.righe.map(r => `<tr><td>${esc(r.voce)}${r.nota ? `<br><small class="nota">${esc(r.nota)}</small>` : ''}</td><td class="num">${f1(r.qta)}</td>${prezzi() ? `<td class="num">${euro(r.qta * r.prezzo)}</td>` : ''}</tr>`).join('');
  const giunti = u.giunti.map(g => `<tr><td>${esc(g.a.nome)} + ${esc(g.b.nome)}</td><td>${esc(descriviTipo(g))}</td><td>${esc(descriviGiunto(g))}${g.note.map(n => `<br><small class="nota">${esc(n)}</small>`).join('')}</td></tr>`).join('');
  return `${avvisi}
    <h3>${t('Lista della spesa')}</h3>
    <table class="distinta"><thead><tr><th>${t('Voce')}</th><th style="text-align:right">${t('Quantità')}</th>${prezzi() ? `<th style="text-align:right">${t('Costo')}</th>` : ''}</tr></thead><tbody>${spesa || `<tr><td colspan="3" class="nota">${t('Ancora niente.')}</td></tr>`}</tbody></table>
    ${prezzi() ? `<p class="nota">${t('Totale ferramenta: <b>{tot}</b> (prezzi indicativi).', { tot: euro(sp.totale) })}</p>` : ''}
    <h3>${t('Unioni trovate')}</h3>
    <table class="distinta"><thead><tr><th>${t('Pezzi')}</th><th>${t('Come si toccano')}</th><th>${t('Fissaggio proposto')}</th></tr></thead><tbody>${giunti || `<tr><td colspan="3" class="nota">${t('Nessun pezzo tocca un altro.')}</td></tr>`}</tbody></table>
    <p class="nota">${t('Le viti sono proposte con regole indicative: controllale prima di forare. Le blu sono nel 3D (pulsante Viti), le rosse si scontrano con qualcosa.')}</p>`;
}

function mostraDistinta(scheda) {
  document.querySelectorAll('#schede-distinta button').forEach(b => b.classList.toggle('on', b.dataset.scheda === scheda));
  $('#distinta').innerHTML = scheda === 'schema' ? htmlSchema() : scheda === 'ferramenta' ? htmlFerramentaProgetto() : scheda === 'disegni' ? htmlDisegni() : htmlDistinta();
  $('#distinta').dataset.scheda = scheda;
}

function stampaHtml(html, tipo = 'documento') {
  $('#stampa-area').innerHTML = html;
  document.body.dataset.stampa = tipo;
  window.print();
}

function htmlDisegni() {
  const pezzi = stato.progetto.pezzi.slice().sort((a, b) => a.n - b.n);
  return `<p class="nota">${t('Ogni pezzo visto di faccia, con i fori di ferramenta e fissaggi. Per i pezzi sagomati, rotondi o tagliati in obliquo stampa la dima 1:1.')}</p>
    <div class="disegni">${pezzi.map(p => `<div>${htmlDisegno(stato.progetto, p)}<button class="btn" data-dima="${p.id}">${t('Dima 1:1')}</button></div>`).join('')}</div>`;

}

function stampa() {
  const pr = stato.progetto;
  stampaHtml(`<h1>${esc(pr.nome)}</h1><p class="nota">MyPlanMaker · ${new Date().toLocaleDateString(lingua.locale)}</p><img class="stampa-vista" src="${vista.immagine()}">${htmlDistinta()}
    <div class="stampa-schema"><h1>${t('Schema di taglio')}</h1>${htmlSchema(true)}</div>
    <div class="stampa-schema"><h1>${t('Ferramenta, viti e controlli')}</h1>${htmlFerramentaProgetto()}</div>
    <div class="stampa-schema"><h1>${t('Istruzioni di montaggio')}</h1>${htmlIstruzioni(pr)}</div>
    <div class="stampa-schema"><h1>${t('Disegni dei pezzi')}</h1><div class="disegni">${pr.pezzi.slice().sort((a, b) => a.n - b.n).map(p => htmlDisegno(pr, p)).join('')}</div></div>`);
}

// ---------- progetti e salvataggio ----------
let timerSalva;
function salvaPresto() {
  clearTimeout(timerSalva);
  $('#stato-salvataggio').textContent = t('Salvo…');
  timerSalva = setTimeout(salvaOra, 700);
}

async function salvaOra() {
  const r = await archivio.salva(stato.progetto);
  const s = $('#stato-salvataggio');
  s.classList.toggle('attenzione', r !== 'salvato');
  if (r === 'salvato') s.textContent = t('Salvato');
  else if (r === 'locale') s.textContent = t('Salvato solo su questo dispositivo');
  else if (r.conflitto) {
    s.textContent = t('Aggiornato da un altro dispositivo');
    apri(r.conflitto);
    avvisa(t('Questo progetto era stato cambiato su un altro dispositivo: ho caricato quella versione.'), true, 8000);
  }
}

function apri(progetto) {
  stato.progetto = progetto;
  seleziona(null);
  stato.modo = null;
  stato.misura = null;
  stato.esploso = false;
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
  $('#lista-progetti').innerHTML = lista.map(p => `<li class="${p.id === stato.progetto.id ? 'attivo' : ''}"><span class="nome"><b>${esc(p.nome)}</b><span>${new Date(p.aggiornato).toLocaleString(lingua.locale, { dateStyle: 'medium', timeStyle: 'short' })}</span></span>
    <button class="btn" data-apri="${p.id}">${t('Apri')}</button><button class="btn icon danger" data-elimina="${p.id}" title="${t('Elimina')}">✕</button></li>`).join('') || `<li><span class="nome nota">${t('Nessun progetto salvato.')}</span></li>`;
  $('#lista-esempi').innerHTML = ESEMPI.map((e, i) => `<li><span class="nome"><b>${esc(t(e.nome))}</b><span>${esc(t(e.nota))}</span></span><button class="btn" data-esempio="${i}">${t('Usa')}</button></li>`).join('');
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
      if (b.dataset.elimina === stato.progetto.id) return avvisa(t('Non puoi eliminare il progetto aperto: aprine prima un altro.'), true);
      if (!confirm(t('Eliminare questo progetto? Non si può annullare.'))) return;
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
      avvisa(t('Importato «{nome}» come nuovo progetto.', { nome: p.nome }));
    } catch (err) { avvisa(err.message, true, 8000); }
  });
  $('#apri-distinta').addEventListener('click', () => { mostraDistinta('pezzi'); $('#dlg-distinta').showModal(); });
  $('#dlg-modelli').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.modello) { try { valoriModello = leggiModello(); } catch { /* valori incompleti: si riparte dai predefiniti */ } modelloScelto = b.dataset.modello; valoriModello = valoriDefault(modello(modelloScelto)); apriModelli(); }
    if (b.dataset.crea) creaModello(b.dataset.crea);
  });
  // Cambiando materiale nel modello, spessore e sezione ripartono da quelli del nuovo materiale.
  $('#dlg-modelli').addEventListener('change', e => {
    if (!e.target.hasAttribute('data-mat-modello')) return;
    const m = materiale(e.target.value), k = e.target.dataset.par;
    for (const [s, x] of [['W', m.W], ['T', m.T]]) { const c = document.querySelector(`#form-modello [data-par="${k}${s}"]`); if (c) c.value = fU(x); }
  });
  $('#dlg-cassetto').addEventListener('click', e => {
    if (e.target.closest('#crea-cassetti')) creaCassettiOra();
    if (e.target.closest('[data-chiudi-cassetto]')) $('#dlg-cassetto').close();
  });
  $('#dividi-n').addEventListener('input', anteprimaDividi);
  $('#dividi-meno').addEventListener('click', () => { $('#dividi-n').value = Math.max(1, (numero($('#dividi-n').value) || 1) - 1); anteprimaDividi(); });
  $('#dividi-piu').addEventListener('click', () => { $('#dividi-n').value = Math.min(50, (numero($('#dividi-n').value) || 1) + 1); anteprimaDividi(); });
  $('#dividi-ok').addEventListener('click', () => {
    const { n, s } = anteprimaDividi();
    if (!s.ok) return;
    const { a } = dividiDa;
    modifica(() => { const nuovi = mod.dividi(stato.progetto, a, s, n); stato.multi = new Set(nuovi.map(x => x.id)); stato.sel = nuovi[0].id; });
    $('#dlg-dividi').close();
    avvisa(tn(n, 'Aggiunto 1 pezzo alla stessa distanza (luce {luce}). Viti e distinta sono già aggiornate.', 'Aggiunti {n} pezzi alla stessa distanza (luce {luce}). Viti e distinta sono già aggiornate.', { luce: mod.fmtU(s.passo, true) }));
  });
  $('#schede-distinta').addEventListener('click', e => { const b = e.target.closest('button'); if (b) mostraDistinta(b.dataset.scheda); });
  $('#distinta').addEventListener('click', e => {
    const b = e.target.closest('[data-dima]');
    if (b) stampaHtml(htmlDima(stato.progetto, stato.progetto.pezzi.find(p => p.id === b.dataset.dima)), 'dima');
  });
  $('#etichette').addEventListener('click', () => stampaHtml(htmlEtichette(stato.progetto, righeDistinta(stato.progetto)), 'etichette'));
  $('#distinta').addEventListener('click', e => {
    const b = e.target.closest('[data-formato-catalogo]');
    if (!b) return;
    modifica(() => { const l = { ...(stato.progetto.lastre || {}) }; delete l[b.dataset.formatoCatalogo]; stato.progetto.lastre = l; });
    mostraDistinta('schema');
  });
  $('#distinta').addEventListener('change', e => {
    if (e.target.hasAttribute('data-usa-avanzi')) { modifica(() => { stato.progetto.usaAvanzi = e.target.checked; }); return mostraDistinta('schema'); }
    if (e.target.dataset.formato) {
      const id = e.target.dataset.formato, g = schema().find(x => x.materiale.id === id), barra = g?.tipo === 'listello';
      const v = e.target.value.split(/[x×*]/i).map(numero);
      const ok = barra ? v.length === 1 && v[0] >= 50 && v[0] <= 20000 : v.length === 2 && v.every(x => x >= 50 && x <= 20000);
      if (!g || !ok) { avvisa(t(barra ? 'Scrivi la lunghezza della barra in mm, per esempio 3000.' : 'Scrivi la lastra come 2500×1250 (in mm, tra 50 e 20000).'), true); return mostraDistinta('schema'); }
      const f = v.map(x => Math.round(x * 10) / 10), cat = g.catalogo, uguale = barra ? f[0] === cat.barra : f[0] === cat.lastra[0] && f[1] === cat.lastra[1];
      modifica(() => { const l = { ...(stato.progetto.lastre || {}) }; if (uguale) delete l[id]; else l[id] = f; stato.progetto.lastre = l; });
      return mostraDistinta('schema');
    }
    const k = e.target.dataset.taglio;
    if (!k) return;
    const v = numero(e.target.value);
    if (v === null || v < 0 || v > 100) { avvisa(t('Scrivi un numero tra 0 e 100.'), true); return mostraDistinta('schema'); }
    modifica(() => { stato.progetto.taglio = { ...IMPOSTAZIONI_TAGLIO, ...(stato.progetto.taglio || {}), [k]: v }; });
    mostraDistinta('schema');
  });
  $('#stampa').addEventListener('click', stampa);
  $('#esporta').addEventListener('click', stampa);
}

// ---------- menu, magazzino, versioni, laboratorio, guida ----------
function menuAltro(azione) {
  const pr = stato.progetto, nome = pr.nome;
  if (azione === 'json') scarica(`${nome}.mpm.json`, archivio.versoFile(pr), 'application/json');
  if (azione === 'csv') scarica(`${nome} - ${t('distinta')}.csv`, csvDistinta(pr), 'text/csv');
  if (azione === 'dxf') scarica(`${nome} - ${t('pezzi')}.dxf`, dxfPezzi(pr), 'application/dxf');
  if (azione === 'stl') scarica(`${nome}.stl`, stlProgetto(pr), 'model/stl');
  if (azione === 'png') scarica(`${nome}.png`, vista.immagine());
  if (azione === 'laboratorio') apriLaboratorio('taglio');
  if (azione === 'montaggio') apriLaboratorio('montaggio');
  if (azione === 'magazzino') apriMagazzino('avanzi');
  if (azione === 'materiali') apriMagazzino('materiali');
  if (azione === 'versioni') apriVersioni();
  if (azione === 'guida') $('#dlg-guida').showModal();
  if (azione === 'prezzi') {
    impostazioni.prezzi = !prezzi();
    salvaImp();
    mostraMenu();
    avvisa(t(prezzi() ? 'Prezzi e costi visibili.' : 'Prezzi e costi nascosti.'));
  }
  if (azione.startsWith('lingua:')) {
    const cod = azione.slice(7);
    if (cod === lingua.cod) return;
    salvaLingua(cod);
    location.reload();
  }
}

// Prezzi e costi: facoltativi (si mostrano solo se attivati dal menu), impostazione condivisa tra i dispositivi.
const prezzi = () => impostazioni.prezzi === true;
const TIPI_PEZZO = [tr('pannello'), tr('listello')]; // per t(p.tipo)

function mostraMenu() {
  $('#menu-prezzi').textContent = t(prezzi() ? '💶 Nascondi prezzi e costi' : '💶 Mostra prezzi e costi');
  $('#menu-lingue').innerHTML = Object.entries(LINGUE).map(([k, v]) => `<button data-menu="lingua:${k}" class="${k === lingua.cod ? 'on' : ''}" title="${v}">${k.toUpperCase()}</button>`).join('');
}

async function salvaImp() {
  const r = await archivio.salvaImpostazioni(impostazioni);
  applicaCatalogo(impostazioni);
  chiavePannello = '';
  aggiorna();
  if (r !== 'salvato') avvisa(t('Salvato solo su questo dispositivo: il server non risponde.'), true);
}

function apriMagazzino(scheda) {
  const d = $('#dlg-magazzino'), avanzi = impostazioni.avanzi || [];
  d.querySelectorAll('[data-mag]').forEach(b => b.classList.toggle('on', b.dataset.mag === scheda));
  const opzioni = sel => MATERIALI.map(m => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.nome)}</option>`).join('');
  let h;
  if (scheda === 'avanzi') {
    h = `<p class="nota">${t('Gli avanzi che hai in laboratorio. Lo schema di taglio li usa prima di farti comprare lastre o barre nuove.')}</p>
      <table class="distinta"><thead><tr><th>${t('Materiale')}</th><th style="text-align:right">${t('Lunghezza')}</th><th style="text-align:right">${t('Larghezza')}</th><th style="text-align:right">${t('Quanti')}</th><th></th></tr></thead><tbody>
      ${avanzi.map((a, i) => `<tr><td>${esc(materiale(a.mat).nome)}</td><td class="num">${f1(a.L)}</td><td class="num">${materiale(a.mat).tipo === 'listello' ? '—' : f1(a.W)}</td><td class="num">${a.qta}</td><td><button class="link" data-togli-avanzo="${i}">${t('Togli')}</button></td></tr>`).join('') || `<tr><td colspan="5" class="nota">${t('Ancora nessun avanzo.')}</td></tr>`}</tbody></table>
      <h3>${t('Aggiungi un avanzo')}</h3>
      <div class="griglia-form"><div class="field"><label>${t('Materiale')}</label><div class="input"><select id="av-mat">${opzioni('mb18')}</select><small>▾</small></div></div>
      <div class="field"><label>${t('Lunghezza')}</label><div class="input"><input id="av-L" inputmode="decimal"><small>mm</small></div></div>
      <div class="field"><label>${t('Larghezza (pannelli)')}</label><div class="input"><input id="av-W" inputmode="decimal"><small>mm</small></div></div>
      <div class="field"><label>${t('Quanti')}</label><div class="input"><input id="av-q" inputmode="numeric" value="1"></div></div></div>
      <button class="btn primary" id="av-aggiungi">${t('Aggiungi al magazzino')}</button>`;
  } else {
    h = `<p class="nota">${t(prezzi() ? 'I tuoi prezzi e le misure che compri davvero. Valgono per tutti i progetti. Prezzi dei pannelli al m², dei listelli al metro.' : 'Le misure che compri davvero: valgono per tutti i progetti.')}</p>
      <div class="tabella-scorre"><table class="distinta"><thead><tr><th>${t('Materiale')}</th><th style="text-align:right">${t('Spessore / sezione')}</th>${prezzi() ? `<th style="text-align:right">${t('Prezzo')}</th>` : ''}<th style="text-align:right">${t('Lastra / barra')}</th><th></th></tr></thead><tbody>
      ${MATERIALI.map(m => `<tr><td>${esc(m.nome)}${m.id.startsWith('u_') ? ` <small class="nota">${t('tuo')}</small>` : ''}</td><td class="num">${m.tipo === 'listello' ? `${m.W}×${m.T}` : m.T}</td>
        ${prezzi() ? `<td class="num"><input class="mini-num" data-mat-prezzo="${m.id}" value="${f1(m.tipo === 'listello' ? m.prezzoM : m.prezzoM2)}"> €/${m.tipo === 'listello' ? 'm' : 'm²'}</td>` : ''}
        <td class="num">${m.tipo === 'listello' ? `<input class="mini-num" data-mat-barra="${m.id}" value="${m.barra}">` : `<input class="mini-num largo" data-mat-lastra="${m.id}" value="${m.lastra.join('×')}">`}</td>
        <td>${materialeBase(m.id) && (impostazioni.materiali || {})[m.id] ? `<button class="link" data-mat-ripristina="${m.id}">${t('Ripristina')}</button>` : m.id.startsWith('u_') ? `<button class="link" data-mat-togli="${m.id}">${t('Togli')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
      <h3>${t('Nuovo materiale')}</h3>
      <div class="griglia-form"><div class="field"><label>${t('Nome')}</label><div class="input"><input id="nm-nome" placeholder="${t('es. Multistrato pioppo 15')}"></div></div>
      <div class="field"><label>${t('Tipo')}</label><div class="input"><select id="nm-tipo"><option value="pannello">${t('Pannello')}</option><option value="listello">${t('Listello')}</option></select><small>▾</small></div></div>
      <div class="field"><label>${t('Spessore')}</label><div class="input"><input id="nm-T" inputmode="decimal"><small>mm</small></div></div>
      <div class="field"><label>${t('Larghezza (listello)')}</label><div class="input"><input id="nm-W" inputmode="decimal"><small>mm</small></div></div>
      ${prezzi() ? `<div class="field"><label>${t('Prezzo')}</label><div class="input"><input id="nm-prezzo" inputmode="decimal"><small>€</small></div></div>` : ''}
      <div class="field"><label>${t('Lastra (L×H) o barra (L)')}</label><div class="input"><input id="nm-misura" placeholder="${t('2500×1250 o 3000')}"></div></div>
      <div class="field"><label>${t('Venatura')}</label><div class="input"><select id="nm-vena"><option value="1">${t('Sì')}</option><option value="0">${t('No')}</option></select><small>▾</small></div></div>
      <div class="field"><label>${t('Colore')}</label><div class="input"><input id="nm-colore" type="color" value="#d9b98a"></div></div></div>
      <button class="btn primary" id="nm-aggiungi">${t('Aggiungi materiale')}</button>`;
  }
  $('#corpo-magazzino').innerHTML = h;
  d.dataset.scheda = scheda;
  if (!d.open) d.showModal();
}

function eventiMagazzino() {
  const d = $('#dlg-magazzino');
  d.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.mag) return apriMagazzino(b.dataset.mag);
    if (b.dataset.togliAvanzo) { impostazioni.avanzi.splice(+b.dataset.togliAvanzo, 1); salvaImp(); return apriMagazzino('avanzi'); }
    if (b.id === 'av-aggiungi') {
      const mat = $('#av-mat').value, L = numero($('#av-L').value), W = numero($('#av-W').value), q = Math.round(numero($('#av-q').value) || 1);
      const listello = materiale(mat).tipo === 'listello';
      if (!L || L <= 0 || (!listello && (!W || W <= 0))) return avvisa(t("Scrivi le misure dell'avanzo."), true);
      impostazioni.avanzi = [...(impostazioni.avanzi || []), { mat, L, W: listello ? materiale(mat).W : W, qta: q }];
      salvaImp(); return apriMagazzino('avanzi');
    }
    if (b.dataset.matRipristina) { delete impostazioni.materiali[b.dataset.matRipristina]; salvaImp(); return apriMagazzino('materiali'); }
    if (b.dataset.matTogli) {
      if (stato.progetto.pezzi.some(p => p.mat === b.dataset.matTogli)) return avvisa(t('Questo materiale è usato nel progetto aperto: cambialo prima sui pezzi.'), true);
      impostazioni.materialiExtra = (impostazioni.materialiExtra || []).filter(m => m.id !== b.dataset.matTogli); salvaImp(); return apriMagazzino('materiali');
    }
    if (b.id === 'nm-aggiungi') {
      const tipo = $('#nm-tipo').value, T = numero($('#nm-T').value), W = numero($('#nm-W').value), prezzo = numero($('#nm-prezzo')?.value ?? '') ?? 0, nome = $('#nm-nome').value.trim();
      const mis = $('#nm-misura').value.split(/[x×*]/i).map(numero);
      if (!nome || !T || !mis[0] || (tipo === 'listello' && !W) || (tipo === 'pannello' && !mis[1])) return avvisa(t('Compila nome, spessore e misura (per i listelli anche la larghezza).'), true);
      const m = { id: 'u_' + mod.nuovoId(), tipo, nome, T, colore: $('#nm-colore').value, venatura: $('#nm-vena').value === '1' };
      if (tipo === 'listello') Object.assign(m, { W, prezzoM: prezzo, barra: mis[0] }); else Object.assign(m, { prezzoM2: prezzo, lastra: [mis[0], mis[1]] });
      impostazioni.materialiExtra = [...(impostazioni.materialiExtra || []), m];
      salvaImp(); avvisa(t('Aggiunto «{nome}»: lo trovi nei materiali di ogni pezzo.', { nome })); return apriMagazzino('materiali');
    }
  });
  d.addEventListener('change', e => {
    const el = e.target, id = el.dataset.matPrezzo || el.dataset.matBarra || el.dataset.matLastra;
    if (!id) return;
    const m = materiale(id), cambio = {};
    if (el.dataset.matPrezzo) { const v = numero(el.value); if (v === null || v < 0) return avvisa(t('Prezzo non valido.'), true); cambio[m.tipo === 'listello' ? 'prezzoM' : 'prezzoM2'] = v; }
    if (el.dataset.matBarra) { const v = numero(el.value); if (!v || v < 100) return avvisa(t('Lunghezza della barra non valida.'), true); cambio.barra = v; }
    if (el.dataset.matLastra) { const v = el.value.split(/[x×*]/i).map(numero); if (!v[0] || !v[1]) return avvisa(t('Scrivi la lastra come 2500×1250.'), true); cambio.lastra = [v[0], v[1]]; }
    if (id.startsWith('u_')) impostazioni.materialiExtra = impostazioni.materialiExtra.map(x => (x.id === id ? { ...x, ...cambio } : x));
    else impostazioni.materiali = { ...(impostazioni.materiali || {}), [id]: { ...((impostazioni.materiali || {})[id] || {}), ...cambio } };
    salvaImp();
  });
}

function apriVersioni() {
  const pr = stato.progetto, v = pr.versioni || [];
  $('#corpo-versioni').innerHTML = `<p class="nota">${t('Una versione è una fotografia del progetto: la puoi riaprire quando vuoi (e annullare con ↶).')}</p>
    <div class="azioni"><div class="input" style="flex:2"><input id="ver-nome" placeholder="${t('Nome della versione, es. «con 3 ripiani»')}"></div><button class="btn primary" id="ver-salva">${t('Salva versione')}</button></div>
    <ul class="lista">${v.slice().reverse().map(x => `<li><span class="nome"><b>${esc(x.nome)}</b><span>${new Date(x.data).toLocaleString(lingua.locale, { dateStyle: 'medium', timeStyle: 'short' })} · ${t('{n} pezzi', { n: x.dati.pezzi.length })}</span></span><button class="btn" data-ver-apri="${x.id}">${t('Riapri')}</button><button class="btn icon danger" data-ver-togli="${x.id}" title="${t('Togli')}">✕</button></li>`).join('') || `<li><span class="nome nota">${t('Nessuna versione salvata.')}</span></li>`}</ul>`;
  if (!$('#dlg-versioni').open) $('#dlg-versioni').showModal();
}
const CAMPI_VERSIONE = ['pezzi', 'prossimoN', 'fissaggi', 'fissaggioPredefinito', 'unioniEscluse', 'taglio', 'caricoRipiani', 'usaAvanzi'];
function eventiVersioni() {
  $('#dlg-versioni').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const pr = stato.progetto;
    if (b.id === 'ver-salva') {
      const nome = $('#ver-nome').value.trim() || t('Versione del {data}', { data: new Date().toLocaleString(lingua.locale, { dateStyle: 'short', timeStyle: 'short' }) });
      const dati = Object.fromEntries(CAMPI_VERSIONE.map(k => [k, structuredClone(pr[k])]));
      modifica(() => { pr.versioni = [...(pr.versioni || []), { id: mod.nuovoId(), nome, data: Date.now(), dati }].slice(-20); });
      avvisa(t('Versione «{nome}» salvata.', { nome })); apriVersioni();
    }
    if (b.dataset.verApri) {
      const v = pr.versioni.find(x => x.id === b.dataset.verApri);
      modifica(() => { for (const k of CAMPI_VERSIONE) pr[k] = structuredClone(v.dati[k]); seleziona(null); });
      $('#dlg-versioni').close(); vista.vista(vista.nomeVista);
      avvisa(t('Riaperta la versione «{nome}». Con ↶ torni a prima.', { nome: v.nome }));
    }
    if (b.dataset.verTogli) { modifica(() => { pr.versioni = pr.versioni.filter(x => x.id !== b.dataset.verTogli); }); apriVersioni(); }
  });
}

// Modalità laboratorio: lista grande dei pezzi da tagliare (da spuntare) e passi di montaggio.
function apriLaboratorio(scheda) {
  const el = $('#laboratorio'), pr = stato.progetto;
  el.hidden = false;
  el.querySelectorAll('[data-lab]').forEach(b => b.classList.toggle('on', b.dataset.lab === scheda));
  const righe = righeDistinta(pr).filter(r => !r.vuoto);
  let h;
  if (scheda === 'taglio') {
    const fatti = righe.filter(r => pr.pezzi.find(p => p.n === r.n)?.fatto).length;
    const perMat = new Map();
    for (const r of righe) { if (!perMat.has(r.materiale)) perMat.set(r.materiale, []); perMat.get(r.materiale).push(r); }
    h = `<p class="lab-avanzamento">${t('{fatti} di {tot} pezzi tagliati', { fatti, tot: righe.length })}</p>${[...perMat].map(([m, rr]) => `<h2>${esc(m)}</h2><div class="lab-griglia">${rr.map(r => {
      const p = pr.pezzi.find(x => x.n === r.n);
      return `<button class="lab-pezzo ${p.fatto ? 'fatto' : ''}" data-lab-fatto="${p.id}"><span class="n">${r.n}</span><span class="mis">${f1(r.Ltaglio)} × ${f1(r.Wtaglio)}</span><span class="nome">${esc(r.nome)}</span>${[...r.forma, ...r.tagli].map(v => `<span class="extra">${esc(v)}</span>`).join('')}<span class="spunta">${t(p.fatto ? '✓ Tagliato' : 'Tocca quando è tagliato')}</span></button>`;
    }).join('')}</div>`).join('')}`;
  } else {
    const passi = istruzioni(pr), fatti = new Set(pr.passiFatti || []);
    h = `<p class="lab-avanzamento">${t('{fatti} di {tot} passi fatti', { fatti: fatti.size, tot: passi.length })}</p><ol class="lab-passi">${passi.map((x, i) => `<li><button class="lab-passo ${fatti.has(i) ? 'fatto' : ''}" data-lab-passo="${i}"><b>${i + 1}. ${esc(x.titolo)}</b><span>${esc(x.testo)}</span>${(x.note || []).map(n => `<span class="extra">${esc(n)}</span>`).join('')}</button></li>`).join('')}</ol>`;
  }
  $('#lab-corpo').innerHTML = h;
  el.dataset.scheda = scheda;
}
function eventiLaboratorio() {
  const el = $('#laboratorio');
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.lab) return apriLaboratorio(b.dataset.lab);
    if (b.id === 'lab-chiudi') { el.hidden = true; return; }
    if (b.dataset.labFatto) { const p = stato.progetto.pezzi.find(x => x.id === b.dataset.labFatto); modifica(() => { p.fatto = !p.fatto; }); return apriLaboratorio('taglio'); }
    if (b.dataset.labPasso) {
      const i = +b.dataset.labPasso, f = new Set(stato.progetto.passiFatti || []);
      f.has(i) ? f.delete(i) : f.add(i);
      modifica(() => { stato.progetto.passiFatti = [...f]; }); return apriLaboratorio('montaggio');
    }
  });
}

// ---------- avvio ----------
async function avvio() {
  await caricaLingua();
  traduciPagina();
  await avviaGeometria();
  impostazioni = await archivio.caricaImpostazioni();
  applicaCatalogo(impostazioni);
  vista = new Vista3D($('#vista3d'), {
    onTocco: tocco, onTrasforma: trasformato, onAfferra: (id, ev) => { seleziona(id, stato.aggiungiSel || ev.ctrlKey || ev.metaKey); aggiorna(); },
    onRidimensiona: ridimensionato, onQuota: quotaScritta,
  });
  $('#barra-sel').addEventListener('click', e => { const b = e.target.closest('button'); if (b) comando(b.dataset.cmd); });
  document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => comando(b.dataset.cmd)));
  $('#viste').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.vista === 'inquadra') return vista.vista(vista.nomeVista);
    if (b.dataset.vista === 'esploso') { stato.esploso = !stato.esploso; aggiorna(); return vista.vista(vista.nomeVista); }
    if (b.dataset.vista === 'viti') { stato.mostraViti = !stato.mostraViti; localStorage.setItem('mpm:viti', stato.mostraViti ? 'si' : 'no'); return aggiorna(); }
    document.querySelectorAll('#viste button:not([data-vista="viti"]):not([data-vista="inquadra"])').forEach(x => x.classList.toggle('on', x === b));
    vista.vista(b.dataset.vista);
  });
  const annulla = () => { const s = storico.annulla(stato.progetto); if (s) { stato.progetto = s; aggiorna(); salvaPresto(); } };
  const ripeti = () => { const s = storico.ripeti(stato.progetto); if (s) { stato.progetto = s; aggiorna(); salvaPresto(); } };
  $('#annulla').addEventListener('click', annulla);
  $('#ripeti').addEventListener('click', ripeti);
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea') || document.querySelector('dialog[open]')) return;
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k === 'z') { e.preventDefault(); e.shiftKey ? ripeti() : annulla(); }
    else if (ctrl && k === 'y') { e.preventDefault(); ripeti(); }
    else if (ctrl && k === 'd') { e.preventDefault(); if (pezzoSel()) comando('duplica'); }
    else if (ctrl && k === 'a') { e.preventDefault(); stato.multi = new Set(stato.progetto.pezzi.map(p => p.id)); stato.sel = stato.progetto.pezzi[0]?.id || null; aggiorna(); }
    else if (e.key === 'Escape') { if (stato.modo) esciModo(); else if (stato.accostato) { stato.accostato = null; disegnaAccostato(); } else { seleziona(null); aggiorna(); } }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && pezzoSel()) comando('elimina');
    else if (ctrl || e.altKey) return;
    else if (e.key.startsWith('Arrow') || e.key === 'PageUp' || e.key === 'PageDown') {
      const sel = pezziSel();
      if (!sel.length) return;
      e.preventDefault();
      const passo = e.shiftKey ? 10 : 1;
      const d = { ArrowLeft: [-passo, 0, 0], ArrowRight: [passo, 0, 0], ArrowUp: [0, 0, -passo], ArrowDown: [0, 0, passo], PageUp: [0, passo, 0], PageDown: [0, -passo, 0] }[e.key];
      modifica(() => sel.forEach(p => mod.sposta(p, d)));
    } else {
      const tasti = { p: 'pannello', l: 'listello', c: 'accosta', a: 'adatta', d: 'dividi', m: 'misura', g: 'sposta', r: 'ruota', s: 'specchia', t: 'modelli', k: 'cassetto' };
      if (tasti[k]) { e.preventDefault(); comando(tasti[k]); }
    }
  });
  eventiProprieta();
  eventiAccostato();
  eventiDialoghi();
  eventiMagazzino();
  eventiVersioni();
  eventiLaboratorio();
  $('#guida-modelli').addEventListener('click', () => { $('#dlg-guida').close(); apriModelli(); });
  mostraMenu();
  // Unità delle misure (mm o cm): preferenza di questo dispositivo.
  const mostraUnita = () => document.querySelectorAll('[data-unita]').forEach(b => b.classList.toggle('on', b.dataset.unita === U()));
  try { if (localStorage.getItem('mpm:unita') === 'cm') mod.unita.u = 'cm'; } catch { /* resta mm */ }
  mostraUnita();
  $('#unita').addEventListener('click', e => {
    const b = e.target.closest('[data-unita]');
    if (!b || b.dataset.unita === U()) return;
    mod.unita.u = b.dataset.unita;
    try { localStorage.setItem('mpm:unita', U()); } catch { /* solo per questa sessione */ }
    mostraUnita();
    chiavePannello = '';
    aggiorna();
    avvisa(t(U() === 'cm' ? "Misure in centimetri. In un campo puoi sempre scrivere anche l'unità, per esempio «76 cm» o «760 mm»." : "Misure in millimetri. In un campo puoi sempre scrivere anche l'unità, per esempio «76 cm» o «760 mm»."));
  });
  $('#menu-altro').addEventListener('click', e => { e.stopPropagation(); $('#tendina').hidden = !$('#tendina').hidden; });
  $('#tendina').addEventListener('click', e => { const b = e.target.closest('[data-menu]'); if (b) { $('#tendina').hidden = true; menuAltro(b.dataset.menu); } else e.stopPropagation(); });
  document.addEventListener('click', () => { $('#tendina').hidden = true; });
  if (!localStorage.getItem('mpm:guida-vista')) { localStorage.setItem('mpm:guida-vista', '1'); setTimeout(() => $('#dlg-guida').showModal(), 600); }
  window.addEventListener('online', () => archivio.sincronizza());

  const ultimo = localStorage.getItem('mpm:ultimo');
  let p = ultimo ? await archivio.carica(ultimo) : null;
  if (!p) { const l = await archivio.elenco(); if (l.length) p = await archivio.carica(l[0].id); }
  if (p) apri(p);
  else { crea(ESEMPI[0].crea()); avvisa(t('Ti ho aperto un esempio: tocca un pezzo per vedere come è fatto. Nuovi progetti dal menu Progetto.'), false, 9000); }
  archivio.sincronizza();
  // Segnale di vita: la versione portable per Windows si chiude da sola quando nessuna pagina è aperta.
  setInterval(() => fetch('/api/ping', { cache: 'no-store' }).catch(() => {}), 60000);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.mpm = { stato, comando, tocco, apri, mod, righeDistinta, menuAltro, vista, lingua };
 // per le prove automatiche
}

avvio().catch(err => { console.error(err); avvisa(t("Errore all'avvio: {errore}", { errore: err.message }), true, 0); });

