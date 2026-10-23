"""GEMS_V1: can PreBuyScan's scan-time data tell apart the rare new tokens that become "gems"?

Prospective study. Protocol frozen in docs/GEMS_V1.md before any study data was collected.
Every hour: scan a deterministic sample of Robinhood Chain tokens aged 60-180 min with the frozen
scanner copy (scanner/) and record GeckoTerminal pool activity; 7 days later, measure the outcome
from public GeckoTerminal candles and the pool's liquidity. Read-only: nothing is signed or sent,
no keys, no wallets, no money. Descriptive, not a buy signal.

Commands:
  python gems_v1.py window    -> exit 0 inside the collection/measurement period, 1 outside
  python gems_v1.py collect   -> appends to data/scans.jsonl (only inside the collection window)
  python gems_v1.py smoke     -> scans 2 tokens into data/smoke_scans.jsonl (never study data)
  python gems_v1.py outcome   -> appends to data/outcomes.jsonl
  python gems_v1.py report    -> prints the frozen evaluation as JSON
"""
import hashlib
import json
import re
import sys
import time
import urllib.request
from datetime import datetime

GT = "https://api.geckoterminal.com/api/v2/networks/robinhood/"
WETH_ID = "robinhood_0x0bd7d308f8e1639fab988df18a8011f41eacad73"
SCANS, OUTCOMES, RUNS, INDEX = "data/scans.jsonl", "data/outcomes.jsonl", "data/runs.jsonl", "data/pool_index.jsonl"

# ---- frozen parameters (see docs/GEMS_V1.md) ----
START = 1793376000            # 2026-10-30T16:00:00Z first eligible scan
END = 1794585600              # 2026-11-13T16:00:00Z last eligible scan (14 days)
# Two cohorts: "h1" = pools aged 1-3 h, "d1" = pools that already lived a day (24-27 h).
COHORTS = {"h1": dict(min_age=60 * 60, max_age=180 * 60, per_run=10),
           "d1": dict(min_age=24 * 3600, max_age=27 * 3600, per_run=5)}
MIN_AGE, MAX_AGE = COHORTS["h1"]["min_age"], COHORTS["h1"]["max_age"]
PER_RUN = COHORTS["h1"]["per_run"]
INDEX_FROM = START - 26 * 3600   # pool index starts early so the d1 cohort has 24 h old pools at START
HORIZON = 7 * 86400           # outcome horizon
MEASURE_DELAY = 900           # measured 15 min after the horizon
ENTRY_WINDOW = 3600           # no candle within 60 min after the scan -> no_trade_after_seen
CANDLE = 900                  # 15-minute candles (1000 candles cover 10.4 days)
GEM_RET, DOUBLE_RET, SPIKE_UP = 2.0, 1.0, 4.0   # +200 % (3x), +100 % (2x), high +400 % (5x)
MIN_LIQ_7D = 10000.0          # USD of pool liquidity still there at day 7
GIVE_UP = 48 * 3600           # provider failures after this long -> outcome "unknown"
# usefulness rule
MIN_N, MIN_GEMS, LIFT, MIN_GAP = 30, 3, 2.0, 0.03
SMART_MIN_N = 15
SMART_COMMON = 0.20           # addresses seen in >20 % of discovery tokens are infrastructure, not wallets

LP_UNKNOWN = r"^(Control de la liquidez no revisado.*|No sabemos quién tiene la liquidez|Liquidez en un contrato|Creador no identificado)$"
CREATOR_UNKNOWN = r"^(Creador no identificado|Historial del creador no disponible.*|Historial del creador incompleto|Lanzado desde una plataforma)$"


def _title_state(checks, present_re, absent_re, unknown_re):
    titles = [c["t"] for c in checks]
    if any(re.search(present_re, t) for t in titles):
        return "present"
    if absent_re and any(re.search(absent_re, t) for t in titles):
        return "absent"
    if unknown_re is None or any(re.search(unknown_re, t) for t in titles):
        return "unknown"
    return "absent" if absent_re is None else "unknown"


def _num(row, key):
    g = row.get("gt") or {}
    v = g.get(key)
    return None if v is None else float(v)


def sig_sin_riesgo_alto(r):
    v = r.get("verdict")
    return "unknown" if v in (None, "unk") else "absent" if v == "high" else "present"


