// MyPlanMaker: collega modello, vista 3D, pannello delle proprietà e salvataggio.
import { Box3, Matrix4, Vector3 } from '../vendor/three.module.js';
import { aggiornaIntagli, avviaGeometria, formeLavorazioni, geometriaPezzo, lavorazioneDa } from './geometria.js';
import { Vista3D } from './vista3d.js';
import * as mod from './modello.js';
import { MATERIALI, applicaCatalogo, materiale, materialeBase, materialePezzo, materialiPer, SPESSORI_COMUNI, SEZIONI_COMUNI, materialeDaId } from './materiali.js';
import { euro, riepilogo, righeDistinta } from './distinta.js';
import * as archivio from './archivio.js';
import { ESEMPI } from './esempi.js';
import { IMPOSTAZIONI_TAGLIO, schemaDiTaglio } from './taglio.js';
import { FISSAGGI, descriviGiunto, descriviTipo, unioni } from './unioni.js';

import { INTERASSI, LATI, MODELLI_CERNIERA, cerniere, maniglia } from './ferramenta.js';
import { listaSpesa } from './spesa.js';
import { MODELLI, modello, valoriDefault } from './modelli.js';
import { FUGA, TIPI_GUIDA, creaCassetti, lunghezzaPer } from './cassetti.js';
import { COMPOSIZIONI, TIPI_LIVELLO, calcola, composizioneDa, genera, normalizza, nuovaColonna, nuovoLivello, nuovoModulo, svgFronte } from './compositore.js';
import { apriEditorSagoma } from './sagome.js';
import { apriDisegno2D, formeDaPezzo } from './disegno2d.js';
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
  // Si comincia a lavorare sulla scena vuota dell'avvio: diventa un progetto nuovo vero.
  if (stato.inAttesa) { stato.inAttesa = false; localStorage.setItem('mpm:ultimo', stato.progetto.id); }
  storico.salva(stato.progetto);
  const r = fn();
  aggiorna();
  salvaPresto();
  return r;
}

function aggiorna() {
  aggiornaIntagli(stato.progetto);
  const u = unioni(stato.progetto);
  vista.aggiorna(stato.progetto, {
    selezione: selezione(), primario: stato.sel, viti: u.viti, mostraViti: stato.mostraViti, vitiErrate: u.errate,
    esploso: stato.esploso, gizmo: stato.modo || pezziSel().some(p => p.bloccato) ? null : stato.gizmo, misura: stato.misura, segno: stato.modo === 'accosta' || stato.modo === 'adatta' ? stato.accostaDa : null,
    maniglie: !stato.modo && stato.gizmo !== 'rotate' && selezione().size === 1 && !pezzoSel()?.bloccato,
    bloccati: new Set(stato.progetto.pezzi.filter(p => p.bloccato).map(p => p.id)),
  });
  disegnaAccostato();
  document.querySelector('[data-vista="esploso"]')?.classList.toggle('on', stato.esploso);
  disegnaBarraSel();
  document.querySelector('[data-vista="viti"]')?.classList.toggle('on', stato.mostraViti);
  $('#nome-progetto').textContent = stato.inAttesa ? '—' : stato.progetto.nome;
  document.title = stato.inAttesa ? 'MyPlanMaker' : `${stato.progetto.nome} — MyPlanMaker`;
  disegnaProprieta();
  disegnaPiede();
  aggiornaAttrezzi();
}

