import QtQuick
import "generated/ControlMath.mjs" as ControlMath
import org.kde.plasma.plasmoid
import org.kde.kirigami as Kirigami

MouseArea {
    id: compactRoot

    property bool lightOn: mainItem.snapshot.lightOn
    property bool connected: mainItem.snapshot.connected

    acceptedButtons: Qt.LeftButton | Qt.MiddleButton
    hoverEnabled: true

    onClicked: mouse => {
        if (mouse.button === Qt.MiddleButton) {
            mainItem.session.toggleLight();
        } else {
            mainItem.expanded = !mainItem.expanded;
        }
    }

    // Wheel over the icon changes brightness in 5 % steps.
    onWheel: wheel => {
        if (!mainItem.snapshot.configured || !mainItem.snapshot.connected || !mainItem.snapshot.available)
            return;
        // Accepted, otherwise the panel bar scrolls too.
        wheel.accepted = true;

        const next = ControlMath.brightnessStep(mainItem.snapshot.brightness, wheel.angleDelta.y > 0 ? 5 : -5);
        if (next !== null)
            mainItem.session.setBrightness(next);
    }

    Kirigami.Icon {
        id: icon
        anchors.fill: parent
        // Package icons, both tinted as a mask in the theme color.
        source: compactRoot.lightOn
            ? Qt.resolvedUrl("../icons/light-on.svg")
            : Qt.resolvedUrl("../icons/light-off.svg")
        isMask: true
        color: Kirigami.Theme.textColor
        active: compactRoot.containsMouse
        opacity: compactRoot.connected ? 1.0 : 0.5

        Rectangle {
            visible: compactRoot.lightOn && mainItem.snapshot.supportsColor
            width: Math.max(4, parent.width * 0.28)
            height: width
            radius: width / 2
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            color: Qt.hsva(mainItem.snapshot.hue01, mainItem.snapshot.saturation01, 1.0, 1.0)
            border.width: 1
            border.color: Qt.rgba(0, 0, 0, 0.4)
        }
    }

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
