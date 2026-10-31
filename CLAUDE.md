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
- `docs/PIANO.md` — requisiti, funzioni per fase, decisioni tecniche, avanzamento. `docs/screenshot/` — immagini del
  README (rifarle con `web/prove-ui.html`, finestra 1440×900).
- `design/` — studi dell'interfaccia (A banco chiaro scelto, B e C solo confronto), `scena.js` isometria SVG.
- `server/server.py` — sola libreria standard: file di `web/` + API `/api/projects[/<id>]` (GET/PUT/DELETE, vince
  `updated` più recente, altrimenti 409), `/api/settings` (magazzino avanzi e catalogo materiali, vince `aggiornato`),
  `/api/ping`. Variabili `MPM_PORT` (8099), `MPM_DATA` (`./data`, esclusa da git), `MPM_PASSWORD` (HTTP Basic).
  `crea_server()` è usato anche dalla portable.
- `web/` — web app senza compilazione (moduli ES, import map per `three`). **Ogni nuovo file JS va aggiunto a
  `sw.js`** (e cambiata `VERSIONE`).
  - **Lingue** (dal 0.12.0): `js/lingua.js` — `t('testo italiano {segnaposto}', {…})`, `tn(n, singolare, plurale)`,
    `tr()` per i testi in costanti tradotti quando si mostrano, `traduciPagina()` per `index.html` (attributo
    `data-t` = contenuto HTML come chiave, più title/aria-label/placeholder). Dizionari `js/lingue/{en,fr,de,es}.js`
    (chiave = italiano). **Ogni testo nuovo dell'interfaccia passa da t()/tn()/tr() e va aggiunto ai 4 dizionari**:
    `python3 tests/test_lingue.py --mancanti en` elenca quelli che mancano; `tests/test_lingue.py` fallisce se ne
    manca uno. I dati del progetto restano in italiano (es. `g.tipo`): mai riconoscere un testo tradotto con regex.
    Lingua scelta dal menu ⋯ (localStorage `mpm:lingua`, la prima volta quella del browser); `lingua.locale` per numeri
    e date; `fmt` senza separatore delle migliaia. In prove-ui: `?lingua=en` e passo `mancanti`.
  - **Prezzi facoltativi**: `impostazioni.prezzi` (condivisa, dal menu ⋯), nascosti se non è `true`.
  - `js/modello.js` — pezzi (L lungo x, W lungo y, T lungo z; tagli = semipiani locali `n·x >= d`; rotazioni ordine
    X → Y → Z, Euler three.js `'ZYX'`), orientamenti rapidi, **Accosta** (`deltaAccosta`: faccia contro faccia, anche
    ruotando; pannello «Allinea» in `app.js`), **Adatta** (asse `x` o `y`, faccia toccata, `lato` = testa toccata (`latoPerFaccia`), la faccia si orienta verso la testa ferma, poi accorcia fino al taglio; pezzi ruotati), **Dividi**,
    trasforma (gizmo), calamita, **ridimensiona** (`assiManiglie`, `ridimensiona(p, asse, lato, nuovo)`: i tagli della
    testa mossa la seguono), copia specchiata (capovolge x locale), bordi (`nomeBordo`, `bordatura`), storico.
    Unità dell'interfaccia (`unita.u` mm/cm, `fmtU`, `leggiMisura`): nel progetto tutto resta in mm.
  - Spessore su misura: `p.spessore` (pannelli) e `p.sezione = [W, T]` (listelli); `materialePezzo(p)` in
    `materiali.js` dà la variante (id `mat@T`, prezzo proporzionale) usata da dimensioni, distinta, taglio, disegni.
  - **Blocca e intagli**: `p.bloccato`; `aggiornaIntagli(progetto)` in `geometria.js` (chiamata in `aggiorna()` di app.js)
    scrive `p.intagli = [{ da, m }]` sui pezzi non bloccati che attraversano un bloccato (m = matrice del bloccato nel
    sistema locale); `geometriaPezzo` li sottrae (registro dei pezzi del progetto). I bloccati non si trascinano.
  - **Fori e forme sul pezzo**: `p.lavorazioni` (forme del disegno 2D senza cx/cy, con ancora `ax` sx/dx/c + `dx`,
    `ay` basso/alto/c + `dy`); `formeLavorazioni(p)`, `lavorazioneDa(f, L, W)`; editor = `apriDisegno2D(..., { sfondo, forme })`.
  - Pannello del pezzo a sezioni `<details>` (`sezione()` in app.js, aperte in localStorage `mpm:sezioni`).
  - `js/geometria.js` — Manifold: profilo (rettangolo con raggi, cerchio, **sagoma** con archi a freccia) estruso,
    tagli, fori della ferramenta; tiene il solido in cache (`solido`) per `volumeComune` e `sezionePezzo` (slice).
  - `js/vista3d.js` — three.js: selezione multipla, trascinamento libero dei pezzi (`afferra`, piano orizzontale o
    dello schermo, passo 5 mm; col dito solo pezzi già selezionati; **calamita dal vivo**
    su facce, bordi e centri, senza far entrare un pezzo nell'altro, Alt = senza; a fine trascinamento `contatto()` in app.js
    apre «Allinea»), **maniglie** (`creaManiglie`/`trascinaManiglia`: teste, bordi, angoli; aggancio alle facce, faccia
    obliqua → `adatta` in `ridimensionato()` di app.js), **quote cliccabili** (`apriQuota` → `quotaScritta()`: L e W
    finite), gizmo (in Sposta solo la freccia Y), quote del pezzo e
    d'ingombro (viste ortogonali), esploso, misura (aggancio agli spigoli), fissaggi colorati per tipo.
  - `js/unioni.js` — contatti tra pezzi (facce complanari opposte, area con `CrossSection.intersect`) e fissaggi:
    viti (regole indicative), confirmat, spinotti, eccentrici, colla; scelta per unione in `progetto.fissaggi`,
    predefinito `progetto.fissaggioPredefinito`; casi: cerniere, parti mobili (`p.mobile`, `p.gruppo`), frontali
    (`p.ruolo = 'frontale'`, solo da faccia), testa contro testa (angolari), pezzi ≤ 6 mm o bordi < 8 mm
    (chiodini); viti negli angoli spostate lungo l'unione; collisioni con viti, scodelle e fori.
  - `js/ferramenta.js` — cerniere, maniglie, guide; catalogo prezzi. `js/cassetti.js` — cassetti con guide
    (gioco 12,5 per lato, guide 250-650, fuga 3). `js/modelli.js` — 7 modelli parametrici; ogni parametro `mat` ha anche
    `k+'T'` (e `k+'W'` per i listelli), letti con `scelto(v, k)`.
  - `js/controlli.js` — peso/baricentro, ribaltamento, fissaggio al muro, compenetrazioni (Manifold), freccia dei
    soli ripiani liberi. In cache finché il progetto non cambia.
  - `js/distinta.js` (misure finite e da tagliare, venatura), `js/taglio.js` (MaxRects su lastre, barre, avanzi
    del magazzino prima; `progetto.lastre[idMateriale] = [L, H]` o `[L]` = lastra/barra scelta per il progetto, dallo schema), `js/spesa.js` (lista della spesa), `js/materiali.js` (catalogo + `applicaCatalogo`).
  - `js/disegni.js` — disegni quotati con tabella fori, dima 1:1 A4 (190 × 272 utili, 10 mm di sovrapposizione),
    etichette 70 × 37. `js/sagome.js` — editor delle sagome. `js/disegno2d.js` — **Disegno 2D**
    (forma `'disegno'`, `p.disegno.forme`: rett/ellisse/poligono/linea con centro, w × h, rot, `modo` pieno/vuoto, `prof`
    e `lato` per gli scassi; geometria in `geometria.js`: `contornoForma`, `sezioniDisegno`, `ingombroDisegno`,
    `poligoniDisegno`; il pezzo = unione dei pieni − vuoti passanti, estruso, − scassi). `js/esporta.js` — CSV (;), DXF R12, STL.
    `js/montaggio.js` — istruzioni di montaggio. `js/archivio.js` — progetti e impostazioni (locale + server),
    file `.mpm.json`. `js/esempi.js` — mobiletto con leggio, tavolo rotondo.
  - `prove.html` — prove automatiche (129, "TUTTE OK"); `prove-ui.html#passo,passo` — pilota l'app per gli
    screenshot (esempio:N, modello:id, crea, sel:Nome, cmd:x, tocca:Nome, faccia:Nome:nx:ny:nz, trascina:Nome:dx:dy[:ox:oy], maniglia:i:dx:dy, quota:asse:valore, stato (JSON dei pezzi),
    tracciaSu:selettore:x0:y0:x1:y1, unita:cm, vista:x, distinta, schema, ferramenta, disegni, menu:x, clic:selettore, fissaggio:tipo, progetti).
  - `vendor/` — three.js 0.186.1 (con OrbitControls e TransformControls) e manifold-3d 3.5.4 (`VERSIONI.txt`).
