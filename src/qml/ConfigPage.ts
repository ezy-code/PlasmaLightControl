// QML entry point: names must match the ConfigPage.* calls in ConfigConnection.qml.
export { createConfigPage } from "../panel/configPage.ts";

export type {
    ConfigFields,
    ConfigLamp,
    ConfigPage,
    ConfigPageHost,
    ConfigPageSnapshot,
    ConfigTone,
} from "../panel/configPage.ts";
