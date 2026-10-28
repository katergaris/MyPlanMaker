# MyPlanMaker — istruzioni progetto

App personale di Salvo per progettare mobili e costruzioni in legno (anche con piani obliqui), con distinta
dei tagli, schema di taglio, ferramenta, viti e costi. Nata il 2026-10-28. Uso **su PC (mouse) e tablet
(touch, anche in laboratorio)**. Con l'utente si parla in italiano.

## Principi
- **Interfaccia molto semplice e chiara**: pochi comandi visibili, il resto compare quando serve. Le misure
  si scrivono a numero, niente quote da disegnare. Annulla sempre disponibile.
- **Flessibile, non a modelli**: si costruisce con pezzi veri (pannelli, listelli/travi, ferramenta) a
  qualunque angolo. I modelli (libreria, cassettiera…) sono solo un punto di partenza modificabile.
- **Ogni pezzo sa cos'è**: distinta, tagli, angoli, ferramenta, viti e costi si calcolano sempre da soli.
- Forme scolpite/organiche fuori scopo (per quelle Blender/Fusion).
- Stile dell'interfaccia: **direzione A "Banco chiaro"**, scelta da Salvo il 2026-10-28
  (`design/direzione-A-banco-chiaro.html` è il riferimento): fondo carta calda `#f4f1ec`, pannelli `#fffdfa`,
  testo `#2b2722`, accento blu `#1f5fbf` per selezione/viti/azioni, verde `#2f7d4f` per gli esiti positivi,
  angoli 10-14 px, campi alti 48 px, attrezzi grandi a sinistra, proprietà del pezzo a destra, riepilogo
  (pezzi, viti, costo) in basso. Le direzioni B e C restano in `design/` solo come confronto.

## Struttura
- `docs/PIANO.md` — requisiti, funzioni per fase e decisioni tecniche.
- `design/` — studi dell'interfaccia: tre direzioni (A banco chiaro, B disegno tecnico, C officina scura) in HTML
  statico + PNG, scena di prova comune in `scena.js` (isometria SVG, senza librerie).
- `server/server.py` — server con sola libreria standard: file di `web/` + API `/api/projects[/<id>]`
  (GET/PUT/DELETE) su SQLite. Al PUT vince il campo `updated` più recente (altrimenti 409 con la versione del
  server). Variabili `MPM_PORT` (8099), `MPM_DATA` (`./data`, esclusa da git), `MPM_PASSWORD` (HTTP Basic).
- `web/` — web app senza passaggi di compilazione (moduli ES, import map per `three`):
  - `js/modello.js` — pezzi, orientamenti rapidi, **Accosta**, **Adatta**, **Dividi** (`spazioTra` + `dividi`:
    n copie di A alla stessa distanza fino a B, che deve essere parallelo), descrizione dei tagli, storico.
    Sistema locale del pezzo: L lungo x, W lungo y, T lungo z; tagli = semipiani locali `n·x >= d`.
    Rotazioni in gradi, ordine sugli assi del mondo X → Y → Z (Euler three.js `'ZYX'`).
  - `js/geometria.js` — Manifold: profilo (rettangolo, angoli arrotondati, cerchio) estruso + `trimByPlane`.
  - `js/vista3d.js` — three.js: disegno, selezione col tocco (con la faccia toccata), viste 3D/Fronte/Lato/Sopra.
  - `js/distinta.js` — misure finite dai solidi tagliati, tagli, costi. `js/materiali.js` — catalogo di partenza
    (per i pannelli anche lastra commerciale e venatura, per i listelli la barra).
  - `js/taglio.js` — schema di taglio: MaxRects (lato corto migliore) sulle lastre, barre "prima dove entra" dal
    pezzo più lungo; lama e rifilo in `progetto.taglio`; con venatura i pezzi non si ruotano.
  - `js/ferramenta.js` — cerniere (lato A/B/basso/alto, numero dall'altezza, scodella Ø 35 a 22,5 mm dal bordo
    sulla faccia interna z = 0) e maniglie (interasse, lato opposto alle cerniere, fori Ø 5): posizioni, fori
    scavati nel solido (`foriPezzo`, usati da `geometria.js`), catalogo con prezzi indicativi.
  - `js/unioni.js` — trova i contatti (facce complanari opposte, area vera con `CrossSection.intersect`) e
    propone viti: passa dal pezzo che tocca di faccia/fianco, va nella testa o nel bordo dell'altro; misura,
    numero (50 mm dalle estremità, passo ≤ 200), preforo; casi speciali: anta con cerniere, testa contro testa
    (angolari), bordo < 8 mm (chiodini), viti in vista sopra un piano, viti in testa al massello; collisioni
    tra viti e con scodelle/fori. Esclusioni in `progetto.unioniEscluse`. `js/spesa.js` — lista della spesa.
  - `js/controlli.js` — peso e baricentro (volumi × densità), stabilità (base = inviluppo dei vertici a terra;
    25 kg sul bordo dei pezzi della metà alta; "fissalo al muro" se alto > 1 m e > 3 × la base), freccia dei
    ripiani orizzontali avvitati alle due teste (trave appoggiata, E e viscosità dal materiale, carico
    `progetto.caricoRipiani`, 30 kg/m; ottimo ≤ L/600, accettabile ≤ L/300).
  - `js/archivio.js` — copia in `localStorage` + server, e file di progetto `.mpm.json`
    (`{formato: 'myplanmaker', versione: 1, progetto}`, Esporta/Importa nel menu Progetti; all'import nuovo id).
    `sw.js` — funzionamento senza rete: **aggiungere lì ogni nuovo file JS** e cambiare `VERSIONE`.
  - `js/esempi.js` — "Mobiletto con leggio" e "Tavolo rotondo", costruiti con gli stessi comandi.
  - `prove.html` — prove automatiche di modello, geometria, schema di taglio e file (col server avviato: "TUTTE OK").
  - `prove-ui.html#passo,passo` — pilota l'app per gli screenshot (esempio:N, sel:Nome, cmd:x, tocca:Nome,
    vista:x, distinta, schema, progetti).
  - `vendor/` — three.js 0.186.1 e manifold-3d 3.5.4 copiati dal registro npm (`VERSIONI.txt`).
