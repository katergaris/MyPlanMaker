"""Prove del server: python3 -m unittest discover -s tests"""
import json
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
import server  # noqa: E402


class ProveServer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        store = server.Store(Path(cls.tmp.name) / "db.sqlite")
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(store, ""))
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.tmp.cleanup()

    def req(self, metodo, path, corpo=None):
        data = json.dumps(corpo).encode() if corpo is not None else None
        r = urllib.request.Request(self.base + path, data=data, method=metodo, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(r) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def test_salva_carica_elimina(self):
        s, _ = self.req("PUT", "/api/projects/abc", {"name": "Tavolo", "data": {"pezzi": [1]}, "updated": 1000})
        self.assertEqual(s, 200)
        s, b = self.req("GET", "/api/projects/abc")
        self.assertEqual(json.loads(b)["data"], {"pezzi": [1]})
        self.assertIn("abc", [p["id"] for p in json.loads(self.req("GET", "/api/projects")[1])])
        self.assertEqual(self.req("DELETE", "/api/projects/abc")[0], 200)
        self.assertEqual(self.req("GET", "/api/projects/abc")[0], 404)

    def test_vince_la_versione_piu_recente(self):
        self.req("PUT", "/api/projects/v", {"name": "nuova", "data": {"x": 2}, "updated": 2000})
        s, b = self.req("PUT", "/api/projects/v", {"name": "vecchia", "data": {"x": 1}, "updated": 1000})
        self.assertEqual(s, 409)
        self.assertEqual(json.loads(b)["data"], {"x": 2})

    def test_file_statici_etag_e_gzip(self):
        r = urllib.request.Request(self.base + "/js/app.js", headers={"Accept-Encoding": "gzip"})
        with urllib.request.urlopen(r) as resp:
            etag, enc, corpo = resp.headers["ETag"], resp.headers["Content-Encoding"], resp.read()
        self.assertEqual(enc, "gzip")
        import gzip
        self.assertIn(b"import", gzip.decompress(corpo))
        r = urllib.request.Request(self.base + "/js/app.js", headers={"If-None-Match": etag})
        with self.assertRaises(urllib.error.HTTPError) as e:
            urllib.request.urlopen(r)
        self.assertEqual(e.exception.code, 304)

    def test_elenco_con_anteprima(self):
        self.req("PUT", "/api/projects/ant", {"name": "A", "data": {"anteprima": "data:image/jpeg;base64,xx"}, "updated": 1})
        self.req("PUT", "/api/projects/sen", {"name": "B", "data": {"anteprima": "javascript:x"}, "updated": 1})
        el = {p["id"]: p for p in json.loads(self.req("GET", "/api/projects")[1])}
        self.assertEqual(el["ant"]["preview"], "data:image/jpeg;base64,xx")
        self.assertIsNone(el["sen"]["preview"])

    def test_impostazioni(self):
        self.assertEqual(json.loads(self.req("GET", "/api/settings")[1]), {})
        self.assertEqual(self.req("PUT", "/api/settings", {"avanzi": [1], "aggiornato": 5})[0], 200)
        self.assertEqual(self.req("PUT", "/api/settings", {"avanzi": [], "aggiornato": 3})[0], 409)
        self.assertEqual(json.loads(self.req("GET", "/api/settings")[1])["avanzi"], [1])

    def test_id_e_percorsi_non_validi(self):
        self.assertEqual(self.req("PUT", "/api/projects/..%2Fx", {"name": "a", "data": {}})[0], 404)
        self.assertEqual(self.req("GET", "/../server/server.py")[0], 404)

    def test_file_statici(self):
        s, b = self.req("GET", "/")
        self.assertEqual(s, 200)
        self.assertIn(b"MyPlanMaker", b)


if __name__ == "__main__":
    unittest.main()
