"""Browser checks with Playwright (CI). MOCKED: every external request is blocked or
answered from tests/fixtures, so results are deterministic; the CDN libraries (d3,
qrcode-generator) are loaded for real with SRI. Real-service checks live in live_check.py.

Writes out/ui.json and screenshots; exits 1 if a blocking check fails.
Visual regression: compares against tests/baseline/*.png when present (mean abs diff).
"""
import base64
import json
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
OUT.mkdir(exist_ok=True)
FIX = json.loads((ROOT / "tests/fixtures/gt_pools.json").read_text())
EXP = json.loads((ROOT / "tests/fixtures/gt_expected.json").read_text())
AXE = ROOT / "node_modules/axe-core/axe.min.js"
TOKEN = "0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd"
PORT = 8790
BASE = "http://localhost:%d/" % PORT
results, failures = {}, []


def check(name, ok, detail=None):
    results[name] = dict(ok=bool(ok), detail=detail)
    if not ok:
        failures.append(name)


def router(route):
    url = route.request.url
    if url.startswith(BASE):
        return route.continue_()
    if url.startswith("https://cdnjs.cloudflare.com/") or url.startswith("https://cdn.jsdelivr.net/"):
        return route.continue_()
    if url.startswith("https://api.geckoterminal.com/api/v2/networks/robinhood/") and "/ohlcv" not in url and "/trades" not in url:
        return route.fulfill(status=200, content_type="application/json", body=json.dumps(FIX))
    if url.startswith("https://api.dexscreener.com/"):
        return route.fulfill(status=200, content_type="application/json", body="[]")
    return route.abort()


def blocked(route):
    url = route.request.url
    return route.continue_() if url.startswith(BASE) else route.abort()


def page(browser, w, h, offline=True, mode="fixtures"):
    ctx = browser.new_context(viewport={"width": w, "height": h})
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.on("console", lambda m: errs.append("console:" + m.text[:160]) if m.type == "error" and "Failed to load resource" not in m.text and "ERR_FAILED" not in m.text else None)
    if offline:
        pg.route("**/*", router if mode == "fixtures" else blocked)
    pg.clock.set_fixed_time(EXP["now"])
    return ctx, pg, errs


def axe(pg, tag):
    if not AXE.exists():
        check("a11y_" + tag, False, "axe-core not installed")
        return
    # The page's CSP forbids inline scripts (as it should); inject axe through the DevTools protocol instead.
    pg.evaluate(AXE.read_text() + "\n;void 0")
    res = pg.evaluate("async()=>{const r=await axe.run(document,{resultTypes:['violations']});return r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length,targets:v.nodes.slice(0,6).map(n=>n.target.join(' ')+' :: '+(n.any[0]&&n.any[0].message||'').slice(0,90))}))}")
    critical = [v for v in res if v["impact"] == "critical"]
    results["a11y_" + tag + "_all"] = res
    check("a11y_" + tag + "_no_critical", not critical, critical)


def shot(pg, name, full=False):
    path = OUT / (name + ".png")
    pg.screenshot(path=str(path), full_page=full)
    return path


def visual(name, path):
    base = ROOT / "tests/baseline" / (name + ".png")
    if not base.exists():
        results["visual_" + name] = dict(ok=True, detail="no baseline yet (candidate saved)")
        return
    from PIL import Image, ImageChops
    a, b = Image.open(base).convert("RGB"), Image.open(path).convert("RGB")
    if a.size != b.size:
        return check("visual_" + name, False, "size %s vs %s" % (a.size, b.size))
    diff = ImageChops.difference(a, b)
    hist = diff.convert("L").histogram()
    mean = sum(i * n for i, n in enumerate(hist)) / (a.size[0] * a.size[1]) / 255
    check("visual_" + name, mean <= 0.02, round(mean, 4))


