import json
import unittest
from datetime import datetime, timezone
import gems_v1 as G

T = "robinhood_0x" + "a" * 40
W = G.WETH_ID
iso = lambda t: datetime.fromtimestamp(t, timezone.utc).isoformat()


def page(*pools):
    return {"data": [{"attributes": {"pool_created_at": iso(t), "address": addr},
                      "relationships": {"base_token": {"data": {"id": base}}, "quote_token": {"data": {"id": quote}}}}
                     for t, addr, base, quote in pools]}


class Window(unittest.TestCase):
    def test_frozen_dates(self):
        self.assertEqual(G.START, int(datetime(2026, 10, 30, 16, tzinfo=timezone.utc).timestamp()))
        self.assertEqual(G.END - G.START, 14 * 86400)
        self.assertFalse(G.in_period(G.START - 28 * 3600))
        self.assertTrue(G.in_period(G.START - 26 * 3600))       # pool index starts early for the d1 cohort
        self.assertTrue(G.in_period(G.START))
        self.assertTrue(G.in_period(G.END + G.HORIZON + 3600))


class Sampling(unittest.TestCase):
    def test_age_1_to_3_hours_dedupe_weth_side(self):
        now = G.START + 50000
        pg = page((now - 90 * 60, "0xp1", T, W),                             # eligible
                  (now - 30 * 60, "0xp2", "robinhood_0x" + "b" * 40, W),     # too young
                  (now - 200 * 60, "0xp3", "robinhood_0x" + "c" * 40, W),    # too old
                  (now - 120 * 60, "0xp4", W, "robinhood_0x" + "d" * 40),    # WETH base -> quote token
                  (now - 100 * 60, "0xp5", T, W))                            # second pool of the same token
        e = G.parse_pages([pg])
        self.assertEqual(len(e), 5)
        c = G.candidates(e, now, seen=set())
        self.assertEqual(sorted(x["token"] for x in c), ["0x" + "a" * 40, "0x" + "d" * 40])
        self.assertEqual([x["pool"] for x in c if x["token"] == "0x" + "a" * 40], ["0xp5"])   # first pool created
        self.assertEqual(G.candidates(e, now, seen={"0x" + "a" * 40, "0x" + "d" * 40}), [])

    def test_index_lets_pools_seen_young_be_scanned_later(self):
        t0 = G.START
        young = G.parse_pages([page((t0 - 20 * 60, "0xp1", T, W))])          # seen at 20 min old
        self.assertEqual(G.candidates(young, t0, set()), [])                  # too young now
        self.assertEqual(len(G.candidates(young, t0 + 3600, set())), 1)       # 80 min old one hour later

    def test_pick_deterministic(self):
        cands = [dict(token="0x%040x" % i) for i in range(40)]
        self.assertEqual(G.pick(cands), G.pick(list(reversed(cands))))
        self.assertEqual(len(G.pick(cands)), G.PER_RUN)


def candles(t0, prices, step=G.CANDLE):
    # [time, open, high, low, close, volume]; prices = list of (open, high, low, close)
    return [[t0 + i * step, o, h, l, c, 1] for i, (o, h, l, c) in enumerate(prices)]


