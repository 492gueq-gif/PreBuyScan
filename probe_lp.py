import json,subprocess,sys,time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,"-m","http.server","8766","-d","candidate"]);time.sleep(1)
JS = r"""async()=>{const C=window.PBCreator;C._budget(600000);const B='https://robinhoodchain.blockscout.com/api';const t='0x1b282927b9c5d39d7161f51af3203b44b1a56213';
const h=await C._get(B+'/v2/tokens/'+t+'/holders');const out={rows:[],funders:{}};
for(const it of (h.items||[]).slice(0,8)){const a=it.address.hash.toLowerCase();
  const j=await C._get(B+'/v2/addresses/'+a+'/transactions?filter=to');
  const inc=(j.items||[]).filter(x=>BigInt(x.value||'0')>0n);const last=inc[inc.length-1];
  let via='tx',f=last&&last.from.hash.toLowerCase(),ts=last&&last.timestamp,hash=last&&last.hash;
  if(!f){const it2=await C._get(B+'/v2/addresses/'+a+'/internal-transactions?filter=to');const ii=(it2.items||[]).filter(x=>BigInt(x.value||'0')>0n);const l=ii[ii.length-1];if(l){f=l.from.hash.toLowerCase();ts=l.timestamp;hash=l.transaction_hash;via='internal';}}
  out.rows.push([a.slice(0,10),via,f,ts,hash&&hash.slice(0,8),j.next_page_params?'50+':String((j.items||[]).length)]);
  if(f&&!out.funders[f]){const ai=await C._get(B+'/v2/addresses/'+f);let n=null;try{n=Number(BigInt(await C._rpc('eth_getTransactionCount',[f,'latest'])));}catch(e){}
    out.funders[f]={is_contract:ai.is_contract,name:ai.name,proxy:ai.proxy_type,nonce:n,tags:(ai.public_tags||[]).map(x=>x.display_name||x.label),meta:JSON.stringify(ai.metadata||null).slice(0,200)};}
}
return out;}"""
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page();pg.goto("http://127.0.0.1:8766/?t=x");pg.wait_for_selector(".stamp",timeout=180000);pg.wait_for_timeout(1000)
    try:r=pg.evaluate(JS)
    except Exception as e:r={"err":str(e)[:500]}
    json.dump(r,open("probe_out.json","w"))
    b.close()
srv.terminate()
