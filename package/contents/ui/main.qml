import QtQuick
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import "HomeAssistant.js" as HA

PlasmoidItem {
    id: mainItem

    ErrorMessages { id: errorMessages }

    // --- Zustand der Lampe ---
    property bool lightOn: false
    property int brightness: 0          // 0..255 (Home-Assistant-Skala)
    property real hue: 0.0              // 0..1
    property real saturation: 0.0       // 0..1
    property int colorTempKelvin: 3500
    property int minKelvin: 2000
    property int maxKelvin: 6500
    property bool supportsColor: false
    property bool supportsColorTemp: false

    property string statusText: ""
    property bool connected: false

    // --- Status polling ---
    // One request at a time; extra triggers coalesce into a single follow-up.
    property int stateRequestId: 0
    property bool stateRequestInFlight: false
    property bool stateRefreshPending: false

    readonly property int pollIntervalSeconds: Math.max(3, Plasmoid.configuration.pollInterval)
    // Keep the timeout below the poll interval.
    readonly property int requestTimeout: Math.max(2000, Math.min(pollIntervalSeconds * 1000 - 500, 15000))

    // Request namespace per widget instance.
    readonly property string requestScope: HA.createScope()

    readonly property var cfg: ({
        url: Plasmoid.configuration.haUrl,
        token: Plasmoid.configuration.haToken,
        entityId: Plasmoid.configuration.entityId,
        timeout: requestTimeout,
        scope: requestScope
    })

    readonly property bool configured: cfg.url && cfg.token && cfg.entityId

    Plasmoid.icon: Qt.resolvedUrl("../icons/light-on.svg")
    toolTipMainText: Plasmoid.configuration.entityId || i18n("Plasma Light Control")
    toolTipSubText: {
        if (!configured)
            return i18n("Not configured – please set up the connection.");
        if (!connected)
            return statusText || i18n("Connecting …");
        return lightOn
            ? i18n("On · Brightness %1 %", Math.round(brightness / 255 * 100))
            : i18nc("@state", "Off");
    }

    // --- Statusabfrage ---
    function refresh() {
        if (!configured) {
            stateRequestInFlight = false;
            stateRefreshPending = false;
            connected = false;
            statusText = i18n("Not configured");
            return;
        }

        if (stateRequestInFlight) {
            stateRefreshPending = true;
            return;
        }

        const requestId = ++stateRequestId;
        stateRequestInFlight = true;

        HA.fetchState(cfg, function (state) {
            if (requestId !== stateRequestId)
                return;
            finishStateRequest();
            connected = true;
            statusText = "";
            applyState(state);
        }, function (err) {
            if (requestId !== stateRequestId)
                return;
            finishStateRequest();
            connected = false;
            statusText = errorMessages.text(err);
        });
    }

    function finishStateRequest() {
        stateRequestInFlight = false;
        if (stateRefreshPending) {
            stateRefreshPending = false;
            Qt.callLater(mainItem.refresh);
        }
    }

    // Drop in-flight requests after a config change.
    function cancelPendingRequests() {
        HA.cancelRequests(cfg.scope, "GET");
        ++stateRequestId;
        stateRequestInFlight = false;
        stateRefreshPending = false;
    }

    function applyState(state) {
        if (!state || !state.state)
            return;
        lightOn = (state.state === "on");
        const a = state.attributes || {};

        if (a.brightness !== undefined && a.brightness !== null)
            brightness = a.brightness;

        const modes = a.supported_color_modes || [];
        supportsColor = modes.indexOf("hs") >= 0 || modes.indexOf("rgb") >= 0
            || modes.indexOf("rgbw") >= 0 || modes.indexOf("rgbww") >= 0 || modes.indexOf("xy") >= 0;
        supportsColorTemp = modes.indexOf("color_temp") >= 0;

        if (a.min_color_temp_kelvin)
            minKelvin = a.min_color_temp_kelvin;
        if (a.max_color_temp_kelvin)
            maxKelvin = a.max_color_temp_kelvin;
        if (a.color_temp_kelvin)
            colorTempKelvin = a.color_temp_kelvin;

        if (a.hs_color && a.hs_color.length === 2) {
            hue = a.hs_color[0] / 360;
            saturation = a.hs_color[1] / 100;
        } else if (a.rgb_color && a.rgb_color.length === 3) {
            const c = Qt.rgba(a.rgb_color[0] / 255, a.rgb_color[1] / 255, a.rgb_color[2] / 255, 1);
            hue = c.hsvHue >= 0 ? c.hsvHue : 0;
            saturation = c.hsvSaturation;
        }
    }

    // --- Aktionen ---
    function toggleLight() {
        if (!configured)
            return;
        HA.toggle(cfg, function () {
            // Kurze Verzögerung, damit HA den neuen Zustand übernommen hat.
            refreshTimer.restart();
            lightOn = !lightOn; // optimistisches Update
        }, function (err) {
            statusText = errorMessages.text(err);
        });
    }

    function setBrightness(value) {
        brightness = value;
        if (!configured)
            return;
        HA.turnOn(cfg, { brightness: Math.round(value) }, function () {
            lightOn = true;
        }, function (err) { statusText = errorMessages.text(err); });
    }

    function setColor(h, s) {
        hue = h;
        saturation = s;
        if (!configured)
            return;
        HA.turnOn(cfg, { hs_color: [Math.round(h * 360), Math.round(s * 100)] }, function () {
            lightOn = true;
        }, function (err) { statusText = errorMessages.text(err); });
    }

    function setColorTemp(kelvin) {
        colorTempKelvin = kelvin;
        if (!configured)
            return;
        HA.turnOn(cfg, { color_temp_kelvin: Math.round(kelvin) }, function () {
            lightOn = true;
        }, function (err) { statusText = errorMessages.text(err); });
    }

    // --- Timer ---
    Timer {
        id: pollTimer
        interval: mainItem.pollIntervalSeconds * 1000
        running: mainItem.configured
        repeat: true
        triggeredOnStart: true
        onTriggered: mainItem.refresh()
    }

    Timer {
        id: refreshTimer
        interval: 600
        repeat: false
        onTriggered: mainItem.refresh()
    }

    onCfgChanged: {
        mainItem.cancelPendingRequests();
        mainItem.refresh();
    }

    // --- Repräsentationen ---
    preferredRepresentation: null // Plasma entscheidet je nach Panel

    compactRepresentation: CompactRepresentation {}
    fullRepresentation: FullRepresentation {}
}
