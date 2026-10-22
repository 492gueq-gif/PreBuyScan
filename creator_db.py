"""PreBuyScan creator database (read-only research data).

Every hour: record each new Robinhood Chain token (GeckoTerminal new_pools) and the wallet that
created it (Blockscout v2: the sender of the contract's creation transaction). 24 h and 72 h after
launch, check whether the token is dead (no DexScreener pair with at least $1,000 of liquidity).
Publishes creators.json: creators with 2+ launches and how many died, so the page can say
"this creator launched 12 tokens and 11 died" instantly.

Nothing is signed or sent; public APIs only. State lives in db/ (the creator-db branch).
"""
import json
import os
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

GT = "https://api.geckoterminal.com/api/v2/networks/robinhood/"
BS = "https://robinhoodchain.blockscout.com/api/v2/"
DEX = "https://api.dexscreener.com/tokens/v1/robinhood/"
WETH_ID = "robinhood_0x0bd7d308f8e1639fab988df18a8011f41eacad73"
DEAD_LIQ = 1000.0
PLATFORM_NONCE = 500      # a "creator" with more transactions than this is a launch platform or relayer, not a person
MAX_LOOKUPS = 160          # per hourly run; the rest waits for the next run
H24, H72 = 86400, 3 * 86400
KEEP_TOKENS_DAYS = 30
DB = os.environ.get("CREATOR_DB_DIR", "db")


def get_json(url, tries=4, timeout=25):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "PreBuyScan-research"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except Exception as e:
            code = getattr(e, "code", None)
            if code in (400, 404) or i == tries - 1:
                raise
            time.sleep(4 * (i + 1))


def load(name, default):
    try:
        with open(os.path.join(DB, name)) as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def save(name, obj):
    os.makedirs(DB, exist_ok=True)
    tmp = os.path.join(DB, name + ".tmp")
    with open(tmp, "w") as f:
        json.dump(obj, f, separators=(",", ":"), sort_keys=True)
    os.replace(tmp, os.path.join(DB, name))


# ---------- pure helpers ----------
def new_tokens(pages, known):
    out = {}
    for page in pages:
        for p in page.get("data") or []:
            a, r = p.get("attributes") or {}, p.get("relationships") or {}
            base = ((r.get("base_token") or {}).get("data") or {}).get("id")
            quote = ((r.get("quote_token") or {}).get("data") or {}).get("id")
            tid = quote if base == WETH_ID else base
            t = (tid or "").split("_")[-1].lower()
            if not re.fullmatch(r"0x[0-9a-f]{40}", t) or t in known or t in out:
                continue
            try:
                created = int(datetime.fromisoformat(a["pool_created_at"].replace("Z", "+00:00")).timestamp())
            except Exception:
                continue
            out[t] = dict(created=created, pool=(a.get("address") or "").lower(), name=(a.get("name") or "").split(" / ")[0][:24])
    return out


def due(tokens, now):
    """Tokens whose 24 h or 72 h check is due."""
    return [t for t, v in tokens.items() if v.get("creator") and (
        ("d24" not in v and now >= v["created"] + H24) or ("d72" not in v and now >= v["created"] + H72))]


def aggregate(tokens):
    creators = {}
    for t, v in tokens.items():
        c = v.get("creator")
        if not c:
            continue
        x = creators.setdefault(c, dict(launched=0, dead=0, alive=0, pending=0, first=v["created"], last=v["created"], tokens=[]))
        x["launched"] += 1
        status = v.get("d72", v.get("d24"))
        if status is None:
            x["pending"] += 1
        elif status == "dead":
            x["dead"] += 1
        else:
            x["alive"] += 1
        x["first"], x["last"] = min(x["first"], v["created"]), max(x["last"], v["created"])
        x["tokens"].append((v["created"], t))
    return creators


def publish(creators, now, tracked, nonces=None):
    # Compact: [launched, dead, alive, pending, first, last, [up to 5 latest tokens], platform]
    # for creators with 2+ launches. platform=1 when the creator wallet has more than PLATFORM_NONCE txs.
    nonces = nonces or {}
    out = {c: [x["launched"], x["dead"], x["alive"], x["pending"], x["first"], x["last"],
               [t for _, t in sorted(x["tokens"], reverse=True)[:5]], 1 if (nonces.get(c) or 0) > PLATFORM_NONCE else 0]
           for c, x in creators.items() if x["launched"] >= 2}
    return dict(updated=now, since=min((x["first"] for x in creators.values()), default=now), tracked=tracked,
                dead_liquidity_usd=DEAD_LIQ, fields=["launched", "dead", "alive", "pending", "first", "last", "latest_tokens", "platform"],
                creators=out)


# ---------- network steps ----------
def rpc(method, params):
    body = json.dumps(dict(jsonrpc="2.0", id=1, method=method, params=params)).encode()
    req = urllib.request.Request("https://rpc.mainnet.chain.robinhood.com", data=body,
                                 headers={"Content-Type": "application/json", "User-Agent": "PreBuyScan-research"})
    with urllib.request.urlopen(req, timeout=20) as r:
        j = json.load(r)
    if "error" in j:
        raise RuntimeError(j["error"])
    time.sleep(0.3)
    return j["result"]


def creator_of(token):
    a = get_json(BS + "addresses/" + token)
    txh = a.get("creation_transaction_hash") or a.get("creation_tx_hash")
    if not txh:
        c = (a.get("creator_address_hash") or "").lower()
        return c or None
    tx = get_json(BS + "transactions/" + txh)
    return ((tx.get("from") or {}).get("hash") or a.get("creator_address_hash") or "").lower() or None