def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "-d", str(ROOT)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            def guarded(name, fn):
                try:
                    fn()
                except Exception as error:  # a crashed block is a failed check, never a silent pass
                    check(name + "_crashed", False, type(error).__name__ + ": " + str(error)[:300])

            def home_block():
                for w, h, tag in ((1440, 900, "desktop"), (390, 844, "mobile")):
                    ctx, pg, errs = page(b, w, h)
                    pg.goto(BASE)
                    pg.wait_for_timeout(1200)
                    check("home_%s_no_errors" % tag, not errs, errs[:5])
                    check("home_%s_boot_removed" % tag, pg.locator("#boot").count() == 0)
                    sw = pg.evaluate("document.documentElement.scrollWidth")
                    wide = pg.evaluate("w=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.right>w+0.5&&r.width>0}).slice(0,8).map(e=>e.tagName+'.'+e.className+':'+Math.round(e.getBoundingClientRect().right))", w)
                    check("home_%s_no_overflow" % tag, sw <= w, dict(scrollWidth=sw, wide=wide))
                    check("home_%s_vector_logo" % tag, pg.evaluate("[...document.querySelectorAll('img[src=\"logo.svg\"]')].some(i=>i.naturalWidth>0)"))
                    visual("home_" + tag, shot(pg, "home_" + tag))
                    axe(pg, "home_" + tag)
                    ctx.close()

            def conn_error_block():
                # 5/12. connection error: market and chain unreachable => not evaluable, nothing favourable
                ctx, pg, errs = page(b, 1440, 900, mode="blocked")
                pg.goto(BASE + "?t=" + TOKEN)
                pg.wait_for_selector("#out .ring:not(.pending)", timeout=180000)
                pg.wait_for_timeout(1800)
                check("conn_error_badge", "ERROR DE CONEXIÓN" in pg.inner_text("#out .done"))
                check("conn_error_not_evaluable", pg.inner_text("#out .ring .lr-lbl") == "No evaluable" and pg.inner_text("#out .lr-num") == "—")
                check("conn_error_technical_pills", pg.locator("#out .pill.err").count() >= 3)
                check("conn_error_no_history_score", pg.evaluate("JSON.parse(localStorage.getItem('pbs_hist')||'[]')[0].score") is None)
                pg.click("[data-act=cards]")
                pg.wait_for_timeout(300)
                check("conn_error_no_share_card", "no se genera una tarjeta" in pg.inner_text("#out .sc-out"))
                check("conn_error_no_errors", not errs, errs[:5])
                visual("conn_error", shot(pg, "conn_error"))
                axe(pg, "result_conn_error")
                ctx.close()

            def alpha_block():
                # 8. Alpha Radar with fixtures
                ctx, pg, errs = page(b, 1440, 900)
                pg.goto(BASE)
                pg.wait_for_timeout(600)
                pg.evaluate("setView('explore',{kind:'alpha'})")
                pg.wait_for_selector("#explore-list li.al", timeout=60000)
                names = pg.evaluate("[...document.querySelectorAll('#explore-list li.al .grow b')].map(b=>b.firstChild.textContent.trim())")
                check("alpha_default_filters_order", names == EXP["order"], names)
                check("alpha_activity_badges", pg.locator("#explore-list .alphab").count() == len(names))
                last = pg.inner_text("#explore-list li.al >> nth=-1")
                check("alpha_high_risk_last_unfavourable", "sin etiqueta favorable" in last, last[:120])
                check("alpha_source_and_time", "Fuente: GeckoTerminal" in pg.inner_text("#explore-list"))
                pg.select_option("#alpha-f select[name=age]", "24")
                pg.wait_for_timeout(800)
                n24 = pg.locator("#explore-list li.al").count()
                check("alpha_filter_editable", n24 == len(EXP["age24_pass"]), n24)
                visual("alpha", shot(pg, "alpha"))
                check("alpha_no_errors", not errs, errs[:5])
                ctx.close()

            def report_visuals_block():
                # Exercise the actual report DOM at phone and desktop widths, without live APIs.
                for w, h in ((360, 780), (1440, 900)):
                    ctx, pg, errs = page(b, w, h, mode="blocked")
                    pg.goto(BASE)
                    pg.wait_for_selector("#boot", state="detached")
                    pg.evaluate("""() => {
                      window.mapBuilds=0; window.d3={};
                      PBMap.build=async()=>{window.mapBuilds++;return {nodes:[],groups:[],partial:{},creatorPct:0,holdersShown:0}};
                      PBMap.draw=el=>{el.textContent='Fixture map ready'};
                      window.reportPair={pairAddress:'0x'+'12'.repeat(20),baseToken:{name:'Fixture token',symbol:'FIX'},quoteToken:{symbol:'ETH'},priceUsd:'1',liquidity:{usd:20000}};
                      setView('result');renderPartial('""" + TOKEN + """',{pair:reportPair,facts:{}});
                    }""")
                    check("scan_no_chart_%d" % w, pg.locator("#out iframe").count() == 0)
                    check("scan_no_map_%d" % w, pg.evaluate("mapBuilds") == 0)
                    pg.evaluate("""() => render('""" + TOKEN + """',{
                      checks:[{s:'warn',t:'Liquidez baja',d:'fixture',c:'Mercado'},
                        {s:'high',t:'Concentración crítica',d:'fixture',c:'Holders'},
                        {s:'unk',t:'Venta no simulada',d:'fixture',c:'Venta'}],
                      facts:{name:'Fixture token'},notChecked:[],cr:{},pair:reportPair,pairs:[reportPair],
                      block:123,scannedAt:Date.parse('2026-10-23T00:00:00Z')})""")
                    pg.wait_for_function("mapBuilds===1 && document.querySelector('#mapsvg')?.textContent==='Fixture map ready'")
                    reason=pg.inner_text(".score-reason")
                    check("reason_priority_%d" % w, reason.index("Concentración crítica") < reason.index("Liquidez baja"))
                    check("reason_pending_not_risk_%d" % w, "no prueban una vulnerabilidad" in reason and "Venta no simulada" not in reason)
                    check("reason_below_marker_%d" % w, pg.evaluate("document.querySelector('.score-reason').getBoundingClientRect().top >= document.querySelector('.rtop').getBoundingClientRect().bottom"))
                    check("report_chart_auto_%d" % w, pg.locator("#out .chart iframe[loading=eager]").count() == 1)
                    check("report_map_auto_%d" % w, pg.locator("#mapsvg").is_visible() and pg.evaluate("mapBuilds") == 1)
                    check("report_no_overflow_%d" % w, pg.evaluate("document.documentElement.scrollWidth") <= w)
                    shot(pg,"report_visuals_%d" % w)
                    # Exercise English mode on the rendered report, including async translation.
                    ctx.add_init_script("localStorage.setItem('pbs_lang',JSON.stringify('en'))")
                    pg.reload()
                    pg.wait_for_function("window.PBI18N && PBI18N.lang==='en'")
                    pg.evaluate("""() => {setView('result'); render('""" + TOKEN + """',{
                      checks:[{s:'warn',t:'Liquidez baja',d:'fixture',c:'Mercado'}],
                      facts:{name:'English fixture'},notChecked:[],cr:{},pair:null,pairs:[]});}""")
                    # Translation is asynchronous (MutationObserver); wait for its actual result.
                    try:
                        pg.wait_for_function("document.querySelector('#out').innerText.toLowerCase().includes('summary') && document.querySelector('#out').innerText.toLowerCase().includes('caution')", timeout=10000)
                    except Exception:
                        pass  # record a failed assertion with the rendered text below
                    english_text=pg.inner_text("#out")
                    check("report_english_%d" % w, "summary" in english_text.lower() and "caution" in english_text.lower(), english_text[:1600])
                    shot(pg,"report_english_%d" % w)
                    check("report_no_errors_%d" % w, not errs, errs[:5])
                    ctx.close()

            def cards_block():
                # 10/11. share cards from a fixture analysis + QR decode + verification page
                ctx, pg, errs = page(b, 1440, 900)
                pg.goto(BASE)
                pg.wait_for_timeout(600)
                data = pg.evaluate("""async()=>{await ensureQR();
                  const res={checks:[{s:'warn',t:'Liquidez baja',d:'fixture',c:'Mercado'},{s:'unk',err:true,t:'Holders no revisados',d:'fixture',c:'Holders'},{s:'ok',t:'La venta simulada funciona',d:'fixture',c:'Venta'}],
                    pair:null,cr:{},block:123,scannedAt:Date.parse('2026-10-23T00:00:00Z')};
                  const s=await PBShare.makeAll('""" + TOKEN + """',res,{score:PBScore.scoreOf(res.checks),verdict:'warn',confidence:40,algo:PBScore.ALGO_VERSION,logoUrl:null});
                  return {x:[s.cards.x.width,s.cards.x.height],t:[s.cards.telegram.width,s.cards.telegram.height],p:[s.cards.premium.width,s.cards.premium.height],
                    qr:s.qr,url:s.link.url,id:s.link.id,premium:s.cards.premium.toDataURL('image/png'),xpng:s.cards.x.toDataURL('image/png'),
                    alerts:s.rep.x.map(a=>a[1])}}""")
                check("cards_sizes", (data["x"], data["t"], data["p"]) == ([1600, 900], [1080, 1080], [1080, 1350]))
                check("cards_qr_drawn", bool(data["qr"]) and data["qr"]["size"] >= 200 and data["qr"]["size"] // (data["qr"]["modules"] + 8) >= 3, data["qr"])
                check("cards_error_state_kept", "ERROR TÉCNICO" in data["alerts"], data["alerts"])
                (OUT / "card_premium.png").write_bytes(base64.b64decode(data["premium"].split(",")[1]))
                (OUT / "card_x.png").write_bytes(base64.b64decode(data["xpng"].split(",")[1]))
                import cv2
                val, _, _ = cv2.QRCodeDetectorAruco().detectAndDecode(cv2.imread(str(OUT / "card_premium.png")))
                check("qr_decodes_to_link", val == data["url"], len(val or ""))
                local = data["url"].replace("https://492gueq-gif.github.io/PreBuyScan/", BASE)
                v = ctx.new_page()
                v.route("**/*", router)
                v.goto(local)
                v.wait_for_selector("#verify .verifybox", timeout=30000)
                check("verify_ok", "Reporte verificado" in v.inner_text("#verify"))
                v2 = ctx.new_page()
                v2.route("**/*", router)
                v2.goto(local.replace("&r=" + data["id"], "&r=" + "0" * 16))
                v2.wait_for_selector("#verify .verifybox", timeout=30000)
                check("verify_tampered_rejected", "no verificado" in v2.inner_text("#verify"))
                check("cards_no_errors", not errs, errs[:5])
                ctx.close()

            for n, fn in (("home", home_block), ("conn_error", conn_error_block), ("alpha", alpha_block), ("cards", cards_block), ("report_visuals", report_visuals_block)):
                guarded(n, fn)
            b.close()
    finally:
        srv.terminate()
    summary = dict(kind="MOCKED_FIXTURES", passed=sum(r["ok"] for r in results.values() if isinstance(r, dict) and "ok" in r),
                   failed=failures, results=results)
    (OUT / "ui.json").write_text(json.dumps(summary, indent=1, ensure_ascii=False))
    print(json.dumps(dict(passed=summary["passed"], failed=failures), ensure_ascii=False))
    print("::notice title=ui_check::" + json.dumps(dict(passed=summary["passed"], failed=failures), ensure_ascii=False))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