def sig_safety_80(r):
    s = r.get("score")
    return "unknown" if s is None else "present" if s >= 80 else "absent"


def sig_liquidez_bloqueada(r):
    return _title_state(r["checks"], r"^(Liquidez en un contrato de bloqueo|Liquidez quemada)$", None, LP_UNKNOWN)


def sig_creador_limpio(r):
    return _title_state(r["checks"], r"^(No lanzó otros tokens|Los otros tokens del creador siguen vivos)$",
                        r"^El creador (lanzó \d+ tokens y \d+ murieron|tiene \d+ tokens? muertos?)$", CREATOR_UNKNOWN)


def sig_holders_repartidos(r):
    t = [c["t"] for c in r["checks"]]
    if any(re.search(r"^(Muy concentrado|Concentrado): ", x) for x in t):
        return "absent"
    if any(re.search(r"^Holders no revisados", x) for x in t):
        return "unknown"
    return "present"


def sig_snipers_salieron(r):
    return _title_state(r["checks"], r"^(Los snipers ya casi no tienen tokens|Sin snipers detectados)$",
                        r"^Los snipers (aún )?tienen ", r".*")


def sig_compradores_30(r):
    b = _num(r, "buyers_h1")
    return "unknown" if b is None else "present" if b >= 30 else "absent"


def sig_presion_compradora(r):
    b, s = _num(r, "buyers_h1"), _num(r, "sellers_h1")
    if b is None or s is None:
        return "unknown"
    return "present" if b > 0 and b >= 1.5 * max(1.0, s) else "absent"


def sig_compras_organicas(r):
    b, n = _num(r, "buyers_h1"), _num(r, "buys_h1")
    if b is None or n is None:
        return "unknown"
    return "present" if b > 0 and n / b <= 3 else "absent"


def sig_liquidez_15k(r):
    v = _num(r, "reserve_usd")
    return "unknown" if v is None else "present" if v >= 15000 else "absent"


def sig_alpha_60(r):
    a = r.get("alpha")
    return "unknown" if a is None else "present" if a >= 60 else "absent"


def sig_equipo_invierte(r):
    d = r.get("dex_info")
    if d is None:
        return "unknown"
    return "present" if (d.get("sites", 0) >= 1 and d.get("socials", 0) >= 1) or d.get("header") else "absent"


def sig_aguanta_primera_ola(r):
    e = r.get("early") or {}
    if not e.get("max_high") or not e.get("last_close"):
        return "unknown"
    return "present" if e["last_close"] >= 0.5 * e["max_high"] else "absent"


def sig_volumen_sostenido(r):
    e = r.get("early") or {}
    if e.get("vol_first30") is None or e.get("vol_last30") is None:
        return "unknown"
    return "present" if e["vol_last30"] > 0 and e["vol_last30"] >= e["vol_first30"] else "absent"


def sig_holders_100(r):
    n = r.get("holders_count")
    return "unknown" if n is None else "present" if n >= 100 else "absent"


def sig_varios_pools(r):
    n = r.get("n_pairs")
    return "unknown" if n is None else "present" if n >= 2 else "absent"


def sig_filtro_combinado(r):
    parts = [sig_sin_riesgo_alto(r), sig_compradores_30(r), sig_presion_compradora(r), sig_compras_organicas(r)]
    if all(p == "present" for p in parts):
        return "present"
    return "absent" if "absent" in parts else "unknown"


SIGNALS = {
    "sin_riesgo_alto": sig_sin_riesgo_alto,
    "safety_80": sig_safety_80,
    "liquidez_bloqueada_o_quemada": sig_liquidez_bloqueada,
    "creador_historial_limpio": sig_creador_limpio,
    "holders_repartidos": sig_holders_repartidos,
    "snipers_salieron": sig_snipers_salieron,
    "compradores_unicos_30": sig_compradores_30,
    "presion_compradora": sig_presion_compradora,
    "compras_organicas": sig_compras_organicas,
    "liquidez_15k": sig_liquidez_15k,
    "alpha_signal_60": sig_alpha_60,
    "filtro_combinado": sig_filtro_combinado,
    "equipo_invierte": sig_equipo_invierte,
    "aguanta_primera_ola": sig_aguanta_primera_ola,
    "volumen_sostenido": sig_volumen_sostenido,
    "holders_100": sig_holders_100,
    "varios_pools": sig_varios_pools,
}


