"""PRECISION_V2: do PreBuyScan's contract, creator, liquidity, sniper and holder signals predict a collapse?

Prospective study. Protocol frozen in docs/PRECISION_V2.md before any data was collected.
Every hour: scan a deterministic sample of brand-new Robinhood Chain tokens with the frozen
scanner copy (scanner/), store the verdict; 24 h later, measure the outcome from public
GeckoTerminal candles. Read-only: nothing is signed or sent, no keys, no money.

Commands:
  python precision_v2.py collect   -> appends to data/scans.jsonl
  python precision_v2.py outcome   -> appends to data/outcomes.jsonl
  python precision_v2.py report    -> prints the frozen evaluation as JSON
"""
import hashlib
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone

GT = "https://api.geckoterminal.com/api/v2/networks/robinhood/"
WETH_ID = "robinhood_0x0bd7d308f8e1639fab988df18a8011f41eacad73"
SCANS, OUTCOMES = "data/scans.jsonl", "data/outcomes.jsonl"

# ---- frozen parameters (see protocol) ----
START = 1792695600            # 2026-10-22T17:00:00Z: first eligible scan
END = 1793289600              # 2026-10-29T14:00:00Z: last eligible scan (7 days minus 3 h)
MIN_AGE, MAX_AGE = 15 * 60, 75 * 60   # pool age window at sampling
PER_RUN = 8                   # tokens scanned per hourly run
ENTRY_WINDOW = 1800           # no trade within 30 min after the scan -> no_trade_after_seen
DAY = 86400
MIN_N_PER_HALF = 15
RISK_GAP, VERDICT_GAP = 0.15, 0.20

LP_UNKNOWN = r"^(Control de la liquidez no revisado|No sabemos quién tiene la liquidez|Liquidez en un contrato|Creador no identificado)$"
CREATOR_UNKNOWN = r"^(Creador no identificado|Historial del creador no disponible|Historial del creador incompleto)$"
SNIPER_UNKNOWN = r"^(Snipers no revisados|Creador no identificado)$"
SIGNALS = {
    # name: (present regex, unknown regex, direction)
    "creador_retira_liquidez": (r"^El creador puede retirar la liquidez$", LP_UNKNOWN, "risk"),
    "wallet_controla_liquidez": (r"^(El creador puede retirar la liquidez|Una wallet controla la liquidez|Una wallet puede retirar la liquidez)$", LP_UNKNOWN, "risk"),
    "liquidez_bloqueada_o_quemada": (r"^(Liquidez en un contrato de bloqueo|Liquidez quemada)$", LP_UNKNOWN, "protective"),
    "creador_tokens_muertos": (r"^El creador (lanzó \d+ tokens y \d+ murieron|tiene \d+ tokens? muertos?)$", CREATOR_UNKNOWN, "risk"),
    "creador_wallet_nueva": (r"^Wallet del creador recién creada$", CREATOR_UNKNOWN, "risk"),
    "snipers_fondeados_por_creador": (r"comprador(es)? del lanzamiento los? fondeó el creador$", SNIPER_UNKNOWN, "risk"),
    "snipers_retienen": (r"^Los snipers (aún )?tienen ", SNIPER_UNKNOWN, "risk"),
    "holders_concentrados": (r"^(Muy concentrado|Concentrado): ", r"^Holders no revisados$", "risk"),
    "venta_falla_o_perdida": (r"^(La venta simulada falla|Pérdida muy alta al vender|Pérdida alta al vender)$",
                              r"^(Venta no simulada|No se pudo simular la compra|Solo se puede operar desde su propio router)$", "risk"),
    "contrato_dueno_activo": (r"^El contrato tiene dueño activo$", r"^(Contrato no revisado|Dueño del contrato no identificado)$", "risk"),
}


