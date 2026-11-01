# Studio sull'uso e sull'interfaccia — 1 novembre 2026 (0.13.0 → 0.14.0 alpha)

Metodo: analisi degli attriti (carico cognitivo, legge di Fitts, Gestalt, continuità del lavoro) sulle schermate reali
dell'app (PC 1440×900, tablet orizzontale 1180×820 e verticale 820×1180, fatte con `web/prove-ui.html`), più tempi
e prove automatiche del flusso dei progetti. Persone simulate: **Salvo** (conosce l'app, PC e tablet in laboratorio),
**tester nuovo** (riceve la portable, non sa niente), **in laboratorio** (tablet appoggiato, mani impegnate, viene
interrotto spesso).

## In tre righe
1. Il punto più debole era la **gestione dei progetti**: all'avvio si apriva sempre l'ultimo, ogni dispositivo nuovo
   salvava una copia dell'esempio (progetti doppi con lo stesso nome e niente per distinguerli), non si poteva
   rinominare dall'elenco né eliminare il progetto aperto, e un progetto eliminato senza rete ricompariva.
   **Risolto nella 0.14.0** (vedi sotto).
2. La **lentezza all'apertura** veniva dal server: ogni volta rimandava tutti i file (~2,7 MB, senza compressione e
   con una connessione nuova per file). Su tablet via Tailscale era il collo di bottiglia. **Risolto nella 0.14.0.**
3. Restano attriti di **scoperta** (attrezzi grigi senza spiegazione, testo d'aiuto sempre aperto, gergo «Accosta /
   Adatta») e di **tablet verticale** (attrezzi tagliati in basso). Proposte sotto, da scegliere.

## Percorsi principali
```
AVVIO ─┬─ continua l'ultimo progetto ............ 60 %  (prima: automatico; ora: 1 tocco su «Continua»)
       ├─ apre un altro progetto ................ 25 %  (prima: menu Progetto → elenco senza immagini)
       ├─ nuovo progetto / modello pronto ....... 10 %
       └─ primo avvio (tester) .................. 5 %   (prima: esempio salvato da solo + guida sopra)
LAVORO ─┬─ aggiunge pezzi, misure scritte ........ alto  attrito basso
        ├─ Accosta / Adatta / Dividi ............. medio attrito medio-alto (gergo, serve un pezzo scelto prima)
        ├─ distinta, schema, PDF ................. basso attrito basso
        └─ rinomina / organizza progetti ......... basso attrito alto → basso (0.14.0)
```

## Simulazioni

**Tester nuovo, primo avvio (prima della 0.14.0)**
```
0:00  doppio clic sul .bat → si apre l'app             curioso            basso
0:05  guida rapida sopra un esempio già "suo"          un po' confuso     medio  (l'esempio è salvato come progetto suo)
0:40  chiude la guida, tocca «Accosta» → è grigio      «perché non va?»   ALTO   (nessun messaggio: serve un pezzo scelto)
1:30  aggiunge un pannello, prova a trascinare         soddisfatto        basso
5:00  vuole chiamare il progetto «Libreria camera»     cerca un "rinomina" ALTO  (il nome si cambia solo nel pannello
                                                                                  di destra con niente selezionato)
```
**Salvo in laboratorio, tablet (prima della 0.14.0)**
```
0:00  apre l'app da Tailscale → attesa lunga           impaziente         ALTO   (2,7 MB a ogni apertura)
0:10  si apre il progetto di ieri, cerca un altro      —                  medio  (menu Progetto, nomi uguali)
1:00  interrotto, torna dopo 20 min: tutto salvato     tranquillo         basso  (salvataggio automatico ✓)
2:00  tablet in verticale: «Misura» non si vede        —                  medio  (colonna attrezzi tagliata)
```

