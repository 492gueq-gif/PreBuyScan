import json,sys
from playwright.sync_api import sync_playwright
TOKENS=sys.argv[1:] or ["0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd"]
with sync_playwright() as p:
    b=p.chromium.launch()
    for t in TOKENS:
        pg=b.new_page(viewport={"width":1000,"height":900});logs=[];pg.on("console",lambda m:logs.append(m.text[:200]));rpcs=[];pg.on("response",lambda r:rpcs.append((r.status,r.request.post_data[:60] if r.request.post_data else r.url[:60])) if "robinhood.com" in r.url else None)
        pg.goto("https://492gueq-gif.github.io/PreBuyScan/?t="+t);pg.wait_for_selector(".stamp",timeout=180000);pg.wait_for_timeout(500)
        items=list(zip(pg.locator("ol.checks li .pill").all_inner_texts(),pg.locator("ol.checks li b").all_inner_texts(),pg.locator("ol.checks li .ck span").all_inner_texts()))
        facts=dict(zip(pg.locator(".fact dt").all_inner_texts(),pg.locator(".fact dd").all_inner_texts()))
        out={"token":t,"stamp":pg.inner_text(".stamp"),"checks":items,"facts":facts,"note":pg.inner_text(".note"),
             "rpc_statuses":sorted(set(str(x[0]) for x in rpcs)),"rpc_n":len(rpcs),"rpc_non200":[x for x in rpcs if x[0]!=200][:5],"tables":pg.locator("#out table.tt").all_inner_texts()}
        out["og"]=pg.evaluate("document.querySelector('meta[property=\"og:image\"]').content");out["creatorjs"]=pg.evaluate("!!window.PBCreator");pg.wait_for_selector("#radar table.tt",timeout=60000);out["radar"]=pg.locator("#radar tbody tr").count()
        s=json.dumps(out,ensure_ascii=False);print(s);open("notes.txt","a").write(s+"\n")
        for i in range(0,len(s),3000):print("::notice title=page_%d::"%(i//3000)+s[i:i+3000].replace("%","%25"))
    b.close()
# rerun 1792678601
