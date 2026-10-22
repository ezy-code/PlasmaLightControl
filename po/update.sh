#!/bin/sh
# Regenerates the translation template and merges it into existing catalogs.
set -e

cd "$(dirname "$0")"
DOMAIN="plasma_applet_com.github.danzicchi.plasmalightcontrol"

xgettext --from-code=UTF-8 --language=C++ \
    --package-name="Plasma Light Control" \
    --package-version="1.0" \
    --msgid-bugs-address="https://github.com/danzicchi/PlasmaLightControl/issues" \
    -ki18n:1 -ki18nc:1c,2 -ki18nd:2 -ki18ndc:2c,3 \
    -o "$DOMAIN.pot" \
    ../package/contents/ui/*.qml ../package/contents/config/config.qml

for po in *.po; do
    [ -f "$po" ] || continue
    msgmerge --update --backup=none "$po" "$DOMAIN.pot"
done