- `tests/test_server.py`, `tests/test_lingue.py` — `python3 -m unittest discover -s tests`.
- `windows/` — portable per Windows (versione in `windows/VERSIONE`): `crea-portable.sh` scarica Python 3.13.17
  embeddable (cache in `dist/cache`) e crea `dist/MyPlanMaker-portable-<VERSIONE>.zip`; `avvia.pyw` usa la prima
  porta libera da 8099 (o riapre l'istanza già avviata), solo 127.0.0.1, Edge/Chrome `--app` con profilo in
  `dati/browser`, si chiude con la finestra o dopo 3 minuti senza richieste. **Mai provato su un Windows vero.**
- `Dockerfile`, `docker-compose.yml` (porta 8099, volume `./data`). Il Dockerfile è quello usato su ZimaOS.
- `deploy/pubblica-zimaos.sh` — installa/aggiorna su ZimaOS: `ZIMA_SSH="ssh -i ~/.ssh/zimaos salvo@10.77.0.201" deploy/pubblica-zimaos.sh`
  (build da `/DATA/shared-dev/MyPlanMaker`, poi `docker compose -p myplanmaker` con `deploy/compose-zimaos.yml`: container
  `myplanmaker`, porta **8098**, dati in `/DATA/AppData/myplanmaker`). Lo stesso compose è registrato tra le app di ZimaOS
  (`casaos-cli app-management install`, 2026-10-30), copia in `Homelab/zimaos/compose/myplanmaker.yml`. Voce `myplanmaker`
  in The Hook (`Homelab/the-hook/services.json`, guida `the-hook/docs/myplanmaker.md`).
- `.github/workflows/prove.yml` — prove del server e `prove.html` in Chrome headless a ogni push.
- **Repository in inglese** (richiesta del 2026-10-31): `README.md` (inglese, screenshot in `docs/screenshot/en/`),
  `README.it.md` (italiano, screenshot in `docs/screenshot/`), `CHANGELOG.md` in inglese, messaggi di commit in
  inglese. Codice, commenti e `docs/PIANO.md` restano in italiano. `LICENSE` (MIT, da confermare con Salvo).

## Verifiche
- Sul code-server non ci sono Node né Docker; c'è `chromium`. WebGL in headless funziona con
  `--use-angle=swiftshader --enable-unsafe-swiftshader`; `prove.html` si legge con `--dump-dom`.
- Per fermare il server di prova non usare `pkill -f server.py` nella stessa riga di altri comandi: uccide anche
  la shell (la riga contiene la parola). Usare il PID.

## Stato
**0.13.0** (2026-10-31): maniglie alla Tinkercad, quote da scrivere sul pezzo, calamita dal vivo, lastra per progetto (0.12.0 5 lingue, prezzi facoltativi, repository in inglese; 0.11.0 disegno 2D; 0.10.0 spessori su misura, spostamento libero, nuovo Accosta/Adatta, mm/cm); vedi `CHANGELOG.md`. Repository privato `katergaris/MyPlanMaker`, branch `main`, pronto per
la pubblicazione (README, screenshot, licenza, CI) ma **ancora privato**: renderlo pubblico solo se Salvo lo chiede.
**Installato su ZimaOS il 2026-10-29**: `http://192.168.0.20:8098` (LAN), `http://10.77.0.201:8098` (rete interna). HTTPS
Tailscale `https://pve.van-pike.ts.net:8098` (dal 2026-10-30, `tailscale serve` su pve). Dopo ogni modifica
al codice: rilanciare `deploy/pubblica-zimaos.sh` (i dati restano).
Per preparare un progetto per Salvo: costruirlo con le funzioni di `modello.js`/`modelli.js` (come `esempi.js`),
controllarlo con `prove-ui.html` e consegnarlo come `.mpm.json` in `MyPlanMaker/progetti/`.
Limiti noti: cambiando la misura si muovono solo i tagli della testa che cresce (testa B dal campo, quella trascinata dalle maniglie); Adatta non allunga sagome e cerchi; i cassetti
solo tra fianchi affiancati in X; viti, frecce e stabilità con regole indicative; un progetto eliminato senza rete
ricompare dal server.
**Punto in cui ci siamo fermati (2026-10-31)**: 0.13.0 su richiesta di Salvo (Accosta/Adatta macchinosi, misure come in
Tinkercad, lastra del taglio da scegliere; caso concreto: pannello 800 nei campi ma 755 finito per un taglio rimasto).
Salvo ha detto **no** alla traduzione in inglese di commenti e nomi interni del codice: restano in italiano (i nomi
interni finiscono anche nei progetti salvati, rinominarli richiederebbe una conversione dei vecchi file).
Proposte fatte e non ancora scelte: modello pronto «Sedia» (altezza seduta, inclinazione schienale, traversi);
curve tra i punti nelle linee del disegno 2D, testo, selezione di più forme. Nomi dei comandi nelle altre lingue
scelti da Claude (es. Accosta = Place/Accoler/Anlegen/Arrimar): cambiarli se Salvo non li trova chiari.
Idee per dopo: relazioni vive tra pezzi (tagli e misure che seguono), legno curvato, rilievo dell'ambiente, sistema
32 per i reggipiani, piedini e reggipiani in spesa, render con essenze.
