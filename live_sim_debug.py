import json,sys
from playwright.sync_api import sync_playwright
T=sys.argv[1:]
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page();rpc=[]
    pg.on("response",lambda r:rpc.append([r.status,(r.request.post_data or "")[:70]]) if "chain.robinhood.com" in r.url else None)
    pg.goto("https://492gueq-gif.github.io/PreBuyScan/");pg.wait_for_selector(".stamp",timeout=60000)
    for t in T:
        rpc.clear()
        r=pg.evaluate("""async t=>{const ps=await (await fetch('https://api.dexscreener.com/tokens/v1/robinhood/'+t)).json();
          const pr=ps.sort((a,b)=>(b.liquidity?.usd||0)-(a.liquidity?.usd||0))[0];const t0=Date.now();
          const r=await window.PBSellSim.simulate(t,pr);r.ms=Date.now()-t0;return r;}""",t)
        out={"token":t,"sim":r,"rpc_n":len(rpc),"rpc_bad":[x for x in rpc if x[0]!=200][:6],"rpc_methods":[x[1][30:70] for x in rpc][:12]}
        s=json.dumps(out);print(s);print("::notice title=dbg_"+t[:8]+"::"+s.replace("%","%25")[:3900])
    b.close()