def liquidity(tokens):
    out = {}
    for i in range(0, len(tokens), 30):
        chunk = tokens[i:i + 30]
        try:
            pairs = get_json(DEX + ",".join(chunk)) or []
        except Exception:
            continue
        seen = {t: 0.0 for t in chunk}
        for p in pairs:
            b = ((p.get("baseToken") or {}).get("address") or "").lower()
            if b in seen:
                seen[b] = max(seen[b], float((p.get("liquidity") or {}).get("usd") or 0))
        out.update(seen)
        time.sleep(1.2)
    return out


BROWSER_JS = """async tokens=>{
  const B='https://robinhoodchain.blockscout.com/api/v2/';const out={};const errs=[];
  const get=async u=>{for(let i=0;i<3;i++){const c=new AbortController();const tm=setTimeout(()=>c.abort(),12000);try{const r=await fetch(u,{signal:c.signal});if(r.status===429||r.status>=500){await new Promise(s=>setTimeout(s,1500*(i+1)));continue;}
    if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();}catch(e){if(i===2)throw e;await new Promise(s=>setTimeout(s,1000*(i+1)));}finally{clearTimeout(tm);}}throw new Error('unavailable');};
  const one=async t=>{try{const a=await get(B+'addresses/'+t);const h=a.creation_transaction_hash||a.creation_tx_hash;
      if(!h){out[t]=(a.creator_address_hash||'').toLowerCase()||null;return;}
      const tx=await get(B+'transactions/'+h);out[t]=((tx.from&&tx.from.hash)||a.creator_address_hash||'').toLowerCase()||null;}
    catch(e){out[t]=null;errs.push(String(e).slice(0,100));}};
  const q=tokens.slice();await Promise.all([0,1,2,3].map(async()=>{while(q.length)await one(q.shift());}));
  return {out,errs:[...new Set(errs)].slice(0,5)};
}"""


def lookup_creators(tokens, errors):
    """Blockscout refuses plain scripts (HTTP 403) but serves browsers: run the lookups in Chromium."""
    if not tokens:
        return {}
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.goto("about:blank")
        pg.set_content("<html><body>creator-db</body></html>")
        res = {}
        for i in range(0, len(tokens), 60):
            try:
                r = pg.evaluate(BROWSER_JS, tokens[i:i + 60])
            except Exception as e:
                errors.append(type(e).__name__); continue
            res.update(r["out"]); errors.extend(r["errs"])
        b.close()
    return res


def run(now=None):
    now = int(now or time.time())
    tokens = load("tokens.json", {})
    pages = []
    for p in range(1, 11):
        try:
            pages.append(get_json(GT + "new_pools?page=%d" % p)); time.sleep(2.2)
        except Exception as e:
            print("new_pools page", p, type(e).__name__)
    fresh = new_tokens(pages, tokens)
    # Retry tokens whose creator lookup failed before (at most 2 extra tries).
    retry = [t for t, v in tokens.items() if not v.get("creator") and v.get("tries", 0) < 5]
    todo = (list(fresh) + retry)[:MAX_LOOKUPS]
    for t, v in fresh.items():
        tokens[t] = v

    errors = []
    for t, c in lookup_creators(todo, errors).items():
        tokens[t]["tries"] = tokens[t].get("tries", 0) + 1
        if c:
            tokens[t]["creator"] = c
    found = sum(1 for t in todo if tokens[t].get("creator"))
    # Death checks
    d = due(tokens, now)
    liq = liquidity(d)
    for t in d:
        if t not in liq:
            continue
        status = "dead" if liq[t] < DEAD_LIQ else "alive"
        v = tokens[t]
        if "d24" not in v and now >= v["created"] + H24:
            v["d24"] = status
        if "d72" not in v and now >= v["created"] + H72:
            v["d72"] = status
    # Prune old tokens from the working set but keep their creators' history in creators_all.json.
    creators = aggregate(tokens)
    old = {t for t, v in tokens.items() if now - v["created"] > KEEP_TOKENS_DAYS * 86400 and "d72" in v}
    if old:
        hist = load("history.json", {})
        for t in old:
            hist[t] = {k: tokens[t].get(k) for k in ("creator", "created", "d24", "d72")}
            del tokens[t]
        save("history.json", hist)
        creators = aggregate({**hist, **tokens})
    save("tokens.json", tokens)
    nonces = load("nonces.json", {})
    for c, x in creators.items():
        if x["launched"] >= 2 and (c not in nonces or x["last"] > nonces[c].get("at", 0)):
            try:
                n = int(rpc("eth_getTransactionCount", [c, "latest"]), 16)
                nonces[c] = dict(n=n, at=now)
            except Exception:
                pass
    save("nonces.json", nonces)
    pub = publish(creators, now, len(tokens), {c: v["n"] for c, v in nonces.items()})
    save("creators.json", pub)
    runs = load("runs.json", [])
    runs.append(dict(at=now, new=len(fresh), creator_found=found, retried=len(retry), checked=len(d),
                     tracked=len(tokens), serial_creators=len(pub["creators"]), errors=sorted(set(errors))[:5]))
    save("runs.json", runs[-500:])
    print(json.dumps(runs[-1]))


if __name__ == "__main__":
    run()
