import json
from playwright.sync_api import sync_playwright
T="0x1b282927b9c5d39d7161f51af3203b44b1a56213"
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page()
    pg.goto("https://492gueq-gif.github.io/PreBuyScan/")
    r=pg.evaluate("""async c=>{const out={};const B='https://robinhoodchain.blockscout.com/api';
      const q=async(k,u)=>{try{const r=await fetch(u);const j=await r.json();out[k]={status:r.status,j:JSON.stringify(j).slice(0,1400)};}catch(e){out[k]={error:String(e)}}};
      await q('txlist',B+'?module=account&action=txlist&address='+c+'&sort=asc&page=1&offset=12');
      await q('txlist_desc',B+'?module=account&action=txlist&address='+c+'&sort=desc&page=1&offset=5');
      await q('counters',B+'/v2/addresses/'+c+'/counters');
      await q('addr',B+'/v2/addresses/'+c);
      await q('dex_batch','https://api.dexscreener.com/tokens/v1/robinhood/0x1b282927b9c5d39d7161f51af3203b44b1a56213,0x39dbed3a2bd333467115de45665cc57f813c4571');
      return out;}""","0xb187ea7defc99a5d2b089047b866697390b6fd19")
    s=json.dumps(r);print(s)
    for i,(k,v) in enumerate(r.items()):print("::notice title=bs_%d::"%i+json.dumps({k:v}).replace("%","%25")[:3500])
    b.close()
