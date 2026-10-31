// Istruzioni di montaggio generate dal progetto: prima i fori, poi la struttura pezzo per pezzo (dal basso, sempre
// attaccando un pezzo a quelli già montati), poi schienali, cassetti, ante e maniglie.
import { geometriaPezzo } from './geometria.js';
import { dimensioni, fmt, matrice } from './modello.js';

import { Vector3 } from '../vendor/three.module.js';
import { cerniere, maniglia } from './ferramenta.js';
import { descriviGiunto, unioni } from './unioni.js';
import { t, tn } from './lingua.js';

const altezza = p => { const g = geometriaPezzo(p); return g ? new Vector3(...g.centro).applyMatrix4(matrice(p)).y : 0; };

export function istruzioni(progetto) {
  const u = unioni(progetto), passi = [];
  const fissi = progetto.pezzi.filter(p => geometriaPezzo(p) && !p.mobile && !cerniere(p));
  const giuntiFissi = u.giunti.filter(g => fissi.includes(g.a) && fissi.includes(g.b) && !g.chiodini);
  const fori = u.viti.length + progetto.pezzi.reduce((t, p) => t + (cerniere(p)?.n || 0) + (maniglia(p) ? 2 : 0), 0);
  if (fori) passi.push({ titolo: t('Prepara i fori'), testo: t('Prima di montare, segna e fai i fori indicati nei disegni dei pezzi ({n} in tutto), con i prefori e le scodelle delle cerniere. Su un pezzo staccato si fora meglio.', { n: fori }) });

  // Struttura: si parte dal pezzo più in basso con più unioni, poi si aggiunge sempre un pezzo attaccato ai montati.
  const montati = new Set(), resto = new Set(fissi);
  const legami = p => giuntiFissi.filter(g => g.a === p || g.b === p);
  while (resto.size) {
    let scelto = null, punti = -Infinity;
    for (const p of resto) {
      const verso = legami(p).filter(g => montati.has(g.a === p ? g.b : g.a));
      const v = (montati.size ? verso.length * 1000 : legami(p).length * 10 + (geometriaPezzo(p).volume / 1e5)) - altezza(p) / 10;
      if ((montati.size === 0 || verso.length) && v > punti) { scelto = p; punti = v; }
    }
    if (!scelto) scelto = [...resto].sort((a, b) => altezza(a) - altezza(b))[0];
    const conMontati = legami(scelto).filter(g => montati.has(g.a === scelto ? g.b : g.a));
    if (!montati.size) passi.push({ titolo: t('Parti da «{nome}»', { nome: scelto.nome }), testo: t('Appoggialo sul banco: è il pezzo a cui si attaccano gli altri.'), pezzi: [scelto.n] });
    else if (conMontati.length) passi.push({
      titolo: t('Monta «{nome}»', { nome: scelto.nome }), pezzi: [scelto.n],
      testo: conMontati.map(g => t('a «{nome}»: {come}', { nome: (g.a === scelto ? g.b : g.a).nome, come: descriviGiunto(g) })).join('; ') + '.',
      note: conMontati.flatMap(g => g.importanti || []),
    });
    else passi.push({ titolo: t('Aggiungi «{nome}»', { nome: scelto.nome }), testo: t('Non tocca gli altri pezzi: controlla la posizione nel 3D.'), pezzi: [scelto.n] });
    montati.add(scelto);
    resto.delete(scelto);
  }
  const verifica = fissi.length > 2;
  if (verifica) passi.push({ titolo: t('Controlla la squadra'), testo: t('Misura le due diagonali della struttura: se sono uguali è in squadra. Correggi prima che la colla tiri.') });

  const sottili = u.giunti.filter(g => g.chiodini);
  if (sottili.length) {
    // il pezzo sottile (schienale, fondo) è quello più sottile dei due
    const nomi = [...new Set(sottili.map(g => (g.a.mobile || g.b.mobile) ? null : [g.a, g.b].sort((x, y) => dimensioni(x).T - dimensioni(y).T)[0].nome).filter(Boolean))];
    if (nomi.length) passi.push({ titolo: t('Fissa {nomi}', { nomi: nomi.map(n => `«${n}»`).join(', ') }), testo: t('Chiodini o graffe ogni 15 cm, con un filo di colla. Lo schienale tiene in squadra il mobile: mettilo con la struttura in squadra.') });
  }

  const cassetti = new Map();
  for (const p of progetto.pezzi) if (p.mobile && p.gruppo) { if (!cassetti.has(p.gruppo)) cassetti.set(p.gruppo, []); cassetti.get(p.gruppo).push(p); }
  for (const pezzi of cassetti.values()) {
    const nome = pezzi[0].nome.split(' · ')[0], guida = pezzi.find(p => p.ferramenta?.some(f => f.tipo === 'guida'))?.ferramenta.find(f => f.tipo === 'guida');
    const interne = u.giunti.filter(g => pezzi.includes(g.a) && pezzi.includes(g.b) && g.viti.length && !(g.a.ruolo === 'frontale' || g.b.ruolo === 'frontale'));
    const frontale = u.giunti.find(g => pezzi.includes(g.a) && pezzi.includes(g.b) && (g.a.ruolo === 'frontale' || g.b.ruolo === 'frontale') && g.viti.length);
    passi.push({
      titolo: `${nome}`, pezzi: pezzi.map(p => p.n),
      testo: [t('Assembla il cassone: {come}', { come: interne.map(g => descriviGiunto(g)).join('; ') }), t('inchioda il fondo'), guida ? t("monta le guide da {l} mm: una parte sul cassone, l'altra sui fianchi del mobile, a filo davanti e alla stessa altezza", { l: guida.lunghezza }) : '',
        frontale ? t('infila il cassetto e fissa il frontale da dentro ({come}), regolando la fuga di 3 mm', { come: descriviGiunto(frontale) }) : ''].filter(Boolean).join('; ') + '.',
    });
  }
  const ante = progetto.pezzi.filter(p => cerniere(p));
  if (ante.length) passi.push({ titolo: t('Ante'), pezzi: ante.map(p => p.n), testo: tn(ante.length, "Avvita le basi delle cerniere sui fianchi, aggancia l'anta e regola le viti delle cerniere finché le fughe sono uguali (circa 2-3 mm).", 'Avvita le basi delle cerniere sui fianchi, aggancia le {n} ante e regola le viti delle cerniere finché le fughe sono uguali (circa 2-3 mm).') });
  const maniglie = progetto.pezzi.filter(p => maniglia(p));
  if (maniglie.length) passi.push({ titolo: t('Maniglie'), testo: tn(maniglie.length, 'Monta {n} maniglia con le viti {vite} dai fori passanti.', 'Monta {n} maniglie con le viti {vite} dai fori passanti.', { vite: maniglia(maniglie[0]).vite }) });
  return passi;
}

export function htmlIstruzioni(progetto) {
  const p = istruzioni(progetto);
  if (!p.length) return `<p class="nota">${t('Ancora nessun pezzo.')}</p>`;

  return `<ol class="passi">${p.map(x => `<li><b>${x.titolo}</b>${x.pezzi ? ` <small class="nota">${tn(x.pezzi.length, 'pezzo {elenco}', 'pezzi {elenco}', { elenco: x.pezzi.join(', ') })}</small>` : ''}<p>${x.testo}</p>${(x.note || []).map(n => `<p class="nota avviso-mini">${n}</p>`).join('')}</li>`).join('')}</ol>
    <p class="nota">${t('Ordine proposto in automatico: è un aiuto, non una regola. Peso del mobile finito: vedi Controlli.')}</p>`;

}
export { fmt };
