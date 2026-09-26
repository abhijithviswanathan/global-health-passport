import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "../../apps/web/node_modules/typescript/lib/typescript.js";
import { createTypeScriptLoader } from "./load-typescript.mjs";
const load = createTypeScriptLoader(ts);
const {
  HttpClient,
  CachedCsrfPolicy,
  FreshCsrfPolicy,
  ApiError,
  browserJson,
  nativeJson,
} = await load(new URL("../../apps/shared/http-client.ts", import.meta.url));
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status });

function fixture(
  policy = new CachedCsrfPolicy(),
  handler = () => json({ saved: true }),
) {
  const calls = [];
  let token = 0;
  const client = new HttpClient({
    baseUrl: "/api",
    credentials: "same-origin",
    csrf: policy,
    decode: browserJson,
    fetch: async (url, init) => {
      calls.push({ url, ...init });
      return url.endsWith("/csrf")
        ? json({ token: `token-${++token}`, headerName: "X-Test-CSRF" })
        : handler(url, init);
    },
  });
  return { client, calls };
}

test("browser requests retain cookie, JSON, token reuse and sign-out rotation contracts", async () => {
  const { client, calls } = fixture();
  await client.request("/me");
  await client.request("/care/tasks", {
    method: "POST",
    body: { requestKey: "stable" },
  });
  await client.request("/care/tasks", {
    method: "PATCH",
    body: { version: 2 },
  });
  assert.deepEqual(
    calls.map((c) => c.url),
    ["/api/me", "/api/csrf", "/api/care/tasks", "/api/care/tasks"],
  );
  assert.equal(calls[0].headers["Content-Type"], undefined);
  assert.equal(calls[2].headers["X-Test-CSRF"], "token-1");
  assert.equal(calls[3].headers["X-Test-CSRF"], "token-1");
  assert.deepEqual(JSON.parse(calls[2].body), { requestKey: "stable" });
  assert.ok(
    calls.every(
      (c) => c.credentials === "same-origin" && c.cache === "no-store",
    ),
  );
  await client.request("/auth/logout", { method: "POST" });
  await client.request("/care/tasks", { method: "POST" });
  assert.equal(calls.at(-1).headers["X-Test-CSRF"], "token-2");
});

test("403 invalidates CSRF and conflict writes surface once without implicit retries", async () => {
  let status = 403;
  const { client, calls } = fixture(undefined, () =>
    json({ message: "Refresh and review" }, status),
  );
  await assert.rejects(
    client.request("/care/tasks/t", { method: "PATCH" }),
    (e) => e instanceof ApiError && e.status === 403,
  );
  status = 409;
  await assert.rejects(
    client.request("/care/tasks/t", { method: "PATCH" }),
    (e) => e.status === 409 && e.message === "Refresh and review",
  );
  assert.equal(calls.filter((c) => c.url.endsWith("/csrf")).length, 2);
  assert.equal(calls.filter((c) => c.method === "PATCH").length, 2);
});

test("a token arriving after invalidation cannot populate the next session cache", async () => {
  const policy = new CachedCsrfPolicy();
  let resolve;
  const pending = policy.get(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  policy.invalidate();
  resolve({ token: "old-session" });
  await pending;
  assert.deepEqual(await policy.get(async () => ({ token: "new-session" })), {
    token: "new-session",
  });
});

test("fresh policy reloads every write; multipart preserves its boundary", async () => {
  const { client, calls } = fixture(new FreshCsrfPolicy());
  const body = new FormData();
  body.append("file", new Blob(["synthetic"]), "sample.txt");
  await client.request("/photos", { method: "POST", body });
  await client.request("/photos", { method: "POST", body });
  assert.equal(calls.filter((c) => c.url.endsWith("/csrf")).length, 2);
  assert.equal(calls[1].body, body);
  assert.equal(calls[1].headers["Content-Type"], undefined);
});

test("caller cancellation reaches fetch; timed out requests abort and never retry", async () => {
  const seen = [];
  const client = new HttpClient({
    baseUrl: "/api",
    credentials: "same-origin",
    csrf: new CachedCsrfPolicy(),
    decode: browserJson,
    fetch: (_url, init) =>
      new Promise((_resolve, reject) => {
        seen.push(init.signal);
        if (init.signal.aborted) return reject(init.signal.reason);
        init.signal.addEventListener(
          "abort",
          () => reject(init.signal.reason),
          { once: true },
        );
      }),
  });
  const controller = new AbortController();
  const pending = client.request("/records", { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(seen[0], controller.signal);
  await assert.rejects(client.request("/records", { timeoutMs: 1 }), {
    name: "AbortError",
  });
  assert.equal(seen.length, 2);
});

test("platform response conventions and secure-session errors stay explicit", async () => {
  assert.equal(
    await browserJson(new Response(null, { status: 204 })),
    undefined,
  );
  assert.deepEqual(await nativeJson(new Response(null, { status: 204 })), {});
  assert.deepEqual(await browserJson(new Response("bad", { status: 500 })), {});
  await assert.rejects(nativeJson(new Response("bad")), /unexpected response/);
  const client = new HttpClient({
    baseUrl: "/api",
    credentials: "same-origin",
    csrf: new CachedCsrfPolicy(),
    decode: browserJson,
    csrfErrorMessage: "Unable to establish a secure session.",
    fetch: async () => new Response("bad", { status: 503 }),
  });
  await assert.rejects(
    client.request("/records", { method: "POST" }),
    (e) => e.status === 503 && /secure session/.test(e.message),
  );
});
