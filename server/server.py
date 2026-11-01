"""MyPlanMaker: server minimo (solo libreria standard).

Serve la web app da `web/` e salva i progetti in SQLite, così PC e tablet vedono gli stessi progetti.
Variabili d'ambiente:
  MPM_PORT      porta (predefinita 8099)
  MPM_DATA      cartella dei dati (predefinita ./data accanto al progetto)
  MPM_PASSWORD  se impostata, la pagina chiede utente qualsiasi + questa password (HTTP Basic)
"""
import base64
import gzip
import hmac
import json
import mimetypes
import os
import re
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
MAX_BODY = 20 * 1024 * 1024

mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("image/svg+xml", ".svg")


def anteprima(data):
    """Miniatura del progetto (data URL JPEG salvata dall'app), per l'elenco dei progetti."""
    try:
        a = json.loads(data).get("anteprima")
    except (ValueError, AttributeError):
        return None
    return a if isinstance(a, str) and a.startswith("data:image/") else None


# File statici compressi, tenuti in memoria finché il file non cambia (chiave: percorso + ETag).
COMPRIMIBILI = {".html", ".js", ".css", ".webmanifest", ".svg", ".wasm", ".json"}
_gzip = {}


class Store:
    def __init__(self, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.lock = threading.Lock()
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS projects ("
            " id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL)"
        )
        self.db.execute("CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)")
        self.db.commit()

    def get_settings(self):
        with self.lock:
            r = self.db.execute("SELECT v FROM settings WHERE k = 'main'").fetchone()
        return json.loads(r[0]) if r else {}

    def put_settings(self, data):
        with self.lock:
            cur = self.db.execute("SELECT v FROM settings WHERE k = 'main'").fetchone()
            if cur and json.loads(cur[0]).get("aggiornato", 0) > data.get("aggiornato", 0):
                return False
            self.db.execute("INSERT INTO settings (k, v) VALUES ('main', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", (json.dumps(data),))
            self.db.commit()
        return True

    def list(self):
        with self.lock:
            rows = self.db.execute("SELECT id, name, updated, data FROM projects ORDER BY updated DESC").fetchall()
        return [{"id": r[0], "name": r[1], "updated": r[2], "preview": anteprima(r[3])} for r in rows]

    def get(self, pid):
        with self.lock:
            r = self.db.execute("SELECT id, name, data, updated FROM projects WHERE id = ?", (pid,)).fetchone()
        if not r:
            return None
        return {"id": r[0], "name": r[1], "data": json.loads(r[2]), "updated": r[3]}

    def put(self, pid, name, data, updated):
        with self.lock:
            cur = self.db.execute("SELECT updated FROM projects WHERE id = ?", (pid,)).fetchone()
            if cur and cur[0] > updated:
                return False  # sul server c'è una versione più recente: vince quella
            self.db.execute(
                "INSERT INTO projects (id, name, data, updated) VALUES (?, ?, ?, ?)"
                " ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated = excluded.updated",
                (pid, name, json.dumps(data), updated),
            )
            self.db.commit()
        return True

    def delete(self, pid):
        with self.lock:
            self.db.execute("DELETE FROM projects WHERE id = ?", (pid,))
            self.db.commit()


def make_handler(store, password):
    class Handler(BaseHTTPRequestHandler):
        server_version = "MyPlanMaker"
        # Connessioni persistenti: l'app chiede una trentina di file, su Tailscale ogni connessione nuova costa.
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):
            pass

        def _authorized(self):
            if not password:
                return True
            h = self.headers.get("Authorization", "")
            if not h.startswith("Basic "):
                return False
            try:
                _, _, pw = base64.b64decode(h[6:]).decode("utf-8").partition(":")
            except Exception:
                return False
            return hmac.compare_digest(pw, password)

        def _send(self, code, body=b"", ctype="application/json", extra=None):
            self.send_response(code)
            if code >= 400:
                self.close_connection = True  # un corpo non letto rovinerebbe la connessione successiva
            if ctype:
                self.send_header("Content-Type", ctype)
            if code != 304:
                self.send_header("Content-Length", str(len(body)))
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if self.command != "HEAD" and code != 304:
                self.wfile.write(body)

        def _json(self, code, obj):
            self._send(code, json.dumps(obj).encode("utf-8"), extra={"Cache-Control": "no-store"})

        def _guard(self):
            if self._authorized():
                return True
            self._send(401, b"", "text/plain", {"WWW-Authenticate": 'Basic realm="MyPlanMaker"'})
            return False

        def _project_id(self):
            m = re.fullmatch(r"/api/projects/([^/]+)", self.path.split("?")[0])
            if m and ID_RE.match(m.group(1)):
                return m.group(1)
            return None

        def do_GET(self):
            self.server.ultima_richiesta = time.time()
            if not self._guard():
                return
            path = self.path.split("?")[0]
            if path == "/api/ping":
                return self._send(200, b"MyPlanMaker", "text/plain", {"Cache-Control": "no-store"})
            if path == "/api/projects":
                return self._json(200, store.list())
            if path == "/api/settings":
                return self._json(200, store.get_settings())
            if path.startswith("/api/"):
                pid = self._project_id()
                p = store.get(pid) if pid else None
                return self._json(200, p) if p else self._json(404, {"error": "non trovato"})
            self._static(path)

        do_HEAD = do_GET

        def do_PUT(self):
            self.server.ultima_richiesta = time.time()
            if not self._guard():
                return
            if self.path.split("?")[0] == "/api/settings":
                length = int(self.headers.get("Content-Length") or 0)
                if length <= 0 or length > MAX_BODY:
                    return self._json(400, {"error": "corpo mancante o troppo grande"})
                try:
                    data = json.loads(self.rfile.read(length))
                    assert isinstance(data, dict)
                except (ValueError, AssertionError):
                    return self._json(400, {"error": "dati non validi"})
                if not store.put_settings(data):
                    return self._json(409, store.get_settings())
                return self._json(200, {"ok": True})
            pid = self._project_id()
            if not pid:
                return self._json(404, {"error": "non trovato"})
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > MAX_BODY:
                return self._json(400, {"error": "corpo mancante o troppo grande"})
            try:
                body = json.loads(self.rfile.read(length))
                name = str(body.get("name") or "Senza nome")[:200]
                data = body["data"]
                updated = int(body.get("updated") or time.time() * 1000)
            except (ValueError, KeyError, TypeError):
                return self._json(400, {"error": "dati non validi"})
            if not store.put(pid, name, data, updated):
                return self._json(409, store.get(pid))
            self._json(200, {"ok": True, "updated": updated})

        def do_DELETE(self):
            if not self._guard():
                return
            pid = self._project_id()
            if not pid:
                return self._json(404, {"error": "non trovato"})
            store.delete(pid)
            self._json(200, {"ok": True})

        def _static(self, path):
            rel = "index.html" if path in ("", "/") else path.lstrip("/")
            target = (WEB / rel).resolve()
            if WEB not in target.parents or not target.is_file():
                return self._send(404, b"non trovato", "text/plain")
            st = target.stat()
            etag = f'"{st.st_mtime_ns:x}-{st.st_size:x}"'
            # Il browser chiede sempre se il file è cambiato (no-cache) e, se non lo è, riceve solo «304».
            testata = {"Cache-Control": "no-cache", "ETag": etag, "Vary": "Accept-Encoding"}
            if etag in [x.strip() for x in self.headers.get("If-None-Match", "").split(",")]:
                return self._send(304, b"", None, testata)
            ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            if target.suffix in COMPRIMIBILI and "gzip" in self.headers.get("Accept-Encoding", ""):
                chiave = (str(target), etag)
                if chiave not in _gzip:
                    for k in [k for k in _gzip if k[0] == chiave[0]]:
                        del _gzip[k]
                    _gzip[chiave] = gzip.compress(target.read_bytes(), 6)
                return self._send(200, _gzip[chiave], ctype, {**testata, "Content-Encoding": "gzip"})
            self._send(200, target.read_bytes(), ctype, testata)

    return Handler


def crea_server(port, data, password="", host="0.0.0.0"):
    store = Store(Path(data) / "myplanmaker.sqlite")
    return ThreadingHTTPServer((host, port), make_handler(store, password))


def main():
    port = int(os.environ.get("MPM_PORT", "8099"))
    data = Path(os.environ.get("MPM_DATA", str(ROOT / "data")))
    srv = crea_server(port, data, os.environ.get("MPM_PASSWORD", ""))
    print(f"MyPlanMaker su http://0.0.0.0:{port}  (dati in {data})", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
