#!/bin/sh
# Installs or updates the Plasma Light Control widget.
set -e

PKG_ID="com.github.danzicchi.plasmalightcontrol"
ROOT="$(cd "$(dirname "$0")" && pwd)"

if command -v msgfmt >/dev/null 2>&1; then
    "$ROOT/po/build.sh"
else
    echo "msgfmt not found, using the bundled translations."
fi

if kpackagetool6 --type Plasma/Applet --show "$PKG_ID" >/dev/null 2>&1; then
    echo "Updating $PKG_ID..."
    kpackagetool6 --type Plasma/Applet --upgrade "$ROOT/package"
else
    echo "Installing $PKG_ID..."
    kpackagetool6 --type Plasma/Applet --install "$ROOT/package"
fi

echo "Done. Add the widget from the panel context menu."
