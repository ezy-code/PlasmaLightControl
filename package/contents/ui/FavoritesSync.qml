import QtQuick
import "FavoriteColors.js" as Favorites
import "FavoritesShared.js" as FavoritesShared

// Entity-registry favorite colors synchronization for Home Assistant.
// The WebSocket transport lives in HaWebSocket.qml; this component owns the
// favorites domain: pull/push, the pending operation queue, defaults, cache
// metadata and the user-facing status. It never writes the widget
// configuration: main.qml receives the signals and decides what to cache or
// display.
Item {
    id: syncRoot

    visible: false
    width: 0
    height: 0

    property string baseUrl: ""
    property string token: ""
    property string entityId: ""
    property bool active: true
    property bool admin: false
    // Inputs owned by main.qml (bound there, never assigned here).
    property var cachedPresets: []
    property var cachedMeta: ({})
    property bool cachedAvailable: false
    property var lightAttributes: ({})
    property bool lightStateKnown: false

    signal presetsPulled(var presets, var meta)
    signal presetsPushed(var presets, var meta)
    signal statusChanged(string state, string message)
    signal authFailed(string message)
    signal writeForbidden(string message)
    signal permissionChanged(bool admin)

    property bool _readOnly: false
    property bool _unsupported: false
    property bool _pullInFlight: false
    property bool _pullQueued: false
    property bool _pushInFlight: false
    property int _pushRetryAttempt: 0
    property int _nextOpId: 0
    // Incremented as soon as a connection setting changes. Requests started
    // for the previous settings must not be applied or continued after it.
    property int _configGeneration: 0
    property var _pendingOps: []
    property var _defaultsPending: null
    // Set when the lamp state was missing, either while waiting or after the
    // wait timed out. The next known state retries the defaults resolution.
    property bool _defaultsNeeded: false
    property bool _lastOriginDefaults: false
    property real _lastModifiedAt: 0
    property string _lastCanonical: ""
    property string _lastServerCanonical: ""
    property string _lastOrigin: ""
    property string _lastState: "off"
    property string _lastMessage: ""

    function pull() {
        if (!active)
            return;

        if (!transport.isAuthenticated) {
            _setState("connecting", "");
            return;
        }

        if (_pushInFlight || _pullInFlight) {
            _pullQueued = true;
            return;
        }

        if (_unsupported)
            return;

        _pullInFlight = true;
        const generation = _configGeneration;
        _setState("syncing", i18n("Loading favorite colors…"));
        transport.request("config/entity_registry/get", { entity_id: entityId }, function (result) {
            _handlePullSuccess(result, generation);
        }, function (error) {
            _handlePullError(error, generation);
        });
    }

    function queueAdd(spec) {
        if (!_canWrite()) {
            writeForbidden(i18n("Writing favorite colors requires an administrator token."));
            return false;
        }

        const normalized = Favorites.normalize(spec);
        if (!normalized) {
            _setState("error", i18n("The current color cannot be saved in Home Assistant."));
            return false;
        }

        _pendingOps.push({ id: ++_nextOpId, type: "add", spec: normalized });
        _schedulePush();
        return true;
    }

    function queueRemove(spec) {
        if (!_canWrite()) {
            writeForbidden(i18n("Writing favorite colors requires an administrator token."));
            return false;
        }

        const normalized = Favorites.normalize(spec);
        if (!normalized) {
            _setState("error", i18n("This favorite color cannot be removed."));
            return false;
        }

        _pendingOps.push({ id: ++_nextOpId, type: "remove", spec: normalized });
        _schedulePush();
        return true;
    }

    function flushPush() {
        pushDebounceTimer.stop();
        _startPush();
    }

    function retryNow() {
        if (!active)
            return;

        pushRetryTimer.stop();
        // A previous "unsupported" result must not block the recovery attempt.
        _unsupported = false;

        if (transport.isAuthenticated) {
            if (_pendingOps.length > 0)
                flushPush();
            else
                pull();
            return;
        }

        transport.retryNow();
    }

    function _scheduleConfigChange() {
        configTimer.restart();
    }

    // The new settings are applied after a short debounce, but the transport is
    // still authenticated with the old ones until then. Invalidate everything
    // that could still push to the previous entity or send new operations over
    // the old connection.
    function _invalidateConfig() {
        ++_configGeneration;
        pushDebounceTimer.stop();
        pushRetryTimer.stop();
        eventTimer.stop();
        _pendingOps = [];
    }

    function _applyConfigNow() {
        _teardown();
        transport.reset();
        admin = false;
        permissionChanged(false);
        _readOnly = false;
        _unsupported = false;
        _pushRetryAttempt = 0;
        _lastCanonical = "";
        _lastServerCanonical = "";
        _lastOrigin = "";
        _lastOriginDefaults = false;
        _lastModifiedAt = 0;
        _defaultsPending = null;
        _pendingOps = [];

        if (!active) {
            _setState("off", "");
            return;
        }

        if (!baseUrl || !token || !entityId) {
            _setState("error", i18n("Home Assistant connection is not configured."));
            return;
        }

        _setState("connecting", "");
        transport.connect();
    }

    function _teardown() {
        configTimer.stop();
        pushDebounceTimer.stop();
        pushRetryTimer.stop();
        eventTimer.stop();
        defaultsWaitTimer.stop();

        _pullInFlight = false;
        _pullQueued = false;
        _pushInFlight = false;
        _pendingOps = [];
        _defaultsPending = null;
        _defaultsNeeded = false;
    }

    function _hasCache() {
        if (cachedAvailable)
            return true;
        return cachedMeta && cachedMeta.v === 1
            && cachedMeta.source === FavoritesShared.sourceKey(baseUrl, entityId);
    }

    function _subscribeAndPull() {
        transport.subscribe("entity_registry_updated", function () {
            syncRoot.pull();
        }, function (error) {
            if (error && error.code === "aborted")
                return;
            // Older or restricted installations may not allow subscriptions;
            // reading and writing favorites can still work.
            syncRoot.pull();
        });
    }

    function _onAuthenticated(isAdmin) {
        // A fresh handshake may succeed where the previous one failed (for
        // example after the entity appeared in the registry).
        _unsupported = false;
        _readOnly = !isAdmin;
        _subscribeAndPull();
    }

    function _onPermissionChanged(isAdmin) {
        admin = isAdmin;
        _readOnly = !isAdmin;
        permissionChanged(isAdmin);
    }

    function _handleEvent(eventType, eventData) {
        if (eventType !== "entity_registry_updated")
            return;

        const data = eventData || {};
        if (data.entity_id !== entityId)
            return;

        eventTimer.restart();
    }

    function _handlePullSuccess(result, generation) {
        if (generation !== _configGeneration)
            return;

        _pullInFlight = false;
        if (!active)
            return;

        const entry = _entryFromResult(result);
        if (!entry) {
            _handlePullError(_makeError("syncInvalidResponse",
                i18n("Invalid response from Home Assistant.")), generation);
            return;
        }

        const options = entry.options && typeof entry.options === "object" ? entry.options : {};
        const lightOptions = options.light && typeof options.light === "object" ? options.light : {};
        const hasFavorites = Object.prototype.hasOwnProperty.call(lightOptions, "favorite_colors");
        const modifiedAt = _number(entry.modified_at);
        _lastModifiedAt = modifiedAt;

        if (!hasFavorites) {
            if (!lightStateKnown) {
                _defaultsPending = { modifiedAt: modifiedAt };
                _defaultsNeeded = true;
                defaultsWaitTimer.restart();
                _setState("syncing", i18n("Waiting for the lamp state…"));
                _afterPullFinished();
                return;
            }

            _defaultsPending = null;
            _defaultsNeeded = false;
            defaultsWaitTimer.stop();
            _publishDefaults(modifiedAt);
            _afterPullFinished();
            return;
        }

        _defaultsPending = null;
        _defaultsNeeded = false;
        defaultsWaitTimer.stop();
        const raw = lightOptions.favorite_colors;
        if (!Array.isArray(raw)) {
            _handlePullError(_makeError("syncInvalidResponse",
                i18n("Invalid favorite colors in Home Assistant.")), generation);
            return;
        }

        const origin = raw.length === 0 ? "empty" : "custom";
        _publishServer(raw, origin, modifiedAt);
        _afterPullFinished();
    }

    function _afterPullFinished() {
        if (_defaultsPending !== null)
            return;

        if (_pullQueued) {
            _pullQueued = false;
            Qt.callLater(syncRoot.pull);
            return;
        }

        if (_pushInFlight)
            return;

        if (_readOnly || !admin) {
            _setState("readonly", "");
            return;
        }

        _setState("synced", "");

        if (_pendingOps.length > 0)
            _schedulePush(200);
    }

    function _handlePullError(error, generation) {
        if (generation !== _configGeneration)
            return;

        _pullInFlight = false;
        if (!active || !error || error.code === "aborted")
            return;

        switch (error.code) {
        case "not_found":
        case "unknown_command":
            _unsupported = true;
            _setState("unsupported", i18n("This entity is not in the Home Assistant entity registry."));
            return;
        case "unauthorized":
            _setState("error", i18n("Home Assistant denied access to the entity registry."));
            return;
        case "timeout":
            _setState(_hasCache() ? "cached" : "error", i18n("Request to Home Assistant timed out."));
            return;
        case "syncConnectionLost":
        case "not_connected":
            _setState(_hasCache() ? "cached" : "error", i18n("Connection to Home Assistant lost."));
            return;
        default:
            _setState("error", error.message || i18n("Could not load favorite colors from Home Assistant."));
        }
    }

    function _publishServer(serverPresets, origin, modifiedAt, force) {
        const server = Favorites.normalizeList(serverPresets);
        const display = Favorites.applyOps(server, _pendingOps);
        const meta = _makeMeta(origin, modifiedAt);
        meta.pending = _pendingOps.length > 0;
        meta.serverPresets = server;
        _publish(display, meta, force);
    }

    function _publish(presets, meta, force) {
        const list = Favorites.normalizeList(presets);
        const canonical = Favorites.canonicalList(list);
        const origin = meta.origin || "";
        const server = Array.isArray(meta.serverPresets) ? meta.serverPresets : null;
        const serverCanonical = server === null ? "" : Favorites.canonicalList(server);
        const changed = force === true || canonical !== _lastCanonical || origin !== _lastOrigin
            || (server !== null && serverCanonical !== _lastServerCanonical);

        _lastCanonical = canonical;
        _lastServerCanonical = serverCanonical;
        _lastOrigin = origin;
        _lastOriginDefaults = origin === "defaults";

        if (changed)
            presetsPulled(list, meta);
    }

    function _makeMeta(origin, modifiedAt) {
        return {
            v: 1,
            source: FavoritesShared.sourceKey(baseUrl, entityId),
            origin: origin,
            modifiedAt: _number(modifiedAt),
            syncedAt: Date.now() / 1000
        };
    }

    function _computeDefaults() {
        return Favorites.computeDefaults({ attributes: lightAttributes || {} });
    }

    // Publishes computed defaults and marks them as the current origin. An
    // empty result (unavailable lamp or no color attributes) is not published:
    // it would persist an empty savedColors list over the user's colors. The
    // flag stays set so a later attribute update retries the computation.
    function _publishDefaults(modifiedAt, force) {
        _lastOriginDefaults = true;
        const defaults = _computeDefaults();
        if (defaults.length === 0)
            return;
        _publishServer(defaults, "defaults", modifiedAt, force);
    }

    function _canWrite() {
        return transport.isAuthenticated && admin && !_readOnly && !_unsupported;
    }

    function _schedulePush(delay) {
        pushDebounceTimer.interval = typeof delay === "number" ? delay : 600;
        pushDebounceTimer.restart();
    }

    function _startPush() {
        if (_pushInFlight || _pullInFlight || !transport.isAuthenticated || !_canWrite())
            return;
        if (_pendingOps.length === 0)
            return;

        _pushInFlight = true;
        const sent = _pendingOps.slice(0);
        const generation = _configGeneration;
        _setState("syncing", i18n("Saving favorite colors to Home Assistant…"));

        transport.request("config/entity_registry/get", { entity_id: entityId }, function (result) {
            if (!_pushInFlight || generation !== _configGeneration)
                return;

            const entry = _entryFromResult(result);
            if (!entry) {
                _handlePushError(_makeError("syncInvalidResponse",
                    i18n("Invalid response from Home Assistant.")), null, generation);
                return;
            }

            const options = entry.options && typeof entry.options === "object" ? entry.options : {};
            const lightOptions = options.light && typeof options.light === "object" ? options.light : {};
            const raw = lightOptions.favorite_colors;
            const base = Array.isArray(raw)
                ? Favorites.normalizeList(raw)
                : _computeDefaults();
            const updated = Favorites.applyOps(base, sent);

            const nextLightOptions = _copyObject(lightOptions);
            nextLightOptions.favorite_colors = updated;

            transport.request("config/entity_registry/update", {
                entity_id: entityId,
                options_domain: "light",
                options: nextLightOptions
            }, function (updateResult) {
                _handlePushSuccess(updateResult, sent, generation);
            }, function (error) {
                _handlePushError(error, entry, generation);
            });
        }, function (error) {
            _handlePushError(error, null, generation);
        });
    }

    function _handlePushSuccess(result, sent, generation) {
        if (generation !== _configGeneration)
            return;

        _pushInFlight = false;
        if (!active)
            return;

        const entry = _entryFromResult(result);
        if (!entry) {
            _handlePushError(_makeError("syncInvalidResponse",
                i18n("Invalid response from Home Assistant.")), null, generation);
            return;
        }

        const options = entry.options && typeof entry.options === "object" ? entry.options : {};
        const lightOptions = options.light && typeof options.light === "object" ? options.light : {};
        const serverPresets = Array.isArray(lightOptions.favorite_colors)
            ? Favorites.normalizeList(lightOptions.favorite_colors) : [];

        // Confirm exactly the operations that were part of this update. Ops
        // queued while the request was in flight keep their ids and stay
        // pending for the next push.
        const sentIds = {};
        for (let i = 0; i < sent.length; ++i)
            sentIds[sent[i].id] = true;

        const remaining = [];
        for (let i = 0; i < _pendingOps.length; ++i) {
            if (!sentIds[_pendingOps[i].id])
                remaining.push(_pendingOps[i]);
        }
        _pendingOps = remaining;

        const display = Favorites.applyOps(serverPresets, remaining);
        const origin = serverPresets.length === 0 ? "empty" : "custom";
        const modifiedAt = _number(entry.modified_at);
        _lastModifiedAt = modifiedAt;
        const meta = _makeMeta(origin, modifiedAt);
        meta.pending = remaining.length > 0;
        meta.serverPresets = serverPresets;

        _lastCanonical = Favorites.canonicalList(display);
        _lastServerCanonical = Favorites.canonicalList(serverPresets);
        _lastOrigin = origin;
        // A successful update writes a real favorite_colors key, so what is
        // displayed is no longer a set of computed defaults. This path bypasses
        // _publish, hence the explicit reset.
        _lastOriginDefaults = false;

        _pushRetryAttempt = 0;
        presetsPushed(display, meta);

        if (remaining.length > 0) {
            _schedulePush(150);
            _setState("syncing", i18n("Saving favorite colors to Home Assistant…"));
        } else if (_readOnly || !admin) {
            _setState("readonly", "");
        } else {
            _setState("synced", "");
        }

        if (_pullQueued) {
            _pullQueued = false;
            Qt.callLater(syncRoot.pull);
        }
    }

    function _handlePushError(error, baseEntry, generation) {
        if (generation !== _configGeneration)
            return;

        _pushInFlight = false;
        if (!active || !error || error.code === "aborted")
            return;

        switch (error.code) {
        case "unauthorized":
        case "forbidden":
            _readOnly = true;
            admin = false;
            _pendingOps = [];
            permissionChanged(false);
            _setState("readonly", i18n("Writing favorite colors requires an administrator token."));
            writeForbidden(i18n("Writing favorite colors requires an administrator token."));
            return;

        case "not_found":
        case "unknown_command":
            _unsupported = true;
            _pendingOps = [];
            _setState("unsupported", i18n("This entity is not in the Home Assistant entity registry."));
            return;

        case "invalid_format":
        case "invalid_info":
            _pendingOps = [];
            if (baseEntry) {
                const options = baseEntry.options && typeof baseEntry.options === "object"
                    ? baseEntry.options : {};
                const lightOptions = options.light && typeof options.light === "object"
                    ? options.light : {};
                const hasFavorites = Object.prototype.hasOwnProperty.call(
                    lightOptions, "favorite_colors")
                    && Array.isArray(lightOptions.favorite_colors);
                if (hasFavorites) {
                    // The server owns a real list, so defaults are no longer
                    // the origin. _publish derives the flag from meta.origin.
                    const list = Favorites.normalizeList(lightOptions.favorite_colors);
                    const meta = _makeMeta(list.length === 0 ? "empty" : "custom",
                        baseEntry.modified_at);
                    meta.pending = false;
                    meta.serverPresets = list;
                    _publish(list, meta, true);
                } else {
                    // No favorite_colors key: this is a computed defaults list,
                    // not server state. Keep the flag set and never publish an
                    // empty list.
                    _lastOriginDefaults = true;
                    const defaults = _computeDefaults();
                    if (defaults.length > 0) {
                        const meta = _makeMeta("defaults", baseEntry.modified_at);
                        meta.pending = false;
                        meta.serverPresets = defaults;
                        _publish(defaults, meta, true);
                    }
                }
            }
            _setState("error", error.message || i18n("Home Assistant rejected the favorite colors."));
            return;

        default:
            _setState("error", error.message || i18n("Could not save favorite colors in Home Assistant."));
            _schedulePushRetry();
        }
    }

    function _schedulePushRetry() {
        if (!active || _pendingOps.length === 0 || pushRetryTimer.running)
            return;

        const delay = Math.min(60000, 1000 * Math.pow(2, Math.min(_pushRetryAttempt, 6)));
        ++_pushRetryAttempt;
        pushRetryTimer.interval = delay;
        pushRetryTimer.restart();
    }

    function _copyObject(source) {
        const result = {};
        if (!source || typeof source !== "object")
            return result;
        for (const key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key))
                result[key] = source[key];
        }
        return result;
    }

    function _entryFromResult(result) {
        if (!result || typeof result !== "object")
            return null;
        if (result.entity_entry && typeof result.entity_entry === "object")
            return result.entity_entry;
        if (typeof result.entity_id === "string")
            return result;
        return null;
    }

    function _number(value) {
        const number = Number(value);
        return isFinite(number) ? number : 0;
    }

    function _makeError(code, message) {
        return { code: code, message: message || "" };
    }

    function _setState(state, message) {
        const text = message || "";
        if (state === _lastState && text === _lastMessage)
            return;

        _lastState = state;
        _lastMessage = text;
        statusChanged(state, text);
    }

    function _resolveDefaults() {
        if (!lightStateKnown || _defaultsPending === null)
            return;

        const pending = _defaultsPending;
        _defaultsPending = null;
        _defaultsNeeded = false;
        defaultsWaitTimer.stop();
        _publishDefaults(pending.modifiedAt, true);
        _afterPullFinished();
    }

    // The wait for the lamp state ended without a state. Drop the pending
    // marker so pull/push completion is no longer blocked, report the error and
    // keep a flag so the next known state retries the resolution.
    function _handleDefaultsTimeout() {
        if (_defaultsPending === null)
            return;

        _defaultsPending = null;
        _defaultsNeeded = true;
        _setState("error",
            i18n("The lamp state is unavailable; default favorite colors cannot be determined."));

        if (_pullQueued) {
            _pullQueued = false;
            Qt.callLater(syncRoot.pull);
        }
    }

    // The last pull found no favorite_colors, but the lamp state was unknown or
    // the wait for it timed out. Once the state is known, defaults can be
    // computed from the current attributes, so resolve them directly instead of
    // issuing another request. Unauthenticated transports are fine: a later
    // authenticated pull publishes the same result.
    function _retryDefaults() {
        if (!_defaultsNeeded || !lightStateKnown || _pullInFlight || _defaultsPending !== null)
            return;
        _defaultsNeeded = false;
        _publishDefaults(_lastModifiedAt, true);
        _afterPullFinished();
    }

    // Only recomputes and publishes defaults; the sync state is owned by the
    // pull/push completion paths, so an attribute update cannot mask an error.
    function _refreshDefaults() {
        if (!lightStateKnown || !_lastOriginDefaults)
            return;
        if (_pendingOps.length > 0 || _pushInFlight || _pullInFlight || _defaultsPending !== null)
            return;

        _publishDefaults(_lastModifiedAt);
    }

    onActiveChanged: {
        _invalidateConfig();
        _scheduleConfigChange();
    }
    onBaseUrlChanged: {
        _invalidateConfig();
        _scheduleConfigChange();
    }
    onTokenChanged: {
        _invalidateConfig();
        _scheduleConfigChange();
    }
    onEntityIdChanged: {
        _invalidateConfig();
        _scheduleConfigChange();
    }
    onLightStateKnownChanged: {
        _resolveDefaults();
        _retryDefaults();
        _refreshDefaults();
    }
    onLightAttributesChanged: {
        _resolveDefaults();
        _refreshDefaults();
    }

    Component.onCompleted: _scheduleConfigChange()

    HaWebSocket {
        id: transport
        url: syncRoot.baseUrl
        token: syncRoot.token
        active: syncRoot.active

        onStatusChanged: (state, message) => {
            if (state === "lost")
                syncRoot._setState(syncRoot._hasCache() ? "cached" : "error", message);
            else
                syncRoot._setState(state, message);
        }
        onAuthFailed: message => syncRoot.authFailed(message)
        onAuthenticated: admin => syncRoot._onAuthenticated(admin)
        onPermissionChanged: admin => syncRoot._onPermissionChanged(admin)
        onEventReceived: (eventType, eventData) => syncRoot._handleEvent(eventType, eventData)
    }

    Timer {
        id: configTimer
        interval: 50
        repeat: false
        onTriggered: syncRoot._applyConfigNow()
    }

    Timer {
        id: pushDebounceTimer
        interval: 600
        repeat: false
        onTriggered: syncRoot._startPush()
    }

    Timer {
        id: pushRetryTimer
        interval: 1000
        repeat: false
        onTriggered: syncRoot._startPush()
    }

    Timer {
        id: eventTimer
        interval: 300
        repeat: false
        onTriggered: syncRoot.pull()
    }

    Timer {
        id: defaultsWaitTimer
        interval: 10000
        repeat: false
        onTriggered: syncRoot._handleDefaultsTimeout()
    }
}
