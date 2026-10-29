// Catalogo di partenza. Prezzi indicativi: in seguito diventeranno il catalogo personale modificabile.
// Pannelli: spessore T (mm), prezzo al m², misura della lastra commerciale [lunghezza, altezza] e se ha una
// venatura da rispettare (allora i pezzi non si ruotano sulla lastra). Listelli: sezione W×T (mm), prezzo al
// metro e lunghezza della barra commerciale. E = modulo elastico (N/mm², valori medi indicativi), densita in
// kg/m³, viscosita = quanto aumenta la freccia nel tempo sotto carico.
export const MATERIALI = [
  { id: 'mb18', tipo: 'pannello', nome: 'Multistrato betulla 18', T: 18, prezzoM2: 38, lastra: [2500, 1250], venatura: true, E: 9000, densita: 680, viscosita: 1.5, colore: '#e3c79b' },
  { id: 'mb12', tipo: 'pannello', nome: 'Multistrato betulla 12', T: 12, prezzoM2: 29, lastra: [2500, 1250], venatura: true, E: 9000, densita: 680, viscosita: 1.5, colore: '#e6cca3' },
  { id: 'tn18', tipo: 'pannello', nome: 'Truciolare nobilitato bianco 18', T: 18, prezzoM2: 13, lastra: [2800, 2070], venatura: false, E: 2500, densita: 650, viscosita: 2.0, colore: '#f1efe9' },
  { id: 'mdf18', tipo: 'pannello', nome: 'MDF 18', T: 18, prezzoM2: 15, lastra: [2800, 2070], venatura: false, E: 3000, densita: 750, viscosita: 2.0, colore: '#c9a57a' },
  { id: 'hdf3', tipo: 'pannello', nome: 'HDF 3 (fondi e schienali)', T: 3, prezzoM2: 5, lastra: [2800, 2070], venatura: false, E: 4000, densita: 900, viscosita: 2.0, colore: '#b98f63' },
  { id: 'al27', massello: true, tipo: 'pannello', nome: 'Lamellare abete 27', T: 27, prezzoM2: 32, lastra: [3000, 1220], venatura: true, E: 9000, densita: 450, viscosita: 1.5, colore: '#ecd3a5' },
  { id: 'ro27', duro: true, massello: true, tipo: 'pannello', nome: 'Rovere massello 27 (tavole incollate)', T: 27, prezzoM2: 120, lastra: [2500, 1200], venatura: true, E: 11000, densita: 720, viscosita: 1.5, colore: '#c89b62' },
  { id: 'ab2040', massello: true, tipo: 'listello', nome: 'Abete 40×20', W: 40, T: 20, prezzoM: 1.6, barra: 3000, E: 10000, densita: 450, viscosita: 1.5, colore: '#ebd2a2' },
  { id: 'ab4545', massello: true, tipo: 'listello', nome: 'Abete 45×45', W: 45, T: 45, prezzoM: 3.2, barra: 3000, E: 10000, densita: 450, viscosita: 1.5, colore: '#ebd2a2' },
  { id: 'ab6060', massello: true, tipo: 'listello', nome: 'Abete 60×60', W: 60, T: 60, prezzoM: 5.5, barra: 4000, E: 10000, densita: 450, viscosita: 1.5, colore: '#e8cd9c' },
  { id: 'ab8060', massello: true, tipo: 'listello', nome: 'Abete 80×60', W: 80, T: 60, prezzoM: 7, barra: 4000, E: 10000, densita: 450, viscosita: 1.5, colore: '#e8cd9c' },
  { id: 'fa4040', duro: true, massello: true, tipo: 'listello', nome: 'Faggio 40×40', W: 40, T: 40, prezzoM: 6.5, barra: 2000, E: 12000, densita: 720, viscosita: 1.5, colore: '#dcb486' },
  { id: 'ro8020', duro: true, massello: true, tipo: 'listello', nome: 'Rovere 80×20', W: 80, T: 20, prezzoM: 9, barra: 2500, E: 11000, densita: 720, viscosita: 1.5, colore: '#c89b62' },
  { id: 'ro6060', duro: true, massello: true, tipo: 'listello', nome: 'Rovere 60×60', W: 60, T: 60, prezzoM: 19, barra: 2500, E: 11000, densita: 720, viscosita: 1.5, colore: '#c89b62' },
  { id: 'tr100', massello: true, tipo: 'listello', nome: 'Trave abete 100×100', W: 100, T: 100, prezzoM: 12, barra: 4000, E: 10000, densita: 450, viscosita: 1.5, colore: '#e3c592' },
];

// Catalogo personale: prezzi e misure modificati, materiali aggiunti (dalle impostazioni condivise).
const BASE = structuredClone(MATERIALI);
export function applicaCatalogo(imp = {}) {
  const modifiche = imp.materiali || {};
  MATERIALI.length = 0;
  for (const m of BASE) MATERIALI.push({ ...m, ...(modifiche[m.id] || {}) });
  for (const m of imp.materialiExtra || []) MATERIALI.push({ E: m.tipo === 'listello' ? 10000 : 5000, densita: 600, viscosita: 1.5, ...m, ...(modifiche[m.id] || {}) });
}
export const materialeBase = id => BASE.find(m => m.id === id);

export const materiale = id => MATERIALI.find(m => m.id === id) || MATERIALI[0];
export const materialiPer = tipo => MATERIALI.filter(m => m.tipo === tipo);
