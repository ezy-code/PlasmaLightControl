// QML entry point: names must match the HaTransport.* calls in HaSocket.qml.
export { createTransport, socketUrl } from "../ha/socket.ts";

export type {
    HaTransport,
    SocketStatus,
    TransportError,
    TransportEvents,
    TransportHost,
    TransportSocket,
    TransportTimer,
} from "../ha/socket.ts";
