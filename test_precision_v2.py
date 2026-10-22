import unittest
import precision_v2 as P


def page(*pools):
    return {"data": [{"attributes": {"pool_created_at": t, "address": addr},
                      "relationships": {"base_token": {"data": {"id": base}}, "quote_token": {"data": {"id": quote}}}}
                     for t, addr, base, quote in pools]}


T = "robinhood_0x" + "a" * 40
W = P.WETH_ID


class Sampling(unittest.TestCase):
    def test_age_window_dedupe_and_weth_side(self):
        now = 1792700000
        iso = lambda ago: __import__("datetime").datetime.fromtimestamp(now - ago, __import__("datetime").timezone.utc).isoformat()
        pg = page((iso(20 * 60), "0xp1", T, W),                       # eligible
                  (iso(5 * 60), "0xp2", "robinhood_0x" + "b" * 40, W),  # too young
                  (iso(90 * 60), "0xp3", "robinhood_0x" + "c" * 40, W), # too old
                  (iso(30 * 60), "0xp4", W, "robinhood_0x" + "d" * 40), # WETH is base -> quote token
                  (iso(25 * 60), "0xp5", T, W))                       # duplicate token
        c = P.candidates([pg], now, seen={"0x" + "e" * 40})
        self.assertEqual(sorted(x["token"] for x in c), ["0x" + "a" * 40, "0x" + "d" * 40])
        self.assertEqual(P.candidates([pg], now, seen={"0x" + "a" * 40, "0x" + "d" * 40}), [])

    def test_pick_is_deterministic_and_capped(self):
        cands = [dict(token="0x%040x" % i) for i in range(30)]
        a, b = P.pick(cands), P.pick(list(reversed(cands)))
        self.assertEqual(a, b)
        self.assertEqual(len(a), P.PER_RUN)


class Outcome(unittest.TestCase):
    s = dict(token="t", scanned_at=1000)

    def test_no_trade(self):
        self.assertEqual(P.outcome(self.s, [])["status"], "no_trade_after_seen")
        self.assertTrue(P.outcome(self.s, [[1000 + 3600, 1, 1, 1, 1, 1]])["collapsed"])

    def test_collapse_and_survival(self):
        c = [[1200, 1.0, 1.1, 0.9, 1.0, 5], [5000, 1.0, 1.0, 0.05, 0.5, 5]]
        o = P.outcome(self.s, c)
        self.assertTrue(o["collapsed"]); self.assertTrue(o["lost_half"])
        c = [[1200, 1.0, 1.5, 0.8, 1.2, 5], [5000, 1.2, 1.3, 0.7, 0.9, 5]]
        o = P.outcome(self.s, c)
        self.assertFalse(o["collapsed"]); self.assertFalse(o["lost_half"])
        self.assertAlmostEqual(o["ret_24h"], -0.1)

    def test_candles_after_24h_ignored(self):
        c = [[1200, 1.0, 1.0, 1.0, 1.0, 5], [1200 + P.DAY + 600, 1.0, 1.0, 0.01, 0.01, 5]]
        self.assertFalse(P.outcome(self.s, c)["collapsed"])


class Evaluation(unittest.TestCase):
    def test_signal_states(self):
        pre, unk, _ = P.SIGNALS["creador_retira_liquidez"]
        self.assertEqual(P.signal_state([{"t": "El creador puede retirar la liquidez"}], pre, unk), "present")
        self.assertEqual(P.signal_state([{"t": "No sabemos quién tiene la liquidez"}], pre, unk), "unknown")
        self.assertEqual(P.signal_state([{"t": "Liquidez quemada"}], pre, unk), "absent")
        pre, unk, _ = P.SIGNALS["creador_tokens_muertos"]
        for t in ("El creador lanzó 14 tokens y 13 murieron", "El creador tiene 1 token muerto", "El creador tiene 3 tokens muertos"):
            self.assertEqual(P.signal_state([{"t": t}], pre, unk), "present", t)
        pre, unk, _ = P.SIGNALS["snipers_fondeados_por_creador"]
        for t in ("Un comprador del lanzamiento lo fondeó el creador", "3 compradores del lanzamiento los fondeó el creador"):
            self.assertEqual(P.signal_state([{"t": t}], pre, unk), "present", t)

    def test_usefulness_requires_both_halves_and_min_n(self):
        scans, outs = [], []
        for i in range(80):
            present = i % 2 == 0
            checks = [{"t": "El creador puede retirar la liquidez" if present else "Liquidez quemada"}]
            scans.append(dict(token="t%d" % i, ok=True, scanned_at=i, verdict="high" if present else "ok", score=10 if present else 90, checks=checks))
            # discovery half separates, confirmation half does not
            col = present if i < 40 else (i % 4 in (0, 1))
            outs.append(dict(token="t%d" % i, status="entered", collapsed=col, lost_half=col))
        r = P.evaluate(scans, outs)
        sig = r["signals"]["creador_retira_liquidez"]
        self.assertEqual(sig["discovery"]["present"]["n"], 20)
        self.assertGreaterEqual(sig["gap_points"]["discovery"], 0.99)
        self.assertFalse(sig["useful"])
        self.assertEqual(r["signals"]["holders_concentrados"]["verdict_text"], "muestra insuficiente")

    def test_unknown_outcomes_excluded(self):
        scans = [dict(token="a", ok=True, scanned_at=1, verdict="ok", score=90, checks=[]),
                 dict(token="b", ok=True, scanned_at=2, verdict="ok", score=90, checks=[]),
                 dict(token="c", ok=False, scanned_at=3)]
        outs = [dict(token="a", status="entered", collapsed=False, lost_half=False),
                dict(token="b", status="provider_unavailable")]
        r = P.evaluate(scans, outs)
        self.assertEqual((r["n"], r["excluded_no_outcome"], r["scan_failures"]), (1, 1, 1))


if __name__ == "__main__":
    unittest.main()
