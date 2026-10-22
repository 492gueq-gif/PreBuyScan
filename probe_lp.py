import json,sys,subprocess,time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,"-m","http.server","8765","-d","candidate"]);time.sleep(1)
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page();pg.goto("http://localhost:8765/?t=0x0000000000000000000000000000000000000000")
    r=pg.evaluate("""async()=>{const C=window.PBCreator;const t='0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd';
      const cr=await C.findCreator(t);let rep=null,err=null;try{rep=await C.reputation(t,cr);}catch(e){err=String(e)+' | '+e.stack;}
      return {cr,err,rep:rep&&JSON.stringify(rep).slice(0,2500)};}""")
    print("::notice title=dbg::"+json.dumps(r).replace("%","%25")[:3900])
    b.close()
srv.terminate()