def get_json(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "PreBuyScan-research"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(5 * (i + 1))


def _read(path):
    try:
        with open(path) as f:
            return [json.loads(l) for l in f if l.strip()]
    except FileNotFoundError:
        return []


# ---------- sampling (pure) ----------
def candidates(pages, now, seen):
    """New pools aged MIN_AGE..MAX_AGE, one entry per token, excluding tokens already scanned."""
    out = {}
    for page in pages:
        for p in page.get("data") or []:
            a, r = p.get("attributes") or {}, p.get("relationships") or {}
            try:
                created = int(datetime.fromisoformat(a["pool_created_at"].replace("Z", "+00:00")).timestamp())
            except Exception:
                continue
            base = ((r.get("base_token") or {}).get("data") or {}).get("id")
            quote = ((r.get("quote_token") or {}).get("data") or {}).get("id")
            tid = quote if base == WETH_ID else base
            token = (tid or "").split("_")[-1].lower()
            if not re.fullmatch(r"0x[0-9a-f]{40}", token) or token in seen or token in out:
                continue
            if MIN_AGE <= now - created <= MAX_AGE:
                out[token] = dict(token=token, pool=(a.get("address") or "").lower(), pool_created=created)
    return list(out.values())


def pick(cands, k=PER_RUN):
    """Deterministic, unbiased by market data: lowest SHA-256 of the token address."""
    return sorted(cands, key=lambda c: hashlib.sha256(c["token"].encode()).hexdigest())[:k]


# ---------- outcome (pure) ----------
def outcome(scan, candles):
    rows = sorted(c for c in candles if all(isinstance(x, (int, float)) for x in c[:5]) and c[1] > 0 and c[4] > 0)
    t0 = scan["scanned_at"]
    after = [c for c in rows if c[0] >= t0]
    base = dict(token=scan["token"])
    if not after or after[0][0] - t0 > ENTRY_WINDOW:
        return dict(base, status="no_trade_after_seen", collapsed=True, lost_half=True)
    entry_t, entry = after[0][0], after[0][1]
    day = [c for c in after if c[0] + 300 <= entry_t + DAY]
    if not day:
        return dict(base, status="no_trade_after_seen", collapsed=True, lost_half=True)
    ret = day[-1][4] / entry - 1
    down = min(c[3] for c in day) / entry - 1
    return dict(base, status="entered", ret_24h=ret, max_down_24h=down,
                collapsed=down <= -0.9 or ret <= -0.9, lost_half=ret <= -0.5)


# ---------- evaluation (pure) ----------
def signal_state(checks, present_re, unknown_re):
    titles = [c["t"] for c in checks]
    if any(re.search(present_re, t) for t in titles):
        return "present"
    if any(re.search(unknown_re, t) for t in titles):
        return "unknown"
    return "absent"


def score_bucket(s):
    return None if s is None else "0-39" if s < 40 else "40-79" if s < 80 else "80-100"


def _rate(rows):
    return dict(n=len(rows), collapse_rate=(sum(r["collapsed"] for r in rows) / len(rows)) if rows else None,
                lost_half_rate=(sum(r["lost_half"] for r in rows) / len(rows)) if rows else None)


def evaluate(scans, outcomes):
    by_token = {o["token"]: o for o in outcomes if o.get("status") in ("entered", "no_trade_after_seen")}
    rows = [dict(s, **by_token[s["token"]]) for s in scans if s.get("ok") and s["token"] in by_token]
    rows.sort(key=lambda r: r["scanned_at"])
    if not rows:
        return dict(n=0)
    cut = rows[len(rows) // 2]["scanned_at"]
    for r in rows:
        r["half"] = "discovery" if r["scanned_at"] < cut else "confirmation"
    res = dict(n=len(rows), excluded_no_outcome=len([s for s in scans if s.get("ok")]) - len(rows),
               scan_failures=len([s for s in scans if not s.get("ok")]), half_cut=cut, signals={}, verdict={}, score={})
    for name, (pre, unk, direction) in SIGNALS.items():
        out = {}
        for half in ("all", "discovery", "confirmation"):
            hr = [r for r in rows if half == "all" or r["half"] == half]
            st = {k: [r for r in hr if signal_state(r["checks"], pre, unk) == k] for k in ("present", "absent", "unknown")}
            out[half] = {k: _rate(v) for k, v in st.items()}
        gaps = {}
        for half in ("discovery", "confirmation"):
            p, a = out[half]["present"], out[half]["absent"]
            if p["n"] >= MIN_N_PER_HALF and a["n"] >= MIN_N_PER_HALF:
                g = p["collapse_rate"] - a["collapse_rate"]
                gaps[half] = g if direction == "risk" else -g
        out["gap_points"] = gaps
        out["direction"] = direction
        out["useful"] = len(gaps) == 2 and all(v >= RISK_GAP for v in gaps.values())
        out["verdict_text"] = ("útil" if out["useful"] else
                               "muestra insuficiente" if len(gaps) < 2 else "no separa")
        res["signals"][name] = out
    for half in ("all", "discovery", "confirmation"):
        hr = [r for r in rows if half == "all" or r["half"] == half]
        res["verdict"][half] = {v: _rate([r for r in hr if r["verdict"] == v]) for v in ("high", "warn", "ok", "unk")}
        res["score"][half] = {b: _rate([r for r in hr if score_bucket(r.get("score")) == b]) for b in ("0-39", "40-79", "80-100")}
    gaps = {}
    for half in ("discovery", "confirmation"):
        h, c = res["verdict"][half]["high"], res["verdict"][half]["ok"]
        if h["n"] >= MIN_N_PER_HALF and c["n"] >= MIN_N_PER_HALF:
            gaps[half] = h["collapse_rate"] - c["collapse_rate"]
    res["verdict_gap_points"] = gaps
    res["verdict_useful"] = len(gaps) == 2 and all(v >= VERDICT_GAP for v in gaps.values())
    return res


# ---------- I/O commands ----------
SCAN_JS = """async t=>{
  try{
    const r=await inspect(t);
    const v=verdictOf(r.checks);
    const cr=r.cr||{};
    return {ok:true,verdict:v[0],score:scoreOf(r.checks),
      checks:r.checks.map(c=>({s:c.s,c:c.c,t:c.t})),
      liq:r.facts&&r.facts["Liquidez"]||null,pair:r.facts&&r.facts._pair||null,
      explorer_errors:(cr.errors||[]).map(e=>String(e).split(":")[0]),explorer_ms:cr.ms||null};
  }catch(e){return {ok:false,error:String(e).slice(0,200)};}
}"""


def log_run(entry):
    with open("data/runs.jsonl", "a") as f:
        f.write(json.dumps(entry, sort_keys=True) + "\n")


def collect(now=None, smoke=False):
    from playwright.sync_api import sync_playwright
    import http.server
    import os
    import shutil
    import tempfile
    import threading
    now = int(now or time.time())
    target = "data/smoke_scans.jsonl" if smoke else SCANS
    if not smoke and (now < START or now > END):
        print("outside collection window"); return 0
    seen = {s["token"] for s in _read(SCANS)}
    pages, failed = [], 0
    for p in range(1, 11):
        try:
            pages.append(get_json(GT + "new_pools?page=%d" % p)); time.sleep(2.5)
        except Exception as e:
            failed += 1; print("new_pools page", p, "failed:", type(e).__name__)
    cands = candidates(pages, now, seen)
    chosen = pick(cands, 2 if smoke else PER_RUN)
    log_run(dict(at=now, smoke=smoke, pools=sum(len(pg.get("data") or []) for pg in pages), pages_failed=failed,
                 eligible=len(cands), chosen=len(chosen)))
    if not chosen:
        print("no eligible tokens"); return 0
    # Serve the frozen scanner without its auto-run on load.
    tmp = tempfile.mkdtemp()
    for f in ("sellsim.js", "creator.js"):
        shutil.copy(os.path.join("scanner", f), tmp)
    html = open("scanner/index.html").read()
    assert "\nrun();\n</script>" in html
    open(os.path.join(tmp, "index.html"), "w").write(html.replace("\nrun();\n</script>", "\n</script>"))
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=tmp, **k)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8799), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    n = 0
    with sync_playwright() as p, open(target, "a") as out:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.goto("http://127.0.0.1:8799/index.html")
        for i, c in enumerate(chosen):
            if i:
                time.sleep(20)          # be gentle with the public explorer
            t_scan = int(time.time())
            try:
                r = pg.evaluate(SCAN_JS, c["token"])
            except Exception as e:
                r = dict(ok=False, error=type(e).__name__)
            row = dict(c, scanned_at=t_scan, scanner_sha=SCANNER_SHA, **r)
            out.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n"); out.flush(); n += 1
            print(c["token"], r.get("verdict"), r.get("score"), r.get("explorer_errors"))
        b.close()
    srv.shutdown()
    return n


