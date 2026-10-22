import json,sys,subprocess,time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,"-m","http.server","8765","-d","candidate"]);time.sleep(1)
T="0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd"
def note(tag,obj):
    s=json.dumps(obj,ensure_ascii=False);open("notes.txt","a").write(tag+" "+s+"\n");print(tag,s[:1500])
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={"width":390,"height":844},device_scale_factor=2,permissions=["clipboard-read","clipboard-write"])
    m=ctx.new_page();errs=[];m.on("pageerror",lambda e:errs.append(str(e)[:300]))
    m.goto("http://localhost:8765/");m.wait_for_timeout(1500);m.screenshot(path="ui_m_home.png")
    m.evaluate("t=>navigator.clipboard.writeText('Contrato: '+t)",T)
    t0=time.time();m.click("#f2 .paste");m.wait_for_selector("#out .ring",timeout=180000)
    note("paste_click",{"secs":round(time.time()-t0),"view":m.evaluate("document.body.dataset.view"),"errs":errs})
    # auto-search when typing/pasting into the field
    m2=ctx.new_page();m2.goto("http://localhost:8765/");m2.wait_for_timeout(1000)
    m2.fill("#addr2","0x39dbed3a2bd333467115de45665cc57f813c4571");m2.wait_for_selector("#out .ring",timeout=180000)
    note("auto_fill",{"name":m2.locator(".ident h2").inner_text()})
    # empty clipboard hint
    m3=ctx.new_page();m3.goto("http://localhost:8765/");m3.wait_for_timeout(800);m3.evaluate("navigator.clipboard.writeText('hola')");m3.click("#f2 .paste");m3.wait_for_timeout(500)
    note("bad_clip",{"hint":m3.locator("#f2 .pastehint").inner_text(),"view":m3.evaluate("document.body.dataset.view")})
    d=b.new_page(viewport={"width":1440,"height":900});d.goto("http://localhost:8765/");d.wait_for_timeout(1500);d.screenshot(path="ui_d_home.png")
    b.close()
srv.terminate()
