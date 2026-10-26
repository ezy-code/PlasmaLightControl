import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import "HomeAssistant.js" as HA
import "FavoritesShared.js" as FavoritesShared

Kirigami.FormLayout {
    id: page

    // Von Plasma erwartete Alias-Properties (cfg_<Key>) für die Konfiguration.
    property alias cfg_haUrl: urlField.text
    property alias cfg_haToken: tokenField.text
    property alias cfg_entityId: entityField.text
    property alias cfg_pollInterval: pollField.value

    // savedColors wird nicht auf dieser Seite bearbeitet, muss aber als Alias
    // existieren, damit Plasma den Wert nicht zurücksetzt.
    property var cfg_savedColors
    property var cfg_savedColorsDefault: []

    property bool cfg_syncFavorites
    property bool cfg_syncFavoritesDefault: false
    property string cfg_colorPresets
    property string cfg_colorPresetsDefault: ""
    property string cfg_colorPresetsMeta
    property string cfg_colorPresetsMetaDefault: ""

    property bool loadingLamps: false
    property bool webSocketsAvailable: true
    readonly property string requestScope: "config"
    readonly property string cacheStatusText: buildCacheStatus()

    function detectWebSockets() {
        try {
            const probe = Qt.createQmlObject("import QtQml; import QtWebSockets; QtObject {}",
                page, "webSocketsProbe");
            if (probe) {
                probe.destroy();
                return true;
            }
        } catch (error) {
            console.warn("Qt WebSockets is not available: " + error);
        }
        return false;
    }

    function currentSource() {
        return FavoritesShared.sourceKey(urlField.text, entityField.text);
    }

    // Clicking the CheckBox assigns `checked` internally and thereby removes
    // the initial binding. Restore it after the confirmation dialog closes so
    // a later configuration reset (Defaults) is reflected again.
    function restoreSyncCheckBinding() {
        syncCheck.checked = Qt.binding(function () {
            return page.cfg_syncFavorites;
        });
    }

    function buildCacheStatus() {
        try {
            const meta = JSON.parse(cfg_colorPresetsMeta || "{}");
            if (!meta || meta.v !== 1 || meta.source !== currentSource())
                return i18n("No cached favorite colors for this entity yet.");

            const presets = JSON.parse(cfg_colorPresets || "[]");
            const count = Array.isArray(presets) ? presets.length : 0;
            const dateText = meta.syncedAt > 0
                ? Qt.formatDateTime(new Date(meta.syncedAt * 1000))
                : i18n("never");
            return i18np("Cached: %1 color, synced at %2",
                "Cached: %1 colors, synced at %2", count, dateText);
        } catch (error) {
            return i18n("No cached favorite colors for this entity yet.");
        }
    }

    Component.onCompleted: webSocketsAvailable = detectWebSockets()

    function requestCfg() {
        return {
            url: urlField.text.trim(),
            token: tokenField.text.trim(),
            scope: requestScope,
            timeout: 8000
        };
    }

    ErrorMessages { id: errorMessages }

    QQC2.TextField {
        id: urlField
        Kirigami.FormData.label: i18n("Home Assistant URL:")
        placeholderText: "http://homeassistant.local:8123"
        Layout.fillWidth: true
    }

    QQC2.TextField {
        id: tokenField
        Kirigami.FormData.label: i18n("Access token:")
        placeholderText: i18n("Long-Lived Access Token")
        echoMode: showToken.checked ? TextInput.Normal : TextInput.Password
        Layout.fillWidth: true
    }

    QQC2.CheckBox {
        id: showToken
        text: i18n("Show token")
    }

    QQC2.Label {
        Layout.fillWidth: true
        Layout.maximumWidth: Kirigami.Units.gridUnit * 22
        wrapMode: Text.WordWrap
        font: Kirigami.Theme.smallFont
        opacity: 0.7
        text: i18n("You can create a token in Home Assistant under “Profile → Security → Long-Lived Access Tokens”.")
    }

    Item { Kirigami.FormData.isSection: true }

    QQC2.TextField {
        id: entityField
        Kirigami.FormData.label: i18n("Lamp entity ID:")
        placeholderText: "light.living_room"
        Layout.fillWidth: true
    }

    RowLayout {
        QQC2.Button {
            id: loadLampsButton
            text: i18n("Load lamps")
            icon.name: "view-refresh"
            enabled: !page.loadingLamps && urlField.text.trim().length > 0 && tokenField.text.trim().length > 0
            onClicked: {
                page.loadingLamps = true;
                testLabel.text = i18n("Loading lamps …");
                testLabel.color = Kirigami.Theme.textColor;
                HA.fetchLights(page.requestCfg(), function (lamps) {
                    page.loadingLamps = false;
                    lampModel.clear();
                    for (let i = 0; i < lamps.length; ++i)
                        lampModel.append({ label: lamps[i].name + " (" + lamps[i].entityId + ")", entityId: lamps[i].entityId });
                    if (lamps.length === 0) {
                        testLabel.text = i18n("No lamps found.");
                        testLabel.color = Kirigami.Theme.neutralTextColor;
                        return;
                    }
                    testLabel.text = i18n("Found %1 lamps.", lamps.length);
                    testLabel.color = Kirigami.Theme.positiveTextColor;
                    for (let j = 0; j < lamps.length; ++j) {
                        if (lamps[j].entityId === entityField.text.trim()) {
                            lampCombo.currentIndex = j;
                            break;
                        }
                    }
                }, function (err) {
                    page.loadingLamps = false;
                    testLabel.text = i18n("Error: %1", errorMessages.text(err));
                    testLabel.color = Kirigami.Theme.negativeTextColor;
                });
            }
        }

        QQC2.BusyIndicator {
            running: page.loadingLamps
            visible: running
            implicitWidth: Kirigami.Units.iconSizes.small
            implicitHeight: Kirigami.Units.iconSizes.small
        }
    }

    QQC2.ComboBox {
        id: lampCombo
        Kirigami.FormData.label: i18n("Available lamps:")
        Layout.fillWidth: true
        visible: lampModel.count > 0
        model: lampModel
        textRole: "label"
        onActivated: index => {
            const id = lampModel.get(index).entityId;
            if (entityField.text !== id)
                entityField.text = id;
        }
    }

    ListModel { id: lampModel }

    QQC2.SpinBox {
        id: pollField
        Kirigami.FormData.label: i18n("Status polling interval (s):")
        from: 3
        to: 300
        value: 15
    }

    Item { Kirigami.FormData.isSection: true }

    QQC2.CheckBox {
        id: syncCheck
        Layout.fillWidth: true
        text: i18n("Sync favorite colors with Home Assistant")
        checked: page.cfg_syncFavorites
        enabled: page.webSocketsAvailable || page.cfg_syncFavorites
        onClicked: {
            if (checked) {
                confirmDialog.open();
            } else {
                page.cfg_syncFavorites = false;
                page.restoreSyncCheckBinding();
            }
        }
    }

    QQC2.Label {
        Layout.fillWidth: true
        Layout.maximumWidth: Kirigami.Units.gridUnit * 22
        wrapMode: Text.WordWrap
        font: Kirigami.Theme.smallFont
        opacity: 0.7
        text: page.webSocketsAvailable
            ? i18n("Favorite colors are read from and written to the lamp's Home Assistant entity registry entry. Without an administrator token, synchronization is read-only.")
            : i18n("The Qt WebSockets module is required for synchronization and could not be loaded.")
    }

    QQC2.Label {
        visible: page.cfg_syncFavorites
        Layout.fillWidth: true
        Layout.maximumWidth: Kirigami.Units.gridUnit * 22
        wrapMode: Text.WordWrap
        font: Kirigami.Theme.smallFont
        opacity: 0.7
        text: page.webSocketsAvailable
            ? page.cacheStatusText
            : i18n("Synchronization is unavailable.")
    }

    Kirigami.PromptDialog {
        id: confirmDialog
        title: i18n("Enable Home Assistant color presets?")
        subtitle: i18n("Local saved colors (%1) will be replaced by favorite colors from Home Assistant. If no favorite colors are configured there, the default colors will be used. Changes made in the widget are written to Home Assistant and become visible to all clients. Writing requires an administrator token; otherwise synchronization is read-only.",
            page.cfg_savedColors ? page.cfg_savedColors.length : 0)
        standardButtons: Kirigami.Dialog.Ok | Kirigami.Dialog.Cancel

        onAccepted: {
            page.cfg_syncFavorites = true;
            page.restoreSyncCheckBinding();
        }
        onRejected: {
            page.cfg_syncFavorites = false;
            page.restoreSyncCheckBinding();
        }
        onVisibleChanged: {
            if (!visible)
                page.restoreSyncCheckBinding();
        }
    }

    Item { Kirigami.FormData.isSection: true }

    RowLayout {
        QQC2.Button {
            text: i18n("Test connection")
            icon.name: "network-connect"
            onClicked: {
                testLabel.text = i18n("Testing …");
                testLabel.color = Kirigami.Theme.textColor;
                HA.fetchState({ url: urlField.text, token: tokenField.text, entityId: entityField.text },
                    function (state) {
                        if (state && state.state) {
                            testLabel.text = i18n("Connected – lamp is %1.",
                                state.state === "on" ? i18nc("@state", "on") : i18nc("@state", "off"));
                            testLabel.color = Kirigami.Theme.positiveTextColor;
                        } else {
                            testLabel.text = i18n("Response without a valid state.");
                            testLabel.color = Kirigami.Theme.neutralTextColor;
                        }
                    },
                    function (err) {
                        testLabel.text = i18n("Error: %1", errorMessages.text(err));
                        testLabel.color = Kirigami.Theme.negativeTextColor;
                    });
            }
        }
    }

    QQC2.Label {
        id: testLabel
        Layout.fillWidth: true
        Layout.maximumWidth: Kirigami.Units.gridUnit * 22
        wrapMode: Text.WordWrap
        text: ""
    }
}
