import QtQuick
import QtWebSockets

// Low-level Home Assistant WebSocket transport.
//
// Owns the socket lifecycle only: connect/reconnect, the auth handshake,
// request/response correlation with per-request timeouts, event subscriptions
// and the reconnect backoff. It knows nothing about lights, entity-registry
// favorites or the widget cache.
//
// statusChanged() states:
//   "connecting"  a connection attempt has started
//   "auth"        the socket is open / the auth handshake is in progress
//   "syncing"     the token was accepted, auth/current_user is being resolved
//   "lost"        connection lost or unreachable; a reconnect is scheduled
//   "error"       protocol, authentication or configuration error
//   "off"         the transport is not active
QtObject {
    id: transport

    // Home Assistant base URL (http, https, ws or wss). "/api/websocket" is
    // appended here.
    property string url: ""
    property string token: ""
    property bool active: false

    readonly property bool isAuthenticated: _socketOpen && _authenticated

    signal statusChanged(string state, string message)
    signal authFailed(string message)
    // Emitted once per successful handshake, after permissionChanged().
    signal authenticated(bool admin)
    signal permissionChanged(bool admin)
    signal eventReceived(string eventType, var eventData)

    property int _nextId: 0
    property bool _socketOpen: false
    property bool _authenticated: false
    property bool _authFailed: false
    property bool _intentionalClose: false
    property bool _admin: false
    property int _pendingCount: 0
    property int _reconnectAttempt: 0
    property var _pendingRequests: ({})

    function connect() {
        if (!active)
            return;
        connectTimer.restart();
    }

    function disconnect() {
        _teardown();
    }

    // Teardown plus backoff reset; used when the configuration changes.
    function reset() {
        _authFailed = false;
        _reconnectAttempt = 0;
        _teardown();
    }

    function retryNow() {
        _authFailed = false;
        _reconnectAttempt = 0;
        reconnectTimer.stop();

        if (socket.status === WebSocket.Open || socket.status === WebSocket.Connecting) {
            _closeSocket();
            connectTimer.restart();
            return;
        }

        statusChanged("connecting", i18n("Connecting to Home Assistant…"));
        connectTimer.restart();
    }

    // Generic request. Returns the request id, or -1 when not connected (the
    // error callback is invoked in that case).
    function request(type, payload, onSuccess, onError) {
        if (!_socketOpen || !_authenticated) {
            if (onError)
                onError(_makeError("not_connected", i18n("Not connected to Home Assistant.")));
            return -1;
        }

        const id = ++_nextId;
        const message = { id: id, type: type };
        if (payload) {
            for (const key in payload) {
                if (Object.prototype.hasOwnProperty.call(payload, key))
                    message[key] = payload[key];
            }
        }

        _pendingRequests[id] = {
            id: id,
            onSuccess: onSuccess,
            onError: onError,
            deadline: Date.now() + 10000
        };
        ++_pendingCount;
        requestTimer.running = true;

        try {
            socket.sendTextMessage(JSON.stringify(message));
        } catch (error) {
            _finishRequest(id, _makeError("syncConnectionLost", i18n("Connection to Home Assistant lost.")));
        }
        return id;
    }

    // Subscribes to a Home Assistant event type. Inbound events are delivered
    // through eventReceived(); the callback receives the subscription result.
    function subscribe(eventType, onSuccess, onError) {
        return request("subscribe_events", { event_type: eventType }, onSuccess, onError);
    }

    function _teardown() {
        connectTimer.stop();
        reconnectTimer.stop();
        authTimer.stop();
        requestTimer.stop();

        _closeSocket();
        _rejectAllPending("aborted");

        _socketOpen = false;
        _authenticated = false;
        _pendingCount = 0;
        _pendingRequests = ({});
    }

    function _closeSocket() {
        _intentionalClose = true;
        socket.active = false;
        _socketOpen = false;
        _authenticated = false;
    }

    function _openSocket() {
        if (!active) {
            statusChanged("off", "");
            return;
        }

        if (socket.status === WebSocket.Open || socket.status === WebSocket.Connecting)
            return;

        // The QML WebSocket keeps `active` true after an unexpected close, so
        // assigning `active = true` again would not reopen the socket.
        if (socket.active)
            socket.active = false;

        const wsUrl = _wsUrl();
        if (!wsUrl) {
            statusChanged("error", i18n("Home Assistant connection is not configured."));
            return;
        }

        _intentionalClose = false;
        _socketOpen = false;
        _authenticated = false;
        statusChanged("connecting", i18n("Connecting to Home Assistant…"));
        socket.url = wsUrl;
        socket.active = true;
    }

    function _wsUrl() {
        let base = String(url || "").trim().replace(/\/+$/, "");
        if (!base)
            return "";

        if (base.indexOf("https://") === 0)
            base = "wss://" + base.substring(8);
        else if (base.indexOf("http://") === 0)
            base = "ws://" + base.substring(7);
        else if (base.indexOf("wss://") !== 0 && base.indexOf("ws://") !== 0)
            base = "ws://" + base;

        return base + "/api/websocket";
    }

    function _handleSocketStatus() {
        const status = socket.status;

        if (status === WebSocket.Open) {
            _socketOpen = true;
            statusChanged("auth", i18n("Authenticating with Home Assistant…"));
            authTimer.restart();
            return;
        }

        if (status === WebSocket.Connecting) {
            if (!_socketOpen)
                statusChanged("connecting", i18n("Connecting to Home Assistant…"));
            return;
        }

        if (status === WebSocket.Closing)
            return;

        const hadConnection = _socketOpen || _authenticated;
        _socketOpen = false;
        _authenticated = false;
        authTimer.stop();
        _admin = false;
        permissionChanged(false);
        _rejectAllPending("syncConnectionLost");

        if (_intentionalClose) {
            _intentionalClose = false;
            return;
        }

        if (!active) {
            statusChanged("off", "");
            return;
        }

        if (_authFailed)
            return;

        _scheduleReconnect(hadConnection
            ? i18n("Connection to Home Assistant lost.")
            : i18n("Cannot reach Home Assistant."));
    }

    function _scheduleReconnect(message) {
        if (!active || _authFailed || reconnectTimer.running)
            return;

        const delay = Math.min(60000, 1000 * Math.pow(2, Math.min(_reconnectAttempt, 6)));
        ++_reconnectAttempt;
        reconnectTimer.interval = delay;
        reconnectTimer.restart();
        statusChanged("lost", message);
    }

    function _sendAuth() {
        if (!_socketOpen)
            return;

        socket.sendTextMessage(JSON.stringify({
            type: "auth",
            access_token: token
        }));
        statusChanged("auth", i18n("Authenticating with Home Assistant…"));
        authTimer.restart();
    }

    function _handleAuthTimeout() {
        if (_authenticated)
            return;
        statusChanged("error", i18n("Authentication with Home Assistant timed out."));
        _closeSocket();
        _scheduleReconnect(i18n("Authentication with Home Assistant timed out."));
    }

    function _handleMessage(text) {
        let message = null;
        try {
            message = JSON.parse(text);
        } catch (error) {
            statusChanged("error", i18n("Invalid response from Home Assistant."));
            return;
        }

        if (!message || typeof message.type !== "string")
            return;

        if (message.type === "auth_required") {
            _sendAuth();
            return;
        }

        if (message.type === "auth_ok") {
            _handleAuthOk();
            return;
        }

        if (message.type === "auth_invalid") {
            _handleAuthInvalid();
            return;
        }

        if (message.type === "result") {
            _handleResult(message);
            return;
        }

        if (message.type === "event") {
            _handleEvent(message);
        }
    }

    function _handleAuthOk() {
        authTimer.stop();
        _authFailed = false;
        _authenticated = true;
        _reconnectAttempt = 0;
        statusChanged("syncing", i18n("Authenticating with Home Assistant…"));

        request("auth/current_user", null, function (result) {
            _admin = !!(result && result.is_admin);
            permissionChanged(_admin);
            authenticated(_admin);
        }, function (error) {
            if (error && error.code === "aborted")
                return;
            _admin = false;
            permissionChanged(false);
            authenticated(false);
        });
    }

    function _handleAuthInvalid() {
        _authFailed = true;
        authTimer.stop();
        const message = i18n("Home Assistant rejected the access token.");
        statusChanged("error", message);
        authFailed(message);
        _closeSocket();
    }

    function _finishRequest(id, error) {
        const pending = _pendingRequests[id];
        if (!pending)
            return;

        delete _pendingRequests[id];
        _pendingCount = Math.max(0, _pendingCount - 1);
        if (_pendingCount === 0)
            requestTimer.running = false;

        if (error && pending.onError)
            pending.onError(error);
    }

    function _handleResult(message) {
        const pending = _pendingRequests[message.id];
        if (!pending)
            return;

        delete _pendingRequests[message.id];
        _pendingCount = Math.max(0, _pendingCount - 1);
        if (_pendingCount === 0)
            requestTimer.running = false;

        if (message.success === false) {
            const error = message.error || {};
            if (pending.onError)
                pending.onError(_makeError(error.code || "unknown", error.message || ""));
            return;
        }

        if (pending.onSuccess)
            pending.onSuccess(message.result);
    }

    function _checkRequestTimeouts() {
        const now = Date.now();
        const expired = [];
        for (const id in _pendingRequests) {
            if (_pendingRequests[id].deadline <= now)
                expired.push(id);
        }

        for (let i = 0; i < expired.length; ++i) {
            const pending = _pendingRequests[expired[i]];
            delete _pendingRequests[expired[i]];
            _pendingCount = Math.max(0, _pendingCount - 1);
            if (pending && pending.onError) {
                pending.onError(_makeError("timeout",
                    i18n("Request to Home Assistant timed out.")));
            }
        }

        if (_pendingCount === 0)
            requestTimer.running = false;
    }

    function _rejectAllPending(code) {
        const pendingRequests = [];
        for (const id in _pendingRequests)
            pendingRequests.push(_pendingRequests[id]);

        _pendingRequests = ({});
        _pendingCount = 0;
        requestTimer.running = false;

        const message = code === "syncConnectionLost"
            ? i18n("Connection to Home Assistant lost.")
            : i18n("Request cancelled.");
        for (let i = 0; i < pendingRequests.length; ++i) {
            const pending = pendingRequests[i];
            if (pending && pending.onError)
                pending.onError(_makeError(code || "aborted", message));
        }
    }

    function _handleEvent(message) {
        const event = message.event;
        if (!event || typeof event.event_type !== "string")
            return;
        eventReceived(event.event_type, event.data || ({}));
    }

    function _makeError(code, message) {
        return { code: code, message: message || "" };
    }

    onActiveChanged: {
        if (!active)
            _teardown();
    }

    readonly property WebSocket socket: WebSocket {
        id: socket
        active: false
        onStatusChanged: transport._handleSocketStatus()
        onTextMessageReceived: message => transport._handleMessage(message)
    }

    readonly property Timer connectTimer: Timer {
        id: connectTimer
        interval: 100
        repeat: false
        onTriggered: transport._openSocket()
    }

    readonly property Timer reconnectTimer: Timer {
        id: reconnectTimer
        interval: 1000
        repeat: false
        onTriggered: transport._openSocket()
    }

    readonly property Timer authTimer: Timer {
        id: authTimer
        interval: 10000
        repeat: false
        onTriggered: transport._handleAuthTimeout()
    }

    readonly property Timer requestTimer: Timer {
        id: requestTimer
        interval: 500
        repeat: true
        running: false
        onTriggered: transport._checkRequestTimeouts()
    }
}
