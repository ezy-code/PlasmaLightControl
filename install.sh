#!/bin/sh
# Installiert bzw. aktualisiert das Plasma-Light-Control-Widget.
set -e

PKG_ID="com.github.danzicchi.plasmalightcontrol"
ROOT="$(cd "$(dirname "$0")" && pwd)"
DIR="$ROOT/package"

if command -v msgfmt >/dev/null 2>&1; then
    "$ROOT/po/build.sh"
else
    echo "Hinweis: msgfmt nicht gefunden, mitgelieferte Übersetzungen werden verwendet."
fi

if kpackagetool6 --type Plasma/Applet --show "$PKG_ID" >/dev/null 2>&1; then
    echo "Aktualisiere $PKG_ID …"
    kpackagetool6 --type Plasma/Applet --upgrade "$DIR"
else
    echo "Installiere $PKG_ID …"
    kpackagetool6 --type Plasma/Applet --install "$DIR"
fi

echo "Fertig. Widget nun über das Panel-Kontextmenü hinzufügen."
echo "Nach Code-Änderungen ggf. 'kquitapp6 plasmashell && kstart plasmashell' zum Neuladen."
