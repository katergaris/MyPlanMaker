# MyPlanMaker — piano

## Come si progetta
1. **Pezzi**: Pannello (spessori reali: 18 truciolare, 15 multistrato, 3 fondo…), Listello/Trave (45×45,
   60×80, 100×100…), Ferramenta. Si agganciano a facce e bordi; lunghezze e angoli scritti a numero.
2. **Dividi lo spazio**: in un vano "dividi in N", "ripiano a 40 cm", "cassetto qui", "anta qui": si adattano
   quando il mobile cambia misura.
3. **Angoli liberi**: pezzi ruotati di qualsiasi angolo, comando **Adatta** (rifila il pezzo contro un altro
   calcolando il taglio obliquo), unione a metà angolo, pannelli sagomati da profilo 2D.
3b. **Tagli curvi** (deciso il 2026-10-28, fase 1): il profilo di ogni pezzo è fatto di segmenti **e archi**,
   salvati esatti (centro, raggio) e approssimati solo per il 3D. Comandi: arrotonda angolo (raggio a numero),
   arco tra due punti (freccia o raggio), taglio curvo su un bordo, foro/asola. Vale anche per i listelli
   (gamba o mensola sagomata ricavata da una tavola). Bordi arrotondati con la fresa (raggio sullo spigolo)
   come informazione e aspetto. Uscite: **dima 1:1 stampabile** per il seghetto alternativo, DXF in fase 2.
   Lo schema di taglio sistema i pezzi curvi usando il loro ingombro reale. Legno curvato (lamellare piegato,
   multistrato flessibile): fase 2.
4. **Giunzioni come scelta**: viti, confirmat, spinotti, lamelle, mezzo legno, tenone e mortasa, angolari.
   L'app accorcia/intaglia i pezzi e mette viti e accessori in distinta.
5. **Misure con nome** (opzionali, nascoste): `L = 120`, ripiano `= L - 2×18`.
6. **Modelli** come punto di partenza; si possono salvare i propri.

## Ferramenta (catalogo personale, modificabile)
Ogni articolo ha: tipo, misure, regole di montaggio, fori da fare, prezzo e fornitore, quantità in casa.
- **Cerniere**: a scodella 35 mm (sovrapposta, semi, a filo), apertura 110°/165°, con base. Numero
  suggerito dall'altezza dell'anta (indicativo: 2 fino a ~90 cm, 3 fino a ~160, 4 fino a ~200), posizione
  della scodella dal bordo e controllo che l'anta non urti.
- **Maniglie e pomoli**: interasse (96, 128, 160…), posizione suggerita (centrata, a filo alto/basso),
  fori passanti in distinta, viti della lunghezza giusta per lo spessore dell'anta.
- **Guide per cassetti**: a sfere, sotto-cassetto, push-pull; lunghezza scelta dalla profondità del mobile,
  gioco laterale (es. 12,5 mm per lato) applicato al cassetto.
- **Angolari, staffe, piastre, reggimensola, piedini, ruote, reggipiani, ganci a muro, eccentrici**.
- **Sistema 32** opzionale per le file di fori dei reggipiani.

## Viti: scelta e posizione automatiche
Per ogni unione l'app propone tipo, diametro, lunghezza, numero e posizione, e mostra perché. Regole di
partenza (**da verificare e rendere modificabili** prima di usarle davvero):
- lunghezza circa 2,5-3 volte lo spessore del pezzo da fissare, senza uscire dall'altro pezzo;
- distanza minima dal bordo e dalle testate (più ampia in testa al truciolare e lungo vena nel massello);
- prima vite a ~5 cm dalle estremità, poi passo ~15-20 cm;
- avviso quando serve il preforo (massello duro, vicino al bordo, in testa al pannello) e diametro del foro;
- avviso di **collisione** tra viti, spinotti, cerniere e fori di altri pezzi;
- viti in vista o nascoste, a scelta (es. da dentro il mobile, sotto il piano).
Le viti finiscono nella lista della spesa e nelle dime di foratura.