- `tests/test_server.py` — `python3 -m unittest discover -s tests`.
- `windows/` — **versione portable per Windows** (2026-10-28, versione in `windows/VERSIONE`): `crea-portable.sh` (da Linux) scarica Python
  3.13.17 embeddable da python.org (cache in `dist/cache`) e crea `dist/MyPlanMaker-portable-<VERSIONE>.zip`
  con `python/`, `app/` (server + web + `avvia.pyw`), `MyPlanMaker.bat`, `LEGGIMI.txt`. `avvia.pyw` usa la
  prima porta libera da 8099 (o riapre l'istanza già avviata, riconosciuta da `/api/ping`), ascolta solo su
  127.0.0.1, apre Edge/Chrome con `--app` e profilo in `dati/browser`, e si chiude quando la finestra viene
  chiusa o dopo 3 minuti senza richieste (la pagina fa un ping ogni minuto). Dati in `dati/` accanto al `.bat`.
  `dist/` è esclusa da git. Provato solo su Linux: **non ancora provato su un Windows vero**.

## Verifiche
- Sul code-server non ci sono Node né Docker; c'è `chromium`. WebGL in headless funziona con
  `--use-angle=swiftshader --enable-unsafe-swiftshader`; `prove.html` si legge con `--dump-dom`.
- Per fermare il server di prova non usare `pkill -f server.py` nella stessa riga di altri comandi: uccide anche
  la shell (la riga contiene la parola). Usare il PID.

## Stato
Prototipo 0.1 (2026-10-28): pannelli e listelli, misure a numero, orientamenti rapidi, rotazioni libere,
Accosta, Adatta (allunga/accorcia e taglia con l'angolo della faccia), forme rotonde e angoli arrotondati,
distinta con tagli e costi, stampa/PDF, salvataggio PC ↔ tablet, Annulla/Ripeti. Non ancora installato su
ZimaOS. Repository privato `katergaris/MyPlanMaker`, branch `main` (creato il 2026-10-28).
Limiti noti: i tagli restano fissi se poi si cambia la lunghezza (non sono ancora relazioni vive); Adatta lavora
solo lungo la lunghezza del pezzo; un progetto eliminato senza rete ricompare dal server.
0.2 (2026-10-28): Esporta/Importa progetto (`.mpm.json`), schema di taglio con lama/rifilo/venatura e conto da
comprare (anche nel piede e nella stampa).
0.3 (2026-10-28): ferramenta (cerniere, maniglie, fori scavati) e viti automatiche con controlli, viti nel 3D
(pulsante Viti), scheda "Ferramenta e viti" con lista della spesa, avvisi nel piede.
0.4 (2026-10-28): Dividi (scegli un pezzo, tocca quello opposto, quanti in mezzo); finestre centrate.
0.5 (2026-10-28): controlli di peso, stabilità e freccia dei ripiani (pannello del progetto, del pezzo, piede).
Per preparare un progetto per Salvo: costruirlo con le funzioni di `modello.js` (come `esempi.js`), controllarlo
con `prove-ui.html` e consegnarlo come `.mpm.json` in `MyPlanMaker/progetti/`.
Prossimi passi (vedi `docs/PIANO.md`): guide e cassetti, sagome libere e dime 1:1, magazzino avanzi, piani in
massello da tavole incollate.