// ---------- messaggi ----------
let timerToast;
function avvisa(testo, errore = false, durata = 5000) {
  const t = $('#toast');
  // Con una finestra aperta il resto della pagina non si tocca: l'avviso va dentro la finestra.
  const dlg = [...document.querySelectorAll('dialog[open]')].at(-1) || $('main');
  if (t.parentElement !== dlg) dlg.append(t);
  $('#toast-chiudi').hidden = true;
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
  disegnaBarraSel();
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
  } else if (cmd === 'riempi' || cmd === 'cassetto') {
    if (stato.modo === 'riempi') return esciModo();
    stato.soloCassetto = cmd === 'cassetto';
    stato.modo = 'riempi'; stato.accostaDa = null; stato.accostato = null;
    seleziona(null); aggiorna();
    avvisa(t('Tocca dentro il vano da riempire (la faccia interna di un fianco, il fondo o il retro): trovo io le pareti. Esc per annullare.'), false, 0);
  } else if (cmd === 'accosta' || cmd === 'adatta' || cmd === 'dividi') {
    if (!p) return;
    if (stato.modo === cmd) { esciModo(); return disegnaBarraSel(); }
    stato.modo = cmd;
    aggiornaAttrezzi();
    disegnaBarraSel();
    stato.accostaDa = null;
    stato.accostato = null;
    avvisa(t(cmd === 'accosta'
      ? "Tocca la faccia di «{nome}» da appoggiare, poi la faccia dell'altro pezzo. (Se tocchi subito l'altro pezzo, «{nome}» ci si appoggia senza girarsi.) Esc per annullare."
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
  } else if (cmd === 'blocca') {
    const sel = pezziSel();
    if (!sel.length) return;
    const blocca = !sel.every(x => x.bloccato);
    modifica(() => sel.forEach(x => { if (blocca) x.bloccato = true; else delete x.bloccato; }));
    const intagliati = stato.progetto.pezzi.filter(x => x.intagli?.some(i => sel.some(b => b.id === i.da)));
    avvisa(blocca
      ? t('Bloccato: non si sposta per sbaglio, e i pezzi che lo attraversano ricevono gli intagli da soli.') + (intagliati.length ? ' ' + t('Intagliati: {nomi}.', { nomi: intagliati.map(x => `«${x.nome}»`).join(', ') }) : '')
      : t('Sbloccato: gli intagli che faceva negli altri pezzi sono spariti.'), false, 6000);
  } else if (cmd === 'altro-sel') {
    $('#altro-sel').hidden = !$('#altro-sel').hidden;
    disegnaBarraSel();
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
  if (stato.modo === 'riempi') {
    if (!id) return avvisa(t('Tocca dentro il vano, su un pezzo del mobile. Esc per annullare.'), true, 4000);
    const v = vanoDa(faccia);
    if (!v.ok) return avvisa(v.msg, true, 6000);
    stato.modo = null; aggiornaAttrezzi(); $('#toast').hidden = true;
    return stato.soloCassetto ? apriCassetto(v) : apriVano(v);
  }
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

// Teste del pezzo fissate ad altri pezzi (viti, confirmat, spinotti, angolari…) lungo l'asse 'x' o 'y': Set di
// 'min' / 'max'. Conta solo un'unione sulla testa (o sul bordo) che quell'asse fa muovere, non sulle facce.
function testeVincolate(p, asse) {
  const i = asse === 'y' ? 1 : 0, R = new Matrix4().extractRotation(mod.matrice(p)), inv = R.clone().transpose();
  const e = new Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, 0).applyMatrix4(R), origine = new Vector3(...p.pos), D = mod.dimensioni(p)[asse === 'y' ? 'W' : 'L'];
  const out = new Set();
  for (const g of unioni(stato.progetto).giunti) {
    if (g.a !== p && g.b !== p) continue;
    if (g.escluso || g.tipo === 'cerniere' || g.tipo === 'parte mobile' || !(g.viti?.length || g.angolari)) continue;
    if (Math.abs(g.normale.clone().applyMatrix4(inv).getComponent(i)) < 0.9) continue;
    const altro = g.a === p ? g.b : g.a, B = ingombroMondo(altro);
    const dove = g.viti?.length ? g.viti.reduce((c, v) => c.add(v.testa), new Vector3()).multiplyScalar(1 / g.viti.length) : B.min.clone().add(B.max).multiplyScalar(0.5);
    out.add(dove.sub(origine).dot(e) < D / 2 ? 'min' : 'max');
  }
  return out;
}
// Da che parte cresce o cala il pezzo quando si scrive una misura: dalla testa non fissata con le viti.
function latoDaMuovere(p, asse, predefinito = 'max') {
  const v = testeVincolate(p, asse);
  if (v.has('max') && !v.has('min')) return { lato: 'min', vincolo: true };
  if (v.has('min') && !v.has('max')) return { lato: 'max', vincolo: true };
  return { lato: predefinito, vincolo: false, tutte: v.size === 2 };
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
  const perTagli = p.tagli.some(x => x.n[i] < -1e-6) || !p.tagli.some(x => x.n[i] > 1e-6) ? 'max' : 'min';
  const sc = latoDaMuovere(p, asse === 'y' ? 'y' : 'x', perTagli), lato = sc.lato;
  if (sc.tutte) avvisa(t('Tutte e due le teste sono fissate con le viti: ho mosso la testa B (o il bordo alto). Controlla le unioni.'), false, 6000);
  else if (sc.vincolo) avvisa(t('La testa fissata con le viti è rimasta ferma: il pezzo è cambiato dall\'altra parte.'), false, 4000);
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

// Comandi che lavorano sul pezzo scelto: stanno nella barra della selezione, che resta visibile mentre sono attivi
// (si ripremono per uscire).
const COMANDI_SEL = ['accosta', 'adatta', 'dividi'];
function disegnaBarraSel() {
  const b = $('#barra-sel'), a = $('#altro-sel'), n = selezione().size;
  b.hidden = !n || (!!stato.modo && !COMANDI_SEL.includes(stato.modo));
  if (b.hidden) { a.hidden = true; return; }
  b.querySelector('[data-cmd="sposta"]').classList.toggle('on', stato.gizmo === 'translate' && !stato.modo);
  b.querySelector('[data-cmd="ruota"]').classList.toggle('on', stato.gizmo === 'rotate' && !stato.modo);
  for (const c of COMANDI_SEL) b.querySelector(`[data-cmd="${c}"]`).classList.toggle('on', stato.modo === c);
  b.querySelector('[data-cmd="altro-sel"]').classList.toggle('on', !a.hidden || stato.aggiungiSel);
  a.querySelector('[data-cmd="multipla"]').classList.toggle('on', stato.aggiungiSel);
  a.querySelector('[data-cmd="blocca"]').classList.toggle('on', pezziSel().every(p => p.bloccato));
  b.querySelector('.conta').textContent = n > 1 ? t('{n} pezzi', { n }) : '';
}

// ---------- Modelli ----------
let modelloScelto = 'scaffale', valoriModello = valoriDefault(modello('scaffale'));
// Un materiale del modello: tendina più spessore (pannelli) o sezione (listelli), già scritti con i valori del catalogo.
function campoMateriale(par, v) {
  // Nei modelli si scrivono solo spessori e sezioni: il tipo di legno resta «non specificato» (si sceglie dopo sui pezzi).
  const m = materiale(v), T = valoriModello[par.k + 'T'] || m.T, W = valoriModello[par.k + 'W'] || m.W;
  const num = (k, nome, x) => `<div class="field"><label>${nome}</label><div class="input"><input data-par="${k}" inputmode="decimal" value="${esc(fU(x))}"><small>${U()}</small></div></div>`;
  const nascosto = `<input type="hidden" data-par="${par.k}" value="${esc(v)}">`;
  return m.tipo === 'listello'
    ? nascosto + num(par.k + 'W', t('{nome}: sezione, larghezza', { nome: t(par.nome) }), W) + num(par.k + 'T', t('{nome}: sezione, spessore', { nome: t(par.nome) }), T)
    : nascosto + num(par.k + 'T', t('{nome}: spessore', { nome: t(par.nome) }), T);
}
function campoParametro(par, v) {
  if (par.tipo === 'mat') return campoMateriale(par, v);
  if (par.tipo === 'scelta') return `<div class="field"><label>${t(par.nome)}</label><div class="input"><select data-par="${par.k}">${Object.entries(par.opzioni).map(([k, testo]) => `<option value="${k}" ${k === String(v) ? 'selected' : ''}>${t(testo)}</option>`).join('')}</select><small>▾</small></div></div>`;
  return `<div class="field"><label>${t(par.nome)}</label><div class="input"><input data-par="${par.k}" inputmode="decimal" value="${esc(par.tipo === 'mm' ? fU(v) : f1(v))}"><small>${par.tipo === 'mm' ? U() : ''}</small></div></div>`;
}
function apriModelli() {
  $('#lista-modelli').innerHTML = `<li class="titoletto">${t('Mobili a livelli')}</li>`
    + COMPOSIZIONI.map(c => `<li><button data-composizione="${c.id}" class="mobile-livelli"><b>${esc(t(c.nome))}</b><span>${esc(t(c.descr))}</span></button></li>`).join('')
    + `<li class="titoletto">${t('Altri modelli')}</li>`
    + MODELLI.map(m => `<li ${MOBILI_VECCHI.has(m.id) ? 'hidden' : ''}><button data-modello="${m.id}" class="${m.id === modelloScelto ? 'on' : ''}"><b>${esc(t(m.nome))}</b><span>${esc(t(m.descr))}</span></button></li>`).join('');
  const m = modello(modelloScelto);
  $('#form-modello').innerHTML = `<h3 style="font-size:18px;color:var(--text);margin:0">${esc(t(m.nome))}</h3><p class="nota">${esc(t(m.descr))} ${t('Dopo puoi cambiare ogni pezzo come vuoi.')}</p>
    <div class="griglia">${m.parametri.filter(p => p.tipo !== 'mat').map(p => campoParametro(p, valoriModello[p.k] ?? p.def)).join('')}</div>
    <h3 class="sotto-titolo">${t('Spessori')}</h3>
    <div class="griglia">${m.parametri.filter(p => p.tipo === 'mat').map(p => campoParametro(p, valoriModello[p.k] ?? p.def)).join('')}</div>
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
// Vano del cassetto da un tocco dentro il mobile: dal punto toccato (spostato di poco verso l'interno) si cerca il
// pezzo più vicino in ognuna delle 6 direzioni, con gli ingombri. Le due pareti stanno sull'asse orizzontale chiuso
// da tutti e due i lati, il davanti è il lato aperto dell'altro asse (o quello verso chi guarda); sopra e sotto il
// primo pezzo che si incontra, altrimenti fin dove arrivano le pareti. Funziona con il mobile girato di 90° in 90°.
function vanoDa(faccia) {
  const Q = faccia.punto.clone().addScaledVector(faccia.normale.clone().normalize(), 2);
  const box = stato.progetto.pezzi.map(p => ({ p, B: ingombroMondo(p) }));
  const assi = ['x', 'y', 'z'];
  const colpo = (k, s, filtro = () => true) => {
    let meglio = null;
    for (const { p, B } of box) {
      if (!filtro(B)) continue;
      if (!assi.every(j => j === k || (B.min[j] < Q[j] - 0.5 && B.max[j] > Q[j] + 0.5))) continue;
      const d = s > 0 ? B.min[k] - Q[k] : Q[k] - B.max[k];
      if (d < -0.5) continue;
      if (!meglio || d < meglio.d) meglio = { d, p, B, c: s > 0 ? B.min[k] : B.max[k] };
    }
    return meglio;
  };
  const h = { x: [colpo('x', -1), colpo('x', 1)], z: [colpo('z', -1), colpo('z', 1)] };
  const chiusi = ['x', 'z'].filter(k => h[k][0] && h[k][1]);
  if (!chiusi.length) return { ok: false, msg: t("Non trovo due pareti ai lati di quel punto: tocca dentro il vano, per esempio la faccia interna di un fianco o il fondo.") };
  const occhio = vista.camera.getWorldDirection(new Vector3()).negate(); // verso chi guarda
  let larg, prof;
  if (chiusi.length === 1) { larg = chiusi[0]; prof = larg === 'x' ? 'z' : 'x'; }
  else { prof = Math.abs(occhio.x) > Math.abs(occhio.z) ? 'x' : 'z'; larg = prof === 'x' ? 'z' : 'x'; }
  const [pa, pb] = h[larg], [dietro, davanti] = h[prof];
  // verso del davanti: il lato aperto, altrimenti quello verso chi guarda
  const segno = !davanti && dietro ? 1 : davanti && !dietro ? -1 : (occhio[prof] >= 0 ? 1 : -1);
  const pareti = [pa.B, pb.B];
  const fronte = segno > 0 ? Math.min(...pareti.map(B => B.max[prof])) : Math.max(...pareti.map(B => B.min[prof]));
  const fondoMobile = segno > 0 ? (dietro ? dietro.c : Math.max(...pareti.map(B => B.min[prof]))) : (davanti ? davanti.c : Math.min(...pareti.map(B => B.max[prof])));
  const giu = colpo('y', -1), su = colpo('y', 1);
  const y0 = giu ? giu.c : Math.max(...pareti.map(B => B.min.y)), y1 = su ? su.c : Math.min(...pareti.map(B => B.max.y));
  // vano descritto girato col davanti verso +Z: angolo intorno alla verticale e coordinate nel sistema girato
  const f = new Vector3(prof === 'x' ? segno : 0, 0, prof === 'z' ? segno : 0), ruota = Math.atan2(f.x, f.z);
  const u = new Vector3(Math.cos(ruota), 0, -Math.sin(ruota));
  const lato = B => (larg === 'x' ? [B.min.x, B.max.x] : [B.min.z, B.max.z]);
  const interno = [pa.c, pb.c].map(c => { const q = new Vector3(); q[larg] = c; return q.dot(u); }).sort((a, b) => a - b);
  const zf = (() => { const q = new Vector3(); q[prof] = fronte; return q.dot(f); })(), zb = (() => { const q = new Vector3(); q[prof] = fondoMobile; return q.dot(f); })();
  const spessore = Math.min(...pareti.map(B => { const [a, b] = lato(B); return b - a; }));
  if (interno[1] - interno[0] < 60) return { ok: false, msg: t('Spazio troppo stretto.') };
  const r2 = x => Math.round(x * 100) / 100;
  // Fin dove arrivano le ante (sistema girato): un fianco esterno si copre tutto (3 mm di fuga), una parete condivisa
  // con un altro vano (divisorio, ripiano) solo fino a metà. «Esterno» = nessun pezzo subito oltre, che arrivi davanti.
  const su0 = u[larg], uInt = B => { const [a, b] = lato(B); return [Math.min(a * su0, b * su0), Math.max(a * su0, b * su0)]; };
  const davantiB = B => (segno > 0 ? B.max[prof] >= fronte - 5 : B.min[prof] <= fronte + 5);
  const altri = escluso => box.filter(x => x.p !== escluso && davantiB(x.B));
  const pareteU = [pa, pb].map(w => ({ w, i: uInt(w.B) })).sort((a, b) => a.i[0] - b.i[0]);
  const spazioY = B => B.max.y > y0 + 1 && B.min.y < y1 - 1;
  const esternoU = (w, verso) => !altri(w.w.p).some(({ B }) => {
    if (!spazioY(B)) return false;
    const i = uInt(B);
    return verso < 0 ? i[1] <= w.i[0] + 0.5 && i[1] >= w.i[0] - 100 : i[0] >= w.i[1] - 0.5 && i[0] <= w.i[1] + 100;
  });
  const dentroU = B => { const i = uInt(B); return i[1] > interno[0] + 1 && i[0] < interno[1] - 1; };
  const esternoY = (c, verso) => !altri(c.p).some(({ B }) => dentroU(B) && (verso < 0 ? B.max.y <= c.B.min.y + 0.5 && B.max.y >= c.B.min.y - 100 : B.min.y >= c.B.max.y - 0.5 && B.min.y <= c.B.max.y + 100));
  const [sx, dx] = pareteU, sxEst = esternoU(sx, -1), dxEst = esternoU(dx, 1);
  // In altezza le ante si fermano ai pezzi che arrivano davanti (base, cielo, traversi), non ai ripiani arretrati.
  const giuF = colpo('y', -1, davantiB), suF = colpo('y', 1, davantiB);
  const giuEst = giuF ? esternoY(giuF, -1) : true, suEst = suF ? esternoY(suF, 1) : true;
  const yA = giuF ? giuF.c : Math.max(...pareti.map(B => B.min.y)), yB = suF ? suF.c : Math.min(...pareti.map(B => B.max.y));
  const copre = {
    x0: sxEst ? sx.i[0] + 3 : (sx.i[0] + sx.i[1]) / 2 + 1.5,
    x1: dxEst ? dx.i[1] - 3 : (dx.i[0] + dx.i[1]) / 2 - 1.5,
    y0: giuF ? (giuEst ? giuF.B.min.y + 1.5 : (giuF.B.min.y + giuF.B.max.y) / 2 + 1.5) : yA + 1.5,
    y1: suF ? (suEst ? suF.B.max.y - 1.5 : (suF.B.min.y + suF.B.max.y) / 2 - 1.5) : yB - 1.5,
  };
  return { ok: true, x0: r2(interno[0]), x1: r2(interno[1]), y0: r2(y0), y1: r2(y1), zFronte: r2(zf), profondita: r2(zf - zb), spessore: r2(spessore), ruota, pareti: [pa.p.nome, pb.p.nome],
    copre: Object.fromEntries(Object.entries(copre).map(([k, x]) => [k, r2(x)])), cerniere: { sx: sxEst ? 'sovrapposta' : 'semi', dx: dxEst ? 'sovrapposta' : 'semi' }, retro: !!(segno > 0 ? dietro : davanti) };
}

const valoriGuida = tipo => ({ ...TIPI_GUIDA[tipo] });
function apriCassetto(v) {
  cassettoTra = v;
  disegnaFormCassetto('sfere');
  $('#dlg-cassetto').showModal();
}
function disegnaFormCassetto(tipo, prima = {}) {
  const v = cassettoTra, gd = valoriGuida(tipo), lg = lunghezzaPer(tipo, v.profondita);
  const campo = (k, nome, val, u = U()) => `<div class="field"><label>${t(nome)}</label><div class="input"><input data-cas="${k}" inputmode="decimal" value="${esc(u === U() ? fU(val) : val)}"><small>${u}</small></div></div>`;
  const opz = (k, voci, sel) => Object.entries(voci).map(([a, b]) => `<option value="${a}" ${a === sel ? 'selected' : ''}>${esc(b)}</option>`).join('');
  $('#form-cassetto').innerHTML = `<p>${t('Vano tra «{a}» e «{b}»: largo <b>{largo}</b>, profondo {prof}.', { a: esc(v.pareti[0]), b: esc(v.pareti[1]), largo: mod.fmtU(v.x1 - v.x0, true), prof: mod.fmtU(v.profondita, true) })}</p>
    <div class="row">${campo('y0', 'Dal basso (Y)', prima.y0 ?? v.y0)}${campo('y1', 'Fino a (Y)', prima.y1 ?? v.y1)}</div>
    <div class="row"><div class="field"><label>${t('Quanti cassetti')}</label><div class="input"><input data-cas="n" inputmode="numeric" value="${prima.n ?? Math.max(1, Math.min(6, Math.floor((v.y1 - v.y0) / 160)))}"></div></div>
    <div class="field"><label>${t('Frontali')}</label><div class="input"><select data-cas="frontale">${opz('frontale', { sovrapposto: t('Sovrapposti ai fianchi'), filo: t('A filo, dentro il vano') }, prima.frontale || 'sovrapposto')}</select><small>▾</small></div></div></div>
    <div class="group"><h3>${t('Guide')}</h3>
      <div class="field"><label>${t('Tipo di guida')}</label><div class="input"><select data-cas="tipo">${opz('tipo', Object.fromEntries(Object.entries(TIPI_GUIDA).map(([k, x]) => [k, t(x.nome)])), tipo)}</select><small>▾</small></div></div>
      <div class="row">${campo('gioco', 'Gioco per lato', gd.gioco)}${campo('lunghezza', tipo === 'legno' ? 'Lunghezza del cassetto' : 'Lunghezza delle guide', lg || 0)}</div>
      ${tipo === 'sotto' ? `<div class="row">${campo('sotto', 'Spazio sotto il cassetto', gd.sotto)}<div></div></div>` : ''}
      ${tipo === 'legno' ? `<div class="row">${campo('lAlto', 'Listello: altezza', gd.listello[0])}${campo('lLargo', 'Listello: larghezza', gd.listello[1])}</div>` : ''}
      <p class="nota">${t(tipo === 'sfere' ? 'Il gioco è lo spazio tra il fianco del cassetto e la parete, dove sta la guida (di solito 12,5 mm). Lunghezza scelta dalla profondità: puoi scriverne un\'altra.' : tipo === 'sotto' ? 'Guide nascoste: guarda nel foglio del produttore gioco laterale e spazio sotto il cassone, cambiano da modello a modello.' : 'Due listelli avvitati alle pareti, il cassetto ci scorre sopra: conviene cera o paraffina. Il gioco è per lato.')}</p></div>
    <div class="row">${campo('spCassone', 'Spessore del cassone', prima.spCassone || 12)}${campo('spFrontale', 'Spessore dei frontali', prima.spFrontale || 18)}</div>
    <p class="nota">${t('Fuga tra i frontali 3 mm. Ogni cassetto è una parte mobile: niente viti verso il mobile.')}</p>
    <div class="azioni"><button class="btn" data-chiudi-cassetto>${t('Annulla')}</button><button class="btn primary" id="crea-cassetti">${t('Crea i cassetti')}</button></div>`;
}
function creaCassettiOra() {
  const q = k => document.querySelector(`#form-cassetto [data-cas="${k}"]`)?.value, mm = k => (q(k) === undefined ? null : mod.leggiMisura(q(k)));
  const tipo = q('tipo');
  const guida = { tipo, gioco: mm('gioco'), lunghezza: mm('lunghezza') || null, ...(tipo === 'sotto' ? { sotto: mm('sotto') } : {}), ...(tipo === 'legno' ? { listello: [mm('lAlto'), mm('lLargo')] } : {}) };
  const v = { ...cassettoTra, y0: mm('y0'), y1: mm('y1'), n: numero(q('n')), frontale: q('frontale'), matCassone: 'pan', matFrontale: 'pan', extraCassone: { spessore: mm('spCassone') }, extraFrontale: { spessore: mm('spFrontale') }, spessoreFianchi: cassettoTra.spessore, guida };
  if ([v.y0, v.y1, v.n].some(x => x === null) || v.y1 <= v.y0) return avvisa(t('Controlla le misure: «Fino a» deve essere più in alto di «Dal basso».'), true);
  if (guida.gioco === null || guida.gioco < 0 || guida.gioco > 50 || (guida.listello && guida.listello.some(x => !(x > 0))) || (tipo === 'sotto' && !(guida.sotto >= 0))) return avvisa(t('Controlla le misure delle guide.'), true);
  const prova = structuredClone(stato.progetto), r = creaCassetti(prova, v);
  if (!r.ok) return avvisa(r.msg, true, 8000);
  modifica(() => { const x = creaCassetti(stato.progetto, v); stato.multi = new Set(x.nuovi.map(p => p.id)); stato.sel = x.nuovi.at(-1).id; });
  $('#dlg-cassetto').close();
  avvisa(r.tipo === 'legno' ? tn(v.n, 'Creato il cassetto su listelli di scorrimento.', 'Creati {n} cassetti su listelli di scorrimento.') : tn(v.n, 'Creato il cassetto con guide da {g} mm.', 'Creati {n} cassetti con guide da {g} mm.', { g: r.guida }));
}

// ---------- Compositore (mobile a livelli) ----------
// Si compone il mobile a livelli con l'anteprima di fronte; «Aggiungi» crea pezzi veri. La composizione resta in
// progetto.composizioni[id] e i pezzi hanno p.comp = id: «Ricomponi» la riapre e ricostruisce il mobile dov'è.
let compo = null, compoSel = { m: 0, c: 0, l: 0 }, compoId = null;
const MOBILI_VECCHI = new Set(['libreria', 'base', 'pensile', 'cassettiera']); // ora nella galleria dei mobili a livelli
function apriCompositore(c, id = null) {
  compo = normalizza(c); compoId = id;
  compoSel = { m: 0, c: 0, l: 0 };
  disegnaCompositore();
  $('#dlg-compositore').showModal();
}
const campoComp = (attr, nome, v, u = U()) => `<div class="field"><label>${t(nome)}</label><div class="input"><input ${attr} inputmode="decimal" value="${esc(v)}"><small>${u}</small></div></div>`;
const stepperComp = (k, nome, v, min = 0) => `<div class="field"><label>${t(nome)}</label><div class="stepper"><button class="btn icon" data-meno="${k}" data-min="${min}">−</button><div class="input"><input data-l="${k}" inputmode="numeric" value="${v}"></div><button class="btn icon" data-piu="${k}">+</button></div></div>`;
const segComp = (attr, voci, attivo) => `<div class="seg">${voci.map(([k, x]) => `<button ${attr}="${k}" class="${String(attivo) === String(k) ? 'on' : ''}">${x}</button>`).join('')}</div>`;
const moduloSel = () => compo.moduli[compoSel.m];
const colonnaSel = () => moduloSel()?.colonne?.[compoSel.c];
const livelloSel = () => colonnaSel()?.livelli?.[compoSel.l];

function editorLivello(l, h) {
  const altezza = `<div class="field"><label>${t('Altezza')}</label>${segComp('data-hmodo', [['auto', `${t('Auto')}${l.h === 'auto' && h ? ` · ${fU(h)}` : ''}`], ['mm', t('Misura')]], l.h === 'auto' ? 'auto' : 'mm')}</div>
      ${l.h !== 'auto' ? campoComp('data-l="h"', 'Altezza utile', fU(l.h)) : ''}`;
  const tipo = l.tipo === 'cassetti' ? `<div class="row">${stepperComp('n', 'Quanti cassetti', l.n || 1, 1)}<div class="field"><label>${t('Guide')}</label><div class="input"><select data-l="guida">${Object.entries(TIPI_GUIDA).map(([k, x]) => `<option value="${k}" ${k === (l.guida || 'sfere') ? 'selected' : ''}>${esc(t(x.nome))}</option>`).join('')}</select><small>▾</small></div></div></div>`
    : l.tipo === 'giorno' ? stepperComp('ripiani', 'Ripiani', l.ripiani || 0)
    : `<div class="row"><div class="field"><label>${t('Ante')}</label>${segComp('data-ante-comp', [['auto', t('Auto')], ['1', '1'], ['2', '2']], l.ante || 'auto')}</div>${stepperComp('ripiani', 'Ripiani dentro', l.ripiani || 0)}</div>`;
  return `<div class="editor-livello">${altezza}${tipo}</div>`;
}

function htmlMobileComp(M, qm) {
  const nc = M.colonne.length, ci = Math.min(compoSel.c, nc - 1), col = M.colonne[ci], qc = qm?.colonne?.[ci];
  const descr = (l, k) => { const x = qc?.livelli?.[k]; return `${l.h === 'auto' ? t('auto') + ' · ' : ''}${x ? fU(x.h) : '—'} ${U()}`; };
  const extra = l => l.tipo === 'cassetti' ? tn(l.n || 1, '{n} cassetto', '{n} cassetti') : l.tipo === 'giorno' ? tn(l.ripiani || 0, '{n} ripiano', '{n} ripiani') : `${l.ante === 'auto' ? t('ante') : tn(+l.ante, '{n} anta', '{n} ante')}${l.ripiani ? ' · ' + tn(l.ripiani, '{n} ripiano', '{n} ripiani') : ''}`;
  const n = col.livelli.length;
  const righe = col.livelli.map((l, i) => ({ l, i })).reverse().map(({ l, i }) => `<li class="${i === compoSel.l ? 'scelto' : ''}"><div class="testa-livello"><button class="nome-livello" data-sel-livello="${i}"><b>${esc(t(TIPI_LIVELLO[l.tipo].nome))}</b><span>${extra(l)} · ${descr(l, i)}</span></button>
      <button class="btn icon" data-su="${i}" title="${t('Più in alto')}" ${i < n - 1 ? '' : 'disabled'}>↑</button><button class="btn icon" data-giu="${i}" title="${t('Più in basso')}" ${i > 0 ? '' : 'disabled'}>↓</button>
      <button class="btn icon danger" data-togli-livello="${i}" title="${t('Togli')}">✕</button></div>
      ${i === compoSel.l ? editorLivello(l, qc?.livelli?.[i]?.h) : ''}</li>`).join('');
  const colonne = nc > 1 ? `<div class="schede-colonne">${M.colonne.map((c, k) => `<span class="scheda ${k === ci ? 'on' : ''}"><button data-sel-col="${k}">${t('Colonna {n}', { n: k + 1 })}<small>${c.L === 'auto' ? t('auto') + ' · ' : ''}${qm?.colonne?.[k] ? fU(qm.colonne[k].w) : '—'}</small></button><button class="togli" data-togli-col="${k}" title="${t('Togli')}">✕</button></span>`).join('')}</div>
      <div class="field"><label>${t('Larghezza della colonna {n}', { n: ci + 1 })}</label>${segComp('data-lmodo', [['auto', `${t('Auto')}${col.L === 'auto' && qc ? ` · ${fU(qc.w)}` : ''}`], ['mm', t('Misura')]], col.L === 'auto' ? 'auto' : 'mm')}</div>
      ${col.L !== 'auto' ? campoComp('data-col="L"', 'Larghezza utile', fU(col.L)) : ''}` : '';
  return `<div class="row3">${campoComp('data-m="L"', 'Larghezza', fU(M.L))}${campoComp('data-m="H"', 'Altezza', fU(M.H))}${campoComp('data-m="P"', 'Profondità', fU(M.P))}</div>
    <div class="row"><div class="field"><label>${t('Zoccolo')}</label>${segComp('data-zoccolo', [['0', t('No')], ['1', t('Sì')]], M.zoccolo ? 1 : 0)}</div>${M.zoccolo ? campoComp('data-m="zoccolo"', 'Altezza zoccolo', fU(M.zoccolo)) : '<div></div>'}</div>
    <div class="field"><label>${t('Piano sopra')}</label>${segComp('data-piano', [['0', t('No')], ['1', t('Sì')]], M.piano ? 1 : 0)}</div>
    ${M.piano ? `<div class="row3">${campoComp('data-m="pianoH"', 'Spessore', fU(M.piano.h))}${campoComp('data-m="pianoSporge"', 'Sporge davanti', fU(M.piano.sporge || 0))}${campoComp('data-m="pianoLati"', 'Sporge ai lati', fU(M.piano.lati || 0))}</div>` : ''}
    <div class="titolo-riga"><h3>${nc > 1 ? t('Colonne') : t('Livelli, dall\'alto')}</h3><button class="btn" data-aggiungi-col>+ ${t('Colonna')}</button></div>
    ${colonne}
    ${nc > 1 ? `<h3>${t('Livelli della colonna {n}, dall\'alto', { n: ci + 1 })}</h3>` : ''}
    <ul class="livelli">${righe}</ul>
    <div class="aggiungi-livello"><span class="nota">${t('Aggiungi:')}</span>${['cassetti', 'giorno', 'ante'].map(k => `<button class="btn" data-aggiungi="${k}">+ ${t(TIPI_LIVELLO[k].nome)}</button>`).join('')}</div>`;
}

function htmlScrivaniaComp(S, mi) {
  const vicino = d => { const M = compo.moduli[mi + d]; return M && M.tipo === 'mobile' && M.H >= S.H - 0.5 ? M : null; };
  const sostegno = (lato, d) => vicino(d)
    ? `<p class="nota">${t('Si appoggia al mobile accanto ({n}).', { n: mi + d + 1 })}</p>`
    : segComp('data-sostegno', [[`${lato}:fianco`, t('Fianco')], [`${lato}:gambe`, t('Gambe')]], `${lato}:${S[lato]}`);
  const C = S.cassettiera;
  return `<div class="row3">${campoComp('data-m="L"', 'Lunghezza', fU(S.L))}${campoComp('data-m="H"', 'Altezza del piano', fU(S.H))}${campoComp('data-m="P"', 'Profondità', fU(S.P))}</div>
    ${campoComp('data-m="Tp"', 'Spessore del piano', fU(S.Tp))}
    <div class="row"><div class="field"><label>${t('A sinistra')}</label>${sostegno('sx', -1)}</div><div class="field"><label>${t('A destra')}</label>${sostegno('dx', 1)}</div></div>
    <div class="field"><label>${t('Cassettiera sotto il piano')}</label>${segComp('data-cassettiera', [['no', t('No')], ['sx', t('A sinistra')], ['dx', t('A destra')]], C ? C.lato : 'no')}</div>
    ${C ? `<div class="row">${stepperComp('cassN', 'Quanti cassetti', C.n || 3, 1)}${campoComp('data-m="cassL"', 'Larghezza', fU(C.L))}</div>` : ''}`;
}

function disegnaCompositore() {
  const c = compo, q = calcola(c), nm = c.moduli.length;
  compoSel.m = Math.min(compoSel.m, nm - 1);
  const M = moduloSel(), qm = q.moduli[compoSel.m];
  const nomeMod = (X, i) => `${t(X.tipo === 'scrivania' ? 'Scrivania' : 'Mobile')} ${i + 1}`;
  const moduli = nm > 1 ? `<div class="schede-colonne moduli">${c.moduli.map((X, i) => `<span class="scheda ${i === compoSel.m ? 'on' : ''}"><button data-sel-mod="${i}">${nomeMod(X, i)}<small>${fU(X.L)} × ${fU(X.H)}</small></button><button class="togli" data-togli-mod="${i}" title="${t('Togli')}">✕</button></span>`).join('')}</div>` : '';
  $('#comp-sx').innerHTML = `<div class="row"><div class="field"><label>${t('Nome')}</label><div class="input"><input data-c="nome" value="${esc(c.nome)}"></div></div>${campoComp('data-c="T"', 'Spessore pannelli', fU(c.T))}</div>
    <div class="field"><label>${t('Schienale')}</label>${segComp('data-schienale', [['1', t('Sì')], ['0', t('No')]], c.schienale ? 1 : 0)}</div>
    ${moduli}
    ${M ? (M.tipo === 'scrivania' ? htmlScrivaniaComp(M, compoSel.m) : htmlMobileComp(M, qm)) : ''}
    <div class="aggiungi-livello affianca"><span class="nota">${t('Affianca a destra:')}</span><button class="btn" data-affianca="mobile">+ ${t('Mobile')}</button><button class="btn" data-affianca="scrivania">+ ${t('Scrivania')}</button></div>`;
  disegnaAnteprimaComp();
}
function disegnaAnteprimaComp() {
  const q = calcola(compo);
  $('#comp-fronte').innerHTML = svgFronte(compo, compoSel);
  const e = $('#comp-esito');
  e.className = q.ok ? 'ok' : 'avviso';
  e.textContent = q.ok ? t('{l} × {h} × {p} {u}. Tocca un livello nel disegno per cambiarlo.', { l: fU(q.L), h: fU(q.H), p: fU(q.Pmax), u: U() }) : q.errori.join(' ');
  $('#comp-ok').disabled = !q.ok;
  $('#comp-ok').textContent = compoId ? t('Aggiorna il mobile') : t('Aggiungi al progetto');
}
// Campi scritti: si aggiorna subito l'anteprima (e il resto quando si esce dal campo).
function leggiCampoComp(el) {
  const misura = x => mod.leggiMisura(x), M = moduloSel();
  if (el.dataset.c) {
    if (el.dataset.c === 'nome') { compo.nome = el.value; return; }
    const v = misura(el.value); if (v && v > 0) compo.T = v;
  } else if (el.dataset.m && M) {
    const k = el.dataset.m, v = misura(el.value);
    if (v === null || v < 0) return;
    if (k === 'pianoH' && M.piano) M.piano.h = v || M.piano.h;
    else if (k === 'pianoSporge' && M.piano) M.piano.sporge = v;
    else if (k === 'pianoLati' && M.piano) M.piano.lati = v;
    else if (k === 'cassL' && M.cassettiera) M.cassettiera.L = v || M.cassettiera.L;
    else if (k === 'zoccolo') M.zoccolo = v;
    else if (v > 0) M[k] = v;
  } else if (el.dataset.col) {
    const v = misura(el.value); if (v && v > 0) colonnaSel().L = v;
  } else if (el.dataset.l) {
    const k = el.dataset.l;
    if (k === 'cassN') { const v = Math.round(numero(el.value)); if (v >= 1 && M.cassettiera) M.cassettiera.n = Math.min(v, 8); return; }
    const l = livelloSel();
    if (!l) return;
    if (k === 'guida') l.guida = el.value;
    else if (k === 'n' || k === 'ripiani') { const v = Math.round(numero(el.value)); if (Number.isFinite(v) && v >= (k === 'n' ? 1 : 0)) l[k] = Math.min(v, 12); }
    else { const v = misura(el.value); if (v !== null && v > 0) l[k] = v; }
  }
}
function eventiCompositore() {
  const d = $('#dlg-compositore');
  d.addEventListener('input', e => { if (e.target.matches('input, select')) { leggiCampoComp(e.target); disegnaAnteprimaComp(); } });
  d.addEventListener('change', e => { if (e.target.matches('input, select')) { leggiCampoComp(e.target); disegnaCompositore(); } });
  d.addEventListener('click', e => {
    const tocco = e.target.closest('#comp-fronte [data-m]');
    if (tocco) {
      compoSel = { m: +tocco.dataset.m, c: tocco.dataset.c !== undefined ? +tocco.dataset.c : 0, l: tocco.dataset.l !== undefined ? +tocco.dataset.l : -1 };
      return disegnaCompositore();
    }
    const b = e.target.closest('button');
    if (!b) return;
    const c = compo, M = moduloSel(), col = colonnaSel(), l = livelloSel(), ds = b.dataset;
    const fatto = () => disegnaCompositore();
    if (ds.selMod) { compoSel = { m: +ds.selMod, c: 0, l: 0 }; return fatto(); }
    if (ds.togliMod) { c.moduli.splice(+ds.togliMod, 1); compoSel = { m: 0, c: 0, l: 0 }; return fatto(); }
    if (ds.affianca) { c.moduli.push(nuovoModulo(ds.affianca)); compoSel = { m: c.moduli.length - 1, c: 0, l: 0 }; return fatto(); }
    if (ds.schienale) { c.schienale = ds.schienale === '1'; return fatto(); }
    if (ds.zoccolo && M) { M.zoccolo = ds.zoccolo === '1' ? 60 : 0; return fatto(); }
    if (ds.piano && M) { M.piano = ds.piano === '1' ? { h: 30, sporge: 20, lati: 0 } : null; return fatto(); }
    if (ds.sostegno && M) { const [lato, v] = ds.sostegno.split(':'); M[lato] = v; return fatto(); }
    if (ds.cassettiera && M) { M.cassettiera = ds.cassettiera === 'no' ? null : { n: 3, L: 420, ...(M.cassettiera || {}), lato: ds.cassettiera }; return fatto(); }
    if (ds.selCol) { compoSel = { ...compoSel, c: +ds.selCol, l: 0 }; return fatto(); }
    if (ds.togliCol && M) { if (M.colonne.length > 1) M.colonne.splice(+ds.togliCol, 1); compoSel = { ...compoSel, c: 0, l: 0 }; return fatto(); }
    if (b.hasAttribute('data-aggiungi-col') && M) { M.colonne.push(nuovaColonna()); compoSel = { ...compoSel, c: M.colonne.length - 1, l: 0 }; return fatto(); }
    if (ds.lmodo && col) { col.L = ds.lmodo === 'auto' ? 'auto' : Math.round(calcola(c).moduli[compoSel.m].colonne[compoSel.c].w || 400); return fatto(); }
    if (ds.selLivello) { compoSel = { ...compoSel, l: +ds.selLivello === compoSel.l ? -1 : +ds.selLivello }; return fatto(); }
    if (ds.hmodo && l) { l.h = ds.hmodo === 'auto' ? 'auto' : Math.round(calcola(c).moduli[compoSel.m].colonne[compoSel.c].livelli[compoSel.l]?.h || 300); return fatto(); }
    if (ds.anteComp && l) { l.ante = ds.anteComp; return fatto(); }
    if (ds.piu || ds.meno) {
      const k = ds.piu || ds.meno, dir = ds.piu ? 1 : -1;
      if (k === 'cassN' && M?.cassettiera) M.cassettiera.n = Math.max(1, Math.min(8, (M.cassettiera.n || 3) + dir));
      else if (l) l[k] = Math.max(+(ds.min || 0), Math.min(12, (l[k] || 0) + dir));
      return fatto();
    }
    if ((ds.su || ds.giu) && col) {
      const i = +(ds.su || ds.giu), j = ds.su ? i + 1 : i - 1;
      [col.livelli[i], col.livelli[j]] = [col.livelli[j], col.livelli[i]]; compoSel = { ...compoSel, l: j }; return fatto();
    }
    if (ds.togliLivello && col) { col.livelli.splice(+ds.togliLivello, 1); compoSel = { ...compoSel, l: -1 }; return fatto(); }
    if (ds.aggiungi && col) { col.livelli.push(nuovoLivello(ds.aggiungi)); compoSel = { ...compoSel, l: col.livelli.length - 1 }; return fatto(); }
    if (b.id === 'comp-ok') confermaCompositore();
  });
}
// Firma di un mobile composto: pezzi e loro posizione rispetto al fianco sinistro (rifId). Se cambia, qualcuno
// ha modificato a mano i pezzi del mobile.
function firmaMobile(pr, id) {
  const cp = pr.composizioni?.[id], rif = cp && pr.pezzi.find(p => p.id === cp.rifId);
  if (!rif) return '?';
  const inv = mod.matrice(rif).clone().invert();
  return pr.pezzi.filter(p => p.comp === id).map(p => {
    const e = inv.clone().multiply(mod.matrice(p)).elements.map((v, i) => Math.round(v * (i >= 12 ? 10 : 1000)) / (i >= 12 ? 10 : 1000) || 0);
    return JSON.stringify([p.nome, p.L, p.W, p.D, p.r, p.spessore, p.sezione, p.forma, p.mat, p.tagli.length, p.ferramenta || [], p.lavorazioni || [], e]);
  }).sort().join('|');
}
// Dove sta il mobile: matrice dal sistema del mobile al mondo (dal fianco sinistro, o quella salvata).
function posizioneMobile(pr, id) {
  const cp = pr.composizioni[id], rif = pr.pezzi.find(p => p.id === cp.rifId);
  return rif ? mod.matrice(rif).clone().multiply(new Matrix4().fromArray(cp.rifCan).invert()) : new Matrix4().fromArray(cp.M);
}
function confermaCompositore() {
  const pr = stato.progetto, prova = structuredClone(pr), r0 = genera(prova, compo, 'prova');
  if (!r0.ok) return avvisa(r0.msg, true, 8000);
  if (compoId && pr.composizioni?.[compoId] && firmaMobile(pr, compoId) !== pr.composizioni[compoId].firma
    && !confirm(t('Alcuni pezzi di questo mobile sono stati cambiati a mano: ricomponendolo quei cambi si perdono (puoi sempre annullare con ↶). Continuo?'))) return;
  const id = compoId || 'mobile-' + mod.nuovoId(), aggiorna = !!compoId;
  modifica(() => {
    let M;
    if (aggiorna && pr.composizioni?.[id]) { M = posizioneMobile(pr, id); pr.pezzi = pr.pezzi.filter(p => p.comp !== id); }
    else M = new Matrix4().makeTranslation(pr.pezzi.length ? Math.round(Math.max(...pr.pezzi.map(x => ingombroMondo(x).max.x)) + 200) : 0, 0, 0);
    const r = genera(pr, compo, id), rif = r.pezzi[0], rifCan = mod.matrice(rif).toArray();
    for (const p of r.pezzi) mod.trasforma(p, M);
    pr.composizioni = { ...(pr.composizioni || {}), [id]: { ...structuredClone(compo), rifId: rif.id, rifCan, M: M.toArray() } };
    pr.composizioni[id].firma = firmaMobile(pr, id);
    stato.multi = new Set(r.pezzi.map(p => p.id)); stato.sel = rif.id;
  });
  $('#dlg-compositore').close();
  vista.vista(vista.nomeVista);
  avvisa(aggiorna ? t('Mobile «{nome}» ricomposto.', { nome: compo.nome }) : t('Aggiunto «{nome}»: ogni pezzo ora si cambia come vuoi. Per cambiare i livelli: tocca un pezzo del mobile → Ricomponi.', { nome: compo.nome }), false, 7000);
}
function ricomponi(id) {
  const cp = stato.progetto.composizioni?.[id];
  if (!cp) return avvisa(t('Non trovo la composizione di questo mobile.'), true);
  const { rifId, rifCan, M, firma, ...c } = cp;
  apriCompositore(structuredClone(c), id);
}

// ---------- Riempi il vano ----------
// Un tocco dentro un vano (comando Riempi) → ripiani, divisori, schienale, ante o cassetti già a misura del vano.
// I pezzi si costruiscono nel sistema girato del vano (davanti verso +Z, vedi vanoDa) e poi si girano al loro posto.
let vanoScelto = null, sceltaVano = 'ripiani';
const SCELTE_VANO = { ripiani: tr('Ripiani'), divisori: tr('Divisori'), schienale: tr('Schienale'), ante: tr('Ante'), cassetti: tr('Cassetti') };
function apriVano(v) {
  vanoScelto = v;
  disegnaFormVano();
  $('#dlg-vano').showModal();
}
function valoriVano() {
  const q = k => document.querySelector(`#form-vano [data-vano="${k}"]`);
  return { n: Math.max(1, Math.min(20, Math.round(numero(q('n')?.value) || 1))), T: mod.leggiMisura(q('T')?.value ?? '') || vanoScelto.spessore, ante: q('ante')?.dataset.valore || '1' };
}
function disegnaFormVano(prima = {}) {
  const v = vanoScelto, s = sceltaVano, largo = v.x1 - v.x0, alto = v.y1 - v.y0;
  const T = prima.T ?? v.spessore, n = prima.n ?? 1, ante = prima.ante ?? (largo > 600 ? '2' : '1');
  const quanti = `<div class="field"><label>${t('Quanti')}</label><div class="stepper"><button class="btn icon" data-vano-meno>−</button><div class="input"><input data-vano="n" inputmode="numeric" value="${n}"></div><button class="btn icon" data-vano-piu>+</button></div></div>`;
  const spessore = `<div class="field"><label>${t('Spessore')}</label><div class="input"><input data-vano="T" inputmode="decimal" value="${esc(fU(T))}"><small>${U()}</small></div></div>`;
  const corpo = s === 'cassetti' ? `<p class="nota">${t('Guide, numero dei cassetti e spessori nel passo dopo.')}</p>`
    : s === 'ante' ? `<div class="field"><label>${t('Quante ante')}</label><div class="seg" data-vano="ante" data-valore="${ante}"><button data-ante="1" class="${ante === '1' ? 'on' : ''}">${t('1 anta')}</button><button data-ante="2" class="${ante === '2' ? 'on' : ''}">${t('2 ante')}</button></div></div>${spessore}`
    : s === 'schienale' ? spessore : `<div class="row">${quanti}${spessore}</div>`;
  $('#form-vano').innerHTML = `<p>${t('Vano tra «{a}» e «{b}»: largo <b>{largo}</b>, alto <b>{alto}</b>, profondo {prof}.', { a: esc(v.pareti[0]), b: esc(v.pareti[1]), largo: mod.fmtU(largo, true), alto: mod.fmtU(alto, true), prof: mod.fmtU(v.profondita, true) })}</p>
    <div class="seg scelte-vano">${Object.entries(SCELTE_VANO).map(([k, x]) => `<button data-scelta-vano="${k}" class="${k === s ? 'on' : ''}">${t(x)}</button>`).join('')}</div>
    ${corpo}<div id="esito-vano" class="ok"></div>
    <div class="azioni"><button class="btn" data-chiudi-vano>${t('Annulla')}</button><button class="btn primary" id="vano-ok">${s === 'cassetti' ? t('Continua') : t('Aggiungi')}</button></div>`;
  anteprimaVano();
}
// Pezzi per la scelta attuale, nel sistema girato del vano: [{ nome, L, W, T, rot, pos, ... }] oppure { errore }.
function pezziVano() {
  const v = vanoScelto, { n, T, ante } = valoriVano(), largo = v.x1 - v.x0, alto = v.y1 - v.y0, P = v.profondita, zf = v.zFronte;
  if (sceltaVano === 'ripiani') {
    const passo = (alto - n * T) / (n + 1);
    if (passo < 20) return { errore: t('Troppi ripiani per questa altezza.') };
    return { luce: passo, pezzi: Array.from({ length: n }, (_, i) => ({ nome: tr('Ripiano'), L: largo, W: P, T, rot: 'orizzontale', pos: [v.x0, v.y0 + (i + 1) * passo + i * T, zf] })) };
  }
  if (sceltaVano === 'divisori') {
    const passo = (largo - n * T) / (n + 1);
    if (passo < 20) return { errore: t('Troppi divisori per questa larghezza.') };
    return { luce: passo, pezzi: Array.from({ length: n }, (_, i) => ({ nome: tr('Divisorio'), L: alto, W: P, T, rot: 'fianco', pos: [v.x0 + (i + 1) * passo + (i + 1) * T, v.y0, zf] })) };
  }
  if (sceltaVano === 'schienale') {
    if (T >= P) return { errore: t('Lo schienale è più spesso della profondità del vano.') };
    return { pezzi: [{ nome: tr('Schienale'), L: largo, W: alto, T, rot: 'frontale', pos: [v.x0, v.y0, zf - P] }] };
  }
  if (sceltaVano === 'ante') {
    const c = v.copre, quante = +ante, l = (c.x1 - c.x0 - FUGA * (quante - 1)) / quante, h = c.y1 - c.y0;
    if (l < 100 || h < 100) return { errore: t('Vano troppo piccolo per un\'anta.') };
    const maniglia = { tipo: 'maniglia', interasse: 128, posizione: (c.y0 + c.y1) / 2 > 1400 ? 'inizio' : 'fine', direzione: 'parallela' };
    return { pezzi: Array.from({ length: quante }, (_, i) => ({ nome: quante === 1 ? tr('Anta') : i === 0 ? tr('Anta sinistra') : tr('Anta destra'), L: l, W: h, T, rot: 'frontale', pos: [c.x0 + i * (l + FUGA), c.y0, zf],
      ferramenta: [{ tipo: 'cerniere', lato: i === 0 ? 'A' : 'B', modello: i === 0 ? v.cerniere.sx : v.cerniere.dx }, maniglia] })) };
  }
  return { pezzi: [] };
}
function anteprimaVano() {
  const e = $('#esito-vano'), ok = $('#vano-ok');
  if (sceltaVano === 'cassetti') { e.textContent = ''; ok.disabled = false; return; }
  const r = pezziVano();
  ok.disabled = !!r.errore;
  e.className = r.errore ? 'avviso' : 'ok';
  if (r.errore) { e.textContent = r.errore; return; }
  const p = r.pezzi[0], n = r.pezzi.length, misure = `${mod.fmtU(p.L)} × ${mod.fmtU(p.W, true)}`;
  e.textContent = sceltaVano === 'ripiani' ? tn(n, 'Un ripiano da {m}, luce sopra e sotto {luce}.', '{n} ripiani da {m}, luce tra uno e l\'altro {luce}.', { m: misure, luce: mod.fmtU(r.luce, true) })
    : sceltaVano === 'divisori' ? tn(n, 'Un divisorio da {m}, due spazi da {luce}.', '{n} divisori da {m}, spazi da {luce}.', { m: misure, luce: mod.fmtU(r.luce, true) })
    : sceltaVano === 'schienale' ? t('Schienale da {m}, dentro il vano contro il fondo.', { m: misure })
    : tn(n, 'Un\'anta da {m}, con cerniere e maniglia.', '{n} ante da {m}, con cerniere e maniglie.', { m: misure });
}
function riempiVano() {
  if (sceltaVano === 'cassetti') { $('#dlg-vano').close(); return apriCassetto(vanoScelto); }
  const r = pezziVano();
  if (r.errore) return avvisa(r.errore, true);
  const R = vanoScelto.ruota ? new Matrix4().makeRotationY(vanoScelto.ruota) : null;
  modifica(() => {
    const pr = stato.progetto, nuovi = r.pezzi.map(({ nome, T, rot, ...dati }) => {
      const d1 = v => Math.round(v * 10) / 10;
      const x = { id: mod.nuovoId(), n: pr.prossimoN++, tipo: 'pannello', mat: 'pan', forma: 'rett', r: 0, tagli: [], rot: mod.rotazioneDa(rot), ...dati, L: d1(dati.L), W: d1(dati.W), pos: dati.pos.map(d1) };
      x.nome = `${t(nome)} ${x.n}`;
      impostaMisura(x, null, T);
      if (R) mod.trasforma(x, R);
      pr.pezzi.push(x);
      return x;
    });
    stato.multi = new Set(nuovi.map(x => x.id)); stato.sel = nuovi.at(-1).id;
  });
  $('#dlg-vano').close();
  avvisa(t('Aggiunto. Per un altro vano premi di nuovo Riempi; con ↶ torni indietro.'));
}
function eventiVano() {
  const d = $('#dlg-vano');
  d.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const prima = valoriVano();
    if (b.dataset.sceltaVano) { sceltaVano = b.dataset.sceltaVano; return disegnaFormVano({ T: sceltaVano === 'ante' || sceltaVano === 'schienale' ? undefined : prima.T }); }
    if (b.dataset.ante) return disegnaFormVano({ ...prima, ante: b.dataset.ante });
    if (b.hasAttribute('data-vano-meno') || b.hasAttribute('data-vano-piu')) { $('#form-vano [data-vano="n"]').value = Math.max(1, prima.n + (b.hasAttribute('data-vano-piu') ? 1 : -1)); return anteprimaVano(); }
    if (b.hasAttribute('data-chiudi-vano')) return d.close();
    if (b.id === 'vano-ok') riempiVano();
  });
  d.addEventListener('input', anteprimaVano);
  d.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); riempiVano(); } });
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
  const chiave = p ? JSON.stringify([p.id, p.tipo, p.forma, p.tagli.length, p.mat, p.spessore, p.sezione, p.ferramenta, p.lavorazioni, p.bloccato, p.intagli?.map(x => x.da), U()]) : 'progetto' + JSON.stringify(riepilogo(stato.progetto).materiali);
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
  const prezzo = materialePezzo(p);
  const costo = p.tipo === 'listello' ? (L / 1000) * prezzo.prezzoM : (L * W / 1e6) * prezzo.prezzoM2;
  const fr = controlli(stato.progetto).frecce.find(x => x.p.id === p.id);
  const testoFreccia = fr ? `<div class="${fr.giudizio === 'troppo' ? 'avviso' : 'ok'}">${fr.giudizio === 'troppo' ? '⚠' : '✓'} ${t('Con {carico} kg/m si piega di {f} mm nel tempo ({giudizio}).', { carico: fr.carico, f: f1(fr.nelTempo), giudizio: t({ ottimo: tr('ottimo'), accettabile: tr('si nota appena'), troppo: tr('troppo') }[fr.giudizio]) })}</div>` : '';
  const d = mod.dimensioni(p), piuCorto = p.tagli.length && (p.forma || 'rett') === 'rett' && (d.L - L > 0.5 || (p.tipo !== 'listello' && d.W - W > 0.5));
  const notaTagli = piuCorto ? `<p class="nota">${t('Più piccola dei campi qui sopra per via dei tagli. Per arrivare a una misura finita, tocca la misura sul pezzo nel 3D e scrivila: il taglio si sposta con la testa.')}</p>` : '';
  return `<div class="chipline"><span>${t('Misura finita')}</span><b>${fU(L)} × ${fU(W)} × ${fU(T)} ${U()}</b></div>${notaTagli}
    ${prezzi() ? `<div class="chipline"><span>${t('Costo del pezzo')}</span><b>${euro(costo)}</b></div>` : ''}${testoFreccia}`;
}

