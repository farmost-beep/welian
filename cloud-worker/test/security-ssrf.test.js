// L3 Security tests — SSRF protection for /ai/read_url
// Verifies that internal/private IPs and non-http protocols are blocked.
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../src/worker.js";
import { baseEnv, authHeader, jsonReq } from "./helpers.js";

describe("L3 SSRF: /ai/read_url blocks internal addresses", () => {
  let env;
  const mockCtx = { waitUntil: () => {} };
  beforeEach(() => { env = baseEnv(); });

  const blockedUrls = [
    "http://127.0.0.1/",
    "http://127.0.0.1:8080/admin",
    "http://localhost/",
    "http://localhost:3000/",
    "http://10.0.0.1/",
    "http://10.255.255.1/",
    "http://192.168.1.1/",
    "http://192.168.0.100/",
    "http://172.16.0.1/",
    "http://172.31.255.1/",
    "http://169.254.169.254/latest/meta-data/",  // AWS metadata endpoint
    "http://0.0.0.0/",
    "http://foo.localhost/",
    "http://bar.local/",
    "ftp://example.com/",  // non-http protocol
    "file:///etc/passwd",  // file protocol
    "javascript:alert(1)",  // javascript protocol
  ];

  blockedUrls.forEach(url => {
    it(`blocks ${url}`, async () => {
      const req = jsonReq("/ai/read_url", {
        body: { url },
        headers: authHeader(),
      });
      const res = await worker.fetch(req, env, mockCtx);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("error");
      expect(data.error).toContain("not allowed");
    });
  });

  it("blocks missing url (400)", async () => {
    const req = jsonReq("/ai/read_url", {
      body: {},
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(400);
  });

  it("blocks non-string url (400)", async () => {
    const req = jsonReq("/ai/read_url", {
      body: { url: 12345 },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(400);
  });

  it("requires auth (401)", async () => {
    const req = jsonReq("/ai/read_url", { body: { url: "https://example.com" } });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(401);
  });

  it("blocks URL with credentials in userinfo", async () => {
    const req = jsonReq("/ai/read_url", {
      body: { url: "http://user:pass@example.com/" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("error");
  });
});

describe("L3 SSRF: isUrlAllowed filter logic", () => {
  // Test the SSRF filter directly without making real HTTP requests.
  // We verify the filter passes legitimate URLs by checking that the
  // endpoint does NOT return the SSRF block message.

  const allowedUrls = [
    "https://example.com/",
    "https://www.baidu.com/",
    "http://example.com/path/to/page",
    "https://example.com:443/",
  ];

  allowedUrls.forEach(url => {
    it(`isUrlAllowed accepts ${url}`, async () => {
      // Use a very short AbortSignal timeout to avoid hanging on real fetch
      // The key assertion: the response should NOT contain "not allowed"
      // (it may timeout or fail at fetch, but SSRF filter should pass it)
      const env = baseEnv();
      const mockCtx = { waitUntil: () => {} };
      const req = jsonReq("/ai/read_url", {
        body: { url },
        headers: authHeader(),
      });
      // Race against a timeout — if it passes SSRF, it'll try to fetch
      // and either succeed or fail with a non-SSRF error
      try {
        const res = await Promise.race([
          worker.fetch(req, env, mockCtx),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
        ]);
        const data = await res.json();
        // Should NOT be blocked by SSRF filter
        expect(data.error).not.toContain("not allowed");
      } catch (e) {
        // Timeout means it passed SSRF and tried to fetch (which hangs in test env)
        // This is expected — the SSRF filter allowed it
        expect(e.message).toContain("timeout");
      }
    });
  });
});
