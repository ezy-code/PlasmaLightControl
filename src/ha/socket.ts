import type { PanelTextKey } from "../i18n/textKeys.ts";
import { text } from "../shared/coerce.ts";

/** Socket states of the host, mapped from the WebSocket.* enums. */
export type SocketStatus = "connecting" | "open" | "closing" | "closed";

/** The four host timers; every delay and repeat flag is decided here. */
export type TransportTimer = "connect" | "reconnect" | "auth" | "poll";

/** The host's WebSocket, wrapped so the transport never touches QML enums. */
export interface TransportSocket {
    status(): SocketStatus;
    active(): boolean;
    setActive(value: boolean): void;
    setUrl(value: string): void;
    send(text: string): void;
}

/** Everything the transport cannot own itself; HaSocket.qml implements it. */
export interface TransportHost {
    credentials(): { url: string; token: string };
    isActive(): boolean;
    socket(): TransportSocket;
    startTimer(name: TransportTimer, delayMs: number, repeat: boolean): void;
    stopTimer(name: TransportTimer): void;
    now(): number;
    translate(key: PanelTextKey): string;
}

export interface TransportError {
    code: string;
    message: string;
}

// statusChanged() states: connecting, auth, syncing, lost, error, off.
export interface TransportEvents {
    statusChanged(state: string, message: string): void;
    authFailed(message: string): void;
    authenticated(admin: boolean): void;
    permissionChanged(admin: boolean): void;
    eventReceived(eventType: string, data: unknown): void;
}

export interface HaTransport {
    connect(): void;
    disconnect(): void;
    reset(): void;
    retryNow(): void;
    isAuthenticated(): boolean;
    request(
        type: string,
        payload: Record<string, unknown> | null,
        onSuccess?: (result: unknown) => void,
        onError?: (error: TransportError) => void,
    ): number;
    subscribe(
        eventType: string,
        onSuccess?: (result: unknown) => void,
        onError?: (error: TransportError) => void,
    ): number;
    handleSocketStatus(): void;
    handleMessage(text: unknown): void;
    handleTimer(name: TransportTimer): void;
    deactivate(): void;
}

interface PendingRequest {
    id: number;
    onSuccess?: ((result: unknown) => void) | undefined;
    onError?: ((error: TransportError) => void) | undefined;
    deadline: number;
}

function isAdminFlag(value: unknown): boolean {
    if (!value || typeof value !== "object")
        return false;
    return Boolean((value as { is_admin?: unknown }).is_admin);
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object")
        return {};
    return value as Record<string, unknown>;
}

export function socketUrl(baseUrl: string): string {
    let base = String(baseUrl || "").trim().replace(/\/+$/, "");
    if (!base)
        return "";

    if (base.indexOf("https://") === 0)
        base = `wss://${base.substring(8)}`;
    else if (base.indexOf("http://") === 0)
        base = `ws://${base.substring(7)}`;
    else if (base.indexOf("wss://") !== 0 && base.indexOf("ws://") !== 0)
        base = `ws://${base}`;

    return `${base}/api/websocket`;
}

