"""PRECISION_V1: how well PreBuyScan's market signals, seen at discovery, predict a collapse.

Protocol frozen in docs/research/PRECISION_V1.md before BASE_RATES_V1 results existed.
Inputs: Lite discovery rows (features at first sighting) + BASE_RATES_V1 per-token outcomes.
Descriptive paper research only.
"""
import json
import sys
from research_base_rates import load_universe, UNIVERSE

HIGH, WARN, CLEAR = "riesgo_alto", "precaucion", "sin_alertas"


def verdict(item):
    """PreBuyScan market rules applied to what was known at first sighting (6 h txns, as Lite logged)."""
    liq = item.get("liq_usd")
    try:
        buys = int(float(item.get("buys_h6") or 0)); sells = int(float(item.get("sells_h6") or 0))
    except ValueError:
        buys = sells = None
    age = item.get("edad_h")
    reasons = []
    if liq is None or buys is None:
        return "sin_datos", ["datos_incompletos"]
    if liq < 5000:
        reasons.append("liquidez<5k")
    if buys >= 20 and sells == 0:
        reasons.append("cero_ventas")
    if reasons:
        return HIGH, reasons
    if liq < 25000:
        reasons.append("liquidez<25k")
    if buys > 0 and sells / buys < 0.15:
        reasons.append("pocas_ventas")
    if age is not None and age < 1:
        reasons.append("menos_de_1h")
    return (WARN if reasons else CLEAR), reasons


def collapsed(row):
    if row["status"] == "no_trade_after_seen":
        return True
    return row.get("max_down_24h", 0) <= -0.9 or row.get("ret_24h", 0) <= -0.9


def lost_half(row):
    return row["status"] == "no_trade_after_seen" or row.get("ret_24h", 0) <= -0.5


def evaluate(universe, outcomes):
    feats = {u["token"]: u for u in universe}
    usable = [r for r in outcomes if r["status"] in ("entered", "no_trade_after_seen") and r["token"] in feats]
    excluded = len(outcomes) - len(usable)
    out = {"excluded_unknown_outcome": excluded, "groups": {}}
    for half in ("all", "discovery", "confirmation"):
        rows = [r for r in usable if half == "all" or r["half"] == half]
        g = {}
        for cls in (HIGH, WARN, CLEAR, "sin_datos"):
            sub = [r for r in rows if verdict(feats[r["token"]])[0] == cls]
            if sub:
                g[cls] = dict(n=len(sub), collapse_rate=sum(map(collapsed, sub)) / len(sub),
                              lost_half_rate=sum(map(lost_half, sub)) / len(sub))
        total_collapse = sum(map(collapsed, rows))
        flagged = [r for r in rows if verdict(feats[r["token"]])[0] == HIGH]
        g["recall_high"] = (sum(map(collapsed, flagged)) / total_collapse) if total_collapse else None
        g["n"] = len(rows)
        out["groups"][half] = g
    # Pre-registered usefulness test: high-risk collapse rate exceeds the no-alert rate by >= 20 points in BOTH halves.
    gaps = {}
    for half in ("discovery", "confirmation"):
        g = out["groups"][half]
        if HIGH in g and CLEAR in g:
            gaps[half] = g[HIGH]["collapse_rate"] - g[CLEAR]["collapse_rate"]
    out["separation_points"] = gaps
    out["useful_signal"] = len(gaps) == 2 and all(v >= 0.20 for v in gaps.values())
    return out


def load_features(paths):
    """load_universe drops columns the precision study needs; re-read them from the same first sighting."""
    import csv
    from research_base_rates import parse_local
    universe = {u["token"]: u for u in load_universe(paths)}
    for path in paths:
        with open(path, newline="") as f:
            for row in csv.DictReader(f):
                u = universe.get(row["token"].lower())
                if u and parse_local(row["ts"]) == u["seen"] and "buys_h6" not in u:
                    u["buys_h6"] = row.get("buys_h6")
                    try:
                        u["edad_h"] = float(row["edad_h"])
                    except (ValueError, KeyError):
                        u["edad_h"] = None
    return list(universe.values())


if __name__ == "__main__":
    tokens = json.load(open(sys.argv[1]))
    print(json.dumps(evaluate(load_features(UNIVERSE), tokens), indent=1))
