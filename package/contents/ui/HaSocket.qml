import QtQuick
import QtWebSockets
import "generated/HaSocket.mjs" as HaTransport

// Thin QML host: every protocol decision lives in src/ha/socket.ts.
QtObject {
    id: host

    property string url: ""
    property string token: ""
    property bool active: false

    // Assigned by the owner; a QML signal would only bounce events back into TS.
    property var callbacks: null

    // Resolved per call: a binding would cache undefined before the timers exist.
    function timerFor(name) {
        return ({
            connect: connectTimer,
            reconnect: reconnectTimer,
            auth: authTimer,
            poll: pollTimer
        })[name];
    }

    // The transport never sees WebSocket.* enums, only these four states.
    readonly property var socketHandle: ({
        status() {
            switch (host.socket.status) {
            case WebSocket.Connecting:
                return "connecting";
            case WebSocket.Open:
                return "open";
            case WebSocket.Closing:
                return "closing";
            default:
                return "closed";
            }
        },
        active: () => host.socket.active,
        setActive: (value) => { host.socket.active = value; },
        setUrl: (value) => { host.socket.url = value; },
        send: (text) => { host.socket.sendTextMessage(text); }
    })

    readonly property var transportHost: ({
        credentials: () => ({ url: host.url, token: host.token }),
        isActive: () => host.active,
        socket: () => host.socketHandle,
        startTimer(name, delayMs, repeat) {
            const timer = host.timerFor(name);
            if (!timer)
                return;
            timer.interval = delayMs;
            timer.repeat = repeat;
            timer.restart();
        },
        stopTimer(name) {
            const timer = host.timerFor(name);
            if (timer)
                timer.stop();
        },
        now: () => Date.now(),
        translate: (key) => host.texts.text(key)
    })

    // The owner owns the handlers; a missing one must not abort the transport.
    function notify(name, first, second) {
        const callbacks = host.callbacks;
        if (!callbacks || typeof callbacks[name] !== "function")
            return;
        callbacks[name](first, second);
    }

    readonly property var transportEvents: ({
        statusChanged: (state, message) => host.notify("statusChanged", state, message),
        authFailed: (message) => host.notify("authFailed", message),
        authenticated: (isAdmin) => host.notify("authenticated", isAdmin),
        permissionChanged: (isAdmin) => host.notify("permissionChanged", isAdmin),
        eventReceived: (eventType, data) => host.notify("eventReceived", eventType, data)
    })

    readonly property var module: HaTransport.createTransport(transportHost, transportEvents)

    // QtObject has no default property, so texts is a property, not a child.
    readonly property PanelTexts texts: PanelTexts {}

    onActiveChanged: {
        if (!active)
            module.deactivate();
    }

    readonly property WebSocket socket: WebSocket {
        id: socket
        active: false
        onStatusChanged: host.module.handleSocketStatus()
        onTextMessageReceived: message => host.module.handleMessage(message)
    }

    readonly property Timer connectTimer: Timer {
        id: connectTimer
        interval: 100
        repeat: false
        onTriggered: host.module.handleTimer("connect")
    }

    readonly property Timer reconnectTimer: Timer {
        id: reconnectTimer
        interval: 1000
        repeat: false
        onTriggered: host.module.handleTimer("reconnect")
    }

    readonly property Timer authTimer: Timer {
        id: authTimer
        interval: 10000
        repeat: false
        onTriggered: host.module.handleTimer("auth")
    }

    readonly property Timer pollTimer: Timer {
        id: pollTimer
        interval: 500
        repeat: true
        running: false
        onTriggered: host.module.handleTimer("poll")
    }
}
