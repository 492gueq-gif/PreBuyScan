import json,sys
from playwright.sync_api import sync_playwright
TOKENS=sys.argv[1:] or ["0x39dbed3a2bd333467115de45665cc57f813c4571"]
with sync_playwright() as p:
    b=p.chromium.launch()
    for t in TOKENS:
        pg=b.new_page(viewport={"width":1000,"height":900})
        pg.goto("https://492gueq-gif.github.io/PreBuyScan/");pg.wait_for_selector(".stamp",timeout=60000)
        pg.fill("#addr",t);pg.click("#go");pg.wait_for_selector(".stamp",timeout=90000);pg.wait_for_timeout(500)
        items=list(zip(pg.locator("ol.checks li .pill").all_inner_texts(),pg.locator("ol.checks li b").all_inner_texts(),pg.locator("ol.checks li .ck span").all_inner_texts()))
        facts=dict(zip(pg.locator(".fact dt").all_inner_texts(),pg.locator(".fact dd").all_inner_texts()))
        out={"token":t,"stamp":pg.inner_text(".stamp"),"checks":items,"facts":facts,"note":pg.inner_text(".note"),
             "table":pg.locator("table.tt").inner_text() if pg.locator("table.tt").count() else None}
        s=json.dumps(out,ensure_ascii=False);print(s)
        for i in range(0,len(s),3000):print("::notice title=page_%d::"%(i//3000)+s[i:i+3000].replace("%","%25"))
    b.close()
