# MyPlanMaker

App personale per progettare mobili e costruzioni in legno: pannelli e listelli a qualunque angolo, tagli
obliqui calcolati da soli, piani rotondi e angoli arrotondati, distinta dei tagli e costi.
Web app installabile (PC e tablet) con un piccolo server che salva i progetti.

## Avvio
Serve solo Python 3.10 o più recente, senza altre dipendenze.

```
python3 server/server.py
```
Poi apri `http://<indirizzo>:8099`. Variabili d'ambiente: `MPM_PORT` (porta, predefinita 8099), `MPM_DATA`
(cartella dei dati, predefinita `./data`), `MPM_PASSWORD` (se impostata, la pagina chiede questa password).

## Versione portable per Windows
`sh windows/crea-portable.sh` crea `dist/MyPlanMaker-portable-<versione>.zip` (Python embeddable incluso).
Si scompatta ovunque e si avvia con `MyPlanMaker.bat`; i progetti restano nella cartella `dati`.

## Prove
- Server: `python3 -m unittest discover -s tests`
- Modello e geometria: con il server avviato apri `/prove.html` (deve dire "TUTTE OK").

## Librerie incluse
`web/vendor/`: three.js 0.186.1 (MIT) e manifold-3d 3.5.4 (Apache-2.0), vedi `VERSIONI.txt`.
