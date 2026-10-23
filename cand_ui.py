import json,sys,subprocess,time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,"-m","http.server","8765","-d","candidate"]);time.sleep(1)
T="0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd"
def note(tag,obj):
    s=json.dumps(obj,ensure_ascii=False);open("notes.txt","a").write(tag+" "+s+"\n");print(tag,s[:1800])
with sync_playwright() as p:
    b=p.chromium.launch()
    d=b.new_page(viewport={"width":1440,"height":900});errs=[];csp=[]
    d.on("pageerror",lambda e:errs.append(str(e)[:300]));d.on("console",lambda m:csp.append(m.text[:200]) if "Content Security Policy" in m.text or "Refused" in m.text else None)
    t0=time.time();d.goto("http://localhost:8765/?t="+T);d.wait_for_selector("#out .ring:not(.pending)",timeout=240000)
    d.wait_for_timeout(4000)
    note("d_scan",{"secs":round(time.time()-t0),"conf":d.locator(".confline").inner_text(),"sizes":d.locator(".a-sec table").inner_text() if d.locator(".a-sec table").count() else None,
      "srcs":d.locator(".src").all_inner_texts()[:6],"note":d.locator("#out .note").inner_text(),"confcard":d.locator("#out .a-info").first.inner_text()[:600],"errs":errs,"csp":csp[:5]})
    d.screenshot(path="ui_d_result.png");d.screenshot(path="ui_d_result_full.png",full_page=True)
    d.click(".side [data-kind=alpha]");d.wait_for_selector("#explore-list li",timeout=60000);d.wait_for_timeout(8000)
    note("d_alpha",{"rows":d.locator("#explore-list li").all_inner_texts()[:4],"errs":errs,"csp":csp[:5]})
    d.screenshot(path="ui_d_alpha.png")
    d.click(".themebtn");d.wait_for_timeout(600);d.goto("http://localhost:8765/?t="+T);d.wait_for_selector("#out .ring:not(.pending)",timeout=240000);d.wait_for_timeout(3000);d.screenshot(path="ui_d_light.png")
    note("d_light",{"theme":d.evaluate("document.documentElement.dataset.theme"),"errs":errs,"csp":csp[:5]})
    m=b.new_page(viewport={"width":390,"height":844},device_scale_factor=2);merr=[];m.on("pageerror",lambda e:merr.append(str(e)[:300]))
    m.goto("http://localhost:8765/");m.wait_for_timeout(1000);m.evaluate("localStorage.setItem('pbs_theme','\"dark\"')");m.goto("http://localhost:8765/");m.wait_for_timeout(1200)
    m.click(".tile[data-kind=alpha]");m.wait_for_selector("#explore-list li",timeout=60000);m.wait_for_timeout(8000);m.screenshot(path="ui_m_alpha.png")
    m.click("[data-nav=settings]");m.wait_for_timeout(600);m.screenshot(path="ui_m_settings.png")
    note("m",{"scrollW":m.evaluate("document.documentElement.scrollWidth"),"errs":merr})
    b.close()
srv.terminate()
