import QtQuick
import "generated/ControlMath.mjs" as ControlMath
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import org.kde.plasma.plasmoid
import org.kde.plasma.components as PlasmaComponents3
import org.kde.plasma.extras as PlasmaExtras
import org.kde.kirigami as Kirigami

PlasmaExtras.Representation {
    id: fullRoot

    readonly property int margin: Kirigami.Units.smallSpacing

    // Fixed width; minimum == maximum == preferred, so the popup cannot be resized.
    readonly property int fixedWidth: Kirigami.Units.gridUnit * 17
    readonly property int desiredHeight: mainItem.snapshot.configured
        ? Math.round(contentColumn.implicitHeight) + 2 * margin
        : Kirigami.Units.gridUnit * 18

    Layout.minimumWidth: fixedWidth
    Layout.maximumWidth: fixedWidth
    Layout.preferredWidth: fixedWidth
    Layout.minimumHeight: desiredHeight
    Layout.maximumHeight: desiredHeight
    Layout.preferredHeight: desiredHeight

    collapseMarginsHint: true

    PlasmaExtras.PlaceholderMessage {
        anchors.centerIn: parent
        width: parent.width - Kirigami.Units.gridUnit * 4
        visible: !mainItem.snapshot.configured
        iconName: "network-disconnect"
        text: i18n("Not configured")
        explanation: i18n("Please enter the lamp's URL, token, and entity ID in the settings.")

        helpfulAction: QQC2.Action {
            icon.name: "configure"
            text: i18n("Open settings")
            onTriggered: Plasmoid.internalAction("configure").trigger()
        }
    }

    // Anchored top/left/right only, so the height follows implicitHeight.
    ColumnLayout {
        id: contentColumn
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.margins: fullRoot.margin
        spacing: Kirigami.Units.largeSpacing
        visible: mainItem.snapshot.configured

        RowLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing

            PlasmaExtras.Heading {
                Layout.fillWidth: true
                level: 3
                elide: Text.ElideRight
                text: mainItem.snapshot.displayName || Plasmoid.configuration.entityId
            }

            QQC2.Switch {
                id: toggleSwitch
                onClicked: mainItem.session.toggleLight()
            }
        }

        RowLayout {
            Layout.fillWidth: true
            visible: !mainItem.snapshot.connected && mainItem.snapshot.statusText.length > 0
            spacing: Kirigami.Units.smallSpacing

            PlasmaComponents3.Label {
                Layout.fillWidth: true
                text: mainItem.snapshot.statusText
                color: Kirigami.Theme.negativeTextColor
                wrapMode: Text.WordWrap
                font: Kirigami.Theme.smallFont
            }

            PlasmaComponents3.ToolButton {
                icon.name: "view-refresh"
                text: i18nc("@action:button", "Retry")
                display: QQC2.AbstractButton.IconOnly
                onClicked: mainItem.session.refresh()
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing
            enabled: mainItem.snapshot.lightOn

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
                    value: mainItem.snapshot.brightness
                    // Send only on user interaction, not on status updates.
                    onPressedChanged: {
                        if (!pressed)
                            mainItem.session.setBrightness(value);
                    }
                    onMoved: mainItem.session.previewBrightness(value)
                }
                Kirigami.Icon {
                    source: "brightness-high"
                    Layout.preferredWidth: Kirigami.Units.iconSizes.small
                    Layout.preferredHeight: Kirigami.Units.iconSizes.small
                }
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing
            visible: mainItem.snapshot.supportsColor
            enabled: mainItem.snapshot.lightOn

            PlasmaComponents3.Label { text: i18n("Color") }

            Item {
                Layout.fillWidth: true
                Layout.preferredHeight: colorWheel.height

                ColorWheel {
                    id: colorWheel
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: Math.min(parent.width, Kirigami.Units.gridUnit * 13)
                    height: width

                    hue: mainItem.snapshot.hue01
                    saturation: mainItem.snapshot.saturation01

                    onColorPicked: (h, s) => mainItem.session.scheduleColor(h, s)
                }
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing
            visible: mainItem.snapshot.supportsColor
                || (mainItem.snapshot.syncEnabled && mainItem.snapshot.supportsColorTemp)

            RowLayout {
                Layout.fillWidth: true
                PlasmaComponents3.Label {
                    Layout.fillWidth: true
                    text: mainItem.snapshot.syncEnabled
                        ? i18n("Home Assistant presets")
                        : i18n("Saved colors")
                }
                PlasmaComponents3.ToolButton {
                    icon.name: "list-add"
                    display: QQC2.AbstractButton.IconOnly
                    text: mainItem.snapshot.syncEnabled
                        ? (mainItem.snapshot.syncWritable
                            ? i18n("Add the current color to Home Assistant presets")
                            : i18n("Color presets are read-only or not synced yet"))
                        : i18n("Save current color")
                    enabled: mainItem.snapshot.lightOn
                        && (!mainItem.snapshot.syncEnabled || mainItem.snapshot.syncWritable)
                    onClicked: mainItem.session.addCurrentPreset()
                }
            }

            RowLayout {
                Layout.fillWidth: true
                visible: mainItem.snapshot.syncEnabled
                spacing: Kirigami.Units.smallSpacing

                PlasmaComponents3.Label {
                    Layout.fillWidth: true
                    text: mainItem.snapshot.syncStatusText
                    opacity: 0.7
                    wrapMode: Text.WordWrap
                    font: Kirigami.Theme.smallFont
                }

                PlasmaComponents3.ToolButton {
                    visible: mainItem.snapshot.syncState === "cached"
                        || (mainItem.snapshot.syncState === "error" && mainItem.snapshot.syncRetryable)
                    icon.name: "view-refresh"
                    display: QQC2.AbstractButton.IconOnly
                    text: i18n("Retry synchronization")
                    onClicked: mainItem.session.retrySync()
                }
            }

            Flow {
                Layout.fillWidth: true
                spacing: Kirigami.Units.smallSpacing

                Repeater {
                    model: mainItem.snapshot.presetItems

                    delegate: Rectangle {
                        id: swatch
                        required property int index
                        required property var modelData
                        readonly property bool writable: !mainItem.snapshot.syncEnabled || mainItem.snapshot.syncWritable

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
                                        mainItem.session.removePreset(swatch.index);
                                } else {
                                    mainItem.session.applyPreset(swatch.modelData.spec);
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
                    visible: mainItem.snapshot.presetItems.length === 0
                    text: {
                        if (mainItem.snapshot.syncEnabled
                                && (mainItem.snapshot.syncState === "connecting"
                                    || mainItem.snapshot.syncState === "auth"
                                    || mainItem.snapshot.syncState === "syncing"
                                    || mainItem.snapshot.syncState === "cached"))
                            return i18n("Waiting for color presets from Home Assistant…");
                        return mainItem.snapshot.syncEnabled
                            ? i18n("No color presets in Home Assistant.")
                            : i18n("No colors saved yet.");
                    }
                    opacity: 0.6
                    font: Kirigami.Theme.smallFont
                }
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing
            visible: mainItem.snapshot.supportsEffect
            enabled: mainItem.snapshot.lightOn

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
                    onClicked: mainItem.session.flashLight()
                }
            }

            QQC2.ComboBox {
                id: effectCombo
                Layout.fillWidth: true
                model: mainItem.snapshot.effectList
                onActivated: index => mainItem.session.setEffect(mainItem.snapshot.effectList[index])
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing
            visible: mainItem.snapshot.supportsColorTemp
            enabled: mainItem.snapshot.lightOn

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

            // Warm -> cool gradient bar as a visual cue.
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
                from: mainItem.snapshot.minKelvin
                to: mainItem.snapshot.maxKelvin
                stepSize: 50
                value: mainItem.snapshot.colorTempKelvin
                onPressedChanged: {
                    if (!pressed)
                        mainItem.session.setColorTemp(value);
                }
                onMoved: mainItem.session.previewColorTemp(value)
            }
        }
    }

    // Keeps the switch in sync, even when the state comes from polling.
    Binding {
        target: toggleSwitch
        property: "checked"
        value: mainItem.snapshot.lightOn
    }

    // Binding, not a direct bind, so the user's selection survives.
    Binding {
        target: effectCombo
        property: "currentIndex"
        value: ControlMath.effectIndex(mainItem.snapshot.effectList, mainItem.snapshot.currentEffect)
        when: mainItem.snapshot.effectList.length > 0
    }

}
