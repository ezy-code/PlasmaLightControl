import QtQuick
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.kirigami as Kirigami

MouseArea {
    id: compactRoot

    property bool lightOn: mainItem.lightOn
    property bool connected: mainItem.connected

    acceptedButtons: Qt.LeftButton | Qt.MiddleButton
    hoverEnabled: true

    // Linksklick: Popup ein-/ausblenden. Mittelklick: Lampe direkt toggeln.
    onClicked: mouse => {
        if (mouse.button === Qt.MiddleButton) {
            mainItem.toggleLight();
        } else {
            mainItem.expanded = !mainItem.expanded;
        }
    }

    // Mausrad über dem Icon regelt die Helligkeit in 5-%-Schritten.
    onWheel: wheel => {
        if (!mainItem.configured || !mainItem.connected || !mainItem.available)
            return;
        // Übernehmen, sonst scrollt die Panelleiste mit.
        wheel.accepted = true;

        const step = wheel.angleDelta.y > 0 ? 5 : -5;
        const percent = Math.max(0, Math.min(100, Math.round(mainItem.brightness / 255 * 100) + step));
        const next = Math.round(percent * 255 / 100);
        if (next !== mainItem.brightness)
            mainItem.setBrightness(next);
    }

    Kirigami.Icon {
        id: icon
        anchors.fill: parent
        // Eigene, monochrome Glühlampen-Icons aus dem Paket. Beide werden als
        // Maske in der Theme-Farbe gefärbt (leuchtend = gefüllt, aus = Umriss).
        source: compactRoot.lightOn
            ? Qt.resolvedUrl("../icons/light-on.svg")
            : Qt.resolvedUrl("../icons/light-off.svg")
        isMask: true
        color: Kirigami.Theme.textColor
        active: compactRoot.containsMouse
        opacity: compactRoot.connected ? 1.0 : 0.5

        // Kleiner Farbindikator, der die aktuelle Lichtfarbe zeigt.
        Rectangle {
            visible: compactRoot.lightOn && mainItem.supportsColor
            width: Math.max(4, parent.width * 0.28)
            height: width
            radius: width / 2
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            color: Qt.hsva(mainItem.hue, mainItem.saturation, 1.0, 1.0)
            border.width: 1
            border.color: Qt.rgba(0, 0, 0, 0.4)
        }
    }

    // Nicht verbunden / nicht konfiguriert: Warnmarkierung.
    Rectangle {
        visible: !compactRoot.connected
        width: Math.max(5, parent.width * 0.3)
        height: width
        radius: width / 2
        anchors.top: parent.top
        anchors.right: parent.right
        color: Kirigami.Theme.negativeTextColor
    }
}
