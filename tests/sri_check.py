"""Dependency integrity (REAL network): fetch each pinned third-party script, compute its
sha384 and compare with the SRI map in index.html. The page has no npm dependencies."""
import base64, hashlib, json, re, sys, urllib.request
from pathlib import Path
_r = Path(__file__).resolve().parent.parent
html = (_r / "index.html").read_text() + (_r / "app.js").read_text()   # page logic lives in app.js
block = re.search(r"const SRI=\{(.*?)\};", html, re.S).group(1)
pins = dict(re.findall(r'"(https://[^"]+)":"(sha384-[^"]+)"', block))
loaded = set(re.findall(r'loadScript\("(https://[^"]+)"', html)) | set(re.findall(r'"(https://(?:cdnjs|cdn\.jsdelivr)[^"]+\.js)"', html))
out, bad = {}, []
for url in sorted(loaded | set(pins)):
    raw = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "PreBuyScan-CI"}), timeout=30).read()
    h = "sha384-" + base64.b64encode(hashlib.sha384(raw).digest()).decode()
    out[url] = dict(computed=h, pinned=pins.get(url), bytes=len(raw))
    if pins.get(url) != h:
        bad.append(url)
print(json.dumps(out, indent=1))
print("::notice title=sri_check::" + json.dumps({u: v["computed"] for u, v in out.items()}))
sys.exit(1 if bad else 0)
