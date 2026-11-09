#!/bin/sh
# Installs or updates the Plasma Light Control widget.
set -e

PKG_ID="com.github.danzicchi.plasmalightcontrol"
ROOT="$(cd "$(dirname "$0")" && pwd)"

build_bundles() {
    if command -v pnpm >/dev/null 2>&1; then
        if [ ! -d "$ROOT/node_modules" ]; then
            echo "Installing build dependencies..."
            pnpm install --frozen-lockfile
        fi
        pnpm run build
    elif command -v node >/dev/null 2>&1 && [ -f "$ROOT/node_modules/esbuild/package.json" ]; then
        node "$ROOT/build.mjs"
    else
        echo "Error: Node.js 24+ and pnpm are required to build the widget modules." >&2
        echo "Install them, then run: pnpm install && pnpm run build" >&2
        echo "Alternatively download a prebuilt .plasmoid from the GitHub releases." >&2
        exit 1
    fi
}

build_bundles

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
