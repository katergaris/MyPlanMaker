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
  - `js/modello.js` — pezzi (L lungo x, W lungo y, T lungo z; tagli = semipiani locali `n·x >= d`; rotazioni ordine
    X → Y → Z, Euler three.js `'ZYX'`), orientamenti rapidi, **Accosta**, **Adatta**, **Dividi**, trasforma (gizmo),
    calamita, copia specchiata (capovolge x locale), bordi (`nomeBordo`, `bordatura`), storico.
  - `js/geometria.js` — Manifold: profilo (rettangolo con raggi, cerchio, **sagoma** con archi a freccia) estruso,
    tagli, fori della ferramenta; tiene il solido in cache (`solido`) per `volumeComune` e `sezionePezzo` (slice).
  - `js/vista3d.js` — three.js: selezione multipla, gizmo (TransformControls, 5 mm / 5°), quote del pezzo e
    d'ingombro (viste ortogonali), esploso, misura (aggancio agli spigoli), fissaggi colorati per tipo.
  - `js/unioni.js` — contatti tra pezzi (facce complanari opposte, area con `CrossSection.intersect`) e fissaggi:
    viti (regole indicative), confirmat, spinotti, eccentrici, colla; scelta per unione in `progetto.fissaggi`,
    predefinito `progetto.fissaggioPredefinito`; casi: cerniere, parti mobili (`p.mobile`, `p.gruppo`), frontali
    (`p.ruolo = 'frontale'`, solo da faccia), testa contro testa (angolari), pezzi ≤ 6 mm o bordi < 8 mm
    (chiodini); viti negli angoli spostate lungo l'unione; collisioni con viti, scodelle e fori.
  - `js/ferramenta.js` — cerniere, maniglie, guide; catalogo prezzi. `js/cassetti.js` — cassetti con guide
    (gioco 12,5 per lato, guide 250-650, fuga 3). `js/modelli.js` — 7 modelli parametrici.
  - `js/controlli.js` — peso/baricentro, ribaltamento, fissaggio al muro, compenetrazioni (Manifold), freccia dei
    soli ripiani liberi. In cache finché il progetto non cambia.
  - `js/distinta.js` (misure finite e da tagliare, venatura), `js/taglio.js` (MaxRects su lastre, barre, avanzi
    del magazzino prima), `js/spesa.js` (lista della spesa), `js/materiali.js` (catalogo + `applicaCatalogo`).
  - `js/disegni.js` — disegni quotati con tabella fori, dima 1:1 A4 (190 × 272 utili, 10 mm di sovrapposizione),
    etichette 70 × 37. `js/sagome.js` — editor delle sagome. `js/esporta.js` — CSV (;), DXF R12, STL.
    `js/montaggio.js` — istruzioni di montaggio. `js/archivio.js` — progetti e impostazioni (locale + server),
    file `.mpm.json`. `js/esempi.js` — mobiletto con leggio, tavolo rotondo.
  - `prove.html` — prove automatiche (85, "TUTTE OK"); `prove-ui.html#passo,passo` — pilota l'app per gli
    screenshot (esempio:N, modello:id, crea, sel:Nome, cmd:x, tocca:Nome, vista:x, distinta, schema, ferramenta,
    disegni, menu:x, clic:selettore, fissaggio:tipo, progetti).
  - `vendor/` — three.js 0.186.1 (con OrbitControls e TransformControls) e manifold-3d 3.5.4 (`VERSIONI.txt`).
- `tests/test_server.py` — `python3 -m unittest discover -s tests`.
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
- `README.md` (pubblico, con screenshot), `CHANGELOG.md`, `LICENSE` (MIT, scelta per la pubblicazione: da
  confermare con Salvo).

## Verifiche
- Sul code-server non ci sono Node né Docker; c'è `chromium`. WebGL in headless funziona con
  `--use-angle=swiftshader --enable-unsafe-swiftshader`; `prove.html` si legge con `--dump-dom`.
- Per fermare il server di prova non usare `pkill -f server.py` nella stessa riga di altri comandi: uccide anche
  la shell (la riga contiene la parola). Usare il PID.

## Stato
**0.9.0** (2026-10-29): vedi `CHANGELOG.md`. Repository privato `katergaris/MyPlanMaker`, branch `main`, pronto per
la pubblicazione (README, screenshot, licenza, CI) ma **ancora privato**: renderlo pubblico solo se Salvo lo chiede.
**Installato su ZimaOS il 2026-10-29**: `http://192.168.0.20:8098` (LAN), `http://10.77.0.201:8098` (rete interna). HTTPS
Tailscale `https://pve.van-pike.ts.net:8098` (dal 2026-10-30, `tailscale serve` su pve). Dopo ogni modifica
al codice: rilanciare `deploy/pubblica-zimaos.sh` (i dati restano).
Per preparare un progetto per Salvo: costruirlo con le funzioni di `modello.js`/`modelli.js` (come `esempi.js`),
controllarlo con `prove-ui.html` e consegnarlo come `.mpm.json` in `MyPlanMaker/progetti/`.
Limiti noti: i tagli restano fissi se poi si cambia la lunghezza; Adatta lavora solo lungo la lunghezza; i cassetti
solo tra fianchi affiancati in X; viti, frecce e stabilità con regole indicative; un progetto eliminato senza rete
ricompare dal server.
Idee per dopo: relazioni vive tra pezzi (tagli e misure che seguono), legno curvato, rilievo dell'ambiente, sistema
32 per i reggipiani, piedini e reggipiani in spesa, render con essenze, supporto multilingua.
