/**
 * Shared HTTP transport for web and native adapters. Callers select CSRF and JSON
 * policies; this layer owns request serialization, cancellation and status errors.
 * It never stores patient records or retries a clinical write automatically.
 */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type CsrfToken = { token: string; headerName?: string };
export interface CsrfPolicy {
  get(load: () => Promise<CsrfToken>): Promise<CsrfToken>;
  invalidate(): void;
}

/** Browser sessions reuse a token until authentication changes or a 403 invalidates it. */
export class CachedCsrfPolicy implements CsrfPolicy {
  private token: CsrfToken | undefined;
  private generation = 0;

  async get(load: () => Promise<CsrfToken>): Promise<CsrfToken> {
    if (this.token) return this.token;
    const generation = this.generation;
    const token = await load();
    // A response started before sign-out must not seed the next session's token cache.
    if (generation === this.generation) this.token = token;
    return token;
  }

  invalidate(): void {
    this.token = undefined;
    this.generation++;
  }
}

/** Native session cookies can rotate outside the app; every write requests a fresh token. */
export class FreshCsrfPolicy implements CsrfPolicy {
  get(load: () => Promise<CsrfToken>): Promise<CsrfToken> {
    return load();
  }
  invalidate(): void {
    /* No retained token. */
  }
}

export type RequestOptions = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
};
type Fetch = (url: string, options: RequestInit) => Promise<Response>;
export type HttpClientOptions = {
  baseUrl: string;
  credentials: RequestCredentials;
  csrf: CsrfPolicy;
  decode: (response: Response) => Promise<unknown>;
  assertTransport?: () => void;
  csrfHeaderName?: string;
  csrfErrorMessage?: string;
  contentTypeOnRead?: boolean;
  messageForStatus?: (status: number) => string;
  fetch?: Fetch;
};

export class HttpClient {
  private readonly options: HttpClientOptions;
  private readonly fetch: Fetch;

  constructor(options: HttpClientOptions) {
    this.options = options;
    // Resolve global fetch when called, so platform runtimes and tests can supply their adapter.
    this.fetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    this.options.assertTransport?.();
    const method = options.method || "GET";
    const headers: Record<string, string> = { Accept: "application/json" };
    if (method !== "GET") {
      const token = await this.options.csrf.get(() =>
        this.send<CsrfToken>("/csrf", {}, { Accept: "application/json" }, true),
      );
      headers[
        this.options.csrfHeaderName || token.headerName || "X-CSRF-TOKEN"
      ] = token.token;
    }
    return this.send<T>(path, { ...options, method }, headers);
  }

  private async send<T>(
    path: string,
    options: RequestOptions,
    headers: Record<string, string>,
    csrfRequest = false,
  ): Promise<T> {
    const method = options.method || "GET";
    const multipart = options.body instanceof FormData;
    if (!multipart && (method !== "GET" || this.options.contentTypeOnRead))
      headers["Content-Type"] = "application/json";
    const controller = options.signal ? undefined : new AbortController();
    const timeout = controller
      ? setTimeout(() => controller.abort(), options.timeoutMs ?? 15000)
      : undefined;
    try {
      const response = await this.fetch(`${this.options.baseUrl}${path}`, {
        method,
        headers,
        credentials: this.options.credentials,
        cache: "no-store",
        signal: options.signal ?? controller?.signal,
        ...(options.body === undefined
          ? {}
          : {
              body: multipart
                ? (options.body as FormData)
                : JSON.stringify(options.body),
            }),
      });
      if (path.startsWith("/auth/") || response.status === 403)
        this.options.csrf.invalidate();
      if (csrfRequest && !response.ok && this.options.csrfErrorMessage)
        throw new ApiError(this.options.csrfErrorMessage, response.status);
      const data = await this.options.decode(response);
      if (!response.ok) {
        const error =
          data && typeof data === "object"
            ? (data as Record<string, unknown>)
            : {};
        throw new ApiError(
          typeof error.message === "string"
            ? error.message
            : typeof error.error === "string"
              ? error.error
              : this.options.messageForStatus?.(response.status) ||
                "The request could not be completed.",
          response.status,
        );
      }
      return data as T;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }
}

/** Preserve the established browser API: no content is undefined; malformed error JSON is optional. */
export async function browserJson(response: Response): Promise<unknown> {
  if (response.ok && response.status === 204) return undefined;
  return response.ok ? response.json() : response.json().catch(() => ({}));
}

/** Preserve the native contract: empty replies are objects, malformed replies are explicit errors. */
export async function nativeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("The server returned an unexpected response.");
  }
}
