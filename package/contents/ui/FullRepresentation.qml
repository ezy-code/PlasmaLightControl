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

        // --- Gespeicherte Farben ---
        ColumnLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing
            visible: mainItem.supportsColor

            RowLayout {
                Layout.fillWidth: true
                PlasmaComponents3.Label {
                    Layout.fillWidth: true
                    text: i18n("Saved colors")
                }
                PlasmaComponents3.ToolButton {
                    icon.name: "list-add"
                    display: QQC2.AbstractButton.IconOnly
                    text: i18n("Save current color")
                    enabled: mainItem.lightOn
                    onClicked: savedColorsModel.addCurrent()
                }
            }

            Flow {
                Layout.fillWidth: true
                spacing: Kirigami.Units.smallSpacing

                Repeater {
                    model: Plasmoid.configuration.savedColors

                    delegate: Rectangle {
                        id: swatch
                        required property int index
                        required property string modelData

                        width: Kirigami.Units.gridUnit * 2
                        height: Kirigami.Units.gridUnit * 2
                        radius: Kirigami.Units.smallSpacing
                        color: modelData
                        border.width: 1
                        border.color: Qt.rgba(0, 0, 0, 0.3)

                        MouseArea {
                            id: swatchMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            acceptedButtons: Qt.LeftButton | Qt.RightButton
                            onClicked: mouse => {
                                if (mouse.button === Qt.RightButton) {
                                    savedColorsModel.removeAt(swatch.index);
                                } else {
                                    const c = Qt.color(swatch.modelData);
                                    mainItem.setColor(c.hsvHue >= 0 ? c.hsvHue : 0, c.hsvSaturation);
                                }
                            }
                        }

                        QQC2.ToolTip.text: i18n("Click: apply · Right-click: delete")
                        QQC2.ToolTip.visible: swatchMouse.containsMouse
                        QQC2.ToolTip.delay: Kirigami.Units.toolTipDelay
                    }
                }

                PlasmaComponents3.Label {
                    visible: Plasmoid.configuration.savedColors.length === 0
                    text: i18n("No colors saved yet.")
                    opacity: 0.6
                    font: Kirigami.Theme.smallFont
                }
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

    // Verwaltung der gespeicherten Farben (Persistenz in der Plasmoid-Konfiguration).
    QtObject {
        id: savedColorsModel

        function addCurrent() {
            const c = Qt.hsva(mainItem.hue, mainItem.saturation, 1.0, 1.0);
            const hex = colorToHex(c);
            const list = Plasmoid.configuration.savedColors.slice();
            if (list.indexOf(hex) === -1) {
                list.push(hex);
                Plasmoid.configuration.savedColors = list;
            }
        }

        function removeAt(index) {
            const list = Plasmoid.configuration.savedColors.slice();
            if (index >= 0 && index < list.length) {
                list.splice(index, 1);
                Plasmoid.configuration.savedColors = list;
            }
        }

        function colorToHex(c) {
            function toHex(v) {
                const s = Math.round(v * 255).toString(16);
                return s.length === 1 ? "0" + s : s;
            }
            return "#" + toHex(c.r) + toHex(c.g) + toHex(c.b);
        }
    }
}