// Pulsanti con le misure che si trovano in negozio (spessori dei pannelli, sezioni dei listelli).
function misureRapide(p) {
  const d = mod.dimensioni(p);
  return p.tipo === 'listello'
    ? `<div class="rapide" aria-label="${t('Sezioni comuni')}">${SEZIONI_COMUNI.map(([w, s]) => `<button data-sezione-rapida="${w}x${s}" class="${d.W === w && d.T === s ? 'on' : ''}">${w}×${s}</button>`).join('')}</div>`
    : `<div class="rapide" aria-label="${t('Spessori comuni')}">${SPESSORI_COMUNI.map(s => `<button data-spessore-rapido="${s}" class="${d.T === s ? 'on' : ''}">${fU(s)}</button>`).join('')}</div>`;
}

// Tipo di legno: facoltativo («non specificato» = materiale generico). Cambiandolo restano spessore e sezione.
function htmlLegno(p) {
  const mats = materialiPer(p.tipo).map(m => `<option value="${m.id}">${esc(m.generico ? t('Non specificato') : m.nome)}</option>`).join('');
  return `<p class="nota">${t('Facoltativo. Serve per il colore, la venatura e controlli di peso e flessione più precisi; distinta e taglio funzionano anche senza.')}</p>
    <div class="input"><select data-campo="mat" aria-label="${t('Tipo di legno')}">${mats}</select><small>▾</small></div>`;
}