def collect_outcomes(now=None):
    now = int(now or time.time())
    done = {o["token"] for o in _read(OUTCOMES) if o.get("status") != "provider_unavailable"}
    todo = [s for s in _read(SCANS) if s.get("ok") and s["token"] not in done and now >= s["scanned_at"] + DAY + 900]
    n = 0
    with open(OUTCOMES, "a") as out:
        for s in todo:
            q = "aggregate=5&limit=300&currency=usd&token=%s&before_timestamp=%d&include_empty_intervals=false" % (
                s["token"], s["scanned_at"] + DAY + 600)
            try:
                rows = get_json(GT + "pools/" + s["pool"] + "/ohlcv/minute?" + q)["data"]["attributes"]["ohlcv_list"]
                o = outcome(s, rows)
            except Exception as e:
                o = dict(token=s["token"], status="provider_unavailable", error_type=type(e).__name__)
            o["measured_at"] = now
            out.write(json.dumps(o, sort_keys=True) + "\n"); out.flush(); n += 1
            time.sleep(2.5)            # GeckoTerminal public limit
    print("outcomes written:", n)
    return n


def _scanner_sha():
    h = hashlib.sha256()
    for f in ("index.html", "sellsim.js", "creator.js"):
        try:
            h.update(open("scanner/" + f, "rb").read())
        except FileNotFoundError:
            pass
    return h.hexdigest()[:16]


SCANNER_SHA = _scanner_sha()

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "collect":
        collect()
    elif cmd == "smoke":
        collect(smoke=True)
    elif cmd == "outcome":
        collect_outcomes()
    elif cmd == "report":
        print(json.dumps(evaluate(_read(SCANS), _read(OUTCOMES)), indent=1, ensure_ascii=False))
    else:
        print(__doc__)