class Outcome(unittest.TestCase):
    s = dict(token="t", scanned_at=10_000)

    def test_gem_needs_3x_and_liquidity(self):
        n = G.HORIZON // G.CANDLE
        prices = [(1, 1, 1, 1)] + [(3.2, 3.3, 3.1, 3.2)] * (n - 1)
        rows = candles(10_000 + 60, prices)
        o = G.outcome(self.s, rows, 20000)
        self.assertEqual(o["status"], "entered")
        self.assertTrue(o["gem"] and o["double"])
        self.assertAlmostEqual(o["ret_7d"], 2.2)
        self.assertFalse(G.outcome(self.s, rows, 5000)["gem"])         # liquidity gone -> not a gem
        self.assertFalse(G.outcome(self.s, rows, None)["gem"])         # unknown liquidity never counts as gem

    def test_spike_without_holding_is_not_gem(self):
        n = G.HORIZON // G.CANDLE
        prices = [(1, 6, 1, 5)] + [(1, 1, 1, 1)] * (n - 1)
        o = G.outcome(self.s, candles(10_000, prices), 50000)
        self.assertTrue(o["spike5"])
        self.assertFalse(o["gem"] or o["double"])

    def test_horizon_excludes_later_candles(self):
        n = G.HORIZON // G.CANDLE
        prices = [(1, 1, 1, 1)] * n + [(10, 10, 10, 10)] * 5            # the rise happens after day 7
        o = G.outcome(self.s, candles(10_000, prices), 50000)
        self.assertFalse(o["gem"])
        self.assertAlmostEqual(o["ret_7d"], 0.0)

    def test_no_trade_after_scan(self):
        self.assertEqual(G.outcome(self.s, [], 1)["status"], "no_trade_after_seen")
        self.assertFalse(G.outcome(self.s, candles(10_000 + 2 * 3600, [(1, 1, 1, 1)]), 1)["gem"])


def chk(*titles):
    return [dict(s="ok", c="x", t=t) for t in titles]


class Signals(unittest.TestCase):
    def test_title_based(self):
        r = dict(checks=chk("Liquidez quemada", "No lanzó otros tokens", "Los snipers ya casi no tienen tokens"), verdict="ok", score=85)
        self.assertEqual(G.sig_liquidez_bloqueada(r), "present")
        self.assertEqual(G.sig_creador_limpio(r), "present")
        self.assertEqual(G.sig_snipers_salieron(r), "present")
        self.assertEqual(G.sig_holders_repartidos(r), "present")
        self.assertEqual(G.sig_safety_80(r), "present")
        r2 = dict(checks=chk("El creador lanzó 5 tokens y 4 murieron", "Los snipers aún tienen 30 %", "Muy concentrado: 10 wallets tienen 80 %",
                             "No sabemos quién tiene la liquidez"), verdict="high", score=20)
        self.assertEqual(G.sig_creador_limpio(r2), "absent")
        self.assertEqual(G.sig_snipers_salieron(r2), "absent")
        self.assertEqual(G.sig_holders_repartidos(r2), "absent")
        self.assertEqual(G.sig_liquidez_bloqueada(r2), "unknown")
        self.assertEqual(G.sig_sin_riesgo_alto(r2), "absent")
        r3 = dict(checks=chk("Historial del creador no disponible (tiempo agotado)", "Snipers no revisados", "Holders no revisados"), verdict="unk", score=None)
        for f in (G.sig_creador_limpio, G.sig_snipers_salieron, G.sig_holders_repartidos, G.sig_sin_riesgo_alto, G.sig_safety_80):
            self.assertEqual(f(r3), "unknown", f.__name__)

    def test_market_signals_and_combined(self):
        r = dict(checks=[], verdict="warn", gt=dict(buyers_h1=40, sellers_h1=10, buys_h1=60, reserve_usd=20000), alpha=70)
        for f in (G.sig_compradores_30, G.sig_presion_compradora, G.sig_compras_organicas, G.sig_liquidez_15k, G.sig_alpha_60, G.sig_filtro_combinado):
            self.assertEqual(f(r), "present", f.__name__)
        wash = dict(r, gt=dict(buyers_h1=40, sellers_h1=10, buys_h1=400, reserve_usd=20000))
        self.assertEqual(G.sig_compras_organicas(wash), "absent")
        self.assertEqual(G.sig_filtro_combinado(wash), "absent")
        self.assertEqual(G.sig_filtro_combinado(dict(r, verdict="unk")), "unknown")
        self.assertEqual(G.sig_compradores_30(dict(r, gt=None)), "unknown")

    def test_gt_metrics(self):
        pj = {"data": {"attributes": {"reserve_in_usd": "15000.5", "transactions": {"h1": {"buys": 10, "sells": 2, "buyers": 8, "sellers": 2}, "m15": {"buyers": 3}},
                                      "volume_usd": {"h1": "999", "m15": "100"}, "fdv_usd": "50000"}}}
        m = G.gt_metrics(pj)
        self.assertEqual((m["reserve_usd"], m["buyers_h1"], m["vol_h1"], m["buyers_m15"]), (15000.5, 8.0, 999.0, 3.0))
        self.assertIsNone(G.gt_metrics({})["reserve_usd"])


