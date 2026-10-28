declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

interface XMLHttpRequest {
  readonly readyState: number;
  readonly status: number;
  readonly statusText: string;
  readonly responseText: string;
  timeout: number;
  onreadystatechange: (() => void) | null;
  onerror: (() => void) | null;
  ontimeout: (() => void) | null;
  onabort: (() => void) | null;
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  send(body?: string): void;
  abort(): void;
}

declare const XMLHttpRequest: {
  readonly DONE: number;
  new (): XMLHttpRequest;
};
