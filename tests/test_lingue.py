"""Controllo dei dizionari delle lingue: ogni testo dell'interfaccia (passato a t(), tn(), tr(), ai campi o segnato
con data-t in index.html) deve avere la traduzione in ogni lingua, con gli stessi segnaposto {nome}.

    python3 -m unittest tests.test_lingue          # controllo
    python3 tests/test_lingue.py --mancanti en     # elenca in JSON i testi senza traduzione inglese
"""
import json
import re
import sys
import unittest
from html.parser import HTMLParser
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent / 'web'
LINGUE = ['en', 'fr', 'de', 'es']
LETTERALE = r"""'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*\""""


def _testo(lit):
    s = lit[1:-1]
    return re.sub(r"\\(.)", r"\1", s)


def _argomenti(src, inizio):
    """Argomenti (come testo) della chiamata che si apre in src[inizio] == '('."""
    prof, i, args, att = 0, inizio, [], inizio + 1
    while i < len(src):
        c = src[i]
        if c in '\'"`':
            q = c
            i += 1
            while i < len(src) and src[i] != q:
                i += 2 if src[i] == '\\' else 1
        elif c in '([{':
            prof += 1
        elif c in ')]}':
            prof -= 1
            if prof == 0:
                args.append(src[att:i])
                return args
        elif c == ',' and prof == 1:
            args.append(src[att:i])
            att = i + 1
        i += 1
    return args


def _letterali_utili(arg):
    """Stringhe di un argomento, tranne quelle confrontate (=== 'x') e le chiavi di oggetto."""
    out = []
    for m in re.finditer(LETTERALE, arg):
        prima = arg[:m.start()].rstrip()
        dopo = arg[m.end():].lstrip()
        if re.search(r"(===|!==|==|!=)$", prima) or re.match(r"(===|!==)", dopo) or dopo.startswith(':') and not prima.endswith('?'):
            continue
        out.append(_testo(m.group(0)))
    return out


def chiavi_js():
    chiavi = set()
    for f in sorted((WEB / 'js').glob('*.js')):
        if f.name == 'lingua.js':
            continue
        src = f.read_text(encoding='utf-8')
        for m in re.finditer(r"(?<![\w.$])(t|tn|tr|campoNum|campo|num)\(", src):
            args = _argomenti(src, m.end() - 1)
            if not args:
                continue
            nome = m.group(1)
            if nome in ('t', 'tr'):
                chiavi.update(_letterali_utili(args[0]))
            elif nome == 'tn':
                for a in args[1:3]:
                    chiavi.update(_letterali_utili(a))
            elif len(args) >= 2 and re.fullmatch(r"\s*(" + LETTERALE + r")\s*", args[1]):
                chiavi.add(_testo(args[1].strip()))  # campoNum('L', 'Lunghezza', …), campo('w', 'Larghezza', …)
    return {k for k in chiavi if re.search(r"[A-Za-zÀ-ÿ]", k)}


class _Pagina(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.chiavi, self.pila = set(), []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for k in ('title', 'aria-label', 'placeholder'):
            if a.get(k) and re.search(r"[A-Za-z]", a[k]):
                self.chiavi.add(a[k])
        for p in self.pila:
            p[1].append(self.get_starttag_text())
        if 'data-t' in a and tag not in ('br', 'hr', 'input'):
            self.pila.append([tag, []])

    def handle_endtag(self, tag):
        for p in self.pila:
            p[1].append(f'</{tag}>')
        if self.pila and self.pila[-1][0] == tag:
            t, parti = self.pila.pop()
            self.chiavi.add(re.sub(r'\s+', ' ', ''.join(parti[:-1])).strip())

    def handle_data(self, data):
        for p in self.pila:
            p[1].append(data)

    def handle_entityref(self, name):
        self.handle_data(f'&{name};')


def chiavi_pagina():
    p = _Pagina()
    p.feed((WEB / 'index.html').read_text(encoding='utf-8'))
    return p.chiavi


def tutte_le_chiavi():
    return chiavi_js() | chiavi_pagina()


def dizionario(cod):
    f = WEB / 'js' / 'lingue' / f'{cod}.js'
    testo = f.read_text(encoding='utf-8')
    corpo = testo[testo.index('{'):testo.rindex('}') + 1]
    return json.loads(corpo)


segnaposto = lambda s: sorted(set(re.findall(r"\{(\w+)\}", s)))


class TestLingue(unittest.TestCase):
    def test_chiavi_trovate(self):
        self.assertGreater(len(tutte_le_chiavi()), 300)

    def test_dizionari_completi(self):
        chiavi = tutte_le_chiavi()
        for cod in LINGUE:
            with self.subTest(lingua=cod):
                d = dizionario(cod)
                mancanti = sorted(chiavi - d.keys())
                self.assertEqual(mancanti, [], f'{cod}: {len(mancanti)} testi senza traduzione')

    def test_segnaposto_uguali(self):
        for cod in LINGUE:
            for k, v in dizionario(cod).items():
                with self.subTest(lingua=cod, testo=k):
                    self.assertEqual(segnaposto(k), segnaposto(v))

    def test_html_bilanciato(self):
        # se il testo ha dei tag, la traduzione deve avere gli stessi
        for cod in LINGUE:
            for k, v in dizionario(cod).items():
                with self.subTest(lingua=cod, testo=k):
                    self.assertEqual(sorted(re.findall(r"</?\w+", k)), sorted(re.findall(r"</?\w+", v)))


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--mancanti':
        d = dizionario(sys.argv[2]) if (WEB / 'js' / 'lingue' / f'{sys.argv[2]}.js').exists() else {}
        print(json.dumps(sorted(tutte_le_chiavi() - d.keys()), ensure_ascii=False, indent=1))
    else:
        unittest.main()
