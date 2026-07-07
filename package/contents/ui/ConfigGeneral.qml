import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import "HomeAssistant.js" as HA

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

    QQC2.TextField {
        id: urlField
        Kirigami.FormData.label: i18n("Home-Assistant-URL:")
        placeholderText: "http://homeassistant.local:8123"
        Layout.fillWidth: true
    }

    QQC2.TextField {
        id: tokenField
        Kirigami.FormData.label: i18n("Access Token:")
        placeholderText: i18n("Long-Lived Access Token")
        echoMode: showToken.checked ? TextInput.Normal : TextInput.Password
        Layout.fillWidth: true
    }

    QQC2.CheckBox {
        id: showToken
        text: i18n("Token anzeigen")
    }

    QQC2.Label {
        Layout.fillWidth: true
        Layout.maximumWidth: Kirigami.Units.gridUnit * 22
        wrapMode: Text.WordWrap
        font: Kirigami.Theme.smallFont
        opacity: 0.7
        text: i18n("Den Token erzeugst du in Home Assistant unter „Profil → Sicherheit → Long-Lived Access Tokens“.")
    }

    Item { Kirigami.FormData.isSection: true }

    QQC2.TextField {
        id: entityField
        Kirigami.FormData.label: i18n("Entity-ID der Lampe:")
        placeholderText: "light.wohnzimmer"
        Layout.fillWidth: true
    }

    QQC2.SpinBox {
        id: pollField
        Kirigami.FormData.label: i18n("Statusabfrage-Intervall (s):")
        from: 3
        to: 300
        value: 15
    }

    Item { Kirigami.FormData.isSection: true }

    RowLayout {
        QQC2.Button {
            text: i18n("Verbindung testen")
            icon.name: "network-connect"
            onClicked: {
                testLabel.text = i18n("Teste …");
                testLabel.color = Kirigami.Theme.textColor;
                HA.fetchState({ url: urlField.text, token: tokenField.text, entityId: entityField.text },
                    function (state) {
                        if (state && state.state) {
                            testLabel.text = i18n("Verbunden – Lampe ist %1.",
                                state.state === "on" ? i18n("ein") : i18n("aus"));
                            testLabel.color = Kirigami.Theme.positiveTextColor;
                        } else {
                            testLabel.text = i18n("Antwort ohne gültigen Zustand.");
                            testLabel.color = Kirigami.Theme.neutralTextColor;
                        }
                    },
                    function (err) {
                        testLabel.text = i18n("Fehler: %1", err);
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
