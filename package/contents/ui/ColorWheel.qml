import QtQuick

// HSV-Farbkreis: Winkel = Farbton (Hue), Radius = Sättigung (Saturation).
// Der Value/Brightness-Anteil wird separat über den Helligkeitsslider gesteuert.
Item {
    id: root

    property real hue: 0.0          // 0..1
    property real saturation: 0.0   // 0..1
    property color selectedColor: Qt.hsva(hue, saturation, 1.0, 1.0)

    // Wird ausgelöst, wenn der Nutzer aktiv eine Farbe wählt.
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

            // Farbton als Kranz aus feinen Segmenten zeichnen.
            const step = 1; // Grad
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

            // Radialer Weiß-Verlauf für die Sättigung (Mitte weiß -> Rand transparent).
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            grad.addColorStop(0, "rgba(255,255,255,1)");
            grad.addColorStop(1, "rgba(255,255,255,0)");
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, 2 * Math.PI, false);
            ctx.fillStyle = grad;
            ctx.fill();
        }
    }

    // Auswahlmarkierung
    Rectangle {
        id: selector
        width: 16
        height: 16
        radius: 8
        border.width: 2
        border.color: "white"
        color: root.selectedColor
        antialiasing: true

        x: root.center.x + Math.cos(root.hue * 2 * Math.PI) * root.saturation * root.radius - width / 2
        y: root.center.y + Math.sin(root.hue * 2 * Math.PI) * root.saturation * root.radius - height / 2

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

        // Nur das Signal auslösen; hue/saturation werden von außen (mainItem)
        // gesetzt, damit die Komponente eine kontrollierte Ansicht bleibt.
        function updateFromPosition(mx, my) {
            const dx = mx - root.center.x;
            const dy = my - root.center.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const sat = Math.min(1.0, dist / root.radius);

            let ang = Math.atan2(dy, dx);
            if (ang < 0)
                ang += 2 * Math.PI;
            const h = ang / (2 * Math.PI);

            root.colorPicked(h, sat);
        }
    }

    onWidthChanged: canvas.requestPaint()
    onHeightChanged: canvas.requestPaint()
}
