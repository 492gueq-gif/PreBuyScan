import json
from playwright.sync_api import sync_playwright
JS = r"""async()=>{const out={};const B='https://robinhoodchain.blockscout.com/api';
const q=async(k,u,n=1800)=>{const t0=Date.now();try{const r=await fetch(u);const txt=await r.text();out[k]={st:r.status,ms:Date.now()-t0,body:txt.slice(0,n)};}catch(e){out[k]={err:String(e),ms:Date.now()-t0}}};
const g='0x1b282927b9c5d39d7161f51af3203b44b1a56213', o='0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd';
await q('tokentx_g',B+'?module=account&action=tokentx&contractaddress='+g+'&sort=asc&page=1&offset=40',2500);
await q('tokentx_o',B+'?module=account&action=tokentx&contractaddress='+o+'&sort=asc&page=1&offset=15',1500);
await q('v2transfers',B+'/v2/tokens/'+g+'/transfers',1500);
const d=await (await fetch('https://api.dexscreener.com/tokens/v1/robinhood/'+g)).json();out.pc=d.map(p=>[p.pairAddress,p.pairCreatedAt]);
return out;}"""
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page();pg.goto("https://492gueq-gif.github.io/PreBuyScan/")
    r=pg.evaluate(JS)
    json.dump(r,open("probe_out.json","w"))
    for i,(k,v) in enumerate(r.items()):print("::notice title=lp_%02d::"%i+json.dumps({k:v}).replace("%","%25")[:3900])
    b.close()
