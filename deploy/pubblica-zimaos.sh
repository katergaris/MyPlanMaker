#!/bin/sh
# Installa o aggiorna MyPlanMaker su ZimaOS: immagine costruita da /DATA/shared-dev/MyPlanMaker (questa cartella,
# condivisa via NFS), container "myplanmaker" avviato con deploy/compose-zimaos.yml come progetto compose
# "myplanmaker" (lo stesso registrato nelle app di ZimaOS), porta 8098, dati in /DATA/AppData/myplanmaker.
# I dati restano nel volume: aggiornare = ricostruire l'immagine e ricreare il container.
# Uso: ZIMA_SSH="ssh -i ~/.ssh/zimaos salvo@10.77.0.201" deploy/pubblica-zimaos.sh
set -eu
cd "$(dirname "$0")"
SSH="${ZIMA_SSH:?imposta ZIMA_SSH, es. \"ssh -i ~/.ssh/zimaos salvo@10.77.0.201\"}"
$SSH "cat > /DATA/AppData/myplanmaker-compose.yml" < compose-zimaos.yml
$SSH "
  set -e
  export DOCKER_CONFIG=/tmp/dockercfg-salvo; mkdir -p \$DOCKER_CONFIG /DATA/AppData/myplanmaker
  docker build -q -t myplanmaker:local /DATA/shared-dev/MyPlanMaker
  docker compose -p myplanmaker -f /DATA/AppData/myplanmaker-compose.yml up -d --force-recreate
  sleep 3
  docker ps --filter name=myplanmaker --format '{{.Names}}  {{.Status}}  {{.Ports}}'
  wget -qO- http://127.0.0.1:8098/api/ping && echo ' ← risponde'
" 2>&1 | grep -v 'Error loading config file'
