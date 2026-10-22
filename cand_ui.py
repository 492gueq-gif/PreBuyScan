import json,sys,subprocess,time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,"-m","http.server","8765","-d","candidate"]);time.sleep(1)
T="0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd"
def note(tag,obj):
    s=json.dumps(obj,ensure_ascii=False);open("notes.txt","a").write(tag+" "+s+"\n");print(tag,s[:1500])
with sync_playwright() as p:
    b=p.chromium.launch()
    # mobile
    m=b.new_page(viewport={"width":390,"height":844},device_scale_factor=2);errs=[];m.on("pageerror",lambda e:errs.append(str(e)[:300]))
    m.goto("http://localhost:8765/");m.wait_for_timeout(2500);m.screenshot(path="ui_m_home.png")
    m.goto("http://localhost:8765/?t="+T);m.wait_for_selector("#out .ring",timeout=180000);m.wait_for_timeout(3000)
    m.screenshot(path="ui_m_result.png");m.screenshot(path="ui_m_result_full.png",full_page=True)
    note("m_result",{"scrollW":m.evaluate("document.documentElement.scrollWidth"),"hl":m.locator(".hl li").all_inner_texts(),"stats":m.locator(".stat").all_inner_texts(),"errs":errs})
    m.click(".rtabs [data-tab=seguridad]");m.wait_for_timeout(500);m.screenshot(path="ui_m_seg.png")
    note("m_sec",{"rows":m.locator(".secrows li").all_inner_texts()})
    m.click(".tabbar [data-nav=explore]");m.wait_for_selector("#explore-list li[data-scan]",timeout=40000);m.wait_for_timeout(1500);m.screenshot(path="ui_m_explore.png")
    m.click(".tabbar [data-nav=sim]");m.wait_for_timeout(800);m.screenshot(path="ui_m_sim.png")
    note("m_sim",{"out":m.locator("#sim-host .s-out").inner_text() if m.locator("#sim-host .s-out").count() else None})
    m.click(".tabbar [data-nav=history]");m.wait_for_timeout(500);note("m_hist",{"items":m.locator("#hist-list li").all_inner_texts()[:3]})
    m.click(".tabbar [data-nav=home]");m.wait_for_timeout(800);m.screenshot(path="ui_m_home2.png")
    note("m_errs",{"errs":errs})
    # desktop
    d=b.new_page(viewport={"width":1440,"height":900});derr=[];d.on("pageerror",lambda e:derr.append(str(e)[:300]))
    d.goto("http://localhost:8765/");d.wait_for_timeout(5000);d.screenshot(path="ui_d_home.png")
    d.goto("http://localhost:8765/?t="+T);d.wait_for_selector("#out .ring",timeout=180000);d.wait_for_timeout(6000)
    d.screenshot(path="ui_d_result.png");d.screenshot(path="ui_d_result_full.png",full_page=True)
    note("d_result",{"scrollW":d.evaluate("document.documentElement.scrollWidth"),"rail":d.locator("#rail-trend li").count(),"recent":d.locator("#recent-d li").all_inner_texts()[:2],"chain":d.locator(".chaincard").inner_text(),"errs":derr})
    # wallet profile
    d.goto("http://localhost:8765/?t=0xb187ea7defc99a5d2b089047b866697390b6fd19");d.wait_for_selector("#out .ring",timeout=120000);d.wait_for_timeout(1500);d.screenshot(path="ui_d_profile.png")
    note("d_profile",{"hl":d.locator(".hl li").all_inner_texts(),"errs":derr})
    b.close()
srv.terminate()
