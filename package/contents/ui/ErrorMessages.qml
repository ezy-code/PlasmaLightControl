import QtQuick

QtObject {
    function text(err) {
        if (!err)
            return "";
        if (typeof err === "string")
            return err;

        switch (err.code) {
        case "notConfigured":
            return i18n("No URL or token configured.");
        case "noEntityId":
            return i18n("No lamp entity ID configured.");
        case "noConnection":
            return i18n("Cannot reach Home Assistant.");
        case "networkError":
            return i18n("Network error while connecting to Home Assistant.");
        case "timeout":
            return i18n("Connection timed out.");
        case "aborted":
            return i18n("Request cancelled.");
        case "httpError":
            return err.detail
                ? i18n("HTTP %1: %2", err.status, err.detail)
                : i18n("HTTP error %1", err.status);
        default:
            return i18n("Unknown error.");
        }
    }
}
