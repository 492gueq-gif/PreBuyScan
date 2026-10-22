import json,sys,subprocess,time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,"-m","http.server","8765","-d","candidate"]);time.sleep(1)
T="0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd"
def note(tag,obj):
    s=json.dumps(obj,ensure_ascii=False);open("notes.txt","a").write(tag+" "+s+"\n");print(tag,s[:1500])
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={"width":390,"height":844},device_scale_factor=2)
    m=ctx.new_page();errs=[];m.on("pageerror",lambda e:errs.append(str(e)[:300]))
    t0=time.time();m.goto("http://localhost:8765/?t="+T)
    m.wait_for_selector("#out .stages li",timeout=60000)
    try:
        m.wait_for_function("document.querySelector('#out h2')&&document.querySelector('#out h2').textContent.includes('Analizando')",timeout=60000)
        tp=round(time.time()-t0,1);m.wait_for_timeout(1500);m.screenshot(path="ui_m_partial.png")
        stages=m.locator("#out .stages li").all_inner_texts()
    except Exception as e: tp=None;stages=str(e)[:100]
    m.wait_for_selector("#out .ring:not(.pending)",timeout=180000);tf=round(time.time()-t0,1)
    note("progressive",{"partial_secs":tp,"final_secs":tf,"stages_at_partial":stages,"errs":errs})
    sw=m.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!r)")
    man=m.evaluate("fetch('manifest.webmanifest').then(r=>r.json()).then(j=>j.name)")
    note("pwa",{"sw":sw,"manifest":man})
    # favourites watch: fake an old snapshot with much higher liquidity and price
    m.evaluate("""t=>{localStorage.setItem('pbs_fav',JSON.stringify([{t,name:'OWO',sym:'OWOWO',img:null,score:90,v:'ok',at:1,liq:999999,price:1}]));localStorage.removeItem('pbs_fav_check');localStorage.removeItem('pbs_alerts');}""",T)
    m.goto("http://localhost:8765/");m.wait_for_timeout(6000)
    note("alerts",{"items":m.locator("#alert-list li").all_inner_texts(),"badge":m.locator(".tabbar .badge").inner_text() if m.locator(".tabbar .badge").count() else None,"hidden":m.evaluate("document.getElementById('alerts').hidden")})
    m.screenshot(path="ui_m_home.png")
    note("errs",{"errs":errs})
    d=b.new_page(viewport={"width":1440,"height":900});d.goto("http://localhost:8765/?t="+T);d.wait_for_function("document.querySelector('#out h2')&&document.querySelector('#out h2').textContent.includes('Analizando')",timeout=60000);d.wait_for_timeout(1500);d.screenshot(path="ui_d_partial.png")
    b.close()
srv.terminate()
