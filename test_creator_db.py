import unittest
import creator_db as D

W = D.WETH_ID


def pg(*rows):
    return {"data": [{"attributes": {"pool_created_at": c, "address": a, "name": n},
                      "relationships": {"base_token": {"data": {"id": b}}, "quote_token": {"data": {"id": q}}}} for c, a, n, b, q in rows]}


class T(unittest.TestCase):
    def test_new_tokens(self):
        p = pg(("2026-10-22T10:00:00Z", "0xP", "AAA / WETH", "robinhood_0x" + "a" * 40, W),
               ("2026-10-22T10:01:00Z", "0xQ", "WETH / BBB", W, "robinhood_0x" + "b" * 40),
               ("2026-10-22T10:02:00Z", "0xR", "AAA / WETH", "robinhood_0x" + "a" * 40, W))
        out = D.new_tokens([p], known={})
        self.assertEqual(sorted(out), ["0x" + "a" * 40, "0x" + "b" * 40])
        self.assertEqual(D.new_tokens([p], known=out), {})

    def test_due_and_aggregate(self):
        now = 1_000_000
        tok = {"t1": dict(creator="c", created=now - D.H24 - 1),
               "t2": dict(creator="c", created=now - D.H72 - 1, d24="dead"),
               "t3": dict(creator="c", created=now - 10),
               "t4": dict(created=now - D.H72 - 1),
               "t5": dict(creator="d", created=now - D.H72 - 5, d24="alive", d72="dead")}
        self.assertEqual(sorted(D.due(tok, now)), ["t1", "t2"])
        agg = D.aggregate(tok)
        self.assertEqual((agg["c"]["launched"], agg["c"]["dead"], agg["c"]["pending"]), (3, 1, 2))
        self.assertEqual(agg["d"]["dead"], 1)          # 72 h status wins over 24 h
        pub = D.publish(agg, now, 5)
        self.assertIn("c", pub["creators"]); self.assertNotIn("d", pub["creators"])   # 2+ launches only
        self.assertEqual(pub["creators"]["c"][:4], [3, 1, 0, 2])


if __name__ == "__main__":
    unittest.main()
