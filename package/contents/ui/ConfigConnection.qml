// qmllint disable missing-property
import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import "generated/HaRest.mjs" as HaRest
import "generated/ConfigPage.mjs" as ConfigPage

// Thin QML host: the logic lives in src/panel/configPage.ts, this file owns the
// cfg_<Key> aliases, the widgets and the holder the module renders into.
Kirigami.FormLayout {
    id: generalPage

    property alias cfg_haUrl: urlField.text
    property alias cfg_haToken: tokenField.text
    property alias cfg_entityId: entityField.text
    property alias cfg_pollInterval: pollField.value

    // Not edited here, but Plasma resets the key without an alias.
    property var cfg_savedColors
    property var cfg_savedColorsDefault: []

    property bool cfg_syncFavorites
    property bool cfg_syncFavoritesDefault: false
    property string cfg_colorPresets
    property string cfg_colorPresetsDefault: ""
    property string cfg_colorPresetsMeta
    property string cfg_colorPresetsMetaDefault: ""

    // Written by module render(), the bindings below only read it.
    QtObject {
        id: pageState
        property bool loadingLamps: false
        property var lamps: []
        property int selectedLampIndex: -1
        property string cacheStatus: ""
        property string testText: ""
        property string testTone: "neutral"
        property bool webSocketsAvailable: true

        onLampsChanged: lampCombo.currentIndex = selectedLampIndex
    }

    PanelTexts { id: texts }
    ErrorMessages { id: errorMessages }

    component HintLabel: QQC2.Label {
        Layout.fillWidth: true
        Layout.maximumWidth: Kirigami.Units.gridUnit * 22
        wrapMode: Text.WordWrap
        font: Kirigami.Theme.smallFont
        opacity: 0.7
    }

    // What the page cannot own: cfg_<Key>, HA calls, WebSockets probe, translations.
    readonly property var configPageHost: ({
        fields: () => ({
            url: generalPage.cfg_haUrl || "",
            token: generalPage.cfg_haToken || "",
            entityId: generalPage.cfg_entityId || "",
            localPresets: generalPage.cfg_savedColors || [],
            cachedPresetsJson: generalPage.cfg_colorPresets || "",
            cachedMetaJson: generalPage.cfg_colorPresetsMeta || ""
        }),
        fetchLights: HaRest.fetchLights,
        fetchState: HaRest.fetchState,
        errorText: (error) => errorMessages.text(error),
        formatTimestamp: (seconds) => Qt.formatDateTime(new Date(seconds * 1000)),
        probeWebSockets() {
            try {
                const probe = Qt.createQmlObject("import QtQml; import QtWebSockets; QtObject {}",
                    generalPage, "webSocketsProbe");
                if (probe) {
                    probe.destroy();
                    return true;
                }
            } catch (error) {
                console.warn("Qt WebSockets is not available: " + error);
            }
            return false;
        },
        translate: (key, argument) => texts.text(key, argument),
        render(snapshot) {
            // Index first, so onLampsChanged already sees it.
            pageState.selectedLampIndex = snapshot.selectedLampIndex;
            pageState.loadingLamps = snapshot.loadingLamps;
            // Only a new list may fire onLampsChanged, or the ComboBox is rebuilt.
            if (pageState.lamps !== snapshot.lamps)
                pageState.lamps = snapshot.lamps;
            pageState.cacheStatus = snapshot.cacheStatus;
            pageState.testText = snapshot.testText;
            pageState.testTone = snapshot.testTone;
            pageState.webSocketsAvailable = snapshot.webSocketsAvailable;
        }
    })

    readonly property var page: ConfigPage.createConfigPage(configPageHost)

    // A click drops the `checked` binding; restore it, so a config reset shows up.
    function restoreSyncCheckBinding() {
        syncCheck.checked = Qt.binding(function () {
            return generalPage.cfg_syncFavorites;
        });
    }

    // cfg_<Key> also changes from outside (Plasma, defaults), so report every change.
    onCfg_haUrlChanged: page.fieldsChanged()
    onCfg_haTokenChanged: page.fieldsChanged()
    onCfg_entityIdChanged: page.fieldsChanged()
    onCfg_savedColorsChanged: page.fieldsChanged()
    onCfg_colorPresetsChanged: page.fieldsChanged()
    onCfg_colorPresetsMetaChanged: page.fieldsChanged()

    Component.onCompleted: page.start()

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

    HintLabel {
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
            enabled: !pageState.loadingLamps && urlField.text.trim().length > 0 && tokenField.text.trim().length > 0
            onClicked: page.loadLamps()
        }

        QQC2.BusyIndicator {
            running: pageState.loadingLamps
            visible: running
            implicitWidth: Kirigami.Units.iconSizes.small
            implicitHeight: Kirigami.Units.iconSizes.small
        }
    }

    QQC2.ComboBox {
        id: lampCombo
        Kirigami.FormData.label: i18n("Available lamps:")
        Layout.fillWidth: true
        visible: pageState.lamps.length > 0
        model: pageState.lamps
        textRole: "label"
        onActivated: index => {
            page.selectLamp(index);
            const lamp = pageState.lamps[index];
            // Field stays in QML: it is the cfg_entityId alias.
            if (lamp && entityField.text !== lamp.entityId)
                entityField.text = lamp.entityId;
        }
    }

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
        text: i18n("Sync color presets with Home Assistant")
        checked: generalPage.cfg_syncFavorites
        enabled: pageState.webSocketsAvailable || generalPage.cfg_syncFavorites
        onClicked: {
            if (checked) {
                confirmDialog.open();
            } else {
                generalPage.cfg_syncFavorites = false;
                generalPage.restoreSyncCheckBinding();
            }
        }
    }

    HintLabel {
        text: pageState.webSocketsAvailable
            ? i18n("Color presets are read from and written to the lamp's Home Assistant entity registry entry. Without an administrator token, synchronization is read-only.")
            : i18n("The Qt WebSockets module is required for synchronization and could not be loaded.")
    }

    HintLabel {
        visible: generalPage.cfg_syncFavorites
        text: pageState.webSocketsAvailable
            ? pageState.cacheStatus
            : i18n("Synchronization is unavailable.")
    }

    Kirigami.PromptDialog {
        id: confirmDialog
        title: i18n("Enable Home Assistant color presets?")
        subtitle: i18n("Local saved colors (%1) will be replaced by color presets from Home Assistant. If no color presets are configured there, the default colors will be used. Changes made in the widget are written to Home Assistant and become visible to all clients. Writing requires an administrator token; otherwise synchronization is read-only.",
            generalPage.cfg_savedColors ? generalPage.cfg_savedColors.length : 0)
        standardButtons: Kirigami.Dialog.Ok | Kirigami.Dialog.Cancel

        onAccepted: {
            generalPage.cfg_syncFavorites = true;
            generalPage.restoreSyncCheckBinding();
        }
        onRejected: {
            generalPage.cfg_syncFavorites = false;
            generalPage.restoreSyncCheckBinding();
        }
        onVisibleChanged: {
            if (!visible)
                generalPage.restoreSyncCheckBinding();
        }
    }

    Item { Kirigami.FormData.isSection: true }

    RowLayout {
        QQC2.Button {
            text: i18n("Test connection")
            icon.name: "network-connect"
            onClicked: page.testConnection()
        }
    }

    QQC2.Label {
        id: testLabel
        Layout.fillWidth: true
        Layout.maximumWidth: Kirigami.Units.gridUnit * 22
        wrapMode: Text.WordWrap
        text: pageState.testText
        color: pageState.testTone === "positive"
            ? Kirigami.Theme.positiveTextColor
            : (pageState.testTone === "negative" ? Kirigami.Theme.negativeTextColor : Kirigami.Theme.textColor)
    }
}
