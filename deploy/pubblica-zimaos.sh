#!/bin/sh
# Installa o aggiorna MyPlanMaker su ZimaOS: immagine costruita da /DATA/shared-dev/MyPlanMaker (stessa cartella
# di questo repository, condivisa via NFS), container "myplanmaker" sulla porta 8098, dati in /DATA/AppData/myplanmaker.
# I dati restano nel volume: aggiornare = ricostruire l'immagine e ricreare il container.
# Uso: ZIMA_SSH="ssh -i ~/.ssh/zimaos salvo@10.77.0.201" deploy/pubblica-zimaos.sh
set -eu
SSH="${ZIMA_SSH:?imposta ZIMA_SSH, es. \"ssh -i ~/.ssh/zimaos salvo@10.77.0.201\"}"
PORT=8098
$SSH "
  set -e
  export DOCKER_CONFIG=/tmp/dockercfg-salvo; mkdir -p \$DOCKER_CONFIG /DATA/AppData/myplanmaker
  docker build -q -t myplanmaker:local /DATA/shared-dev/MyPlanMaker
  docker rm -f myplanmaker >/dev/null 2>&1 || true
  docker run -d --name myplanmaker --restart unless-stopped -p $PORT:8099 \
    -v /DATA/AppData/myplanmaker:/data -e MPM_PORT=8099 -e MPM_DATA=/data myplanmaker:local >/dev/null
  sleep 2
  docker ps --filter name=myplanmaker --format '{{.Names}}  {{.Status}}  {{.Ports}}'
  wget -qO- http://127.0.0.1:$PORT/api/ping && echo ' ← risponde'
" 2>&1 | grep -v 'Error loading config file'