def row(i, t, gem, sig=True, wallets=()):
    return dict(token="0x%040x" % i, ok=True, scanned_at=t, verdict="ok" if sig else "high", score=90 if sig else 10,
                checks=[], gt=None, alpha=None, early_wallets=list(wallets), top_holders=[])


class Evaluation(unittest.TestCase):
    def build(self, rate_p, rate_a, n=200):
        scans, outs = [], []
        for i in range(n):
            sig = i % 2 == 0
            k = i // 2
            gem = (k * 37) % 100 < (rate_p * 100 if sig else rate_a * 100)
            scans.append(row(i, 1000 + i, gem, sig))
            outs.append(dict(token="0x%040x" % i, status="entered", gem=gem, double=gem, spike5=gem, ret_7d=2.5 if gem else 0, liq_7d=20000))
        return scans, outs

    def test_useful_needs_both_halves_lift_and_gap(self):
        s, o = self.build(0.10, 0.02)
        r = G.evaluate_cohort(s, o)
        self.assertEqual(r["n"], 200)
        self.assertTrue(r["signals"]["sin_riesgo_alto"]["useful"])
        s, o = self.build(0.06, 0.04, n=400)
        self.assertEqual(G.evaluate_cohort(s, o)["signals"]["sin_riesgo_alto"]["verdict_text"], "no separa")
        s, o = self.build(0.10, 0.02, n=40)
        self.assertEqual(G.evaluate_cohort(s, o)["signals"]["sin_riesgo_alto"]["verdict_text"], "muestra insuficiente")

    def test_unknown_outcomes_and_failures_reported_not_counted(self):
        s, o = self.build(0.10, 0.02, n=10)
        s.append(dict(token="0xfail", ok=False, scanned_at=5))
        o[0] = dict(token=o[0]["token"], status="unknown")
        r = G.evaluate_cohort(s, o)
        self.assertEqual((r["n"], r["scan_failures"], r["excluded_no_outcome"]), (9, 1, 1))

    def test_smart_money_learned_in_discovery_tested_in_confirmation(self):
        SM, INFRA = "0x" + "5" * 40, "0x" + "f" * 40
        scans, outs = [], []
        for i in range(240):
            disc = i < 120
            has = (i % 8 == 0)
            gem = (disc and has) or (not disc and i % 16 == 0)
            w = ([SM] if has else ["0x%040x" % (1000 + i)]) + [INFRA]
            scans.append(row(i, 1000 + i, gem, wallets=w))
            outs.append(dict(token="0x%040x" % i, status="entered", gem=gem, double=gem, spike5=False, ret_7d=0, liq_7d=0))
        r = G.evaluate_cohort(scans, outs)["dinero_inteligente"]
        self.assertGreaterEqual(r["smart_wallets"], 1)
        self.assertEqual(r["confirmation"]["present"]["n"], 15)
        self.assertEqual(r["confirmation"]["present"]["gems"], 7)
        self.assertEqual(r["confirmation"]["absent"]["gems"], 0)
        self.assertTrue(r["useful"])
        disc = [dict(scans[i], **outs[i]) for i in range(120)]
        self.assertNotIn(INFRA, G.smart_set(disc))          # shared infrastructure is never "smart money"

    def test_scan_js_and_scanner_present(self):
        self.assertIn("inspect(t)", G.SCAN_JS)
        self.assertNotEqual(G.SCANNER_SHA, hashlib_empty())


