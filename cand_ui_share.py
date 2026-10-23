import json,sys,subprocess,time,base64
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,"-m","http.server","8765","-d","candidate"]);time.sleep(1)
T="0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd"
def note(tag,obj):
    s=json.dumps(obj,ensure_ascii=False);open("notes.txt","a").write(tag+" "+s+"\n");print(tag,s[:1800])
def save(pg,sel,path):
    data=pg.evaluate("s=>document.querySelector(s).src",sel);open(path,"wb").write(base64.b64decode(data.split(",")[1]))
with sync_playwright() as p:
    b=p.chromium.launch()
    d=b.new_page(viewport={"width":1440,"height":900});errs=[];csp=[]
    d.on("pageerror",lambda e:errs.append(str(e)[:300]));d.on("console",lambda m:csp.append(m.text[:200]) if "Content Security Policy" in m.text or "Refused" in m.text else None)
    d.goto("http://localhost:8765/?t="+T);d.wait_for_selector("#out .ring:not(.pending)",timeout=240000)
    d.click("[data-act=cards]");d.wait_for_selector(".sc-grid img",timeout=60000);d.wait_for_timeout(800)
    sizes=d.evaluate("()=>({x:[shareSet.cards.x.width,shareSet.cards.x.height],t:[shareSet.cards.telegram.width,shareSet.cards.telegram.height],p:[shareSet.cards.premium.width,shareSet.cards.premium.height],qr:shareSet.qr,url:shareSet.link.url,id:shareSet.link.id,alerts:shareSet.rep.x.map(a=>a[0]+'|'+a[1]+'|'+a[2]),addr:PBShare.checksum(shareSet.rep.a)})")
    note("cards",{**sizes,"errs":errs,"csp":csp[:5]})
    imgs=d.locator(".sc-grid img")
    for i,n in enumerate(["card_x.png","card_tg.png","card_premium.png"]):
        data=imgs.nth(i).get_attribute("src");open(n,"wb").write(base64.b64decode(data.split(",")[1]))
    d.screenshot(path="ui_d_share.png")
    # verification link
    v=b.new_page(viewport={"width":1440,"height":900});v.goto(sizes["url"].replace("https://492gueq-gif.github.io/PreBuyScan/","http://localhost:8765/"));v.wait_for_selector("#verify .verifybox",timeout=30000)
    note("verify_ok",{"ok":"Reporte verificado" in v.inner_text("#verify"),"text":v.inner_text("#verify")[:400]})
    tam=sizes["url"].replace("https://492gueq-gif.github.io/PreBuyScan/","http://localhost:8765/").replace("&r="+sizes["id"],"&r=0000000000000000")
    v2=b.new_page();v2.goto(tam);v2.wait_for_selector("#verify .verifybox",timeout=30000);note("verify_tampered",{"rejected":"no verificado" in v2.inner_text("#verify"),"text":v2.inner_text("#verify")[:200]})
    # long name + missing data (test data, clearly labelled)
    d.evaluate("""async()=>{const rep={v:1,c:4663,a:'0x1111111111111111111111111111111111111111',n:'DATOS DE PRUEBA — Token con un nombre larguísimo que no cabe en ninguna tarjeta',s:'PRUEBAXYZLARGO',sc:15,vd:'high',cf:40,al:'test',b:null,ts:1792700000,
      x:[['confirmed','RIESGO CONFIRMADO','La venta simulada falla',''],['suspicious','SEÑAL SOSPECHOSA','El creador tiene 2 tokens muertos',''],['pending','SIMULACIÓN PENDIENTE','Venta no simulada',''],['pending','IDENTIDAD NO VERIFICADA','Dueño del contrato no identificado','']],m:null,lg:0};
      const meta={id:'test000000000000',hash:'0'.repeat(64),url:'https://492gueq-gif.github.io/PreBuyScan/?t=0x1111111111111111111111111111111111111111',logo:null};
      await ensureQR();const c=await PBShare.drawX(rep,meta);const pr=await PBShare.drawPremium(rep,meta);window.__t1=c.toDataURL('image/png');window.__t2=pr.canvas.toDataURL('image/png');}""")
    open("card_test_long.png","wb").write(base64.b64decode(d.evaluate("()=>window.__t1").split(",")[1]))
    open("card_test_premium.png","wb").write(base64.b64decode(d.evaluate("()=>window.__t2").split(",")[1]))
    note("errs",{"errs":errs,"csp":csp[:5]})
    m=b.new_page(viewport={"width":390,"height":844});m.goto("http://localhost:8765/?t="+T);m.wait_for_selector("#out .ring:not(.pending)",timeout=240000)
    m.click("[data-act=cards]");m.wait_for_selector(".sc-grid img",timeout=60000);note("mobile",{"scrollW":m.evaluate("document.documentElement.scrollWidth")})
    b.close()
srv.terminate()
# QR decode check
import cv2
img=cv2.imread("card_premium.png");det=cv2.QRCodeDetector();val,pts,_=det.detectAndDecode(img)
note("qr_decode",{"decoded":bool(val),"matches_link":val==sizes["url"],"len":len(val)})
for n in ["card_test_premium.png"]:
    try:
        v3,_,_=det.detectAndDecode(cv2.imread(n));note("qr_decode_"+n,{"decoded":bool(v3)})
    except Exception as e: note("qr_decode_"+n,{"err":str(e)[:200]})
from PIL import Image
for n in ["card_x.png","card_tg.png","card_premium.png"]:note("png_"+n,{"size":Image.open(n).size})
