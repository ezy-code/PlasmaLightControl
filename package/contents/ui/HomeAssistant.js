.pragma library

// Kapselt die REST-Aufrufe an die Home-Assistant-API.
// Alle Funktionen bekommen ein cfg-Objekt: { url, token, entityId }.

function normalizedBase(url) {
    if (!url)
        return "";
    return url.replace(/\/+$/, "");
}

function request(cfg, method, path, body, onSuccess, onError) {
    var base = normalizedBase(cfg.url);
    if (!base || !cfg.token) {
        if (onError)
            onError("Keine URL oder kein Token konfiguriert.");
        return;
    }

    var xhr = new XMLHttpRequest();
    xhr.open(method, base + path);
    xhr.setRequestHeader("Authorization", "Bearer " + cfg.token);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.timeout = 8000;

    xhr.onreadystatechange = function () {
        if (xhr.readyState !== XMLHttpRequest.DONE)
            return;

        if (xhr.status >= 200 && xhr.status < 300) {
            var data = null;
            if (xhr.responseText) {
                try {
                    data = JSON.parse(xhr.responseText);
                } catch (e) {
                    data = xhr.responseText;
                }
            }
            if (onSuccess)
                onSuccess(data);
        } else if (onError) {
            onError("HTTP " + xhr.status + ": " + (xhr.statusText || xhr.responseText));
        }
    };
    xhr.ontimeout = function () {
        if (onError)
            onError("Zeitüberschreitung bei der Verbindung.");
    };

    if (body)
        xhr.send(JSON.stringify(body));
    else
        xhr.send();
}

// Ruft den aktuellen Zustand der Lampe ab.
function fetchState(cfg, onSuccess, onError) {
    if (!cfg.entityId) {
        if (onError)
            onError("Keine Entity-ID konfiguriert.");
        return;
    }
    request(cfg, "GET", "/api/states/" + encodeURIComponent(cfg.entityId), null, onSuccess, onError);
}

// Schaltet die Lampe ein. attrs kann brightness, rgb_color, color_temp_kelvin enthalten.
function turnOn(cfg, attrs, onSuccess, onError) {
    var body = { entity_id: cfg.entityId };
    if (attrs) {
        for (var key in attrs) {
            if (attrs[key] !== undefined && attrs[key] !== null)
                body[key] = attrs[key];
        }
    }
    request(cfg, "POST", "/api/services/light/turn_on", body, onSuccess, onError);
}

function turnOff(cfg, onSuccess, onError) {
    request(cfg, "POST", "/api/services/light/turn_off", { entity_id: cfg.entityId }, onSuccess, onError);
}

function toggle(cfg, onSuccess, onError) {
    request(cfg, "POST", "/api/services/light/toggle", { entity_id: cfg.entityId }, onSuccess, onError);
}
