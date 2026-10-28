#!/bin/sh
# Crea dist/MyPlanMaker-portable-<versione>.zip: Python embeddable per Windows + app + avvio.
# Si lancia da Linux (code-server): sh windows/crea-portable.sh
set -eu
cd "$(dirname "$0")/.."
VERSIONE=$(cat windows/VERSIONE)
PY=3.13.17
CACHE=dist/cache
OUT=dist/MyPlanMaker-portable
mkdir -p "$CACHE"
ZIPPY="$CACHE/python-$PY-embed-amd64.zip"
[ -f "$ZIPPY" ] || curl -fsSL -o "$ZIPPY" "https://www.python.org/ftp/python/$PY/python-$PY-embed-amd64.zip"

rm -rf "$OUT"
mkdir -p "$OUT/python" "$OUT/app/server"
python3 -I -c "import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$ZIPPY" "$OUT/python"
cp server/server.py "$OUT/app/server/"
cp -r web "$OUT/app/web"
cp windows/avvia.pyw "$OUT/app/"
printf '@echo off\r\nstart "" "%%~dp0python\\pythonw.exe" "%%~dp0app\\avvia.pyw"\r\n' > "$OUT/MyPlanMaker.bat"
sed 's/$/\r/' windows/LEGGIMI.txt | sed "s/{VERSIONE}/$VERSIONE/" > "$OUT/LEGGIMI.txt"

rm -f "dist/MyPlanMaker-portable-$VERSIONE.zip"
python3 -I -c "
import os, sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(src):
        for f in files:
            p = os.path.join(root, f)
            z.write(p, os.path.join('MyPlanMaker', os.path.relpath(p, src)))
" "$OUT" "dist/MyPlanMaker-portable-$VERSIONE.zip"
ls -la "dist/MyPlanMaker-portable-$VERSIONE.zip"