def early_metrics(candles, pool_created, scanned_at):
    """5-min candles from pool creation to the scan: highest high, last close, volume of the first and
    last 30 minutes. Only candles before the scan are used (no look-ahead)."""
    rows = sorted(c for c in candles if all(isinstance(x, (int, float)) for x in c[:6]) and pool_created - 300 <= c[0] < scanned_at)
    if not rows:
        return dict(max_high=None, last_close=None, vol_first30=None, vol_last30=None, candles=0)
    return dict(max_high=max(c[2] for c in rows), last_close=rows[-1][4], candles=len(rows),
                vol_first30=sum(c[5] for c in rows if c[0] < pool_created + 1800),
                vol_last30=sum(c[5] for c in rows if c[0] >= scanned_at - 1800))


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
def parse_pages(pages):
    """new_pools pages -> [{token, pool, pool_created}] (the non-WETH side of each pool)."""
    out = []
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
            if re.fullmatch(r"0x[0-9a-f]{40}", token):
                out.append(dict(token=token, pool=(a.get("address") or "").lower(), pool_created=created))
    return out


def candidates(entries, now, seen, min_age=MIN_AGE, max_age=MAX_AGE):
    """Pools aged min_age..max_age, one entry per token (its first pool seen), excluding tokens already scanned.
    entries come from the hourly pool index: new_pools only reaches ~1 h back, so pools are recorded when
    they appear and scanned when they are 1-3 h old."""
    out = {}
    for e in sorted(entries, key=lambda e: e["pool_created"]):
        t = e["token"]
        if t in seen or t in out:
            continue
        if min_age <= now - e["pool_created"] <= max_age:
            out[t] = dict(token=t, pool=e["pool"], pool_created=e["pool_created"])
    return list(out.values())


def pick(cands, k=PER_RUN):
    """Deterministic and blind to market data: lowest SHA-256 of the token address."""
    return sorted(cands, key=lambda c: hashlib.sha256(c["token"].encode()).hexdigest())[:k]


def gt_metrics(pool_json):
    """Scan-time activity of the sampled pool, as GeckoTerminal reports it."""
    a = ((pool_json or {}).get("data") or {}).get("attributes") or {}
    tx, v = a.get("transactions") or {}, a.get("volume_usd") or {}
    h1, m15 = tx.get("h1") or {}, tx.get("m15") or {}
    f = lambda x: None if x is None else float(x)
    return dict(reserve_usd=f(a.get("reserve_in_usd")), fdv_usd=f(a.get("fdv_usd")), mcap_usd=f(a.get("market_cap_usd")),
                vol_h1=f(v.get("h1")), vol_m15=f(v.get("m15")), buys_h1=f(h1.get("buys")), sells_h1=f(h1.get("sells")),
                buyers_h1=f(h1.get("buyers")), sellers_h1=f(h1.get("sellers")), buyers_m15=f(m15.get("buyers")))


# ---------- outcome (pure) ----------
def outcome(scan, candles, liq_7d):
    rows = sorted(c for c in candles if all(isinstance(x, (int, float)) for x in c[:5]) and c[1] > 0 and c[4] > 0)
    t0 = scan["scanned_at"]
    after = [c for c in rows if c[0] >= t0]
    base = dict(token=scan["token"], cohort=scan.get("cohort", "h1"), liq_7d=liq_7d)
    dead = dict(base, status="no_trade_after_seen", gem=False, double=False, spike5=False)
    if not after or after[0][0] - t0 > ENTRY_WINDOW:
        return dead
    entry_t, entry = after[0][0], after[0][1]
    win = [c for c in after if c[0] + CANDLE <= entry_t + HORIZON]
    if not win:
        return dead
    ret = win[-1][4] / entry - 1
    up = max(c[2] for c in win) / entry - 1
    liquid = liq_7d is not None and liq_7d >= MIN_LIQ_7D
    return dict(base, status="entered", entry=entry, ret_7d=ret, max_up_7d=up,
                gem=ret >= GEM_RET and liquid, double=ret >= DOUBLE_RET and liquid, spike5=up >= SPIKE_UP)


# ---------- evaluation (pure) ----------
def _rate(rows, key="gem"):
    n = len(rows)
    k = sum(1 for r in rows if r[key])
    return dict(n=n, gems=k, rate=(k / n) if n else None)


