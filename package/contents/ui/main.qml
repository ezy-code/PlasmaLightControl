// qmllint disable missing-property
import QtQuick
import org.kde.plasma.plasmoid
import "generated/HaRest.mjs" as HaRest
import "generated/PanelSession.mjs" as PanelSession

// Thin QML host: state, actions and preset logic live in src/panel/session.ts.
PlasmoidItem {
    id: mainItem

    ErrorMessages { id: errorMessages }
    PanelTexts { id: texts }

    // The only place that reads the Plasmoid configuration.
    readonly property var configValues: ({
        url: Plasmoid.configuration.haUrl,
        token: Plasmoid.configuration.haToken,
        entityId: Plasmoid.configuration.entityId,
        pollInterval: Plasmoid.configuration.pollInterval,
        syncPresets: Plasmoid.configuration.syncFavorites === true,
        localPresets: Plasmoid.configuration.savedColors,
        cachedPresetsJson: Plasmoid.configuration.colorPresets,
        cachedMetaJson: Plasmoid.configuration.colorPresetsMeta
    })

    // What the session cannot own: KConfig, XHR, timers, translations, render.
    readonly property var panelHost: ({
        config: () => mainItem.configValues,
        setLocalPresets: (value) => { Plasmoid.configuration.savedColors = value },
        setCachedPresetsJson: (value) => { Plasmoid.configuration.colorPresets = value },
        setCachedMetaJson: (value) => { Plasmoid.configuration.colorPresetsMeta = value },
        createRequestScope: HaRest.createRequestScope,
        fetchState: HaRest.fetchState,
        turnOn: HaRest.turnOn,
        toggle: HaRest.toggle,
        cancelRequests: HaRest.cancelRequests,
        errorText: (error) => errorMessages.text(error),
        translate: (key, argument) => texts.text(key, argument),
        render: (snapshot) => { mainItem.snapshot = snapshot },
        callLater: Qt.callLater,
        restartRefreshTimer: () => refreshTimer.restart(),
        startColorTimer: (delayMs) => {
            colorApplyTimer.interval = delayMs;
            colorApplyTimer.restart();
        },
        stopColorTimer: () => colorApplyTimer.stop(),
        now: () => Math.floor(Date.now() / 1000),
        syncModule: () => (presetSyncLoader.item ? presetSyncLoader.item.module : null),
        reloadSync: () => mainItem.reloadPresetSync()
    })

    readonly property var session: PanelSession.createSession(panelHost)

    // The Loader hands these callbacks to the component it creates.
    readonly property var presetSyncCallbacks: ({
        presetsPulled: (presets, meta) => mainItem.session.handlePresetsPulled(presets, meta),
        presetsPushed: (presets, meta) => mainItem.session.handlePresetsPushed(presets, meta),
        statusChanged: (state, message) => mainItem.session.handleStatusChanged(state, message),
        authFailed: (message) => mainItem.session.handleAuthFailed(message),
        writeForbidden: (message) => mainItem.session.handleWriteForbidden(message),
        permissionChanged: (admin) => mainItem.session.handlePermissionChanged(admin)
    })

    // Session snapshot; every change replaces the whole object.
    property var snapshot: PanelSession.initialSnapshot()

    Plasmoid.icon: Qt.resolvedUrl("../icons/light-on.svg")
    toolTipMainText: snapshot.toolTipMainText
    toolTipSubText: snapshot.toolTipSubText

    function reloadPresetSync() {
        // Reload through the source: "active" is bound and must stay untouched.
        presetSyncLoader.source = "";
        Qt.callLater(function () {
            presetSyncLoader.source = "PresetSync.qml";
        });
    }

    onConfigValuesChanged: {
        if (mainItem.session)
            mainItem.session.setConfig(mainItem.configValues);
    }

    Component.onCompleted: mainItem.session.start()

    Timer {
        id: pollTimer
        interval: mainItem.snapshot.pollIntervalSeconds * 1000
        running: mainItem.snapshot.configured
        repeat: true
        triggeredOnStart: true
        onTriggered: mainItem.session.refresh()
    }

    Timer {
        id: refreshTimer
        interval: 600
        repeat: false
        onTriggered: mainItem.session.refresh()
    }

    // Debounced in the session; closing the popup still applies the last color.
    Timer {
        id: colorApplyTimer
        repeat: false
        onTriggered: mainItem.session.applyScheduledColor()
    }

    Loader {
        id: presetSyncLoader
        active: mainItem.snapshot.syncEnabled
        source: "PresetSync.qml"

        onLoaded: if (item)
            item.callbacks = mainItem.presetSyncCallbacks

        onStatusChanged: {
            if (!active)
                return;

            if (status === Loader.Error)
                mainItem.session.loaderFailed(errorString);
            else if (status === Loader.Ready)
                mainItem.session.loaderReady();
        }
    }

    // One Binding per property: the targets exist only once the Loader is ready.
    Binding {
        target: presetSyncLoader.item
        property: "baseUrl"
        value: mainItem.snapshot.connection.url
        when: presetSyncLoader.item !== null
    }
    Binding {
        target: presetSyncLoader.item
        property: "token"
        value: mainItem.snapshot.connection.token
        when: presetSyncLoader.item !== null
    }
    Binding {
        target: presetSyncLoader.item
        property: "entityId"
        value: mainItem.snapshot.connection.entityId
        when: presetSyncLoader.item !== null
    }
    Binding {
        target: presetSyncLoader.item
        property: "active"
        value: mainItem.snapshot.syncEnabled
        when: presetSyncLoader.item !== null
    }
    Binding {
        target: presetSyncLoader.item
        property: "cachedPresets"
        value: mainItem.snapshot.cachedPresets
        when: presetSyncLoader.item !== null
    }
    Binding {
        target: presetSyncLoader.item
        property: "cachedMeta"
        value: mainItem.snapshot.cachedMeta
        when: presetSyncLoader.item !== null
    }
    Binding {
        target: presetSyncLoader.item
        property: "cachedAvailable"
        value: mainItem.snapshot.cachedAvailable
        when: presetSyncLoader.item !== null
    }
    Binding {
        target: presetSyncLoader.item
        property: "lightAttributes"
        value: mainItem.snapshot.lightAttributes
        when: presetSyncLoader.item !== null
    }
    Binding {
        target: presetSyncLoader.item
        property: "lightStateKnown"
        value: mainItem.snapshot.lightStateKnown
        when: presetSyncLoader.item !== null
    }

    preferredRepresentation: null // Plasma picks per panel

    compactRepresentation: CompactRepresentation {}
    fullRepresentation: FullRepresentation {}
}
