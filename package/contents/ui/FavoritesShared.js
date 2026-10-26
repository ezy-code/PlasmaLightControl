.pragma library

// Shared helpers for favorite-colors synchronization.
//
// Source key format: "<normalized base URL>|<trimmed entity ID>".
// It identifies the cache entry for a Home Assistant entity, so main.qml,
// FavoritesSync.qml and the configuration page must build it identically.

function sourceKey(baseUrl, entityId) {
    const base = String(baseUrl || "").trim().replace(/\/+$/, "");
    return base + "|" + String(entityId || "").trim();
}
