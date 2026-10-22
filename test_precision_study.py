import unittest
from precision_study import verdict, collapsed, evaluate, HIGH, WARN, CLEAR


def feat(token, liq, buys, sells, age=5.0):
    return dict(token=token, liq_usd=liq, buys_h6=str(buys), sells_h6=str(sells), edad_h=age)


def out(token, half, status='entered', down=-0.2, ret=0.1):
    return dict(token=token, half=half, status=status, max_down_24h=down, ret_24h=ret)


class PrecisionTests(unittest.TestCase):
    def test_verdict_rules(self):
        self.assertEqual(verdict(feat('a', 1000, 5, 5))[0], HIGH)
        self.assertEqual(verdict(feat('a', 50000, 30, 0))[0], HIGH)
        self.assertEqual(verdict(feat('a', 10000, 10, 5))[0], WARN)
        self.assertEqual(verdict(feat('a', 50000, 100, 5))[0], WARN)        # sells/buys < 0.15
        self.assertEqual(verdict(feat('a', 50000, 10, 5, age=0.5))[0], WARN)
        self.assertEqual(verdict(feat('a', 50000, 10, 5))[0], CLEAR)
        self.assertEqual(verdict(dict(token='a', liq_usd=None, buys_h6='1', sells_h6='1'))[0], 'sin_datos')

    def test_collapse_definition(self):
        self.assertTrue(collapsed(out('a', 'x', status='no_trade_after_seen')))
        self.assertTrue(collapsed(out('a', 'x', down=-0.95)))
        self.assertFalse(collapsed(out('a', 'x', down=-0.5, ret=-0.4)))

    def test_usefulness_requires_both_halves_and_excludes_unknowns(self):
        feats = [feat('h1', 1000, 5, 5), feat('c1', 50000, 10, 5), feat('h2', 1000, 5, 5), feat('c2', 50000, 10, 5),
                 feat('u', 1000, 5, 5)]
        outcomes = [out('h1', 'discovery', down=-0.95), out('c1', 'discovery'),
                    out('h2', 'confirmation', down=-0.95), out('c2', 'confirmation', down=-0.95),
                    dict(token='u', half='confirmation', status='provider_unavailable')]
        r = evaluate(feats, outcomes)
        self.assertEqual(r['excluded_unknown_outcome'], 1)
        self.assertAlmostEqual(r['separation_points']['discovery'], 1.0)
        self.assertAlmostEqual(r['separation_points']['confirmation'], 0.0)
        self.assertFalse(r['useful_signal'])
        self.assertEqual(r['groups']['all'][HIGH]['n'], 2)


if __name__ == '__main__':
    unittest.main()
