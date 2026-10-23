"""Fetch a list of public URLs (GET, or JSON-RPC POST) and save raw responses + headers. REAL services.
Used to inspect data before writing detection rules. Input: tests/probe_urls.json."""
import json, time, urllib.request
from pathlib import Path
OUT = Path("out"); OUT.mkdir(exist_ok=True)
items = json.loads(Path("tests/probe_urls.json").read_text())
res = {}
for name, it in items.items():
    t0 = time.time()
    try:
        if isinstance(it, str):
            req = urllib.request.Request(it, headers={"Accept": "application/json", "User-Agent": "PreBuyScan-research", "Origin": "https://492gueq-gif.github.io"})
        else:
            req = urllib.request.Request(it["url"], data=json.dumps(it["body"]).encode(), headers={"Content-Type": "application/json", "Origin": "https://492gueq-gif.github.io"})
        with urllib.request.urlopen(req, timeout=40) as r:
            body = r.read().decode("utf-8", "replace")
            res[name] = dict(status=r.status, ms=int((time.time() - t0) * 1000), headers={k: v for k, v in r.headers.items() if k.lower().startswith(("access-control", "content-type", "retry", "x-ratelimit"))}, body=body[:400000])
    except Exception as e:
        res[name] = dict(error=repr(e)[:300], ms=int((time.time() - t0) * 1000))
    if "geckoterminal" in (it if isinstance(it, str) else it["url"]): time.sleep(2.2)
(OUT / "probe.json").write_text(json.dumps(res, indent=1))
print("::notice title=probe::" + json.dumps({k: (v.get("status"), v.get("error"), len(v.get("body", ""))) for k, v in res.items()})[:3500])