function htmlPezzo(p) {
  const cat = materiale(p.mat);
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
  const intagli = (p.intagli || []).map(x => stato.progetto.pezzi.find(q => q.id === x.da)).filter(Boolean)
    .map(b => `<div class="chipline"><span>${t('Intaglio per «{nome}»', { nome: esc(b.nome) })}<br><small class="nota">${t('si aggiorna da solo se sposti uno dei due pezzi')}</small></span></div>`).join('');
  const nomeForma = { cerchio: tr('Rotondo'), sagoma: tr('Sagoma'), disegno: tr('Disegno') }[p.forma] || tr('Rettangolo');
  const nTagli = p.tagli.length + (p.intagli?.length || 0), nLav = p.lavorazioni?.length || 0;
  return `
    <div><div class="kicker">${t('Pezzo {n} · {tipo}', { n: p.n, tipo: t(p.tipo) })}</div><input class="titolo" data-campo="nome" aria-label="${t('Nome del pezzo')}"></div>
    ${p.comp && stato.progetto.composizioni?.[p.comp] ? `<div class="chipline mobile-comp"><span>${t('Parte del mobile «{nome}»', { nome: esc(stato.progetto.composizioni[p.comp].nome) })}</span><span class="azioni-comp"><button class="link" data-azione="tutto-mobile">${t('Scegli tutto')}</button><button class="link" data-azione="ricomponi">${t('Ricomponi')}</button></span></div>` : ''}
    ${p.bloccato ? `<div class="chipline bloccato"><span>🔒 ${t('Bloccato: intaglia i pezzi che lo attraversano')}</span><button class="link" data-azione="sblocca">${t('Sblocca')}</button></div>` : ''}
    ${misure}
    ${p.tipo === 'pannello' ? campoNum('spessore', 'Spessore', mod.dimensioni(p).T) : ''}
    ${misureRapide(p)}
    <div data-info class="group"></div>
    ${sezione('legno', t('Tipo di legno: {nome}', { nome: cat.generico ? t('non specificato') : materialePezzo(p).nome }), htmlLegno(p))}
    ${forma ? sezione('forma', t('Forma: {forma}', { forma: t(nomeForma) }), forma) : ''}
    ${sezione('fori', nLav ? t('Fori e forme ({n})', { n: nLav }) : t('Fori e forme'), htmlLavorazioni(p))}
    ${sezione('posizione', t('Orientamento e posizione'), `<div class="seg">${orient}</div>
      <div class="field"><label>${t('Rotazione attorno agli assi X, Y, Z')}</label><div class="row3">
        <div class="input"><input data-campo="rot0" inputmode="decimal"><small>°</small></div>
        <div class="input"><input data-campo="rot1" inputmode="decimal"><small>°</small></div>
        <div class="input"><input data-campo="rot2" inputmode="decimal"><small>°</small></div></div></div>
      <div class="stepper"><button class="btn icon" data-inclina="-1" title="${t('Inclina indietro di 1°')}">−</button><div class="input"><span class="nota">${t('Inclina (asse X) di 1°')}</span></div><button class="btn icon" data-inclina="1" title="${t('Inclina avanti di 1°')}">+</button></div>
      <div class="row3">
        <div class="field"><label>${t('X destra')}</label><div class="input"><input data-campo="pos0" inputmode="decimal"><small>${U()}</small></div></div>
        <div class="field"><label>${t('Y altezza')}</label><div class="input"><input data-campo="pos1" inputmode="decimal"><small>${U()}</small></div></div>
        <div class="field"><label>${t('Z verso di te')}</label><div class="input"><input data-campo="pos2" inputmode="decimal"><small>${U()}</small></div></div>
      </div>
      <button class="btn" data-azione="terra">${t('Appoggia a terra')}</button>`)}
    ${sezione('tagli', nTagli ? t('Tagli e intagli ({n})', { n: nTagli }) : t('Tagli e intagli'), tagli + intagli)}
    ${p.tipo === 'pannello' ? sezione('bordi', t('Bordi e venatura'), htmlBordi(p)) : ''}
    ${p.tipo === 'pannello' ? sezione('ferramenta', t('Ferramenta'), htmlFerramenta(p)) : ''}
    ${sezione('unioni', t('Unioni e viti'), '<div class="group" data-unioni></div>')}
    ${p.gruppo ? `<button class="btn" data-azione="gruppo">${t('Seleziona tutto «{nome}»', { nome: esc(nomeGruppo(p)) })}</button>` : ''}
    <div class="azioni"><button class="btn" data-azione="duplica">${t('Duplica')}</button><button class="btn danger" data-azione="elimina">${t('Elimina')}</button></div>`;
}

