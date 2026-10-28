import QtQuick
import "generated/ControlMath.mjs" as ControlMath

// HSV wheel: angle = hue, radius = saturation; brightness comes from the slider.
Item {
    id: root

    property real hue: 0.0          // 0..1
    property real saturation: 0.0   // 0..1
    property color selectedColor: Qt.hsva(hue, saturation, 1.0, 1.0)

    signal colorPicked(real hue, real saturation)

    implicitWidth: 200
    implicitHeight: 200

    readonly property real radius: Math.min(width, height) / 2
    readonly property point center: Qt.point(width / 2, height / 2)

    Canvas {
        id: canvas
        anchors.fill: parent
        renderStrategy: Canvas.Cooperative

        onPaint: {
            const ctx = getContext("2d");
            const cx = root.center.x;
            const cy = root.center.y;
            const r = root.radius;

            ctx.clearRect(0, 0, width, height);

            const step = 1; // degrees
            for (let a = 0; a < 360; a += step) {
                const start = (a - 0.5) * Math.PI / 180;
                const end = (a + step + 0.5) * Math.PI / 180;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, r, start, end, false);
                ctx.closePath();
                ctx.fillStyle = Qt.hsva(a / 360, 1.0, 1.0, 1.0);
                ctx.fill();
            }

            // Saturation: white in the center, transparent at the rim.
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            grad.addColorStop(0, "rgba(255,255,255,1)");
            grad.addColorStop(1, "rgba(255,255,255,0)");
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, 2 * Math.PI, false);
            ctx.fillStyle = grad;
            ctx.fill();
        }
    }

    Rectangle {
        id: selector
        width: 16
        height: 16
        radius: 8
        border.width: 2
        border.color: "white"
        color: root.selectedColor
        antialiasing: true

        readonly property var offset: ControlMath.wheelSelector(root.hue, root.saturation, root.radius)

        x: root.center.x + offset.x - width / 2
        y: root.center.y + offset.y - height / 2

        Rectangle {
            anchors.fill: parent
            anchors.margins: 1
            radius: parent.radius
            color: "transparent"
            border.width: 1
            border.color: "black"
        }
    }

    MouseArea {
        anchors.fill: parent
        onPressed: mouse => updateFromPosition(mouse.x, mouse.y)
        onPositionChanged: mouse => updateFromPosition(mouse.x, mouse.y)

        // Only emits the signal; hue/saturation are set from outside (mainItem).
        function updateFromPosition(mx, my) {
            const pick = ControlMath.wheelPick(mx - root.center.x, my - root.center.y, root.radius);
            root.colorPicked(pick.hue01, pick.saturation01);
        }
    }

    onWidthChanged: canvas.requestPaint()
    onHeightChanged: canvas.requestPaint()
}
