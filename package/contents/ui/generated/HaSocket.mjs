// src/shared/coerce.ts
function text(value) {
  return String(value || "");
}

// src/ha/socket.ts
function isAdminFlag(value) {
  if (!value || typeof value !== "object")
    return false;
  return Boolean(value.is_admin);
}
function asRecord(value) {
  if (!value || typeof value !== "object")
    return {};
  return value;
}
function socketUrl(baseUrl) {
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
function createTransport(host, events) {
  const CONNECT_DELAY_MS = 100;
  const AUTH_TIMEOUT_MS = 1e4;
  const REQUEST_TIMEOUT_MS = 1e4;
  const REQUEST_POLL_MS = 500;
  const MAX_RECONNECT_DELAY_MS = 6e4;
  const MAX_BACKOFF_STEP = 6;
  let nextId = 0;
  let socketOpen = false;
  let authenticated = false;
  let authFailed = false;
  let intentionalClose = false;
  let admin = false;
  let reconnectAttempt = 0;
  let pollRunning = false;
  let reconnectRunning = false;
  const pendingRequests = /* @__PURE__ */ new Map();
  function makeError(code, message) {
    return { code, message: message || "" };
  }
  function stopTimer(name) {
    if (name === "reconnect")
      reconnectRunning = false;
    if (name === "poll")
      pollRunning = false;
    host.stopTimer(name);
  }
  function startPoll() {
    if (pollRunning)
      return;
    pollRunning = true;
    host.startTimer("poll", REQUEST_POLL_MS, true);
  }
  function stopPoll() {
    if (!pollRunning)
      return;
    stopTimer("poll");
  }
  function takePending(id) {
    const pending = pendingRequests.get(id);
    if (!pending)
      return null;
    pendingRequests.delete(id);
    if (pendingRequests.size === 0)
      stopPoll();
    return pending;
  }
  function finishRequest(id, error) {
    const pending = takePending(id);
    if (!pending)
      return;
    if (pending.onError)
      pending.onError(error);
  }
  function rejectAllPending(code) {
    const pending = Array.from(pendingRequests.values());
    pendingRequests.clear();
    stopPoll();
    const message = code === "syncConnectionLost" ? host.translate("wsConnectionLost") : host.translate("wsRequestCancelled");
    for (const entry of pending) {
      if (entry.onError)
        entry.onError(makeError(code || "aborted", message));
    }
  }
  function closeSocket() {
    intentionalClose = true;
    host.socket().setActive(false);
    socketOpen = false;
    authenticated = false;
  }
  function openSocket() {
    if (!host.isActive()) {
      events.statusChanged("off", "");
      return;
    }
    const socket = host.socket();
    const status = socket.status();
    if (status === "open" || status === "connecting")
      return;
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
  function scheduleReconnect(message) {
    if (!host.isActive() || authFailed || reconnectRunning)
      return;
    const step = Math.min(reconnectAttempt, MAX_BACKOFF_STEP);
    reconnectAttempt += 1;
    reconnectRunning = true;
    host.startTimer("reconnect", Math.min(MAX_RECONNECT_DELAY_MS, 1e3 * Math.pow(2, step)), false);
    events.statusChanged("lost", message);
  }
  function handleSocketStatus() {
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
    scheduleReconnect(hadConnection ? host.translate("wsConnectionLost") : host.translate("wsCannotReach"));
  }
  function sendAuth() {
    if (!socketOpen)
      return;
    host.socket().send(JSON.stringify({
      type: "auth",
      access_token: host.credentials().token
    }));
    events.statusChanged("auth", host.translate("wsAuthenticating"));
    host.startTimer("auth", AUTH_TIMEOUT_MS, false);
  }
  function handleAuthTimeout() {
    if (authenticated)
      return;
    events.statusChanged("error", host.translate("wsAuthTimedOut"));
    closeSocket();
    scheduleReconnect(host.translate("wsAuthTimedOut"));
  }
  function handleAuthOk() {
    stopTimer("auth");
    authFailed = false;
    authenticated = true;
    reconnectAttempt = 0;
    events.statusChanged("syncing", host.translate("wsAuthenticating"));
    request("auth/current_user", null, function(result) {
      admin = isAdminFlag(result);
      events.permissionChanged(admin);
      events.authenticated(admin);
    }, function(error) {
      if (error.code === "aborted")
        return;
      admin = false;
      events.permissionChanged(false);
      events.authenticated(false);
    });
  }
  function handleAuthInvalid() {
    authFailed = true;
    stopTimer("auth");
    const message = host.translate("wsAuthRejected");
    events.statusChanged("error", message);
    events.authFailed(message);
    closeSocket();
  }
  function handleResult(message) {
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
  function checkRequestTimeouts() {
    const now = host.now();
    const expired = [];
    for (const [id, pending] of pendingRequests) {
      if (pending.deadline <= now)
        expired.push(id);
    }
    for (const id of expired) {
      const pending = takePending(id);
      if (pending == null ? void 0 : pending.onError)
        pending.onError(makeError("timeout", host.translate("wsRequestTimedOut")));
    }
    if (pendingRequests.size === 0)
      stopPoll();
  }
  function handleEvent(message) {
    const event = message.event;
    if (!event || typeof event !== "object")
      return;
    const record = event;
    const eventType = record.event_type;
    if (typeof eventType !== "string")
      return;
    events.eventReceived(eventType, record.data || {});
  }
  function handleMessage(text2) {
    let message = null;
    try {
      message = JSON.parse(String(text2));
    } catch (e) {
      events.statusChanged("error", host.translate("wsInvalidResponse"));
      return;
    }
    if (!message || typeof message !== "object")
      return;
    const record = message;
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
  function connect() {
    if (!host.isActive())
      return;
    host.startTimer("connect", CONNECT_DELAY_MS, false);
  }
  function retryNow() {
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
  function teardown() {
    stopTimer("connect");
    stopTimer("reconnect");
    stopTimer("auth");
    stopTimer("poll");
    closeSocket();
    rejectAllPending("aborted");
    socketOpen = false;
    authenticated = false;
  }
  function request(type, payload, onSuccess, onError) {
    if (!socketOpen || !authenticated) {
      if (onError)
        onError(makeError("not_connected", host.translate("wsNotConnected")));
      return -1;
    }
    nextId += 1;
    const id = nextId;
    const message = { id, type };
    if (payload) {
      for (const key of Object.keys(payload))
        message[key] = payload[key];
    }
    pendingRequests.set(id, {
      id,
      onSuccess,
      onError,
      deadline: host.now() + REQUEST_TIMEOUT_MS
    });
    startPoll();
    try {
      host.socket().send(JSON.stringify(message));
    } catch (e) {
      finishRequest(id, makeError("syncConnectionLost", host.translate("wsConnectionLost")));
    }
    return id;
  }
  function subscribe(eventType, onSuccess, onError) {
    return request("subscribe_events", { event_type: eventType }, onSuccess, onError);
  }
  function reset() {
    authFailed = false;
    reconnectAttempt = 0;
    teardown();
  }
  function isAuthenticated() {
    return socketOpen && authenticated;
  }
  function handleTimer(name) {
    switch (name) {
      case "connect":
        openSocket();
        return;
      case "reconnect":
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
    connect,
    disconnect: teardown,
    reset,
    retryNow,
    isAuthenticated,
    request,
    subscribe,
    handleSocketStatus,
    handleMessage,
    handleTimer,
    deactivate: teardown
  };
}
export {
  createTransport,
  socketUrl
};
