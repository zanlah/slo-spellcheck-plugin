#!/bin/sh
set -e
BASE_URL="${BASE_URL:-https://localhost:3000}"
sed "s|{{BASE_URL}}|$BASE_URL|g" /app/manifest.xml.template > /app/dist/manifest.xml
exec http-server dist -p 3000 -S -C cert.pem -K key.pem -a 0.0.0.0 --cors "$@"
