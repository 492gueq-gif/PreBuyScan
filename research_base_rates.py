"""BASE_RATES_V1: descriptive base rates for newly discovered Robinhood Chain tokens.

Protocol frozen in docs/research/BASE_RATES_V1.md BEFORE any price was fetched.
Universe: every token VIGIA Lite saw in new-pool feeds (research_data/lite_vistos_*.csv),
not a winners list. Prices: GeckoTerminal public 5-minute OHLCV (trade prices, not
executable fills). Paper research only: no orders, no keys, no strategy tuning.
"""
import csv
import datetime as dt
import hashlib
import json
import re
import statistics
import sys
import time
from urllib.parse import urlencode

PROTOCOL_VERSION = "BASE_RATES_V1"
LOCAL_UTC_OFFSET = dt.timedelta(hours=-6)  # Lite wrote America/Mexico_City (CST, UTC-6) timestamps
HORIZONS = {"1h": 3600, "6h": 21600, "24h": 86400}
COST_SCENARIOS = {"rt2": 0.02, "rt5": 0.05, "rt10": 0.10}  # assumed round-trip costs, not measured
ENTRY_WINDOW = 1800        # a trade candle must exist within 30 min after first sighting
SAMPLE_SIZE = 1200         # deterministic hash sample + every token Lite marked PASA
LIQ_BUCKETS = ((0, 1000, "<1k"), (1000, 5000, "1k-5k"), (5000, 25000, "5k-25k"), (25000, float("inf"), ">=25k"))
TOKEN = re.compile(r"0x[0-9a-fA-F]{40}")
POOL = re.compile(r"0x(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})")


def parse_local(text):
    naive = dt.datetime.strptime(text, "%Y-%m-%d %H:%M:%S")
    return int((naive - LOCAL_UTC_OFFSET).replace(tzinfo=dt.timezone.utc).timestamp())


def load_universe(paths):
    """Earliest sighting per token across Lite discovery logs."""
    first = {}
    for path in paths:
        with open(path, newline="") as f:
            for row in csv.DictReader(f):
                token, pool = row["token"].lower(), row["par"].lower()
                if not TOKEN.fullmatch(token) or not POOL.fullmatch(pool):
                    continue
                seen = parse_local(row["ts"])
                if token not in first or seen < first[token]["seen"]:
                    try:
                        liq = float(row["liq_usd"])
                    except ValueError:
                        liq = None
                    first[token] = dict(token=token, pool=pool, seen=seen, dex=row["dex"],
                                        liq_usd=liq, verdict=row["veredicto"],
                                        lite_pass=row["veredicto"].startswith("PASA"),
                                        sells_h6=row.get("sells_h6"))
    return [first[t] for t in sorted(first)]


