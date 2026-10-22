import csv
import json
import os
import tempfile
import unittest
from research_base_rates import (load_universe, select_sample, metrics, report, run, parse_local,
                                 HORIZONS, ENTRY_WINDOW)

T = '0x' + 'a'*40
U = '0x' + 'b'*40
P = '0x' + 'c'*64


def write_csv(path, rows):
    with open(path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['ts', 'token', 'ticker', 'par', 'dex', 'liq_usd', 'veredicto', 'sells_h6'])
        w.writeheader()
        for r in rows:
            w.writerow(r)


class BaseRateTests(unittest.TestCase):
    def test_local_time_is_utc_minus_six(self):
        self.assertEqual(parse_local('2026-10-19 22:21:25') % 86400, (4*3600 + 21*60 + 25))

    def test_universe_keeps_earliest_sighting_and_all_verdicts(self):
        with tempfile.TemporaryDirectory() as d:
            p = d + '/v.csv'
            write_csv(p, [dict(ts='2026-10-18 10:00:00', token=T, ticker='A', par=P, dex='uniswap/v4', liq_usd='0', veredicto='DESCARTA', sells_h6='0'),
                          dict(ts='2026-10-18 09:00:00', token=T.upper().replace('0X', '0x'), ticker='A', par=P, dex='uniswap/v4', liq_usd='10', veredicto='PASA', sells_h6='3'),
                          dict(ts='bad', token='nope', ticker='', par='', dex='', liq_usd='', veredicto='', sells_h6='')][:2])
            u = load_universe([p])
            self.assertEqual(len(u), 1)
            self.assertEqual(u[0]['seen'], parse_local('2026-10-18 09:00:00'))
            self.assertTrue(u[0]['lite_pass'])

    def test_sample_excludes_incomplete_horizon_and_splits_by_time(self):
        items = [dict(token='0x%040x' % i, pool=P, seen=1000*i, dex='uniswap/v4', liq_usd=1.0,
                      verdict='DESCARTA', lite_pass=(i == 3), sells_h6='0') for i in range(10)]
        cutoff = 9000 + HORIZONS['24h'] + 600 - 1  # last one lacks a full horizon
        sample, counts = select_sample(items, cutoff, size=4)
        self.assertEqual(counts['eligible'], 9)
        self.assertIn('0x%040x' % 3, {s['token'] for s in sample})       # every PASA kept
        self.assertEqual({s['half'] for s in sample} <= {'discovery', 'confirmation'}, True)

    def test_metrics_entry_horizons_and_dead_tokens(self):
        item = dict(token=T, seen=1000, liq_usd=2000.0, half='discovery', lite_pass=False, dex='uniswap/v4')
        candles = [[1000 + 300*k, 1.0 + k*0.01, 1.0 + k*0.01 + 0.5, 0.05, 1.0 + k*0.01, 1] for k in range(300)]
        m = metrics(item, candles)
        self.assertEqual(m['status'], 'entered')
        self.assertAlmostEqual(m['ret_1h'], (1.0 + 11*0.01) - 1)            # last full candle ending <= +1h
        self.assertAlmostEqual(m['max_down_24h'], -0.95)
        self.assertEqual(m['last_trade_age_1h'], 0)
        late = [[1000 + ENTRY_WINDOW + 300, 1, 1, 1, 1, 1]]
        self.assertEqual(metrics(item, late)['status'], 'no_trade_after_seen')
        self.assertEqual(metrics(item, [])['status'], 'no_trade_after_seen')
        sparse = metrics(item, [[1000, 1, 1, 1, 1, 1], [1300, 2, 2, 2, 2, 1]])
        self.assertAlmostEqual(sparse['ret_24h'], 1.0)                      # last trade carried, age recorded
        self.assertGreater(sparse['last_trade_age_24h'], 80000)

    def test_report_counts_unknowns_and_h1_requires_both_halves(self):
        def row(half, passed, r):
            return dict(token='x', half=half, lite_pass=passed, liq_bucket='<1k', dex='v4', status='entered',
                        ret_1h=r, ret_6h=r, ret_24h=r, max_up_24h=r, max_down_24h=min(r, 0))
        rows = [row('discovery', True, 0.5), row('discovery', False, -0.5),
                row('confirmation', True, -0.6), row('confirmation', False, 0.1),
                dict(token='y', half='confirmation', lite_pass=False, liq_bucket='<1k', dex='v4', status='provider_unavailable')]
        out = report(rows)
        self.assertEqual(out['summary']['all']['unavailable'], 1)
        h1 = out['h1_lite_filter_net_mean_rt5_24h_difference']
        self.assertGreater(h1['discovery'], 0)
        self.assertLess(h1['confirmation'], 0)
        self.assertFalse(h1['consistent_positive'])

    def test_run_offline_records_provider_failures_and_input_hashes(self):
        with tempfile.TemporaryDirectory() as d:
            p = d + '/v.csv'
            write_csv(p, [dict(ts='2026-10-18 09:00:00', token=T, ticker='A', par=P, dex='uniswap/v4', liq_usd='10', veredicto='PASA', sells_h6='3'),
                          dict(ts='2026-10-18 09:05:00', token=U, ticker='B', par=P, dex='uniswap/v2', liq_usd='x', veredicto='DESCARTA', sells_h6='0')])
            seen = parse_local('2026-10-18 09:00:00')

            def fake(url):
                if U in url:
                    raise ValueError('404')
                return {'data': {'attributes': {'ohlcv_list': [[seen + 300*k, 1, 1, 1, 1, 1] for k in range(300)]}}}
            out = run([p], d, cutoff=seen + 10**6, get_json=fake)
            self.assertEqual(out['counts']['sampled'], 2)
            self.assertEqual(out['summary']['all']['unavailable'], 1)
            self.assertEqual(out['summary']['all']['entered'], 1)
            self.assertIn(p, out['inputs_sha256'])
            self.assertTrue(os.path.exists(d + '/base_rates_v1_tokens.json'))
            with open(d + '/base_rates_v1_summary.json') as f:
                json.load(f)


if __name__ == '__main__':
    unittest.main()


class ShardTests(unittest.TestCase):
    def test_shards_cover_sample_once_resume_and_merge_marks_missing(self):
        from research_base_rates import run_shard, merge
        with tempfile.TemporaryDirectory() as d:
            p = d + '/v.csv'
            rows = [dict(ts='2026-10-18 09:%02d:00' % i, token='0x%040x' % (i + 1), ticker='T', par=P, dex='uniswap/v4',
                         liq_usd='10', veredicto='PASA' if i == 0 else 'DESCARTA', sells_h6='0') for i in range(7)]
            write_csv(p, rows)
            seen = parse_local('2026-10-18 09:00:00')
            calls = []

            def fake(url):
                calls.append(url)
                return {'data': {'attributes': {'ohlcv_list': [[seen + 300*k, 1, 1, 1, 1, 1] for k in range(300)]}}}
            cutoff = seen + 10**6
            n0 = run_shard([p], d, 0, 3, cutoff, fake); n1 = run_shard([p], d, 1, 3, cutoff, fake)
            first = len(calls)
            run_shard([p], d, 0, 3, cutoff, fake)            # resume: nothing re-fetched
            self.assertEqual(len(calls), first)
            out = merge([p], [d + '/tokens_shard_0.jsonl', d + '/tokens_shard_1.jsonl'], d, cutoff)
            self.assertEqual(out['counts']['sampled'], 7)
            self.assertEqual(out['counts']['processed'], n0 + n1)
            self.assertEqual(out['counts']['not_processed'], 7 - n0 - n1)   # shard 2 never ran: reported, not hidden
