// qmllint disable missing-property
import QtQuick
import "generated/PresetSync.mjs" as PresetSync

// Thin QML host: the domain logic lives in src/presets/sync.ts.
Item {
    id: syncRoot

    visible: false
    width: 0
    height: 0

    property string baseUrl: ""
    property string token: ""
    property string entityId: ""
    property bool active: true
    // Inputs owned by main.qml (bound there, never assigned here).
    property var cachedPresets: []
    property var cachedMeta: ({})
    property bool cachedAvailable: false
    property var lightAttributes: ({})
    property bool lightStateKnown: false

    // Assigned by main.qml once the Loader created this item.
    property var callbacks: null
    property bool admin: false

    // The timers exist only after construction, so start is deferred.
    property bool ready: false
    property bool started: false

    // Do not run before the caller's callbacks exist; the first status would be lost.
    function ensureStarted() {
        if (started || !ready || !callbacks)
            return;
        started = true;
        module.start();
    }

    // Resolved per call: a binding would cache undefined before the timers exist.
    function timerFor(name) {
        return ({
            config: configTimer,
            pushDebounce: pushDebounceTimer,
            pushRetry: pushRetryTimer,
            event: eventTimer,
            defaultsWait: defaultsWaitTimer
        })[name];
    }

    // The module only knows these six calls, never the QML component.
    readonly property var transportHandle: ({
        isAuthenticated: () => transport.module.isAuthenticated(),
        request: transport.module.request,
        subscribe: transport.module.subscribe,
        connect: transport.module.connect,
        reset: transport.module.reset,
        retryNow: transport.module.retryNow
    })

    readonly property var syncHost: ({
        config: () => ({
            baseUrl: syncRoot.baseUrl,
            token: syncRoot.token,
            entityId: syncRoot.entityId,
            active: syncRoot.active
        }),
        cache: () => ({
            presets: syncRoot.cachedPresets,
            meta: syncRoot.cachedMeta,
            available: syncRoot.cachedAvailable
        }),
        lightAttributes: () => syncRoot.lightAttributes,
        lightStateKnown: () => syncRoot.lightStateKnown,
        transport: () => syncRoot.transportHandle,
        startTimer(name, delayMs) {
            const timer = syncRoot.timerFor(name);
            if (!timer)
                return;
            timer.interval = delayMs;
            timer.restart();
        },
        stopTimer(name) {
            const timer = syncRoot.timerFor(name);
            if (timer)
                timer.stop();
        },
        now: () => Date.now() / 1000,
        callLater: Qt.callLater,
        translate: (key, argument) => texts.text(key, argument)
    })

    readonly property var syncEvents: ({
        presetsPulled: (presets, meta) => syncRoot.callbacks.presetsPulled(presets, meta),
        presetsPushed: (presets, meta) => syncRoot.callbacks.presetsPushed(presets, meta),
        statusChanged: (state, message) => syncRoot.callbacks.statusChanged(state, message),
        authFailed: (message) => syncRoot.callbacks.authFailed(message),
        writeForbidden: (message) => syncRoot.callbacks.writeForbidden(message),
        permissionChanged: (isAdmin) => {
            syncRoot.admin = isAdmin;
            syncRoot.callbacks.permissionChanged(isAdmin);
        }
    })

    readonly property var module: PresetSync.createPresetSync(syncHost, syncEvents)

    Component.onCompleted: {
        ready = true;
        ensureStarted();
    }

    onCallbacksChanged: ensureStarted()
    onActiveChanged: module.inputsChanged()
    onBaseUrlChanged: module.inputsChanged()
    onTokenChanged: module.inputsChanged()
    onEntityIdChanged: module.inputsChanged()
    onLightStateKnownChanged: module.lightStateKnownChanged()
    onLightAttributesChanged: module.lightAttributesChanged()

    PanelTexts { id: texts }

    HaSocket {
        id: transport
        url: syncRoot.baseUrl
        token: syncRoot.token
        active: syncRoot.active

        callbacks: ({
            statusChanged: (state, message) => syncRoot.module.transportStatus(state, message),
            authFailed: (message) => syncRoot.module.transportAuthFailed(message),
            authenticated: (isAdmin) => syncRoot.module.transportAuthenticated(isAdmin),
            permissionChanged: (isAdmin) => syncRoot.module.transportPermissionChanged(isAdmin),
            eventReceived: (eventType, data) => syncRoot.module.transportEvent(eventType, data)
        })
    }

    Timer {
        id: configTimer
        onTriggered: syncRoot.module.handleTimer("config")
    }

    Timer {
        id: pushDebounceTimer
        onTriggered: syncRoot.module.handleTimer("pushDebounce")
    }

    Timer {
        id: pushRetryTimer
        onTriggered: syncRoot.module.handleTimer("pushRetry")
    }

    Timer {
        id: eventTimer
        onTriggered: syncRoot.module.handleTimer("event")
    }

    Timer {
        id: defaultsWaitTimer
        onTriggered: syncRoot.module.handleTimer("defaultsWait")
    }
}
