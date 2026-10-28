"""MyPlanMaker portable per Windows: avvia il server in locale e apre l'app in una finestra del browser.

Tutto resta nella cartella portable: progetti in `dati/`, profilo del browser in `dati/browser/`
(così anche la copia locale dei progetti viaggia con la chiavetta). Si chiude da solo quando la finestra
dell'app viene chiusa, oppure dopo qualche minuto senza pagine aperte.
"""
import os
import subprocess
import sys
import threading
import time
import traceback
import urllib.request
import webbrowser
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent          # cartella MyPlanMaker-portable
APP = BASE / "app"
DATI = BASE / "dati"
sys.path.insert(0, str(APP / "server"))                # il Python embeddable non aggiunge la cartella dello script

PORTE = range(8099, 8130)
SENZA_PAGINE = 180  # secondi senza richieste prima di chiudersi, se la finestra non è controllabile


def log(msg):
    DATI.mkdir(parents=True, exist_ok=True)
    with open(DATI / "registro.txt", "a", encoding="utf-8") as f:
        f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n")


def gia_avviato(porta):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{porta}/api/ping", timeout=1) as r:
            return r.read() == b"MyPlanMaker"
    except Exception:
        return False


def trova_browser():
    radici = [os.environ.get(k) for k in ("ProgramFiles(x86)", "ProgramFiles", "LocalAppData")]
    nomi = [r"Microsoft\Edge\Application\msedge.exe", r"Google\Chrome\Application\chrome.exe"]
    for nome in nomi:
        for radice in radici:
            if radice and (Path(radice) / nome).is_file():
                return Path(radice) / nome
    return None


def apri_finestra(url):
    """Apre l'app in una finestra senza barre. Restituisce il processo, o None se usa il browser predefinito."""
    exe = trova_browser()
    if exe:
        profilo = DATI / "browser"
        profilo.mkdir(parents=True, exist_ok=True)
        return subprocess.Popen([str(exe), f"--app={url}", f"--user-data-dir={profilo}", "--no-first-run",
                                 "--no-default-browser-check", "--window-size=1400,900"])
    webbrowser.open(url)
    return None


def main():
    import server  # noqa: E402  (dopo aver sistemato sys.path)

    for porta in PORTE:
        if gia_avviato(porta):
            log(f"già in esecuzione sulla porta {porta}: apro solo la finestra")
            apri_finestra(f"http://127.0.0.1:{porta}/")
            return
        try:
            srv = server.crea_server(porta, DATI, host="127.0.0.1")
            break
        except OSError:
            continue
    else:
        log("nessuna porta libera tra 8099 e 8129")
        return

    srv.ultima_richiesta = time.time()
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{porta}/"
    log(f"avviato su {url}")
    inizio = time.time()
    proc = apri_finestra(url)

    while True:
        time.sleep(3)
        finestra_chiusa = proc is not None and proc.poll() is not None
        # Se il browser si è chiuso dopo essere rimasto aperto, l'utente ha chiuso l'app.
        if finestra_chiusa and time.time() - inizio > 15:
            break
        # Altrimenti (browser predefinito, o finestra passata a un'altra istanza) decide il segnale di vita.
        if (proc is None or finestra_chiusa) and time.time() - srv.ultima_richiesta > SENZA_PAGINE:
            break
    log("chiuso")
    srv.shutdown()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log("errore:\n" + traceback.format_exc())
        raise