## Esempio guida: tavolo rotondo (2026-10-28)
Caso di prova per tagli curvi, massello e controlli:
- piano Ø 1000 da **pannello** oppure da **tavole di massello incollate** (l'app propone quante tavole, larghezza
  grezza, sfalsamento delle venature, sovramisura da rifilare dopo l'incollaggio);
- basi alternative: 4 gambe con fascia sotto il piano, colonna centrale con piede a croce (incastro a mezzo
  legno), 3 gambe;
- fissaggio piano-base che lascia **muovere il legno** (fissaggi a 8, bottoni in legno, fori asolati) e viti
  scelte di conseguenza;
- controlli: **ribaltamento** se ci si appoggia sul bordo (soprattutto con colonna centrale), spazio per le
  ginocchia, posti a sedere suggeriti dal diametro;
- in laboratorio: tracciatura del cerchio (centro + raggio, compasso a filo o fresa con dima a cerchio) e dima
  1:1 del piede.

## Funzioni per fase
**Fase 1 (base)**: pezzi, aggancio, misure a numero, angoli e Adatta, dividi spazio, ferramenta e viti
automatiche, tagli curvi (archi, raggi, sagome), distinta con angoli, schema di taglio (con spessore lama e avanzi), materiali e prezzi
personali, costi, controlli automatici (compenetrazioni, pezzi troppo lunghi, ante che urtano, cassetti),
freccia dei ripiani, ribaltamento, piani in massello da tavole incollate, PDF, salvataggio e sincronizzazione PC ↔ tablet, funzionamento senza rete.

**Fase 1b (laboratorio)**: modalità laboratorio sul tablet (pezzi da spuntare), numeri ed etichette dei
pezzi, istruzioni di montaggio con vista esplosa, dime di foratura stampabili 1:1.

**Fase 2**: legno curvato, rilievo dell'ambiente (pareti fuori squadra), esportazioni DXF/CSV, finiture
(quantità di olio/vernice), versioni del progetto, essenze realistiche nel 3D.

**Esclusi**: rendering fotorealistico, realtà aumentata, social, multiutente.

## Decisioni tecniche (confermate da Salvo il 2026-10-28)
- Web app installabile (PWA), offline, senza passaggi di compilazione.
- 3D con Three.js, geometria dei solidi con **Manifold** (WASM nel browser).
- Server Python con sola libreria standard + SQLite, da installare su ZimaOS per la sincronizzazione.

## Avanzamento
- 2026-10-28, prototipo 0.1: pezzi, Accosta, Adatta, cerchi e angoli arrotondati, distinta, salvataggio.
  Dettagli e limiti nel `CLAUDE.md` del progetto.
- 2026-10-28, 0.2: Esporta/Importa progetto, schema di taglio (lastre e barre, lama, rifilo, venatura).
  Manca ancora: magazzino avanzi nello schema.
- 2026-10-28, 0.3: cerniere e maniglie con fori, viti automatiche (tipo, misura, numero, posizione,
  preforo) con controlli e collisioni, lista della spesa. Mancano: guide, angolari disegnati, piedini,
  reggipiani, sistema 32, viti nascoste a scelta.
- 2026-10-28, 0.4: Dividi come "n pezzi alla stessa distanza tra due pezzi paralleli" (al posto della
  divisione dei vani pensata all'inizio: più semplice e funziona anche per divisori verticali).
- 2026-10-28, 0.5: peso, stabilità (ribaltamento con 25 kg sul bordo, fissaggio al muro) e freccia dei ripiani.
- 2026-10-29, 0.9 (notte in autonomia, su richiesta di Salvo "come un software professionale ma intuitivo"):
  gizmo, calamita, selezione multipla e gruppi, specchia, misura, quote, esploso; modelli pronti; cassetti;
  fissaggi a scelta; compenetrazioni; bordatura e venatura; sagome; disegni, dime 1:1, etichette; CSV/DXF/STL;
  montaggio; laboratorio; magazzino avanzi; catalogo materiali; versioni; guida; tablet in verticale; README,
  screenshot, licenza MIT, Docker, CI. Fatte quasi tutte le voci di fase 1, 1b e parte della fase 2.
