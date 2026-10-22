import json
from playwright.sync_api import sync_playwright
T="0x1b282927b9c5d39d7161f51af3203b44b1a56213"
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page()
    pg.goto("https://492gueq-gif.github.io/PreBuyScan/")
    r=pg.evaluate("""async t=>{const out={};
      for(const u of ['https://robinhoodchain.blockscout.com/api/v2/addresses/'+t,'https://robinhoodchain.blockscout.com/api/v2/tokens/'+t+'/holders',
                      'https://robinhoodchain.blockscout.com/api?module=contract&action=getcontractcreation&contractaddresses='+t,
                      'https://api.blockscout.com/4663/api/v2/addresses/'+t]){
        try{const r=await fetch(u);const txt=await r.text();out[u.slice(8,70)]={status:r.status,body:txt.slice(0,600)};}catch(e){out[u.slice(8,70)]={error:String(e)};}}
      return out;}""",T)
    s=json.dumps(r);print(s)
    for i,(k,v) in enumerate(r.items()):print("::notice title=bs_%d::"%i+json.dumps({k:v}).replace("%","%25")[:3500])
    b.close()