def useful(p, a, min_n=MIN_N):
    """Gem rate with the signal at least LIFT x the rate without it and MIN_GAP higher, enough tokens."""
    if p["n"] < min_n or a["n"] < MIN_N or p["gems"] < MIN_GEMS:
        return None                      # insufficient sample
    return p["rate"] >= LIFT * a["rate"] and p["rate"] - a["rate"] >= MIN_GAP


def wallets_of(row):
    return set(w.lower() for w in (row.get("early_wallets") or []) + (row.get("top_holders") or []))


def smart_set(discovery_rows):
    """Early buyers / top holders of discovery-half doubles, minus addresses common to many tokens."""
    if not discovery_rows:
        return set()
    count = {}
    for r in discovery_rows:
        for w in wallets_of(r):
            count[w] = count.get(w, 0) + 1
    common = {w for w, c in count.items() if c > SMART_COMMON * len(discovery_rows)}
    smart = set()
    for r in discovery_rows:
        if r["double"]:
            smart |= wallets_of(r)
    return smart - common


def key(x):
    return (x["token"], x.get("cohort", "h1"))


def evaluate(scans, outcomes):
    """Both cohorts, evaluated separately with the same frozen rules."""
    return dict(protocol="GEMS_V1", cohorts={c: evaluate_cohort([s for s in scans if s.get("cohort", "h1") == c],
                                                                [o for o in outcomes if o.get("cohort", "h1") == c]) for c in COHORTS})


