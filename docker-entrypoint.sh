#!/bin/sh
# Writes dist/manifest.xml for the public address and starts the static server.
#   BASE_URL   public address of the add-in (e.g. https://crkovalnik.zanlah.si);
#              on Coolify it defaults to the first domain in COOLIFY_URL
#   USE_HTTPS  true = serve HTTPS with the self-signed certificate (local use);
#              false = plain HTTP behind a proxy that terminates SSL (Coolify)
set -e
cd /app

BASE_URL="${BASE_URL:-${COOLIFY_URL%%,*}}"
BASE_URL="${BASE_URL:-https://localhost:3000}"
BASE_URL="${BASE_URL%/}"
sed "s|https://localhost:3000|$BASE_URL|g" manifest.xml > dist/manifest.xml
echo "manifest.xml -> $BASE_URL"

if [ "$USE_HTTPS" = "true" ]; then
  exec http-server dist -p 3000 -g -S -C cert.pem -K key.pem -a 0.0.0.0 --cors
fi
exec http-server dist -p 3000 -g -a 0.0.0.0 --cors