class NewSignalsAndCohorts(unittest.TestCase):
    def test_team_holders_pools(self):
        self.assertEqual(G.sig_equipo_invierte(dict(dex_info=dict(sites=1, socials=2, header=False))), "present")
        self.assertEqual(G.sig_equipo_invierte(dict(dex_info=dict(sites=0, socials=0, header=True))), "present")
        self.assertEqual(G.sig_equipo_invierte(dict(dex_info=dict(sites=1, socials=0, header=False))), "absent")
        self.assertEqual(G.sig_equipo_invierte(dict(dex_info=None)), "unknown")
        self.assertEqual(G.sig_holders_100(dict(holders_count=150)), "present")
        self.assertEqual(G.sig_holders_100(dict(holders_count=40)), "absent")
        self.assertEqual(G.sig_holders_100(dict()), "unknown")
        self.assertEqual(G.sig_varios_pools(dict(n_pairs=3)), "present")
        self.assertEqual(G.sig_varios_pools(dict(n_pairs=1)), "absent")

    def test_early_metrics_no_lookahead(self):
        created, scan = 100_000, 100_000 + 7200
        c = [[created + i * 300, 1, h, 1, cl, v] for i, (h, cl, v) in enumerate([(2, 1.5, 100)] * 6 + [(1.2, 1.1, 10)] * 12 + [(1, 0.9, 50)] * 6)]
        c.append([scan + 300, 9, 99, 9, 99, 1e9])                       # after the scan: ignored
        e = G.early_metrics(c, created, scan)
        self.assertEqual(e["max_high"], 2)
        self.assertEqual(e["last_close"], 0.9)
        self.assertEqual(e["vol_first30"], 600)
        self.assertEqual(e["vol_last30"], 300)
        r = dict(early=e)
        self.assertEqual(G.sig_aguanta_primera_ola(r), "absent")        # 0.9 < 0.5 x 2 ... = 1.0
        self.assertEqual(G.sig_volumen_sostenido(r), "absent")
        self.assertEqual(G.sig_aguanta_primera_ola(dict(early=dict(e, last_close=1.2))), "present")
        self.assertEqual(G.sig_volumen_sostenido(dict(early=None)), "unknown")
        self.assertEqual(G.early_metrics([], created, scan)["max_high"], None)

    def test_d1_cohort_age_and_separate_outcomes(self):
        now = G.START + 30 * 3600
        idx = [dict(token="0x" + "a" * 40, pool="0xp", pool_created=now - 25 * 3600),
               dict(token="0x" + "b" * 40, pool="0xq", pool_created=now - 2 * 3600)]
        d1 = G.COHORTS["d1"]
        self.assertEqual([c["token"] for c in G.candidates(idx, now, set(), d1["min_age"], d1["max_age"])], ["0x" + "a" * 40])
        self.assertEqual([c["token"] for c in G.candidates(idx, now, set())], ["0x" + "b" * 40])
        # the same token in both cohorts keeps two separate outcomes
        scans = [dict(row(1, 10, False), cohort="h1"), dict(row(1, 10 + 86400, False), cohort="d1")]
        outs = [dict(token=scans[0]["token"], cohort="h1", status="entered", gem=True, double=True, spike5=False, ret_7d=3, liq_7d=1e5),
                dict(token=scans[0]["token"], cohort="d1", status="entered", gem=False, double=False, spike5=False, ret_7d=0, liq_7d=1e5)]
        r = G.evaluate(scans, outs)["cohorts"]
        self.assertEqual(r["h1"]["base_rate"]["all"]["gem"]["gems"], 1)
        self.assertEqual(r["d1"]["base_rate"]["all"]["gem"]["gems"], 0)
        self.assertEqual(len(G.SIGNALS), 17)


def hashlib_empty():
    import hashlib
    return hashlib.sha256().hexdigest()[:16]


if __name__ == "__main__":
    unittest.main()
