import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import org.kde.plasma.plasmoid
import org.kde.plasma.components as PlasmaComponents3
import org.kde.plasma.extras as PlasmaExtras
import org.kde.kirigami as Kirigami

PlasmaExtras.Representation {
    id: fullRoot

    readonly property int margin: Kirigami.Units.smallSpacing

    // Feste Breite. Die Höhe richtet sich nach dem tatsächlichen Inhalt
    // ("nur so groß wie nötig"). minimum == maximum == preferred verhindert,
    // dass der Nutzer das Popup vergrößern kann.
    readonly property int fixedWidth: Kirigami.Units.gridUnit * 17
    readonly property int desiredHeight: mainItem.configured
        ? Math.round(contentColumn.implicitHeight) + 2 * margin
        : Kirigami.Units.gridUnit * 18

    Layout.minimumWidth: fixedWidth
    Layout.maximumWidth: fixedWidth
    Layout.preferredWidth: fixedWidth
    Layout.minimumHeight: desiredHeight
    Layout.maximumHeight: desiredHeight
    Layout.preferredHeight: desiredHeight

    collapseMarginsHint: true

    // Hinweis, wenn keine Konfiguration vorhanden ist.
    PlasmaExtras.PlaceholderMessage {
        anchors.centerIn: parent
        width: parent.width - Kirigami.Units.gridUnit * 4
        visible: !mainItem.configured
        iconName: "network-disconnect"
        text: i18n("Not configured")
        explanation: i18n("Please enter the lamp's URL, token, and entity ID in the settings.")

        helpfulAction: QQC2.Action {
            icon.name: "configure"
            text: i18n("Open settings")
            onTriggered: Plasmoid.internalAction("configure").trigger()
        }
    }

    // Inhalt: nur top/left/right verankert, damit die Höhe frei aus dem
    // Inhalt (implicitHeight) folgt.
    ColumnLayout {
        id: contentColumn
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.margins: fullRoot.margin
        spacing: Kirigami.Units.largeSpacing
        visible: mainItem.configured

        // --- Kopfzeile mit Titel und An/Aus-Schalter ---
        RowLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing

            PlasmaExtras.Heading {
                Layout.fillWidth: true
                level: 3
                elide: Text.ElideRight
                text: mainItem.displayName || Plasmoid.configuration.entityId
            }

            QQC2.Switch {
                id: toggleSwitch
                onClicked: mainItem.toggleLight()
            }
        }

        // Verbindungsfehler-Hinweis
        RowLayout {
            Layout.fillWidth: true
            visible: !mainItem.connected && mainItem.statusText.length > 0
            spacing: Kirigami.Units.smallSpacing

            PlasmaComponents3.Label {
                Layout.fillWidth: true
                text: mainItem.statusText
                color: Kirigami.Theme.negativeTextColor
                wrapMode: Text.WordWrap
                font: Kirigami.Theme.smallFont
            }

            PlasmaComponents3.ToolButton {
                icon.name: "view-refresh"
                text: i18nc("@action:button", "Retry")
                display: QQC2.AbstractButton.IconOnly
                onClicked: mainItem.refresh()
            }
        }

        // --- Helligkeit ---
        ColumnLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing
            enabled: mainItem.lightOn

            RowLayout {
                Layout.fillWidth: true
                PlasmaComponents3.Label {
                    Layout.fillWidth: true
                    text: i18n("Brightness")
                }
                PlasmaComponents3.Label {
                    text: Math.round(brightnessSlider.value / 255 * 100) + " %"
                    opacity: 0.7
                }
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: Kirigami.Units.smallSpacing
                Kirigami.Icon {
                    source: "brightness-low"
                    Layout.preferredWidth: Kirigami.Units.iconSizes.small
                    Layout.preferredHeight: Kirigami.Units.iconSizes.small
                }
                PlasmaComponents3.Slider {
                    id: brightnessSlider
                    Layout.fillWidth: true
                    from: 0
                    to: 255
                    value: mainItem.brightness
                    // Nur bei Nutzerinteraktion senden, nicht bei Statusupdates.
                    onPressedChanged: {
                        if (!pressed)
                            mainItem.setBrightness(value);
                    }
                    onMoved: mainItem.brightness = value
                }
                Kirigami.Icon {
                    source: "brightness-high"
                    Layout.preferredWidth: Kirigami.Units.iconSizes.small
                    Layout.preferredHeight: Kirigami.Units.iconSizes.small
                }
            }
        }

        // --- Farbkreis ---
        ColumnLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing
            visible: mainItem.supportsColor
            enabled: mainItem.lightOn

            PlasmaComponents3.Label { text: i18n("Color") }

            // Wrapper füllt die Breite; der Farbkreis wird darin exakt zentriert.
            Item {
                Layout.fillWidth: true
                Layout.preferredHeight: colorWheel.height

                ColorWheel {
                    id: colorWheel
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: Math.min(parent.width, Kirigami.Units.gridUnit * 13)
                    height: width

                    hue: mainItem.hue
                    saturation: mainItem.saturation

                    onColorPicked: (h, s) => {
                        // Sofort optimistisch anzeigen, damit der Selektor folgt.
                        mainItem.hue = h;
                        mainItem.saturation = s;
                        colorApplyTimer.restart();
                    }

                    // Sendet die Farbe leicht gedrosselt, um HA nicht zu überfluten.
                    Timer {
                        id: colorApplyTimer
                        interval: 200
                        onTriggered: mainItem.setColor(colorWheel.hue, colorWheel.saturation)
                    }
                }
            }
        }

        // --- Gespeicherte Farben / Home-Assistant-Favoriten ---
        ColumnLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing
            visible: mainItem.supportsColor
                || (mainItem.syncEnabled && mainItem.supportsColorTemp)

            RowLayout {
                Layout.fillWidth: true
                PlasmaComponents3.Label {
                    Layout.fillWidth: true
                    text: mainItem.syncEnabled
                        ? i18n("Home Assistant favorites")
                        : i18n("Saved colors")
                }
                PlasmaComponents3.ToolButton {
                    icon.name: "list-add"
                    display: QQC2.AbstractButton.IconOnly
                    text: mainItem.syncEnabled
                        ? (mainItem.syncWritable
                            ? i18n("Add the current color to Home Assistant favorites")
                            : i18n("Favorite colors are read-only or not synced yet"))
                        : i18n("Save current color")
                    enabled: mainItem.lightOn
                        && (!mainItem.syncEnabled || mainItem.syncWritable)
                    onClicked: mainItem.addCurrentPreset()
                }
            }

            RowLayout {
                Layout.fillWidth: true
                visible: mainItem.syncEnabled
                spacing: Kirigami.Units.smallSpacing

                PlasmaComponents3.Label {
                    Layout.fillWidth: true
                    text: mainItem.syncStatusText
                    opacity: 0.7
                    wrapMode: Text.WordWrap
                    font: Kirigami.Theme.smallFont
                }

                PlasmaComponents3.ToolButton {
                    visible: mainItem.syncState === "cached"
                        || (mainItem.syncState === "error" && mainItem.syncRetryable)
                    icon.name: "view-refresh"
                    display: QQC2.AbstractButton.IconOnly
                    text: i18n("Retry synchronization")
                    onClicked: mainItem.retrySync()
                }
            }

            Flow {
                Layout.fillWidth: true
                spacing: Kirigami.Units.smallSpacing

                Repeater {
                    model: mainItem.presetItems

                    delegate: Rectangle {
                        id: swatch
                        required property int index
                        required property var modelData
                        readonly property bool writable: !mainItem.syncEnabled || mainItem.syncWritable

                        width: Kirigami.Units.gridUnit * 2
                        height: Kirigami.Units.gridUnit * 2
                        radius: Kirigami.Units.smallSpacing
                        color: modelData.hex
                        border.width: 1
                        border.color: Qt.rgba(0, 0, 0, 0.3)

                        MouseArea {
                            id: swatchMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            acceptedButtons: Qt.LeftButton | Qt.RightButton
                            onClicked: mouse => {
                                if (mouse.button === Qt.RightButton) {
                                    if (swatch.writable)
                                        mainItem.removePreset(swatch.index);
                                } else {
                                    mainItem.applyPreset(swatch.modelData.spec);
                                }
                            }
                        }

                        QQC2.ToolTip.text: swatch.writable
                            ? i18n("Click: apply · Right-click: delete")
                            : i18n("Click: apply")
                        QQC2.ToolTip.visible: swatchMouse.containsMouse
                        QQC2.ToolTip.delay: Kirigami.Units.toolTipDelay
                    }
                }

                PlasmaComponents3.Label {
                    visible: mainItem.presetItems.length === 0
                    text: {
                        if (mainItem.syncEnabled
                                && (mainItem.syncState === "connecting"
                                    || mainItem.syncState === "auth"
                                    || mainItem.syncState === "syncing"
                                    || mainItem.syncState === "cached"))
                            return i18n("Waiting for favorite colors from Home Assistant…");
                        return mainItem.syncEnabled
                            ? i18n("No favorite colors in Home Assistant.")
                            : i18n("No colors saved yet.");
                    }
                    opacity: 0.6
                    font: Kirigami.Theme.smallFont
                }
            }
        }

        // --- Effekte ---
        ColumnLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing
            visible: mainItem.supportsEffect
            enabled: mainItem.lightOn

            RowLayout {
                Layout.fillWidth: true
                PlasmaComponents3.Label {
                    Layout.fillWidth: true
                    text: i18n("Effect")
                }
                PlasmaComponents3.ToolButton {
                    icon.name: "media-record"
                    display: QQC2.AbstractButton.IconOnly
                    text: i18n("Flash the light")
                    onClicked: mainItem.flashLight()
                }
            }

            QQC2.ComboBox {
                id: effectCombo
                Layout.fillWidth: true
                model: mainItem.effectList
                onActivated: index => mainItem.setEffect(mainItem.effectList[index])
            }
        }

        // --- Farbtemperatur ---
        ColumnLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing
            visible: mainItem.supportsColorTemp
            enabled: mainItem.lightOn

            RowLayout {
                Layout.fillWidth: true
                PlasmaComponents3.Label {
                    Layout.fillWidth: true
                    text: i18n("Color temperature")
                }
                PlasmaComponents3.Label {
                    text: Math.round(tempSlider.value) + " K"
                    opacity: 0.7
                }
            }

            // Verlaufsbalken warm -> kalt als visuelle Hilfe.
            Rectangle {
                Layout.fillWidth: true
                height: Kirigami.Units.smallSpacing
                radius: height / 2
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0.0; color: "#ff8b3d" }
                    GradientStop { position: 0.5; color: "#fff4e0" }
                    GradientStop { position: 1.0; color: "#cfe3ff" }
                }
            }

            PlasmaComponents3.Slider {
                id: tempSlider
                Layout.fillWidth: true
                from: mainItem.minKelvin
                to: mainItem.maxKelvin
                stepSize: 50
                value: mainItem.colorTempKelvin
                onPressedChanged: {
                    if (!pressed)
                        mainItem.setColorTemp(value);
                }
                onMoved: mainItem.colorTempKelvin = value
            }
        }
    }

    // Hält den Switch synchron, auch wenn der Status vom Polling kommt.
    Binding {
        target: toggleSwitch
        property: "checked"
        value: mainItem.lightOn
    }

    // Binding statt direkter Bindung, damit die Auswahl des Nutzers erhalten bleibt.
    Binding {
        target: effectCombo
        property: "currentIndex"
        value: Math.max(0, mainItem.effectList.indexOf(mainItem.currentEffect))
        when: mainItem.effectList.length > 0
    }

}
