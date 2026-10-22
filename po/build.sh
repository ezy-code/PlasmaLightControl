#!/bin/sh
# Compiles the PO catalogs into the Plasma applet package.
set -e

cd "$(dirname "$0")"
DOMAIN="plasma_applet_com.github.danzicchi.plasmalightcontrol"

for po in *.po; do
    [ -f "$po" ] || continue
    lang="${po%.po}"
    out="../package/contents/translations/$lang/LC_MESSAGES"
    mkdir -p "$out"
    msgfmt --check -o "$out/$DOMAIN.mo" "$po"
    echo "  $lang"
done