// Socket lifecycle only: reconnect, auth handshake, request correlation, backoff.
export function createTransport(host: TransportHost, events: TransportEvents): HaTransport {
    const CONNECT_DELAY_MS = 100;
    const AUTH_TIMEOUT_MS = 10000;
    const REQUEST_TIMEOUT_MS = 10000;
    const REQUEST_POLL_MS = 500;
    const MAX_RECONNECT_DELAY_MS = 60000;
    const MAX_BACKOFF_STEP = 6;

    let nextId = 0;
    let socketOpen = false;
    let authenticated = false;
    let authFailed = false;
    let intentionalClose = false;
    let admin = false;
    let reconnectAttempt = 0;
    // The host has no "is this timer running" query, so both flags mirror it.
    let pollRunning = false;
    let reconnectRunning = false;
    const pendingRequests = new Map<number, PendingRequest>();

    function makeError(code: string, message: string): TransportError {
        return { code: code, message: message || "" };
    }

    function stopTimer(name: TransportTimer): void {
        if (name === "reconnect")
            reconnectRunning = false;
        if (name === "poll")
            pollRunning = false;
        host.stopTimer(name);
    }

    // Restarting a running poll timer would push out every pending deadline.
    function startPoll(): void {
        if (pollRunning)
            return;
        pollRunning = true;
        host.startTimer("poll", REQUEST_POLL_MS, true);
    }

    function stopPoll(): void {
        if (!pollRunning)
            return;
        stopTimer("poll");
    }

    // takePending() is the only place that can empty the map, so the poll timer
    // stops exactly when the last request is gone.
    function takePending(id: number): PendingRequest | null {
        const pending = pendingRequests.get(id);
        if (!pending)
            return null;

        pendingRequests.delete(id);
        if (pendingRequests.size === 0)
            stopPoll();
        return pending;
    }

    function finishRequest(id: number, error: TransportError): void {
        const pending = takePending(id);
        if (!pending)
            return;
        if (pending.onError)
            pending.onError(error);
    }

    function rejectAllPending(code: string): void {
        const pending = Array.from(pendingRequests.values());
        pendingRequests.clear();
        stopPoll();

        const message = code === "syncConnectionLost"
            ? host.translate("wsConnectionLost")
            : host.translate("wsRequestCancelled");
        for (const entry of pending) {
            if (entry.onError)
                entry.onError(makeError(code || "aborted", message));
        }
    }

    function closeSocket(): void {
        intentionalClose = true;
        host.socket().setActive(false);
        socketOpen = false;
        authenticated = false;
    }

    function openSocket(): void {
        if (!host.isActive()) {
            events.statusChanged("off", "");
            return;
        }

        const socket = host.socket();
        const status = socket.status();
        if (status === "open" || status === "connecting")
            return;

        // QML keeps active true after an unexpected close, so reset it first.
        if (socket.active())
            socket.setActive(false);

        const url = socketUrl(host.credentials().url);
        if (!url) {
            events.statusChanged("error", host.translate("wsNotConfigured"));
            return;
        }

        intentionalClose = false;
        socketOpen = false;
        authenticated = false;
        events.statusChanged("connecting", host.translate("wsConnecting"));
        socket.setUrl(url);
        socket.setActive(true);
    }

    function scheduleReconnect(message: string): void {
        if (!host.isActive() || authFailed || reconnectRunning)
            return;

        const step = Math.min(reconnectAttempt, MAX_BACKOFF_STEP);
        reconnectAttempt += 1;
        reconnectRunning = true;
        host.startTimer("reconnect", Math.min(MAX_RECONNECT_DELAY_MS, 1000 * Math.pow(2, step)), false);
        events.statusChanged("lost", message);
    }

    function handleSocketStatus(): void {
        const status = host.socket().status();

        if (status === "open") {
            socketOpen = true;
            events.statusChanged("auth", host.translate("wsAuthenticating"));
            host.startTimer("auth", AUTH_TIMEOUT_MS, false);
            return;
        }

        if (status === "connecting") {
            if (!socketOpen)
                events.statusChanged("connecting", host.translate("wsConnecting"));
            return;
        }

        if (status === "closing")
            return;

        const hadConnection = socketOpen || authenticated;
        socketOpen = false;
        authenticated = false;
        stopTimer("auth");
        admin = false;
        events.permissionChanged(false);
        rejectAllPending("syncConnectionLost");

        if (intentionalClose) {
            intentionalClose = false;
            return;
        }

        if (!host.isActive()) {
            events.statusChanged("off", "");
            return;
        }

        if (authFailed)
            return;

        scheduleReconnect(hadConnection
            ? host.translate("wsConnectionLost")
            : host.translate("wsCannotReach"));
    }

    function sendAuth(): void {
        if (!socketOpen)
            return;

        host.socket().send(JSON.stringify({
            type: "auth",
            access_token: host.credentials().token,
        }));
        events.statusChanged("auth", host.translate("wsAuthenticating"));
        host.startTimer("auth", AUTH_TIMEOUT_MS, false);
    }

    function handleAuthTimeout(): void {
        if (authenticated)
            return;
        events.statusChanged("error", host.translate("wsAuthTimedOut"));
        closeSocket();
        scheduleReconnect(host.translate("wsAuthTimedOut"));
    }

    function handleAuthOk(): void {
        stopTimer("auth");
        authFailed = false;
        authenticated = true;
        reconnectAttempt = 0;
        events.statusChanged("syncing", host.translate("wsAuthenticating"));

        request("auth/current_user", null, function (result): void {
            admin = isAdminFlag(result);
            events.permissionChanged(admin);
            events.authenticated(admin);
        }, function (error): void {
            if (error.code === "aborted")
                return;
            admin = false;
            events.permissionChanged(false);
            events.authenticated(false);
        });
    }

    function handleAuthInvalid(): void {
        authFailed = true;
        stopTimer("auth");
        const message = host.translate("wsAuthRejected");
        events.statusChanged("error", message);
        events.authFailed(message);
        closeSocket();
    }

    function handleResult(message: Record<string, unknown>): void {
        const pending = takePending(Number(message.id));
        if (!pending)
            return;

        if (message.success === false) {
            const error = asRecord(message.error);
            if (pending.onError)
                pending.onError(makeError(text(error.code) || "unknown", text(error.message)));
            return;
        }

        if (pending.onSuccess)
            pending.onSuccess(message.result);
    }

    function checkRequestTimeouts(): void {
        const now = host.now();
        const expired: number[] = [];
        for (const [id, pending] of pendingRequests) {
            if (pending.deadline <= now)
                expired.push(id);
        }

        for (const id of expired) {
            const pending = takePending(id);
            if (pending?.onError)
                pending.onError(makeError("timeout", host.translate("wsRequestTimedOut")));
        }

        if (pendingRequests.size === 0)
            stopPoll();
    }

    function handleEvent(message: Record<string, unknown>): void {
        const event = message.event;
        if (!event || typeof event !== "object")
            return;

        const record = event as Record<string, unknown>;
        const eventType = record.event_type;
        if (typeof eventType !== "string")
            return;

        events.eventReceived(eventType, record.data || {});
    }

    function handleMessage(text: unknown): void {
        let message: unknown = null;
        try {
            message = JSON.parse(String(text));
        } catch {
            events.statusChanged("error", host.translate("wsInvalidResponse"));
            return;
        }

        if (!message || typeof message !== "object")
            return;

        const record = message as Record<string, unknown>;
        if (typeof record.type !== "string")
            return;

        switch (record.type) {
        case "auth_required":
            sendAuth();
            return;
        case "auth_ok":
            handleAuthOk();
            return;
        case "auth_invalid":
            handleAuthInvalid();
            return;
        case "result":
            handleResult(record);
            return;
        case "event":
            handleEvent(record);
            return;
        default:
            return;
        }
    }

    function connect(): void {
        if (!host.isActive())
            return;
        host.startTimer("connect", CONNECT_DELAY_MS, false);
    }

    function retryNow(): void {
        authFailed = false;
        reconnectAttempt = 0;
        stopTimer("reconnect");

        const status = host.socket().status();
        if (status === "open" || status === "connecting") {
            closeSocket();
            host.startTimer("connect", CONNECT_DELAY_MS, false);
            return;
        }

        events.statusChanged("connecting", host.translate("wsConnecting"));
        host.startTimer("connect", CONNECT_DELAY_MS, false);
    }

    function teardown(): void {
        stopTimer("connect");
        stopTimer("reconnect");
        stopTimer("auth");
        stopTimer("poll");

        closeSocket();
        rejectAllPending("aborted");

        socketOpen = false;
        authenticated = false;
    }

    function request(
        type: string,
        payload: Record<string, unknown> | null,
        onSuccess?: (result: unknown) => void,
        onError?: (error: TransportError) => void,
    ): number {
        if (!socketOpen || !authenticated) {
            if (onError)
                onError(makeError("not_connected", host.translate("wsNotConnected")));
            return -1;
        }

        nextId += 1;
        const id = nextId;
        const message: Record<string, unknown> = { id: id, type: type };
        if (payload) {
            for (const key of Object.keys(payload))
                message[key] = payload[key];
        }

        pendingRequests.set(id, {
            id: id,
            onSuccess: onSuccess,
            onError: onError,
            deadline: host.now() + REQUEST_TIMEOUT_MS,
        });
        startPoll();

        try {
            host.socket().send(JSON.stringify(message));
        } catch {
            finishRequest(id, makeError("syncConnectionLost", host.translate("wsConnectionLost")));
        }
        return id;
    }

    function subscribe(
        eventType: string,
        onSuccess?: (result: unknown) => void,
        onError?: (error: TransportError) => void,
    ): number {
        return request("subscribe_events", { event_type: eventType }, onSuccess, onError);
    }

    function reset(): void {
        authFailed = false;
        reconnectAttempt = 0;
        teardown();
    }

    function isAuthenticated(): boolean {
        return socketOpen && authenticated;
    }

    function handleTimer(name: TransportTimer): void {
        switch (name) {
        case "connect":
            openSocket();
            return;
        case "reconnect":
            // The one-shot timer has just fired; a new reconnect may be scheduled.
            reconnectRunning = false;
            openSocket();
            return;
        case "auth":
            handleAuthTimeout();
            return;
        case "poll":
            checkRequestTimeouts();
            return;
        default:
            return;
        }
    }

    return {
        connect: connect,
        disconnect: teardown,
        reset: reset,
        retryNow: retryNow,
        isAuthenticated: isAuthenticated,
        request: request,
        subscribe: subscribe,
        handleSocketStatus: handleSocketStatus,
        handleMessage: handleMessage,
        handleTimer: handleTimer,
        deactivate: teardown,
    };
}
