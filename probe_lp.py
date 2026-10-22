import json,time
from playwright.sync_api import sync_playwright
JS = r"""async()=>{const out={};const B='https://robinhoodchain.blockscout.com/api';const d='0x18a4486c2e8a27b726f8af24e2e77858d454e556';
const q=async(k,u,n=1200)=>{const t0=Date.now();try{const r=await fetch(u);const txt=await r.text();out[k]={st:r.status,ms:Date.now()-t0,body:txt.slice(0,n)};}catch(e){out[k]={err:String(e),ms:Date.now()-t0}}};
await q('desc300',B+'?module=account&action=txlist&address='+d+'&sort=desc&page=1&offset=300',600);
await q('desc50',B+'?module=account&action=txlist&address='+d+'&sort=desc&page=1&offset=50',600);
await q('addr',B+'/v2/addresses/'+d,1500);
await q('counters',B+'/v2/addresses/'+d+'/counters',400);
await q('v2tx',B+'/v2/addresses/'+d+'/transactions?filter=from',1500);
await q('internal',B+'?module=account&action=txlistinternal&address=0xe33e9e479df8802cb0866d5d05258bec4cf62948&sort=desc&page=1&offset=5',1200);
await q('factory_addr',B+'/v2/addresses/0xe33e9e479df8802cb0866d5d05258bec4cf62948',800);
return out;}"""
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page();pg.goto("https://492gueq-gif.github.io/PreBuyScan/")
    r=pg.evaluate(JS)
    for i,(k,v) in enumerate(r.items()):print("::notice title=lp_%02d::"%i+json.dumps({k:v}).replace("%","%25")[:3800])
    b.close()
