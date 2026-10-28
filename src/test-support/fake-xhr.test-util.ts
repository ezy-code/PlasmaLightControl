export class FakeXhr {
    static readonly DONE = 4;
    static instances: FakeXhr[] = [];

    static reset(): void {
        FakeXhr.instances = [];
    }

    static latest(): FakeXhr {
        const instance = FakeXhr.instances[FakeXhr.instances.length - 1];
        if (!instance)
            throw new Error("no XMLHttpRequest was created");
        return instance;
    }

    readyState = 0;
    status = 0;
    statusText = "";
    responseText = "";
    timeout = 0;
    method = "";
    url = "";
    headers: Record<string, string> = {};
    body: string | null = null;
    aborted = false;
    onreadystatechange: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;

    constructor() {
        FakeXhr.instances.push(this);
    }

    open(method: string, url: string): void {
        this.method = method;
        this.url = url;
    }

    setRequestHeader(name: string, value: string): void {
        this.headers[name] = value;
    }

    send(body?: string): void {
        this.body = body ?? null;
    }

    abort(): void {
        this.aborted = true;
        this.onabort?.();
    }

    respond(status: number, responseText = "", statusText = ""): void {
        this.status = status;
        this.statusText = statusText;
        this.responseText = responseText;
        this.readyState = FakeXhr.DONE;
        this.onreadystatechange?.();
    }

    fail(): void {
        this.onerror?.();
    }

    timeOut(): void {
        this.ontimeout?.();
    }
}

export function installFakeXhr(): () => void {
    const scope = globalThis as unknown as { XMLHttpRequest?: unknown };
    const previous = scope.XMLHttpRequest;
    scope.XMLHttpRequest = FakeXhr;
    FakeXhr.reset();
    return () => {
        if (previous === undefined)
            delete scope.XMLHttpRequest;
        else
            scope.XMLHttpRequest = previous;
    };
}