## Matrice degli attriti
| # | Attrito | Chi | Gravità | Difficoltà | Priorità | Stato |
|---|---|---|---|---|---|---|
| 1 | Apertura lenta (file rimandati ogni volta) | tutti, tablet di più | 8 | facile | ALTA | **fatto** |
| 2 | All'avvio si apre sempre l'ultimo progetto | tutti | 6 | media | ALTA | **fatto**: schermata Progetti con «Continua» |
| 3 | Esempio salvato da solo a ogni primo avvio → doppioni | tester | 6 | facile | ALTA | **fatto** |
| 4 | Progetti senza immagine, nomi uguali indistinguibili | tutti | 5 | media | ALTA | **fatto**: miniature |
| 5 | Rinomina nascosta | tutti | 6 | facile | ALTA | **fatto**: «Rinomina» su ogni scheda |
| 6 | Non si elimina il progetto aperto; «non si può annullare» | tutti | 5 | facile | ALTA | **fatto**: si elimina, con «Annulla» |
| 7 | Progetto eliminato senza rete ricompare | tablet | 4 | facile | MEDIA | **fatto** |
| 8 | Avvisi (anche errori) nascosti sotto le finestre aperte | tutti | 5 | facile | ALTA | **fatto**: l'avviso va nella finestra |
| 9 | Attrezzi grigi (Accosta, Adatta, Dividi) senza spiegazione al tocco | tester | 6 | facile | ALTA | proposta A |
| 10 | Nessun modo di mandare un riscontro dall'app | tester (alpha!) | 7 | facile | ALTA | proposta B |
| 11 | Tablet verticale: colonna attrezzi tagliata, pannello sotto molto lungo | tablet | 5 | media | MEDIA | proposta C |
| 12 | Testo «Come si costruisce» sempre aperto a destra | Salvo | 3 | facile | MEDIA | proposta D |
| 13 | Primo avvio: guida rapida sopra la schermata Progetti | tester | 3 | facile | MEDIA | proposta E |
| 14 | Gergo: Accosta / Adatta (nomi nelle altre lingue scelti da Claude) | tester | 4 | facile | MEDIA | da sentire dai tester |
| 15 | Barra della selezione con 7 comandi; icona del lucchetto è un'emoji (su alcuni sistemi un quadrato) | tutti | 3 | facile | BASSA | proposta F |
| 16 | Riga delle viste mischia viste (3D, Fronte…) e interruttori (Esploso, Viti, ⤢) | tutti | 2 | facile | BASSA | proposta F |
| 17 | «Esporta PDF» in blu pieno nell'intestazione: compete con il blu della selezione | tutti | 2 | facile | BASSA | proposta F |
| 18 | Etichetta dello spessore a volte lontana dal pezzo | tutti | 2 | media | BASSA | — |

## Fatto nella 0.14.0
- **Schermata Progetti** all'avvio e dal nome del progetto: schede con miniatura, data, «aperto ora» / «ultimo aperto»;
  tocco sull'immagine o sul nome = apri; **Continua «…»** in grande; Rinomina e Duplica su ogni scheda, ✕ separato a destra.
  Chiudendola senza scegliere si riapre l'ultimo progetto. Elenco subito dalle copie locali, poi completato dal server.
- **Elimina anche il progetto aperto**, con «Annulla» nell'avviso; eliminazioni senza rete ricordate e ripetute.
- **Primo avvio pulito**: niente progetti creati da soli; gli esempi si usano dalla schermata.
- **Server più veloce**: ETag con risposta 304, gzip, connessioni persistenti; richieste con tempo massimo (5 s) così
  con rete debole si usa la copia locale invece di restare in attesa.
- Indicazione **0.14.0 alpha** nel menu ⋯ e nella guida.

## Proposte (da scegliere)
- **A. Attrezzi grigi che spiegano**: toccandoli compare «Prima tocca il pezzo da accostare» (o simile) invece di niente.
- **B. «Segnala un problema»** nel menu ⋯: prepara un messaggio con versione, lingua, sistema e (a scelta) il file del
  progetto, da mandare via email o copiare. Essenziale per raccogliere i riscontri dell'alpha. Serve decidere
  l'indirizzo o il canale (email dedicata? Issues di GitHub, se il repository diventa pubblico?).
- **C. Tablet verticale**: attrezzi in una riga in basso (zona del pollice) invece che in colonna; pannello del pezzo
  come foglio che sale dal basso, chiuso a metà.
- **D. Aiuto che si fa da parte**: «Come si costruisce» chiudibile (ricordato), riapribile da un «?».
- **E. Benvenuto dentro la schermata Progetti** al primo avvio, al posto della guida sopra: tre righe e «Prova un esempio».
- **F. Pulizia visiva**: lucchetto disegnato in SVG come gli altri attrezzi; viste e interruttori separati; «Esporta PDF»
  come pulsante normale.

## Da misurare con i tester
- Tempo per il primo pezzo messo e per il primo progetto completo (senza aiuto).
- Quante volte si usano Annulla, Accosta, Adatta; se i nomi si capiscono nelle altre lingue.
- Se la portable parte su Windows senza intoppi (mai provata su un Windows vero prima dell'alpha).