def select_sample(universe, cutoff, size=SAMPLE_SIZE):
    eligible = [u for u in universe if u["seen"] + HORIZONS["24h"] + 600 <= cutoff]
    ranked = sorted(eligible, key=lambda u: hashlib.sha256(u["token"].encode()).hexdigest())
    chosen = {u["token"] for u in ranked[:size]} | {u["token"] for u in eligible if u["lite_pass"]}
    seen = sorted(u["seen"] for u in eligible)
    split = seen[len(seen)//2] if seen else 0
    out = []
    for u in eligible:
        if u["token"] in chosen:
            out.append(dict(u, half="discovery" if u["seen"] < split else "confirmation"))
    return out, dict(universe=len(universe), eligible=len(eligible), sampled=len(out), split_at=split)


def liq_bucket(liq):
    if liq is None:
        return "unknown"
    return next(label for lo, hi, label in LIQ_BUCKETS if lo <= liq < hi)


def metrics(item, candles):
    """candles: [[start_ts, open, high, low, close, volume], ...] any order. Pure."""
    rows = sorted(c for c in candles if all(isinstance(x, (int, float)) for x in c[:5]) and c[1] > 0 and c[4] > 0)
    base = dict(token=item["token"], half=item["half"], lite_pass=item["lite_pass"],
                liq_bucket=liq_bucket(item["liq_usd"]), dex=item["dex"].split("/")[-1] or item["dex"])
    after = [c for c in rows if c[0] >= item["seen"]]
    if not after or after[0][0] - item["seen"] > ENTRY_WINDOW:
        return dict(base, status="no_trade_after_seen")
    entry_t, entry = after[0][0], after[0][1]
    out = dict(base, status="entered", entry_delay_s=entry_t - item["seen"])
    for name, horizon in HORIZONS.items():
        window = [c for c in after if c[0] + 300 <= entry_t + horizon]
        last = window[-1]
        out["ret_" + name] = last[4] / entry - 1
        out["last_trade_age_" + name] = entry_t + horizon - (last[0] + 300)
    day = [c for c in after if c[0] + 300 <= entry_t + HORIZONS["24h"]]
    out["max_up_24h"] = max(c[2] for c in day) / entry - 1
    out["max_down_24h"] = min(c[3] for c in day) / entry - 1
    return out


def _q(values, p):
    s = sorted(values)
    return s[min(len(s)-1, int(p * (len(s)-1) + 0.5))]


def summarize(rows):
    entered = [r for r in rows if r["status"] == "entered"]
    out = dict(n=len(rows), entered=len(entered), no_trade_after_seen=sum(r["status"] == "no_trade_after_seen" for r in rows),
               unavailable=sum(r["status"] == "provider_unavailable" for r in rows))
    if not entered:
        return out
    for name in HORIZONS:
        r = [x["ret_" + name] for x in entered]
        h = dict(median=statistics.median(r), p25=_q(r, .25), p75=_q(r, .75),
                 gross_positive=sum(v > 0 for v in r)/len(r),
                 down_50=sum(v <= -.5 for v in r)/len(r), down_90=sum(v <= -.9 for v in r)/len(r))
        for label, cost in COST_SCENARIOS.items():
            net = [(1+v)*(1-cost)-1 for v in r]
            h["net_positive_" + label] = sum(v > 0 for v in net)/len(net)
            h["net_mean_" + label] = statistics.fmean(net)
        out[name] = h
    out["reached_2x_24h"] = sum(x["max_up_24h"] >= 1 for x in entered)/len(entered)
    out["fell_90_24h"] = sum(x["max_down_24h"] <= -.9 for x in entered)/len(entered)
    return out


def report(rows):
    groups = {"all": rows}
    for half in ("discovery", "confirmation"):
        groups[half] = [r for r in rows if r["half"] == half]
        groups[half + "/lite_pass"] = [r for r in rows if r["half"] == half and r["lite_pass"]]
        groups[half + "/lite_reject"] = [r for r in rows if r["half"] == half and not r["lite_pass"]]
    for _, _, label in LIQ_BUCKETS + ((None, None, "unknown"),):
        groups["liq/" + label] = [r for r in rows if r["liq_bucket"] == label]
    for dex in sorted({r["dex"] for r in rows}):
        groups["dex/" + dex] = [r for r in rows if r["dex"] == dex]
    summary = {k: summarize(v) for k, v in groups.items() if v}
    # Pre-registered comparison H1 (see protocol): consistent only if same sign in both halves.
    h1 = {}
    for half in ("discovery", "confirmation"):
        a, b = summary.get(half + "/lite_pass", {}), summary.get(half + "/lite_reject", {})
        if "24h" in a and "24h" in b:
            h1[half] = a["24h"]["net_mean_rt5"] - b["24h"]["net_mean_rt5"]
    h1["consistent_positive"] = len(h1) == 2 and all(v > 0 for v in h1.values())
    return dict(summary=summary, h1_lite_filter_net_mean_rt5_24h_difference=h1)


def fetch_candles(get_json, item):
    query = urlencode({"aggregate": 5, "limit": 300, "currency": "usd", "token": item["token"],
                       "before_timestamp": item["seen"] + HORIZONS["24h"] + 600,
                       "include_empty_intervals": "false"})
    url = "https://api.geckoterminal.com/api/v2/networks/robinhood/pools/" + item["pool"] + "/ohlcv/minute?" + query
    rows = get_json(url)["data"]["attributes"]["ohlcv_list"]
    if not isinstance(rows, list):
        raise ValueError("invalid candle payload")
    return rows


FIXED_CUTOFF = 1792633800  # 2026-10-22T01:50:00Z, start of the first complete run; freezes the sample


def run_shard(universe_paths, out_dir, shard, shards, cutoff=FIXED_CUTOFF, get_json=None):
    """Process one deterministic slice of the frozen sample, appending each token as it finishes.

    Execution change only (parallel, crash-safe); sample, definitions and outputs are unchanged.
    """
    if get_json is None:
        from fetch_history import get_json
    if type(shard) is not int or type(shards) is not int or not 0 <= shard < shards:
        raise ValueError("invalid shard")
    sample, _ = select_sample(load_universe(universe_paths), cutoff)
    mine = [u for i, u in enumerate(sorted(sample, key=lambda u: u["token"])) if i % shards == shard]
    path = "%s/tokens_shard_%d.jsonl" % (out_dir, shard)
    done = set()
    try:
        with open(path) as f:
            done = {json.loads(line)["token"] for line in f if line.strip()}
    except FileNotFoundError:
        pass
    with open(path, "a") as f:
        for item in mine:
            if item["token"] in done:
                continue
            try:
                row = metrics(item, fetch_candles(get_json, item))
            except Exception as error:
                row = dict(token=item["token"], half=item["half"], lite_pass=item["lite_pass"],
                           liq_bucket=liq_bucket(item["liq_usd"]), dex=item["dex"].split("/")[-1] or item["dex"],
                           status="provider_unavailable", error_type=type(error).__name__)
            f.write(json.dumps(row, sort_keys=True) + "\n")
            f.flush()
    return len(mine)


def merge(universe_paths, shard_paths, out_dir, cutoff=FIXED_CUTOFF):
    sample, counts = select_sample(load_universe(universe_paths), cutoff)
    expected = {u["token"] for u in sample}
    rows = {}
    for path in shard_paths:
        with open(path) as f:
            for line in f:
                if line.strip():
                    row = json.loads(line)
                    rows[row["token"]] = row
    missing = sorted(expected - set(rows))
    rows = [rows[t] for t in sorted(rows) if t in expected]
    for token in missing:  # never silently shrink the sample
        rows.append(dict(token=token, half=None, lite_pass=None, liq_bucket=None, dex=None, status="not_processed"))
    inputs = {p: hashlib.sha256(open(p, "rb").read()).hexdigest() for p in universe_paths}
    result = dict(protocol=PROTOCOL_VERSION, generated_at=int(time.time()), cutoff=cutoff,
                  counts=dict(counts, processed=len(rows) - len(missing), not_processed=len(missing)),
                  inputs_sha256=inputs, source="GeckoTerminal public OHLCV 5m (trade prices, not fills)",
                  cost_scenarios_assumed=COST_SCENARIOS, **report([r for r in rows if r["status"] != "not_processed"]))
    with open(out_dir + "/base_rates_v1_summary.json", "w") as f:
        json.dump(result, f, indent=1, sort_keys=True)
    with open(out_dir + "/base_rates_v1_tokens.json", "w") as f:
        json.dump(rows, f, sort_keys=True)
    return result


def run(universe_paths, out_dir, cutoff=None, get_json=None):
    if get_json is None:
        from fetch_history import get_json
    cutoff = int(time.time()) if cutoff is None else cutoff
    universe = load_universe(universe_paths)
    sample, counts = select_sample(universe, cutoff)
    rows = []
    for item in sample:
        try:
            rows.append(metrics(item, fetch_candles(get_json, item)))
        except Exception as error:  # unknown stays unknown: counted, never dropped or filled
            rows.append(dict(token=item["token"], half=item["half"], lite_pass=item["lite_pass"],
                             liq_bucket=liq_bucket(item["liq_usd"]), dex=item["dex"].split("/")[-1] or item["dex"],
                             status="provider_unavailable", error_type=type(error).__name__))
    inputs = {p: hashlib.sha256(open(p, "rb").read()).hexdigest() for p in universe_paths}
    result = dict(protocol=PROTOCOL_VERSION, generated_at=int(time.time()), cutoff=cutoff, counts=counts,
                  inputs_sha256=inputs, source="GeckoTerminal public OHLCV 5m (trade prices, not fills)",
                  cost_scenarios_assumed=COST_SCENARIOS, **report(rows))
    with open(out_dir + "/base_rates_v1_summary.json", "w") as f:
        json.dump(result, f, indent=1, sort_keys=True)
    with open(out_dir + "/base_rates_v1_tokens.json", "w") as f:
        json.dump(rows, f, sort_keys=True)
    return result


UNIVERSE = ["research_data/lite_vistos_original_20261017_20261019.csv",
            "research_data/lite_vistos_runtime_20261019_20261021.csv"]

if __name__ == "__main__":
    if sys.argv[1] == "shard":   # research_base_rates.py shard OUT K N
        print(run_shard(UNIVERSE, sys.argv[2], int(sys.argv[3]), int(sys.argv[4])))
    elif sys.argv[1] == "merge":  # research_base_rates.py merge OUT shard files...
        out = merge(UNIVERSE, sys.argv[3:], sys.argv[2])
        print(json.dumps({k: out[k] for k in ("counts", "h1_lite_filter_net_mean_rt5_24h_difference")}))
    else:
        out = run(sys.argv[2:], sys.argv[1])
        print(json.dumps({k: out[k] for k in ("counts", "h1_lite_filter_net_mean_rt5_24h_difference")}))