// Sezioni del pannello del pezzo: chiuse finché non servono (si ricorda quali sono aperte).
const sezioniAperte = new Set(JSON.parse(localStorage.getItem('mpm:sezioni') || '[]'));
const sezione = (k, titolo, corpo) => `<details class="sezione" data-sezione="${k}" ${sezioniAperte.has(k) ? 'open' : ''}><summary>${titolo}</summary><div class="corpo">${corpo}</div></details>`;

// Fori e forme sul pezzo: misura fissa, centro misurato da un bordo (come nel disegno del pezzo).
const ANCORE_X = { sx: tr('da sinistra'), c: tr('dal centro'), dx: tr('da destra') }, ANCORE_Y = { basso: tr('dal basso'), c: tr('dal centro'), alto: tr("dall'alto") };
function nomeLavorazione(l) {
  const tipo = l.tipo === 'ellisse' && Math.abs(l.w - l.h) < 0.01 ? t('Foro Ø {d}', { d: fU(l.w) }) : `${t({ rett: tr('Rettangolo'), ellisse: tr('Ellisse'), poligono: tr('Poligono'), linea: tr('Linea') }[l.tipo] || l.tipo)} ${fU(l.w)} × ${fU(l.h)}`;
  return `${tipo} ${U()} · ${l.prof > 0 ? t('scasso {p} mm', { p: f1(l.prof) }) : t('passante')}`;
}
function htmlLavorazioni(p) {
  const righe = (p.lavorazioni || []).map((l, i) => {
    const sel = (k, voci, v) => `<span class="input mini-sel"><select data-lav="${i}:${k}">${Object.entries(voci).map(([a, b]) => `<option value="${a}" ${a === v ? 'selected' : ''}>${t(b)}</option>`).join('')}</select><small>▾</small></span>`;
    const num = (k, v) => `<span class="input mini-num-u"><input data-lav="${i}:${k}" inputmode="decimal" value="${esc(fU(v))}"><small>${U()}</small></span>`;
    const tondo = l.tipo === 'ellisse' && Math.abs(l.w - l.h) < 0.01;
    return `<div class="lavorazione"><div class="chipline"><b>${esc(nomeLavorazione(l))}</b><button class="link" data-lav-togli="${i}">${t('Togli')}</button></div>
      <div class="lav-righe"><span class="nota">${t(tondo ? 'Diametro' : 'Misure')}</span>${tondo ? num('d', l.w) : num('w', l.w) + num('h', l.h)}</div>
      <div class="lav-righe"><span class="nota">${t('Centro')} ↔</span>${num('dx', l.dx)}${sel('ax', ANCORE_X, l.ax)}</div>
      <div class="lav-righe"><span class="nota">${t('Centro')} ↕</span>${num('dy', l.dy)}${sel('ay', ANCORE_Y, l.ay)}</div></div>`;
  }).join('');
  return `${righe || `<p class="nota">${t('Fori passanti e scassi sul pezzo: restano della loro misura e alla stessa distanza dal bordo anche se il pezzo cambia misura.')}</p>`}
    <div class="azioni a-capo"><button class="btn" data-azione="foro-nuovo">${t('+ Foro Ø 40')}</button><button class="btn" data-azione="fori">${t('Disegna fori e forme…')}</button></div>`;
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
  // Venatura da rispettare nello schema di taglio: predefinita dal tipo di legno («non importa» se non specificato).
  const vena = `<div class="field"><label>${t('Venatura')}</label><div class="seg">${[['libera', tr('Non importa')], ['L', tr('Lungo la lunghezza')], ['W', tr('Lungo la larghezza')]].map(([k, testo]) => `<button data-vena="${k}" class="${(p.venatura || (m.venatura ? 'L' : 'libera')) === k ? 'on' : ''}">${t(testo)}</button>`).join('')}</div></div>`;
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
  const comp = pezzi[0].comp && pezzi.every(p => p.comp === pezzi[0].comp) ? stato.progetto.composizioni?.[pezzi[0].comp] : null;
  return `<div><div class="kicker">${t('Selezione')}</div><h2 class="titolo-fisso">${comp ? esc(comp.nome) : t('{n} pezzi', { n: pezzi.length })}</h2></div>
    ${comp ? `<div class="chipline mobile-comp"><span>${t('Mobile a livelli: cambia livelli e misure in un colpo.')}</span><button class="btn primary" data-azione="ricomponi-multi" data-comp="${pezzi[0].comp}">${t('Ricomponi')}</button></div>` : ''}
    <p class="nota">${pezzi.map(p => esc(p.nome)).join(', ')}</p>
    <div class="chipline"><span>${t('Ingombro')}</span><b>${fU(b.max.x - b.min.x)} × ${fU(b.max.y - b.min.y)} × ${fU(b.max.z - b.min.z)} ${U()}</b></div>
    <div class="group"><h3>${t('Sposta tutti di')}</h3>
      <div class="row3">
        <div class="field"><label>${t('X destra')}</label><div class="input"><input data-sposta="0" inputmode="decimal" value="0"><small>${U()}</small></div></div>
        <div class="field"><label>${t('Y altezza')}</label><div class="input"><input data-sposta="1" inputmode="decimal" value="0"><small>${U()}</small></div></div>
        <div class="field"><label>${t('Z verso di te')}</label><div class="input"><input data-sposta="2" inputmode="decimal" value="0"><small>${U()}</small></div></div>
      </div>
      <p class="nota">${t('Oppure trascina i pezzi nel 3D (passo 5 mm, poi si agganciano ai pezzi vicini); la freccia sopra li alza.')}</p></div>
    <div class="group"><h3>${t('Tipo di legno per tutti')}</h3><div class="input"><select data-mat-multi><option value="">${t('— scegli —')}</option>${['pannello', 'listello'].filter(tp => pezzi.some(p => p.tipo === tp)).map(tp => materialiPer(tp).map(m => `<option value="${m.id}">${esc(m.generico ? `${t(tp === 'pannello' ? 'Pannelli' : 'Listelli')}: ${t('non specificato')}` : m.nome)}</option>`).join('')).join('')}</select><small>▾</small></div></div>
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

// Cambia il tipo di legno tenendo spessore e sezione che il pezzo ha già.
function cambiaLegno(p, id) {
  const d = mod.dimensioni(p);
  p.mat = id;
  delete p.spessore; delete p.sezione;
  impostaMisura(p, d.W, d.T);
}
function impostaMisura(p, W, T) {
  const cat = materiale(p.mat);
  if (p.tipo === 'listello') { if (W === cat.W && T === cat.T) delete p.sezione; else p.sezione = [W, T]; }
  else if (T === cat.T) delete p.spessore; else p.spessore = T;
}

function applicaCampo(campo, valore) {
  const p = pezzoSel(), pr = stato.progetto;
  if (campo === 'nomeProgetto') { const v = valore.trim(); if (v && v !== pr.nome) modifica(() => { pr.nome = v; }); return; }
  if (!p) return;
  if (campo === 'nome') { const v = valore.trim(); if (v && v !== p.nome) modifica(() => { p.nome = v; }); return; }
  if (campo === 'mat') return modifica(() => cambiaLegno(p, valore));
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
  if ((campo === 'L' || campo === 'W') && (p.forma || 'rett') === 'rett') {
    const asse = campo === 'L' ? 'x' : 'y', sc = latoDaMuovere(p, asse);
    modifica(() => mod.ridimensiona(p, asse, sc.lato, v));
    if (sc.vincolo) avvisa(t('La testa fissata con le viti è rimasta ferma: il pezzo è cambiato dall\'altra parte.'), false, 4000);
    else if (sc.tutte) avvisa(t('Tutte e due le teste sono fissate con le viti: ho mosso la testa B (o il bordo alto). Controlla le unioni.'), false, 6000);
    return;
  }
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

// Fori e forme sul pezzo con l'editor del disegno 2D: il contorno resta fisso, si aggiungono solo vuoti.
function apriFori(p) {
  const { L, W } = mod.dimensioni(p), prima = p.lavorazioni || [];
  apriDisegno2D(p, mod.dimensioni(p).T, n => {
    modifica(() => {
      const l = n.forme.map((f, i) => lavorazioneDa(f, L, W, prima[i] && prima[i].tipo === f.tipo ? prima[i] : null));
      if (l.length) p.lavorazioni = l; else delete p.lavorazioni;
    });
    avvisa(tn(n.forme.length, '1 foro o forma sul pezzo. Il centro è misurato dal bordo più vicino: lo cambi nella sezione «Fori e forme».', '{n} fori o forme sul pezzo. Il centro è misurato dal bordo più vicino: lo cambi nella sezione «Fori e forme».'));
  }, { sfondo: formeDaPezzo({ ...p, L, W }), forme: formeLavorazioni(p) });
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
    else if (e.target.dataset.lav && p) {
      const [i, k] = e.target.dataset.lav.split(':'), l = p.lavorazioni?.[+i];
      if (!l) return;
      if (k === 'ax' || k === 'ay') {
        // cambia il bordo di riferimento lasciando il foro dov'è
        const f = formeLavorazioni(p)[+i], { L, W } = mod.dimensioni(p), n = lavorazioneDa(f, L, W, { ...l, [k]: e.target.value });
        return modifica(() => { p.lavorazioni[+i] = n; });
      }
      const v = mod.leggiMisura(e.target.value);
      if (v === null || (k !== 'dx' && k !== 'dy' && v <= 0)) { avvisa(t('Scrivi un numero, per esempio {esempio} (in {u}; puoi anche scrivere «60 cm» o «600 mm»).', { esempio: U() === 'cm' ? '4' : '40', u: U() }), true); return disegnaProprieta(); }
      modifica(() => { if (k === 'd') { l.w = v; l.h = v; } else l[k] = v; });
    }
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
      modifica(() => pezziSel().filter(x => x.tipo === tipo).forEach(x => cambiaLegno(x, id)));
      chiavePannello = '';
    }
    else if (e.target.hasAttribute('data-carico')) {
      const v = numero(e.target.value);
      if (v === null || v < 0 || v > 500) return avvisa(t('Scrivi un carico tra 0 e 500 kg/m.'), true);
      modifica(() => { stato.progetto.caricoRipiani = v; });
    }
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.dataset.campo || e.target.dataset.lav)) e.target.blur(); });
  el.addEventListener('toggle', e => {
    const k = e.target.dataset?.sezione;
    if (!k) return;
    if (e.target.open) sezioniAperte.add(k); else sezioniAperte.delete(k);
    localStorage.setItem('mpm:sezioni', JSON.stringify([...sezioniAperte]));
  }, true);
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
    else if (b.dataset.spessoreRapido && p) modifica(() => impostaMisura(p, null, +b.dataset.spessoreRapido));
    else if (b.dataset.sezioneRapida && p) { const [W, T] = b.dataset.sezioneRapida.split('x').map(Number); modifica(() => impostaMisura(p, W, T)); }
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
    } else if (b.dataset.azione === 'ricomponi-multi') ricomponi(b.dataset.comp);
    else if (b.dataset.azione === 'ricomponi' && p?.comp) ricomponi(p.comp);
    else if (b.dataset.azione === 'tutto-mobile' && p?.comp) { stato.multi = new Set(stato.progetto.pezzi.filter(x => x.comp === p.comp).map(x => x.id)); aggiorna(); }
    else if (b.dataset.azione === 'gruppo' && p) { stato.multi = new Set(stato.progetto.pezzi.filter(x => x.gruppo === p.gruppo).map(x => x.id)); aggiorna(); }
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
    else if (b.dataset.azione === 'sblocca' && p) comando('blocca');
    else if (b.dataset.azione === 'fori' && p) apriFori(p);
    else if (b.dataset.azione === 'foro-nuovo' && p) {
      modifica(() => { p.lavorazioni = [...(p.lavorazioni || []), { tipo: 'ellisse', w: 40, h: 40, rot: 0, prof: 0, ax: 'c', dx: 0, ay: 'c', dy: 0 }]; });
      avvisa(t('Foro Ø 40 al centro del pezzo: scrivi misura e distanza dal bordo qui sotto, oppure «Disegna fori e forme…».'));
    }
    else if (b.dataset.lavTogli !== undefined && p) modifica(() => { p.lavorazioni = p.lavorazioni.filter((x, i) => i !== +b.dataset.lavTogli); if (!p.lavorazioni.length) delete p.lavorazioni; });
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

let ultimaMiniatura = 0;
async function salvaOra() {
  if (stato.inAttesa) return;
  // Miniatura per l'elenco dei progetti, rifatta al massimo ogni 15 secondi.
  if (stato.progetto.pezzi.length && Date.now() - ultimaMiniatura > 15000) {
    try { stato.progetto.anteprima = vista.miniatura(); ultimaMiniatura = Date.now(); } catch { /* resta quella di prima */ }
  }
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
  stato.inAttesa = false;
  stato.progetto = progetto;
  seleziona(null);
  stato.modo = null;
  stato.misura = null;
  stato.esploso = false;
  storico.indietro = []; storico.avanti = [];
  chiavePannello = '';
  ultimaMiniatura = progetto.anteprima ? Date.now() : 0;
  localStorage.setItem('mpm:ultimo', progetto.id);
  aggiorna();
  vista.vista('3d');
  document.querySelectorAll('#viste button:not([data-vista="viti"]):not([data-vista="inquadra"])').forEach(b => b.classList.toggle('on', b.dataset.vista === '3d'));
}

function crea(progetto) {
  progetto.id = mod.nuovoId();
  delete progetto.anteprima;
  apri(progetto);
  salvaOra();
}

// Nessun progetto aperto (avvio, o progetto aperto appena eliminato): scena vuota finché non se ne sceglie uno.
function inAttesa() {
  clearTimeout(timerSalva);
  stato.progetto = mod.nuovoProgetto();
  stato.progetto.id = mod.nuovoId();
  seleziona(null);
  stato.modo = null;
  storico.indietro = []; storico.avanti = [];
  chiavePannello = '';
  stato.inAttesa = true;
  aggiorna();
  $('#stato-salvataggio').textContent = '';
}

// Finestra Progetti: all'avvio è la schermata iniziale (si sceglie cosa aprire, o si continua l'ultimo).
let elencoProgetti = [];
async function dialogoProgetti() {
  const d = $('#dlg-progetti');
  if (!stato.inAttesa && stato.progetto.pezzi.length && !stato.progetto.anteprima) { await salvaOra(); }
  const ultimo = localStorage.getItem('mpm:ultimo');
  disegnaProgetti(await archivio.elenco({ soloLocale: true }), ultimo);
  $('#lista-esempi').innerHTML = ESEMPI.map((e, i) => `<li><span class="nome"><b>${esc(t(e.nome))}</b><span>${esc(t(e.nota))}</span></span><button class="btn" data-esempio="${i}">${t('Usa')}</button></li>`).join('');
  if (!d.open) d.showModal();
  // Poi l'elenco completo dal server (progetti fatti su altri dispositivi), senza far aspettare.
  archivio.elenco().then(l => { if (d.open && !d.querySelector('.rinomina')) disegnaProgetti(l, ultimo); });
}

function disegnaProgetti(lista, ultimo) {
  elencoProgetti = lista;
  const aperto = stato.inAttesa ? null : stato.progetto.id;
  const continua = stato.inAttesa && lista.find(p => p.id === ultimo);
  $('#continua').hidden = !continua;
  if (continua) $('#continua').textContent = t('Continua «{nome}»', { nome: continua.nome });
  $('#continua').dataset.apri = continua ? continua.id : '';
  $('#nuovo-progetto').classList.toggle('primary', !continua);
  const data = v => new Date(v).toLocaleString(lingua.locale, { dateStyle: 'medium', timeStyle: 'short' });
  const segno = p => p.id === aperto ? `<em>${t('aperto ora')}</em>` : p.id === ultimo && stato.inAttesa ? `<em>${t('ultimo aperto')}</em>` : '';
  $('#lista-progetti').innerHTML = lista.map(p => `<li class="scheda-progetto${p.id === aperto ? ' attivo' : ''}" data-id="${p.id}">
    <button class="miniatura" data-apri="${p.id}" aria-label="${esc(t('Apri «{nome}»', { nome: p.nome }))}">${p.anteprima ? `<img src="${esc(p.anteprima)}" alt="">` : '<svg viewBox="0 0 32 32"><rect x="6" y="4" width="20" height="24" rx="1.5"/><path d="M6 12h20M6 20h20"/></svg>'}</button>
    <div class="info"><b class="nome" data-apri="${p.id}">${esc(p.nome)}</b><span>${data(p.aggiornato)} ${segno(p)}</span></div>
    <div class="azioni-scheda"><button class="btn" data-rinomina="${p.id}">${t('Rinomina')}</button><button class="btn" data-duplica="${p.id}">${t('Duplica')}</button><span class="sp"></span><button class="btn icon danger" data-elimina="${p.id}" title="${t('Elimina')}" aria-label="${t('Elimina')}">✕</button></div>
  </li>`).join('') || `<li class="vuoto nota">${t('Nessun progetto salvato: comincia da un progetto vuoto, da un modello pronto o da un esempio.')}</li>`;
}

let apreUltimo = false;
async function dopoHome() {
  if (!stato.inAttesa || apreUltimo || $('#dlg-modelli').open) return;
  apreUltimo = true;
  try {
    const ultimo = localStorage.getItem('mpm:ultimo'), l = elencoProgetti;
    const id = l.find(p => p.id === ultimo)?.id || l[0]?.id;
    const p = id ? await archivio.carica(id) : null;
    if (stato.inAttesa) p ? apri(p) : crea(mod.nuovoProgetto());
  } finally { apreUltimo = false; }
}

function avvisaAnnulla(testo, azione, durata = 8000) {
  avvisa(testo, false, durata);
  const b = $('#toast-chiudi');
  b.hidden = false;
  b.onclick = () => { b.hidden = true; $('#toast').hidden = true; azione(); };
  setTimeout(() => { b.hidden = true; }, durata);
}

function rinominaInLinea(id) {
  const li = $(`.scheda-progetto[data-id="${id}"]`), b = li.querySelector('.nome');
  const vecchio = elencoProgetti.find(p => p.id === id)?.nome || b.textContent;
  const inp = document.createElement('input');
  inp.className = 'rinomina'; inp.value = vecchio; inp.setAttribute('aria-label', t('Nome del progetto'));
  b.replaceWith(inp);
  inp.focus(); inp.select();
  let fatto = false;
  const fine = async salva => {
    if (fatto) return;
    fatto = true;
    const nome = inp.value.trim();
    if (salva && nome && nome !== vecchio) {
      if (id === stato.progetto.id && !stato.inAttesa) modifica(() => { stato.progetto.nome = nome; });
      else await archivio.rinomina(id, nome);
    }
    dialogoProgetti();
  };
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); fine(true); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fine(false); }
  });
  inp.addEventListener('blur', () => fine(true));
}

async function duplicaProgetto(id) {
  const p = id === stato.progetto.id && !stato.inAttesa ? structuredClone(stato.progetto) : await archivio.carica(id);
  if (!p) return avvisa(t('Non riesco a leggere questo progetto.'), true);
  p.id = mod.nuovoId();
  p.nome = t('{nome} (copia)', { nome: p.nome });
  await archivio.salva(p);
  dialogoProgetti();
  avvisa(t('Creato «{nome}».', { nome: p.nome }));
}

async function eliminaProgetto(id) {
  const nome = elencoProgetti.find(p => p.id === id)?.nome || '';
  if (!confirm(t('Eliminare «{nome}»?', { nome }))) return;
  const aperto = id === stato.progetto.id && !stato.inAttesa;
  const copia = aperto ? structuredClone(stato.progetto) : await archivio.carica(id);
  await archivio.elimina(id);
  if (aperto) inAttesa();
  dialogoProgetti();
  avvisaAnnulla(t('Eliminato «{nome}».', { nome }), async () => {
    if (!copia) return;
    await archivio.ripristina(copia);
    if ($('#dlg-progetti').open) dialogoProgetti();
    avvisa(t('Ripristinato «{nome}».', { nome }));
  });
}

function eventiDialoghi() {
  document.querySelectorAll('[data-chiudi]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  $('#apri-progetti').addEventListener('click', dialogoProgetti);
  $('#nuovo-progetto').addEventListener('click', () => { $('#dlg-progetti').close(); crea(mod.nuovoProgetto()); });
  $('#home-modelli').addEventListener('click', () => { $('#dlg-progetti').close(); apriModelli(); });
  // Chiusa la schermata iniziale senza scegliere (✕, Esc, clic fuori): si riapre l'ultimo progetto, o uno nuovo.
  $('#dlg-progetti').addEventListener('close', dopoHome);
  $('#dlg-progetti [data-chiudi]').addEventListener('click', dopoHome);
  $('#dlg-progetti').addEventListener('click', async e => {
    const b = e.target.closest('button, [data-apri]');
    if (!b) return;
    if (b.dataset.apri) {
      if (b.dataset.apri === stato.progetto.id && !stato.inAttesa) return $('#dlg-progetti').close();
      b.closest('li')?.classList.add('apro');
      const p = await archivio.carica(b.dataset.apri);
      if (!p) return avvisa(t('Non riesco a leggere questo progetto.'), true);
      apri(p); $('#dlg-progetti').close();
    }
    if (b.dataset.esempio) { stato.inAttesa = false; $('#dlg-progetti').close(); crea(ESEMPI[+b.dataset.esempio].crea()); }
    if (b.dataset.rinomina) rinominaInLinea(b.dataset.rinomina);
    if (b.dataset.duplica) duplicaProgetto(b.dataset.duplica);
    if (b.dataset.elimina) eliminaProgetto(b.dataset.elimina);
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
    if (b.dataset.composizione) { $('#dlg-modelli').close(); apriCompositore(composizioneDa(b.dataset.composizione)); }
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
  // cambiando tipo di guida, i valori di partenza del tipo nuovo (il resto resta come l'hai scritto)
  $('#dlg-cassetto').addEventListener('change', e => {
    if (e.target.dataset.cas !== 'tipo') return;
    const q = k => document.querySelector(`#form-cassetto [data-cas="${k}"]`)?.value;
    disegnaFormCassetto(e.target.value, { y0: mod.leggiMisura(q('y0')), y1: mod.leggiMisura(q('y1')), n: q('n'), frontale: q('frontale'), spCassone: mod.leggiMisura(q('spCassone')), spFrontale: mod.leggiMisura(q('spFrontale')) });
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
  $('[data-menu="materiali"] span').textContent = t(prezzi() ? 'Materiali e prezzi' : 'Lastre e barre');
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
      ${avanzi.map((a, i) => `<tr><td>${esc(materialeDaId(a.mat).nome)}</td><td class="num">${f1(a.L)}</td><td class="num">${materialeDaId(a.mat).tipo === 'listello' ? '—' : f1(a.W)}</td><td class="num">${a.qta}</td><td><button class="link" data-togli-avanzo="${i}">${t('Togli')}</button></td></tr>`).join('') || `<tr><td colspan="5" class="nota">${t('Ancora nessun avanzo.')}</td></tr>`}</tbody></table>
      <h3>${t('Aggiungi un avanzo')}</h3>
      <div class="griglia-form"><div class="field"><label>${t('Materiale')}</label><div class="input"><select id="av-mat">${opzioni('pan')}</select><small>▾</small></div></div>
      <div class="field"><label>${t('Spessore (o sezione 45×45)')}</label><div class="input"><input id="av-T" inputmode="decimal" placeholder="18"><small>mm</small></div></div>
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
      const base = $('#av-mat').value, L = numero($('#av-L').value), W = numero($('#av-W').value), q = Math.round(numero($('#av-q').value) || 1);
      const listello = materiale(base).tipo === 'listello', sp = $('#av-T').value.split(/[x×*]/i).map(numero).filter(Boolean);
      if (!L || L <= 0 || (!listello && (!W || W <= 0))) return avvisa(t("Scrivi le misure dell'avanzo."), true);
      // Lo stesso id del materiale dei pezzi con quella misura (es. «pan@12»): così lo schema di taglio lo trova.
      const pz = { tipo: materiale(base).tipo, mat: base };
      if (sp.length) impostaMisura(pz, listello ? sp[0] : null, sp[sp.length - 1]);
      const m = materialePezzo(pz);
      impostazioni.avanzi = [...(impostazioni.avanzi || []), { mat: m.id, L, W: listello ? m.W : W, qta: q }];
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
const CAMPI_VERSIONE = ['pezzi', 'composizioni', 'prossimoN', 'fissaggi', 'fissaggioPredefinito', 'unioniEscluse', 'taglio', 'caricoRipiani', 'usaAvanzi'];
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
  $('#altro-sel').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $('#altro-sel').hidden = true; comando(b.dataset.cmd); });
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
      const sel = pezziSel().filter(p => !p.bloccato);
      if (!sel.length) return;
      e.preventDefault();
      const passo = e.shiftKey ? 10 : 1;
      const d = { ArrowLeft: [-passo, 0, 0], ArrowRight: [passo, 0, 0], ArrowUp: [0, 0, -passo], ArrowDown: [0, 0, passo], PageUp: [0, passo, 0], PageDown: [0, -passo, 0] }[e.key];
      modifica(() => sel.forEach(p => mod.sposta(p, d)));
    } else {
      const tasti = { b: 'blocca', p: 'pannello', l: 'listello', c: 'accosta', a: 'adatta', d: 'dividi', m: 'misura', g: 'sposta', r: 'ruota', s: 'specchia', t: 'modelli', k: 'riempi' };
      if (tasti[k]) { e.preventDefault(); comando(tasti[k]); }
    }
  });
  eventiProprieta();
  eventiAccostato();
  eventiDialoghi();
  eventiVano();
  eventiCompositore();
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
  document.addEventListener('click', e => {
    $('#tendina').hidden = true;
    if (!e.target.closest('#barra-sel, #altro-sel') && !$('#altro-sel').hidden) { $('#altro-sel').hidden = true; disegnaBarraSel(); }
  });
  if (!localStorage.getItem('mpm:guida-vista')) { localStorage.setItem('mpm:guida-vista', '1'); setTimeout(() => $('#dlg-guida').showModal(), 600); }
  window.addEventListener('online', () => archivio.sincronizza());

  // All'avvio si sceglie cosa aprire: «Continua» riapre l'ultimo progetto con un tocco.
  inAttesa();
  await dialogoProgetti();
  archivio.sincronizza();
  // Segnale di vita: la versione portable per Windows si chiude da sola quando nessuna pagina è aperta.
  setInterval(() => fetch('/api/ping', { cache: 'no-store' }).catch(() => {}), 60000);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.mpm = { stato, comando, tocco, apri, mod, righeDistinta, menuAltro, vista, lingua };
 // per le prove automatiche
}

avvio().catch(err => { console.error(err); avvisa(t("Errore all'avvio: {errore}", { errore: err.message }), true, 0); });