def evaluate_cohort(scans, outcomes):
    by_key = {key(o): o for o in outcomes if o.get("status") in ("entered", "no_trade_after_seen")}
    ok_scans = [s for s in scans if s.get("ok")]
    rows = sorted((dict(s, **by_key[key(s)]) for s in ok_scans if key(s) in by_key), key=lambda r: r["scanned_at"])
    res = dict(n=len(rows), scan_failures=len(scans) - len(ok_scans),
               excluded_no_outcome=len(ok_scans) - len(rows))
    if not rows:
        return res
    cut = rows[len(rows) // 2]["scanned_at"]
    for r in rows:
        r["half"] = "discovery" if r["scanned_at"] < cut else "confirmation"
    res["half_cut"] = cut
    res["base_rate"] = {h: {k: _rate([r for r in rows if h == "all" or r["half"] == h], k) for k in ("gem", "double", "spike5")}
                        for h in ("all", "discovery", "confirmation")}
    res["signals"] = {}
    for name, fn in SIGNALS.items():
        out, ok = {}, []
        for h in ("all", "discovery", "confirmation"):
            hr = [r for r in rows if h == "all" or r["half"] == h]
            st = {k: [r for r in hr if fn(r) == k] for k in ("present", "absent", "unknown")}
            out[h] = {k: _rate(v) for k, v in st.items()}
            if h != "all":
                ok.append(useful(out[h]["present"], out[h]["absent"]))
        out["useful"] = all(x is True for x in ok)
        out["verdict_text"] = "útil" if out["useful"] else "muestra insuficiente" if any(x is None for x in ok) else "no separa"
        res["signals"][name] = out
    # smart money: wallets learned in the discovery half, tested only in the confirmation half
    disc = [r for r in rows if r["half"] == "discovery"]
    conf = [r for r in rows if r["half"] == "confirmation"]
    smart = smart_set(disc)
    pres = [r for r in conf if wallets_of(r) & smart]
    absn = [r for r in conf if wallets_of(r) and not (wallets_of(r) & smart)]
    p, a = _rate(pres), _rate(absn)
    u = useful(p, a, SMART_MIN_N)
    res["dinero_inteligente"] = dict(smart_wallets=len(smart), confirmation=dict(present=p, absent=a,
                                     unknown=_rate([r for r in conf if not wallets_of(r)])),
                                     useful=u is True, verdict_text="útil" if u else "muestra insuficiente" if u is None else "no separa")
    # what the safety scanner says about the gems (reverse view)
    gems = [r for r in rows if r["gem"]]
    res["gems_by_verdict"] = {v: sum(1 for r in gems if r.get("verdict") == v) for v in ("high", "warn", "ok", "unk")}
    res["gems"] = [dict(token=r["token"], scanned_at=r["scanned_at"], ret_7d=round(r["ret_7d"], 3), liq_7d=r.get("liq_7d"),
                        verdict=r.get("verdict"), score=r.get("score"),
                        signals={k: fn(r) for k, fn in SIGNALS.items()}) for r in gems]
    return res


# ---------- I/O ----------
SCAN_JS = """async t=>{
  try{
    const r=await inspect(t);
    const v=verdictOf(r.checks);
    const cr=r.cr||{};
    const sn=(cr.snipers&&cr.snipers.wallets)||[];
    const ho=(cr.holders&&cr.holders.top)||[];
    return {ok:true,verdict:v[0],score:PBScore.isEvaluable(r.checks)?scoreOf(r.checks):null,
      checks:r.checks.map(c=>({s:c.s,c:c.c,t:c.t,err:!!c.err})),
      pair:r.facts&&r.facts._pair||null,block:r.block||null,
      early_wallets:sn.map(w=>w.addr).filter(Boolean).slice(0,15),
      top_holders:ho.filter(h=>!h.contract).map(h=>h.addr).filter(Boolean).slice(0,15),
      holders_count:(cr.holders&&cr.holders.count)||null,n_pairs:(r.pairs||[]).length||null,
      dex_info:r.pair?{sites:((r.pair.info||{}).websites||[]).length,socials:((r.pair.info||{}).socials||[]).length,header:!!(r.pair.info||{}).header}:null,
      explorer_errors:(cr.errors||[]).map(e=>String(e).split(":")[0]),explorer_ms:cr.ms||null};
  }catch(e){return {ok:false,error:String(e).slice(0,200)};}
}"""
ALPHA_JS = """p=>{try{const x=PBAlpha.evaluate(p,{},Date.now(),null);return x?x.alpha:null;}catch(e){return null;}}"""


def _append(path, entry):
    with open(path, "a") as f:
        f.write(json.dumps(entry, ensure_ascii=False, sort_keys=True) + "\n")


def in_period(now):
    return INDEX_FROM - 3600 <= now <= END + HORIZON + GIVE_UP + 86400


def collect(now=None, smoke=False):
    from playwright.sync_api import sync_playwright
    import http.server
    import threading
    now = int(now or time.time())
    target = "data/smoke_scans.jsonl" if smoke else SCANS
    if not smoke and not in_period(now):
        print("outside study period"); return 0
    pages, failed = [], 0
    for p in range(1, 11):
        try:
            pages.append(get_json(GT + "new_pools?page=%d" % p)); time.sleep(2.5)
        except Exception as e:
            failed += 1; print("new_pools page", p, "failed:", type(e).__name__)
    fresh = parse_pages(pages)
    if not smoke:                                   # the pool index is built from 1 h before the window
        known = {(e["token"], e["pool"]) for e in _read(INDEX)}
        for e in fresh:
            if (e["token"], e["pool"]) not in known:
                _append(INDEX, dict(e, seen_at=now)); known.add((e["token"], e["pool"]))
    if not smoke and (now < START or now > END):
        print("outside scan window (pool index updated)"); return 0
    entries = fresh if smoke else _read(INDEX)
    done = _read(SCANS)
    chosen, info = [], {}
    for cohort, cfg in COHORTS.items():
        if smoke and cohort != "h1":
            continue
        seen = {s["token"] for s in done if s.get("cohort", "h1") == cohort}
        cands = candidates(entries, now, seen, *((15 * 60, cfg["max_age"]) if smoke else (cfg["min_age"], cfg["max_age"])))
        pk = pick(cands, 2 if smoke else cfg["per_run"])
        chosen += [dict(c, cohort=cohort) for c in pk]
        info[cohort] = dict(eligible=len(cands), chosen=len(pk))
    _append("data/smoke_runs.jsonl" if smoke else RUNS, dict(at=now, pools=len(fresh), pages_failed=failed,
                                                             index=0 if smoke else len(entries), cohorts=info))
    if not chosen:
        print("no eligible tokens"); return 0
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory="scanner", **k)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8798), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    n = 0
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(service_workers="block")
        pg = ctx.new_page()
        pg.goto("http://127.0.0.1:8798/index.html")
        pg.wait_for_function("typeof inspect==='function' && window.PBCreator && window.PBAlpha")
        for i, c in enumerate(chosen):
            if i:
                time.sleep(20)                    # be gentle with the public explorer
            t_scan = int(time.time())
            try:
                pool = get_json(GT + "pools/" + c["pool"])
                gt, alpha = gt_metrics(pool), pg.evaluate(ALPHA_JS, pool["data"])
            except Exception as e:
                gt, alpha = None, None
            try:
                time.sleep(2.5)
                q = "aggregate=5&limit=1000&currency=usd&token=%s&before_timestamp=%d&include_empty_intervals=false" % (c["token"], t_scan)
                early = early_metrics(get_json(GT + "pools/" + c["pool"] + "/ohlcv/minute?" + q)["data"]["attributes"]["ohlcv_list"],
                                      c["pool_created"], t_scan)
            except Exception as e:
                early = None
            try:
                r = pg.evaluate(SCAN_JS, c["token"])
            except Exception as e:
                r = dict(ok=False, error=type(e).__name__)
            row = dict(c, scanned_at=t_scan, scanner_sha=SCANNER_SHA, gt=gt, alpha=alpha, early=early, **r)
            _append(target, row); n += 1
            print(c["cohort"], c["token"], r.get("verdict"), r.get("score"), alpha, (gt or {}).get("buyers_h1"), r.get("explorer_errors"))
        b.close()
    srv.shutdown()
    return n


