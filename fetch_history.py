"""Rate-limited public GeckoTerminal JSON client (copied verbatim from VIGIA fetch_history.get_json)."""
import json
import time
import urllib.request
import urllib.error

_LAST_REQUEST=0.0

def get_json(url):
    global _LAST_REQUEST
    for attempt in range(4):
        pause=max(0,2.2-(time.monotonic()-_LAST_REQUEST))
        if pause:time.sleep(pause)
        _LAST_REQUEST=time.monotonic()
        try:
            request=urllib.request.Request(url,headers={"Accept":"application/json","User-Agent":"VIGIA-Research/0.8"})
            with urllib.request.urlopen(request,timeout=12) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code not in (429,503) or attempt==3:raise
            try:wait=float(error.headers.get("Retry-After",2**(attempt+2)))
            except (TypeError,ValueError):wait=2**(attempt+2)
            if not 0<=wait<=45:raise
            time.sleep(wait)

