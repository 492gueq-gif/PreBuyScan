/* PreBuyScan network layer (window.PBNet): timeouts, bounded retries with exponential
 * backoff and jitter, Retry-After, JSON validation and a short TTL cache for public
 * market GETs. RPC POSTs are retried only on transport failures / 429, never cached.
 * Errors carry .kind ("timeout" | "http" | "rate_limited" | "invalid_json" | "network")
 * so the UI can say "technical error" instead of pretending a check passed.
 * No secrets: every endpoint is public and keyless.
 */
(function (root) {
  "use strict";
  const CACHE_TTL = 30000;
  const CACHEABLE = /^https:\/\/api\.(dexscreener\.com|geckoterminal\.com)\//;
  // Minimum spacing per host (GeckoTerminal's public API allows ~30 requests/minute).
  const HOST_GAP = { "api.geckoterminal.com": 2100 };

  function netError(kind, message, status) {
    const e = new Error(message); e.kind = kind; if (status) e.status = status; return e;
  }
  const defaultSleep = ms => new Promise(r => setTimeout(r, ms));

  function makeClient(opts) {
    opts = opts || {};
    const fetchImpl = opts.fetch || ((...a) => root.fetch(...a));
    const sleep = opts.sleep || defaultSleep;
    // Monotonic clock for pacing and cache age (wall-clock changes must not stall requests).
    const now = opts.now || (() => (root.performance && root.performance.now ? root.performance.now() : Date.now()));
    const random = opts.random || Math.random;
    const retries = opts.retries == null ? 2 : opts.retries;
    const cache = new Map();
    const stats = { requests: 0, retries: 0, failures: 0, cacheHits: 0, lastError: null };
    const gaps = opts.gaps || HOST_GAP;
    const nextAt = {};
    async function pace(url) {
      let host; try { host = new URL(url).host; } catch (e) { return; }
      const gap = gaps[host]; if (!gap) return;
      const at = Math.max(now(), nextAt[host] || 0);
      nextAt[host] = at + gap;           // reserve a slot so concurrent callers queue up
      const wait = at - now();
      if (wait > 0) await sleep(wait);
    }

    async function once(url, init, ms) {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
      let r;
      try { r = await fetchImpl(url, Object.assign({}, init, { signal: ctl.signal })); }
      catch (e) { throw netError(e && e.name === "AbortError" ? "timeout" : "network", "request failed"); }
      finally { clearTimeout(t); }
      if (r.status === 429) {
        const raw = r.headers && r.headers.get ? r.headers.get("Retry-After") : null;
        const after = raw == null || raw === "" ? NaN : Number(raw);   // absent header is not "retry in 0 s"
        const err = netError("rate_limited", "HTTP 429", 429); err.retryAfter = isFinite(after) && after >= 0 ? after : null; throw err;
      }
      if (!r.ok) throw netError("http", "HTTP " + r.status, r.status);
      try { return await r.json(); } catch (e) { throw netError("invalid_json", "invalid JSON"); }
    }

    async function fetchJSON(url, init, ms) {
      init = init || {}; ms = ms || 9000;
      const method = (init.method || "GET").toUpperCase();
      const key = method === "GET" && CACHEABLE.test(url) ? url : null;
      if (key) {
        const hit = cache.get(key);
        if (hit && now() - hit.at < CACHE_TTL) { stats.cacheHits++; return hit.value; }
      }
      let attempt = 0;
      for (;;) {
        stats.requests++;
        try {
          await pace(url);
          const value = await once(url, init, ms);
          if (key) cache.set(key, { at: now(), value });
          return value;
        } catch (e) {
          // Retry only what can be transient; a 4xx (other than 429) or bad JSON will not improve.
          const transient = e.kind === "timeout" || e.kind === "network" || e.kind === "rate_limited" || (e.kind === "http" && e.status >= 500);
          const postOk = method === "GET" || e.kind !== "http";
          if (!transient || !postOk || attempt >= retries) {
            stats.failures++; stats.lastError = { kind: e.kind, status: e.status || null, at: now() };
            throw e;
          }
          attempt++; stats.retries++;
          const base = 400 * Math.pow(2, attempt - 1);
          // 429 without Retry-After: wait longer than for transient network errors.
          const wait = e.retryAfter != null ? Math.min(10000, e.retryAfter * 1000)
            : e.kind === "rate_limited" ? 2000 * Math.pow(2, attempt - 1) : base + Math.floor(random() * base);
          await sleep(wait);
        }
      }
    }
    return { fetchJSON, clear: () => cache.clear(), stats, cache };
  }

  const api = Object.assign(makeClient(), { makeClient, CACHE_TTL, CACHEABLE, HOST_GAP });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PBNet = api;
})(typeof window !== "undefined" ? window : globalThis);
