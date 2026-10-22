import json
from playwright.sync_api import sync_playwright
JS = r"""async()=>{const out={log:[]};const B='https://robinhoodchain.blockscout.com/api';const t='0x1b282927b9c5d39d7161f51af3203b44b1a56213';
const q=async(k,u)=>{const t0=Date.now();try{const r=await fetch(u);const txt=await r.text();out.log.push([k,r.status,Date.now()-t0,txt.length,txt.slice(0,80)]);return txt;}catch(e){out.log.push([k,'ERR',Date.now()-t0,String(e).slice(0,60)]);return null}};
const h=JSON.parse(await q('holders',B+'/v2/tokens/'+t+'/holders')||'{}');
const addrs=(h.items||[]).map(i=>i.address.hash).slice(0,20);
for(const a of addrs){await q('txlist',B+'?module=account&action=txlist&address='+a+'&sort=asc&page=1&offset=5');await new Promise(r=>setTimeout(r,300));}
await q('tokentx300',B+'?module=account&action=tokentx&contractaddress='+t+'&sort=asc&page=1&offset=300');
await q('tokentx100',B+'?module=account&action=tokentx&contractaddress='+t+'&sort=desc&page=1&offset=100');
await q('v2transfers',B+'/v2/tokens/'+t+'/transfers');
// parallel burst of 4
await Promise.all(addrs.slice(0,8).map(a=>q('par',B+'/v2/addresses/'+a)));
return out;}"""
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page();pg.goto("https://492gueq-gif.github.io/PreBuyScan/?t=x")
    r=pg.evaluate(JS)
    json.dump(r,open("probe_out.json","w"))
    b.close()