def collect_outcomes(now=None):
    now = int(now or time.time())
    final = {key(o) for o in _read(OUTCOMES) if o.get("status") != "provider_unavailable"}
    todo = [s for s in _read(SCANS) if s.get("ok") and key(s) not in final and now >= s["scanned_at"] + HORIZON + MEASURE_DELAY]
    n = 0
    for s in todo:
        try:
            q = "aggregate=15&limit=1000&currency=usd&token=%s&before_timestamp=%d&include_empty_intervals=false" % (
                s["token"], s["scanned_at"] + HORIZON + MEASURE_DELAY)
            rows = get_json(GT + "pools/" + s["pool"] + "/ohlcv/minute?" + q)["data"]["attributes"]["ohlcv_list"]
            time.sleep(2.5)
            liq = gt_metrics(get_json(GT + "pools/" + s["pool"]))["reserve_usd"]
            o = outcome(s, rows, liq)
        except Exception as e:
            late = now > s["scanned_at"] + HORIZON + MEASURE_DELAY + GIVE_UP
            o = dict(token=s["token"], cohort=s.get("cohort", "h1"), status="unknown" if late else "provider_unavailable", error_type=type(e).__name__)
        o["measured_at"] = now
        _append(OUTCOMES, o); n += 1
        time.sleep(2.5)                       # GeckoTerminal public limit
    print("outcomes written:", n)
    return n


def _scanner_sha():
    h = hashlib.sha256()
    for f in ("index.html", "net.js", "scoring.js", "alpha.js", "sellsim.js", "creator.js"):
        try:
            h.update(open("scanner/" + f, "rb").read())
        except FileNotFoundError:
            pass
    return h.hexdigest()[:16]


SCANNER_SHA = _scanner_sha()

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "window":
        sys.exit(0 if in_period(int(time.time())) else 1)
    elif cmd == "collect":
        collect()
    elif cmd == "smoke":
        collect(smoke=True)
        # Outcome path against real data: a known pool "scanned" 8 days ago (never study data).
        pool, tok = "0x6693cf7e87a7039e36fa5f3c0d7e06818d259468", "0x39dbed3a2bd333467115de45665cc57f813c4571"
        s0 = dict(token=tok, pool=pool, scanned_at=int(time.time()) - 8 * 86400)
        q = "aggregate=15&limit=1000&currency=usd&token=%s&before_timestamp=%d&include_empty_intervals=false" % (tok, s0["scanned_at"] + HORIZON + MEASURE_DELAY)
        rows = get_json(GT + "pools/" + pool + "/ohlcv/minute?" + q)["data"]["attributes"]["ohlcv_list"]
        o = outcome(s0, rows, gt_metrics(get_json(GT + "pools/" + pool))["reserve_usd"])
        _append("data/smoke_outcomes.jsonl", dict(o, candles=len(rows), measured_at=int(time.time())))
        print("smoke outcome:", o)
    elif cmd == "outcome":
        collect_outcomes()
    elif cmd == "report":
        print(json.dumps(evaluate(_read(SCANS), _read(OUTCOMES)), indent=1, ensure_ascii=False))
    else:
        print(__doc__)
