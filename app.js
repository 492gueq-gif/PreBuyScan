/* PreBuyScan page logic (moved out of index.html so the CSP needs no 'unsafe-inline' for scripts). */
// Chart: Ctrl + wheel activates it; leaving it gives the wheel back to the page.
document.addEventListener("wheel",e=>{const sh=e.target.closest&&e.target.closest(".chart-shield");if(sh&&e.ctrlKey){e.preventDefault();sh.parentElement.classList.add("chart-on");}},{passive:false});
document.addEventListener("mouseout",e=>{const c=e.target.closest&&e.target.closest(".chart.chart-on");if(c&&!c.contains(e.relatedTarget))c.classList.remove("chart-on");});
document.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.classList&&e.target.classList.contains("chart-shield")){e.preventDefault();e.target.parentElement.classList.add("chart-on");}});
// Images that fail to load: no inline onerror handlers (blocked by the CSP); one delegated listener.
document.addEventListener("error",e=>{const t=e.target;if(!t||t.tagName!=="IMG")return;
  if(t.dataset.onerr==="remove")t.remove();
  else if(t.dataset.fallback!=null){const sp=document.createElement("span");sp.className="av";sp.textContent=t.dataset.fallback;t.replaceWith(sp);}},true);


const RPC="https://rpc.mainnet.chain.robinhood.com";
const DEX="https://api.dexscreener.com/tokens/v1/robinhood/";
const V4_POOL_MANAGER="0x8366a39cc670b4001a1121b8f6a443a643e40951";
const $=s=>document.querySelector(s);
const uiText=s=>window.PBI18N?.lang==="en"?PBI18N.tr(s):s;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const usd=v=>v==null||isNaN(v)?"—":"$"+Number(v).toLocaleString((globalThis.PBI18N?.locale||"es-MX"),{maximumFractionDigits:v<1?8:0});
const num=v=>v==null||isNaN(v)?"—":Number(v).toLocaleString((globalThis.PBI18N?.locale||"es-MX"));

// net.js: timeout, bounded retries with backoff, Retry-After, JSON validation, 30 s market cache.
const timed=(url,opts={},ms=9000)=>PBNet.fetchJSON(url,opts,ms);
const netCacheClear=()=>PBNet.clear();
let rpcId=0;
// Official public RPC first; if it fails at the transport level (down, CORS, rate limit), the same call
// goes to public fallbacks and the report says which data came from them.
async function rpc(method,params){
  const body={method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:++rpcId,method,params})};
  let j;
  try{j=await timed(RPC,body);}
  catch(e){
    const S=window.PBSellSim;if(!S)throw e;
    for(const u of S.FALLBACKS){try{j=await timed(u,body,9000);if(j&&j.error)continue;const h=new URL(u).host;S.usage.fallback[h]=(S.usage.fallback[h]||0)+1;break;}catch(e2){j=null;}}
    if(!j)throw e;
  }
  if(j.error)throw new Error("rpc");return j.result;
}
const hasSel=(code,sels)=>sels.some(s=>code.includes("63"+s));
const pct=v=>v==null||isNaN(v)?"—":(v>0?"+":"")+Number(v).toLocaleString((globalThis.PBI18N?.locale||"es-MX"),{maximumFractionDigits:1})+" %";
const word=a=>a.toLowerCase().replace(/^0x/,"").padStart(64,"0");
async function uintCall(to,data){const r=await rpc("eth_call",[{to,data},"latest"]);if(!r||r==="0x")throw new Error("empty");return BigInt(r.slice(0,66));}
const GT="https://api.geckoterminal.com/api/v2/networks/robinhood/pools/";
const GTN="https://api.geckoterminal.com/api/v2/networks/robinhood/";
const short=a=>a.slice(0,6)+"…"+a.slice(-4);
async function traders(pool){
  const j=await timed(GT+pool+"/trades");
  const rows=(j.data||[]).map(d=>d.attributes).filter(a=>a&&a.tx_from_address&&!a.is_anomalous);
  const w={};
  for(const a of rows){
    const k=a.tx_from_address.toLowerCase(),v=Number(a.volume_in_usd)||0;
    const x=w[k]||(w[k]={addr:k,bought:0,sold:0,nb:0,ns:0,buys:[]});
    if(a.kind==="buy"){x.bought+=v;x.nb++;x.buys.push({v,b:a.block_number});}else if(a.kind==="sell"){x.sold+=v;x.ns++;}
  }
  const list=Object.values(w);
  // Only wallets that bought AND sold inside the visible window: earlier buys are unknown.
  const top=list.filter(x=>x.ns>0&&x.nb>0).map(x=>({...x,pnl:x.sold-x.bought})).sort((a,b)=>b.pnl-a.pnl).slice(0,5);
  // Identical buys: 3+ different wallets whose buy sizes match within 0.5 % (> $50).
  const big=list.flatMap(x=>x.buys.filter(b=>b.v>50).map(b=>({...b,addr:x.addr}))).sort((a,b)=>a.v-b.v);
  let clone=[];
  // Same size (±0.5 %) AND nearly simultaneous (≤ 50 blocks, ~5 s): a coordinated launch buy, not routine bots.
  for(let i=0;i<big.length;i++){const grp=big.filter(b=>Math.abs(b.v-big[i].v)<=big[i].v*0.005&&Math.abs(b.b-big[i].b)<=50);const ws=new Set(grp.map(g=>g.addr));if(ws.size>clone.length)clone=[...ws].map(a=>({addr:a,v:big[i].v}));}
  const byBlock={};for(const x of list)for(const b of x.buys){(byBlock[b.b]=byBlock[b.b]||new Set()).add(x.addr);}
  const sameBlock=Math.max(0,...Object.values(byBlock).map(s=>s.size));
  const sells=list.reduce((t,x)=>t+x.sold,0),topSeller=list.reduce((m,x)=>x.sold>m.sold?x:m,{sold:0});
  const bigSells=rows.filter(a=>a.kind==="sell").map(a=>({addr:a.tx_from_address.toLowerCase(),v:Number(a.volume_in_usd)||0,ts:Date.parse(a.block_timestamp)})).sort((x,y)=>y.v-x.v).slice(0,5);
  // Wash trading: few distinct wallets that both buy and sell over and over carry most of the volume.
  const totalVol=list.reduce((t,x)=>t+x.bought+x.sold,0);
  const loopers=list.filter(x=>x.nb>=3&&x.ns>=3);const loopVol=loopers.reduce((t,x)=>t+x.bought+x.sold,0);
  const top3=list.slice().sort((a,b)=>(b.bought+b.sold)-(a.bought+a.sold)).slice(0,3).reduce((t,x)=>t+x.bought+x.sold,0);
  let wash=null;
  if(rows.length>=60&&totalVol>2000){
    const ls=loopVol/totalVol,t3=top3/totalVol;
    if(ls>=0.5)wash=loopers.length+" wallets que compran y venden una y otra vez hacen "+Math.round(ls*100)+" % del volumen reciente: parte del volumen puede ser falso.";
    else if(list.length<=Math.max(6,rows.length*0.05)&&t3>=0.7)wash="Solo "+list.length+" wallets hicieron las últimas "+rows.length+" operaciones y 3 de ellas suman "+Math.round(t3*100)+" % del volumen.";
  }
  return {n:rows.length,bigSells,wash,uniq:list.length,loopShare:totalVol?loopVol/totalVol:null,wallets:list,top,clone:clone.length>=3?clone:[],sameBlock,sellShare:sells>0?topSeller.sold/sells:null,topSeller};
}
const share=(part,total)=>total>0n?Number(part*10000n/total)/100:null;

function dbCreatorCheck(K,DBC,createdAt){const r=dbCreatorCheck0(K,DBC);r.src="Base de creadores de PreBuyScan";
  // The database only knows launches since it started: older history is not covered.
  if(createdAt&&DBC&&DBC.since&&createdAt<DBC.since*1000){r.d+=" Ojo: este token es anterior al inicio de la base, así que su historial está incompleto.";if(r.s==="ok"){r.s="unk";r.t="Historial incompleto en la base de creadores";}}
  return r;}
function dbCreatorCheck0(K,DBC){
  const kd=K[1],kk=K[1]+K[2];
  const since=new Date(DBC.since*1000).toLocaleDateString((globalThis.PBI18N?.locale||"es-MX"),{day:"numeric",month:"short"});
  const src="Base de creadores de PreBuyScan (todos los tokens nuevos de Robinhood Chain desde el "+since+"): ";
  if(kk>=3&&kd/kk>=0.7)return {s:"high",t:"Creador serial: lanzó "+K[0]+" tokens y "+kd+" murieron",d:src+"de "+kk+" tokens con resultado, "+kd+" quedaron sin liquidez a las 24–72 h."};
  if(kd>0)return {s:"warn",t:kd===1?"El creador tiene 1 token muerto":"El creador tiene "+kd+" tokens muertos",d:src+"lanzó "+K[0]+" tokens; "+kd+" de "+kk+" con resultado murieron."};
  if(kk>0)return {s:"ok",t:"Los otros tokens del creador siguen vivos",d:src+"lanzó "+K[0]+" tokens; los "+kk+" con resultado siguen con liquidez."};
  if(K[0]>=3){const h=Math.max(1,(K[5]-K[4])/3600);return {s:"warn",t:"Lanza tokens en serie: "+K[0]+" en "+(h<48?Math.round(h)+" h":Math.round(h/24)+" días"),d:src+"esta wallet creó "+K[0]+" tokens; aún no tienen resultado (se revisa a las 24 h). Quien lanza muchos tokens seguidos suele abandonarlos."};}
  return {s:"unk",t:"Creador con tokens recientes",d:src+"lanzó "+K[0]+" tokens; ninguno tiene resultado todavía (se revisa a las 24 h)."};
}
const lockTxt=u=>u?" Bloqueada hasta el "+new Date(u*1000).toLocaleDateString((globalThis.PBI18N?.locale||"es-MX"),{day:"numeric",month:"short",year:"numeric"})+".":" No pudimos leer hasta cuándo.";
const lockState=(u,okState)=>!u?okState:u*1000<Date.now()?"high":u*1000-Date.now()<30*864e5?"warn":"ok";
let dbPromise=null;
function creatorDB(){
  if(!dbPromise)dbPromise=timed("https://raw.githubusercontent.com/492gueq-gif/PreBuyScan/creator-db/creators.json",{},7000).catch(()=>{dbPromise=null;return null;});
  return dbPromise;
}
const ALGO_VERSION=window.PBScore.ALGO_VERSION;
const SRC={"Venta":"Simulación eth_simulateV1 en la RPC pública","Contrato":"Código del contrato en la cadena (RPC pública)","Creador y liquidez":"Explorador Blockscout + RPC pública","Lanzamiento":"Explorador Blockscout + RPC pública","Holders":"Explorador Blockscout","Mercado":"DexScreener"};
let nextExplorerBudget=0;
// A part cut by our own time budget is not a broken provider: say so, and say a retry can finish it.
function explorerMiss(cr,key,t,dProvider){
  const why=cr&&window.PBCreator&&window.PBCreator.failReason?window.PBCreator.failReason(cr,key):null;
  if(why==="timeout")return{s:"unk",err:true,t:t+" (tiempo agotado)",d:"El explorador de Robinhood Chain respondió lento y la consulta se cortó a los "+Math.round(((cr&&cr.budgetMs)||60000)/1000)+" s para no congelar el reporte. «Reintentar análisis» le da más tiempo."};
  return{s:"unk",err:true,t,d:dProvider};
}
async function inspect(token,onPartial){
  if(window.PBSellSim&&window.PBSellSim.resetUsage)window.PBSellSim.resetUsage();
  const dbP=creatorDB();
  const checks=[];const facts={};const notChecked=[];let cat="Mercado";const add=o=>{if(o)checks.push({c:cat,src:o.src||SRC[cat],...o});};
  let scanBlock=null;rpc("eth_blockNumber",[]).then(b=>{scanBlock=parseInt(b,16);}).catch(()=>{});const scannedAt=Date.now();
  // Market data
  let pair=null,pairsFound=0,allPairs=[],liqUsd=null,gtPools=null,marketInconsistent=false;
  // All pools of the token on GeckoTerminal (DexScreener can miss some), and the verified source, in parallel.
  const gtP=timed(GTN+"tokens/"+token+"/pools?page=1",{},12000).then(j=>PBRisk.poolsFromGT(j,token)).catch(()=>null);
  const srcP=window.PBCreator&&window.PBCreator.contractSource?window.PBCreator.contractSource(token).catch(()=>null):Promise.resolve(null);
  try{
    const pairs=await timed(DEX+token);
    if(Array.isArray(pairs)&&pairs.length){pairsFound=pairs.length;allPairs=pairs;pair=pairs.slice().sort((a,b)=>(b.liquidity?.usd||0)-(a.liquidity?.usd||0))[0];}
  }catch(e){add({s:"unk",err:true,t:"Datos de mercado no disponibles",d:"No se pudo consultar DexScreener desde este navegador."});}
  // The explorer section (creator, liquidity, snipers, holders) is the slowest part and only needs the
  // pair: start it now so it runs while the sale is simulated and the contract is read.
  const exBudget=nextExplorerBudget||(window.PBCreator&&window.PBCreator.BUDGET_MS)||60000;nextExplorerBudget=0;
  let crP=null;if(window.PBCreator){crP=window.PBCreator.analyze(token,pair,allPairs,{budgetMs:exBudget});crP.catch(()=>{});}
  if(pair){
    const liq=pair.liquidity?.usd;liqUsd=liq||null;const fdv=pair.fdv??pair.marketCap,ageH=pair.pairCreatedAt?(Date.now()-pair.pairCreatedAt)/3.6e6:null;
    const h24=pair.txns?.h24||{}, h1=pair.txns?.h1||{};
    facts.name=(pair.baseToken?.name||"")+(pair.baseToken?.symbol?" ("+pair.baseToken.symbol+")":"");
    const pc=pair.priceChange||{}, vol=pair.volume||{};
    const socials=(pair.info?.socials||[]).length, sites=(pair.info?.websites||[]).length;
    Object.assign(facts,{Precio:usd(Number(pair.priceUsd)),Liquidez:usd(liq),"Valor total (FDV)":usd(fdv),"Capitalización":usd(pair.marketCap),
      "Edad del par":ageH==null?"—":ageH<48?ageH.toFixed(1)+" h":(ageH/24).toFixed(1)+" días",
      "Volumen 1 h / 24 h":usd(vol.h1)+" / "+usd(vol.h24),
      "Compras / ventas 1 h":num(h1.buys)+" / "+num(h1.sells),"Compras / ventas 24 h":num(h24.buys)+" / "+num(h24.sells),
      "Cambio 1 h / 6 h / 24 h":pct(pc.h1)+" · "+pct(pc.h6)+" · "+pct(pc.h24),
      "Web y redes":sites+socials?(sites?"web":"")+(sites&&socials?" + ":"")+(socials?socials+" red(es)":""):"ninguna",
      "Pares encontrados":num(pairsFound),
      DEX:(pair.dexId||"—")+(pair.labels?.length?" "+pair.labels.join(","):"")});
    facts.url=pair.url;facts._pair=pair.pairAddress;
    if(liq==null)add({s:"unk",t:"Liquidez desconocida",d:"El par no reporta liquidez."});
    else if(liq<5000)add({s:"high",t:"Liquidez muy baja",d:usd(liq)+": una venta pequeña mueve mucho el precio y es fácil de manipular."});
    else if(liq<25000)add({s:"warn",t:"Liquidez baja",d:usd(liq)+": el deslizamiento puede ser alto."});
    else add({s:"ok",t:"Liquidez aceptable",d:usd(liq)+" en el par principal."});
    if(liq&&fdv&&fdv/liq>50)add({s:"warn",t:"Valoración muy alta frente a la liquidez",d:"El FDV es "+Math.round(fdv/liq)+" veces la liquidez: el precio de pantalla no se puede realizar en tamaño."});
    if(pc.h1!=null&&pc.h1<=-50)add({s:"high",t:"Caída fuerte en la última hora",d:"El precio cayó "+pct(pc.h1)+" en 1 h: puede ser una salida masiva o un rug en curso."});
    else if(pc.h24!=null&&pc.h24<=-70)add({s:"warn",t:"Caída fuerte en 24 h",d:"El precio cayó "+pct(pc.h24)+" en 24 h."});
    if(liq&&vol.h24&&vol.h24/liq>20)add({s:"warn",t:"Volumen inusualmente alto frente a la liquidez",d:"Volumen de 24 h "+Math.round(vol.h24/liq)+" veces la liquidez: puede ser volumen inflado entre wallets del mismo dueño."});
    if(!socials&&!sites)add({s:"warn",t:"Sin web ni redes sociales registradas",d:"DexScreener no tiene web ni redes de este token. Los proyectos serios casi siempre las publican."});
    if(ageH!=null&&ageH<1)add({s:"warn",t:"Token recién creado",d:"Menos de 1 hora de vida: la mayoría de estafas ocurren en las primeras horas."});
    gtPools=await gtP;
    const gtMain=gtPools&&gtPools.find(p=>p.pool===String(pair.pairAddress).toLowerCase());
    // Fake volume on the main pair (DexScreener counts) or on any pool (GeckoTerminal counts, with unique traders).
    let fake=PBRisk.fakeVolume(vol.h24,h24.buys,h24.sells,gtMain?(gtMain.buyers||0)+(gtMain.sellers||0):null,"par principal");
    if(!fake&&gtPools)for(const gp of gtPools.slice().sort((a,b)=>(b.vol24||0)-(a.vol24||0))){const f=PBRisk.fakeVolume(gp.vol24,gp.buys,gp.sells,(gp.buyers||0)+(gp.sellers||0),gp.name);if(f){fake=f;fake.src="GeckoTerminal (todos los pools del token)";break;}}
    if(fake)add(fake);
    // Every pool together (GeckoTerminal): totals and risky secondary pools.
    let hollowHigh=false;
    if(gtPools&&gtPools.length){
      const mp=PBRisk.multiPool(gtPools,pair.pairAddress);
      facts["Pools del token"]=num(mp.n)+" · liquidez total "+usd(mp.totalLiq)+" · volumen 24 h "+usd(mp.totalVol);
      mp.findings.forEach(add);hollowHigh=mp.findings.some(f=>f.s==="high"&&/^Volumen sin liquidez/.test(f.t));
    }
    if((h24.buys||0)>=20&&(h24.sells||0)===0)add({s:"high",t:"Nadie ha vendido",d:num(h24.buys)+" compras y 0 ventas en 24 h: señal clásica de token que no deja vender (honeypot)."});
    else if((h24.buys||0)>0&&(h24.sells||0)/(h24.buys||1)<0.15)add({s:"warn",t:"Muy pocas ventas",d:"Solo "+num(h24.sells)+" ventas frente a "+num(h24.buys)+" compras en 24 h."});
    else if((h24.sells||0)>0&&((fake&&fake.s==="high")||hollowHigh))add({s:"unk",t:"Ventas no confiables",d:"El par reporta "+num(h24.sells)+" ventas, pero el volumen del token es anómalo: no sirven como prueba de que se pueda vender."});
    else if((h24.sells||0)>0)add({s:"ok",t:"Hay ventas de otros usuarios",d:num(h24.sells)+" ventas en 24 h. Que otros vendan no garantiza que tú puedas."});
    // Two independent sources must roughly agree.
    const mm=gtPools?PBRisk.sourceMismatch({liq:liq==null?null:liq,price:Number(pair.priceUsd)||null},{liq:gtMain?gtMain.liq:null,price:gtMain?gtMain.price:null,poolFound:!!gtMain}):null;
    if(mm){add(mm);marketInconsistent=true;
      const la=checks.find(c=>c.t==="Liquidez aceptable");if(la){la.s="unk";la.t="Liquidez no confirmada";la.d="DexScreener reporta "+usd(liq)+", pero GeckoTerminal no lo confirma: no cuentes con esa liquidez para vender.";}}
  }else if(!checks.length){add({s:"high",t:"Sin mercado en DexScreener",d:"No hay pares de este token en Robinhood Chain: no se puede comprar ni vender de forma normal."});}

  if(onPartial&&pair){try{onPartial({pair,facts,pairs:allPairs});}catch(e){}}
  // Sell simulation: buy 0.01 ETH -> approve -> sell everything, in one simulated block
  let simDone=false,simR=null,simSizes=null,saleCap=null,saleCapFinding=null;cat="Venta";step("Simulando compra y venta…");
  const ethWei=eth=>(BigInt(Math.round(eth*1e6))*10n**12n).toString();
  if(pair&&window.PBSellSim){
    let r=await window.PBSellSim.simulate(token,pair);simR=r;
    // Time-based locks: the same round trip with the sale one hour later (second simulated block).
    let later=null;
    if(r.status==="round_trip_ok"||r.status==="sell_failed"){try{later=await window.PBSellSim.simulate(token,pair,{delaySec:3600,block:r.block});}catch(e){later=null;}}
    if(r.status==="sell_failed"&&later&&later.status==="round_trip_ok"){
      simDone=true;
      add({s:"warn",t:"No deja vender en el mismo bloque de la compra",d:"Comprar y vender en el mismo bloque falla, pero vender 1 hora después funciona (recuperas "+Math.round(later.retention*1000)/10+" %). Es una protección anti-bots (cooldown), no un bloqueo permanente."});
      r=Object.assign({},later,{sameBlockFailed:true});simR=r;
    }
    const keep=r.retention!=null?Math.round(r.retention*1000)/10:null;
    let okFinding=null;
    if(r.status==="round_trip_ok"){
      simDone=true;
      facts["Venta simulada (0.01 ETH)"]="recuperas "+keep+" %";
      if(keep<70)add({s:"high",t:"Pérdida muy alta al vender",d:"En la simulación recuperarías solo "+keep+" % de lo invertido (comisiones, impacto e impuestos del token). Posible impuesto de venta abusivo."});
      else if(keep<90)add({s:"warn",t:"Pérdida alta al vender",d:"En la simulación recuperarías "+keep+" % de lo invertido: puede haber un impuesto de venta o poca liquidez."});
      else{const nv=checks.find(c=>c.t==="Nadie ha vendido");if(nv){nv.s="warn";nv.d+=" Aun así, la simulación sí pudo vender: no parece un bloqueo del contrato.";}
        okFinding={s:"ok",t:"La venta simulada funciona",d:"Simulamos comprar con 0.01 ETH y vender todo: recuperarías "+keep+" % (incluye comisiones e impacto). No garantiza que siga así."};add(okFinding);}
      if(later&&later.status==="sell_failed"&&!r.sameBlockFailed)add({s:"high",t:"La venta falla si esperas",d:"Vender justo después de comprar funciona, pero la misma venta 1 hora después falla en la simulación: el contrato bloquea ventas con el tiempo."});
    }else if(r.status==="sell_failed"){simDone=true;add({s:"high",t:"La venta simulada falla",d:"Se pudo comprar pero no vender en la simulación, ni en el mismo bloque ni 1 hora después: señal fuerte de honeypot."});}
    else if(r.status==="hook_restricted")add({s:"warn",t:"Solo se puede operar desde su propio router",d:"El hook del pool rechaza compras desde los routers estándar de Uniswap; las compras reales pasan por un contrato propio de la plataforma. No pudimos simular la venta y dependes de esa plataforma para vender."});
    else if(r.status==="buy_failed")add({s:"warn",t:"No se pudo simular la compra",d:r.detail||"La compra simulada falló."});
    else add({s:"unk",t:"Venta no simulada",d:r.detail||"Simulación no disponible para este par."});
    if(r.status==="round_trip_ok"){
      step("Simulando montos mayores…");
      const opt=Object.assign({block:r.block},r.sameBlockFailed?{delaySec:3600}:{});   // every size on the same block
      // Price impact = how many fewer tokens each ETH buys at a larger size (a quick round trip hides it).
      simSizes=[{eth:0.01,status:r.status,ret:r.retention,bought:r.boughtRaw?Number(BigInt(r.boughtRaw)/10n**6n):null,boughtRaw:r.boughtRaw,impact:0}];
      for(const eth of [0.1,0.5]){
        try{const x=await window.PBSellSim.simulate(token,pair,Object.assign({buyWei:ethWei(eth)},opt));
          const bought=x.boughtRaw?Number(BigInt(x.boughtRaw)/10n**6n):null;const ref=simSizes[0].bought;
          simSizes.push({eth,status:x.status,ret:x.retention,bought,boughtRaw:x.boughtRaw,revert:x.revert,impact:bought&&ref?Math.max(0,1-(bought/eth)/(ref/0.01)):null});}
        catch(e){simSizes.push({eth,status:"unknown",ret:null,impact:null});}
      }
      const fails=simSizes.filter(x=>x.status==="sell_failed"||x.status==="buy_failed");
      if(fails.length){
        // Largest amount that still sells: binary search between the last size that worked and the first that failed.
        step("Buscando el monto máximo vendible…");
        let lo=simSizes.filter(x=>x.status==="round_trip_ok").reduce((m,x)=>Math.max(m,x.eth),0.01),hi=fails[0].eth,best={eth:lo,boughtRaw:simSizes.find(x=>x.eth===lo).boughtRaw};
        for(let i=0;i<6&&hi/lo>1.15;i++){
          const mid=Math.round(Math.sqrt(lo*hi)*1e4)/1e4;
          let x=null;try{x=await window.PBSellSim.simulate(token,pair,Object.assign({buyWei:ethWei(mid)},opt));}catch(e){}
          if(x&&x.status==="round_trip_ok"){lo=mid;best={eth:mid,boughtRaw:x.boughtRaw};}else if(x&&(x.status==="sell_failed"||x.status==="buy_failed")){hi=mid;fails[0].revert=fails[0].revert||x.revert;}else break;
        }
        const dec=await uintCall(token,"0x313ce567").then(Number).catch(()=>18);
        const tokens=best.boughtRaw?Number(BigInt(best.boughtRaw)/10n**BigInt(Math.max(0,dec-2)))/100:null;
        saleCap={eth:best.eth,tokens:tokens==null?null:num(Math.round(tokens)),boughtRaw:best.boughtRaw,failRaw:fails[0].boughtRaw,revert:fails[0].revert,failStatus:fails[0].status};
        if(okFinding)checks.splice(checks.indexOf(okFinding),1);      // one clear finding instead of "works" + "fails"
        saleCapFinding=PBRisk.saleSummary(simSizes,saleCap);if(saleCapFinding)add(saleCapFinding);
        facts["Monto máximo vendible"]="~"+best.eth+" ETH"+(saleCap.tokens?" ("+saleCap.tokens+" tokens)":"");
      }else{const big=simSizes[2];
        if(big&&big.impact!=null&&big.impact>=0.15)add({s:"warn",t:"Mucho impacto de precio en compras grandes",d:"Comprando "+big.eth+" ETH pagarías cada token "+(big.impact*100).toFixed(1)+" % más caro que con una compra pequeña: la liquidez es poca para ese monto."});}
    }
    if(r.hooks&&!/^0x0+$/.test(r.hooks))add({s:"warn",t:"El pool V4 tiene un hook",d:"Código extra en el pool ("+short(r.hooks)+") que puede cambiar comisiones o reglas de compra y venta."});
  }
  // Recent trades: top winners and coordinated buying
  let tr=null;cat="Mercado";step("Revisando operaciones recientes…");
  if(pair&&pair.pairAddress){
    try{
      tr=await traders(pair.pairAddress);
      const young=pair.pairCreatedAt&&(Date.now()-pair.pairCreatedAt)<72*3.6e6;   // bundles matter at launch
      if(!young){tr.clone=[];tr.sameBlock=0;}
      const GTs="GeckoTerminal (últimas operaciones)";
      if(tr.wash)add({s:"warn",src:GTs,t:"Posible volumen inflado (wash trading)",d:tr.wash});
      if(tr.clone.length)add({s:"high",src:GTs,t:"Varias wallets compraron exactamente lo mismo",d:tr.clone.length+" wallets distintas compraron ~"+usd(tr.clone[0].v)+" cada una: típico de un grupo coordinado o del propio creador (bundle) que luego vende a la gente."});
      if(tr.sameBlock>=3)add({s:"warn",src:GTs,t:"Compras de varias wallets en el mismo bloque",d:tr.sameBlock+" wallets compraron en el mismo bloque: posibles bots o compras coordinadas."});
      if(tr.sellShare!=null&&tr.sellShare>0.5&&tr.topSeller.sold>500)add({s:"warn",src:GTs,t:"Una sola wallet domina las ventas",d:short(tr.topSeller.addr)+" hizo "+Math.round(tr.sellShare*100)+" % del volumen vendido reciente ("+usd(tr.topSeller.sold)+")."});
    }catch(e){notChecked.push("mayores ganadores (historial de operaciones no disponible)");}
  }
  // On-chain contract checks
  cat="Contrato";let owner=null,ctr=null,supplyRaw=null,decimals=18;step("Revisando el contrato…");
  let src=null;try{src=await srcP;}catch(e){}
  try{
    const code=await rpc("eth_getCode",[token,"latest"]);
    if(!code||code==="0x"){add({s:"high",t:"No hay contrato en esa dirección",d:"La dirección no tiene código en Robinhood Chain."});}
    else{
      facts["Tamaño del contrato"]=num((code.length-2)/2)+" bytes";
      ctr=await PBContract.analyze(token,code,rpc);
      const P=ctr.proxy;
      if(P){
        if(P.kind==="eip1167")add({s:"ok",t:"Clon de un contrato base (EIP-1167)",d:"El token es una copia mínima de "+short(P.impl)+": no es actualizable. Revisamos también el código de ese contrato base."});
        else{const kind={eip1967:"EIP-1967",beacon:"beacon",zos:"ZeppelinOS",diamond:"diamond EIP-2535"}[P.kind];
          add({s:"warn",t:"Contrato actualizable (proxy "+kind+")",d:"Quien controla el proxy puede cambiar las reglas del token."+(P.impl?" Implementación: "+P.impl+".":"")+(P.beacon?" Beacon: "+P.beacon+".":"")+(P.facets?" Facetas: "+P.facets.length+".":"")+(ctr.admin?" Administrador del proxy: "+ctr.admin+".":"")});}
      }
      owner=ctr.owner;
      const renounced=owner!==null&&PBContract.isZeroAddr(owner);
      // Risky functions: bytecode selectors (wide list) + verified ABI names when the source is published.
      const abiRisk=src?PBContract.riskyFromAbi(src.abi):{};
      const cats=[...new Set([...ctr.risky,...Object.keys(abiRisk)])];
      if(src){facts["Código verificado"]="sí"+(src.name?" ("+src.name+")":"");}else facts["Código verificado"]="no";
      const via=k=>abiRisk[k]?"Función "+abiRisk[k].slice(0,3).join(", ")+" en el código verificado":"Función detectada en el código del contrato (búsqueda por huella; puede haber falsos positivos)";
      let admins=null;
      if(owner===null&&ctr.roles&&ctr.roles.admins&&ctr.roles.admins.length)admins=ctr.roles.admins;
      const abiAdmin=src&&src.abi.some(f=>f&&f.type==="function"&&/^(owner|getOwner|admin|transferOwnership|renounceOwnership|setOwner|changeOwner|setAdmin|changeAdmin|grantRole|hasRole|upgradeTo|upgradeToAndCall)$/i.test(f.name||""));
      if(owner===null&&!ctr.roles&&src&&!abiAdmin&&!P)add({s:"ok",t:"Sin dueño ni administradores",d:"El código verificado no tiene funciones de dueño, roles ni actualización: nadie puede cambiar las reglas del token después del lanzamiento."});
      else if(owner===null&&!ctr.roles)add({s:"unk",t:"Dueño del contrato no identificado",d:"El contrato no expone owner(), getOwner() ni admin(), y no usa roles estándar (AccessControl)."+(src?" Revisa el código verificado.":"")});
      else if(owner===null&&admins)add({s:cats.length?"high":"warn",t:"El contrato tiene administradores (roles)",d:"Usa AccessControl: "+admins.map(short).join(", ")+(ctr.roles.count>admins.length?" y "+(ctr.roles.count-admins.length)+" más":"")+" tienen el rol de administrador."+(cats.length?" Combinado con las funciones de abajo, pueden cambiar las reglas.":"")});
      else if(owner===null)ctr.rolesPending=true;      // resolved with the creator below
      else if(renounced)add({s:"ok",t:"Propiedad renunciada",d:(ctr.ownerVia||"owner()")+" es la dirección cero."+(ctr.roles?" Ojo: el contrato también usa roles; pueden seguir activos.":" Ojo: otros roles pueden seguir activos.")});
      else add({s:cats.length?"high":"warn",t:"El contrato tiene dueño activo",d:"Dueño ("+(ctr.ownerVia||"owner()")+"): "+owner+(cats.length?". Combinado con las funciones de abajo, puede cambiar las reglas.":".")});
      try{
        supplyRaw=await uintCall(token,"0x18160ddd");
        try{decimals=Number(await uintCall(token,"0x313ce567"));}catch(e){}
        facts["Suministro total"]=num(Number(supplyRaw/10n**BigInt(Math.max(0,decimals-2)))/100);
        if(owner&&!renounced){
          const ob=share(await uintCall(token,"0x70a08231"+word(owner)),supplyRaw);
          facts["En manos del dueño"]=ob==null?"—":ob+" %";
          if(ob!=null&&ob>20)add({s:"high",t:"El dueño tiene mucho del suministro",d:"El dueño guarda "+ob+" % de todos los tokens: puede venderlos de golpe."});
          else if(ob!=null&&ob>5)add({s:"warn",t:"El dueño guarda una parte importante",d:ob+" % del suministro está en la wallet del dueño."});
        }
        // Share of the supply in pools: V4 pools all live in the PoolManager; V2/V3 pools hold their own tokens.
        const poolAddrs=[...new Set([...(allPairs||[]).map(p=>String(p.pairAddress).toLowerCase()),...((gtPools||[]).map(p=>p.pool))].filter(a=>/^0x[0-9a-f]{40}$/.test(a)))].slice(0,15);
        const hasV4=[...(allPairs||[]).map(p=>String(p.pairAddress)),...((gtPools||[]).map(p=>p.pool))].some(a=>/^0x[0-9a-fA-F]{64}$/.test(a));
        let inPools=0n;
        for(const a of [...poolAddrs,...(hasV4?[V4_POOL_MANAGER]:[])]){try{inPools+=await uintCall(token,"0x70a08231"+word(a));}catch(e){}}
        const pp=share(inPools,supplyRaw);
        if(pp!=null){facts["En los pools"]=pp+" %";const fdv=pair?(pair.fdv??pair.marketCap):null;const f=PBRisk.poolSupply(pp,fdv);if(f)add(f);}
      }catch(e){notChecked.push("suministro y tokens del dueño");}
      // Declared taxes and limits (common getters), checked against the simulation.
      const T=ctr.taxes;
      if(T.buy!=null||T.sell!=null){
        facts["Impuesto declarado (compra / venta)"]=(T.buy==null?"—":T.buy+" %")+" / "+(T.sell==null?"—":T.sell+" %");
        const mx=Math.max(T.buy||0,T.sell||0);
        if(mx>=25)add({s:"high",t:"Impuesto declarado muy alto: "+mx+" %",d:"El contrato declara compra "+(T.buy??"—")+" % y venta "+(T.sell??"—")+" %. Parte de cada operación se la queda el contrato."});
        else if(mx>=10)add({s:"warn",t:"Impuesto declarado alto: "+mx+" %",d:"El contrato declara compra "+(T.buy??"—")+" % y venta "+(T.sell??"—")+" %."});
      }
      const L=ctr.limits,tk=v=>supplyRaw&&v?Math.round(Number(BigInt(v)*10000n/supplyRaw))/100+" % del suministro":null;
      if(L.maxTx)facts["Máximo por operación"]=tk(L.maxTx)||"—";
      if(L.maxWallet)facts["Máximo por wallet"]=tk(L.maxWallet)||"—";
      if(cats.length)cats.forEach(k=>add({s:renounced?"warn":"high",t:PBContract.RISKY[k].label,d:renounced?via(k)+", aunque la propiedad está renunciada.":via(k)+"."}));
      else add({s:"ok",t:"Sin funciones peligrosas comunes",d:"No se encontraron mint, lista negra, cambio de comisiones, pausa, límites ni cambio de saldos"+(src?" en el código verificado ni":"")+" entre las variantes conocidas."});
    }
  }catch(e){add({s:"unk",err:true,t:"Contrato no revisado",d:"No se pudo consultar la cadena desde este navegador. Prueba de nuevo más tarde."});}
  // Why large sales fail: the contract's own error name (verified ABI) or its declared limits.
  if(saleCapFinding&&saleCap){
    let cause=null;const errs=src&&window.PBCreator?PBContract.errorNames(src.abi,window.PBCreator.keccak):{};
    const sel=saleCap.revert&&/^0x[0-9a-f]{8}/i.test(saleCap.revert)?saleCap.revert.slice(2,10).toLowerCase():null;
    if(sel&&errs[sel])cause="el contrato rechaza con «"+errs[sel]+"»";
    else if(ctr&&ctr.limits&&saleCap.failRaw){const f=BigInt(saleCap.failRaw),L=ctr.limits;
      if(L.maxTx&&f>BigInt(L.maxTx))cause="límite por operación del contrato (máximo "+num(Math.round(Number(BigInt(L.maxTx)/10n**BigInt(Math.max(0,decimals-2)))/100))+" tokens)";
      else if(L.maxWallet&&f>BigInt(L.maxWallet))cause="límite por wallet del contrato (máximo "+num(Math.round(Number(BigInt(L.maxWallet)/10n**BigInt(Math.max(0,decimals-2)))/100))+" tokens)";}
    if(!cause&&saleCap.failStatus==="sell_failed")cause="no es deslizamiento (la simulación acepta cualquier precio): el contrato o el pool rechaza la venta grande";
    if(cause)saleCapFinding.d+=" Causa probable: "+cause+".";
  }
  if(!simDone)notChecked.push("si se puede vender (simulación no disponible para este par)");
  // Preliminary result while the explorer part (the slow one) finishes.
  if(onPartial&&pair){try{onPartial({pair,facts,pairs:allPairs,checks:checks.slice(),prelim:true});}catch(e){}}
  // Creator, liquidity control and holders (explorer data)
  let DBC=null;try{DBC=await dbP;}catch(e){}
  let cr=null;step("Revisando creador, liquidez, snipers y holders (hasta "+Math.round(exBudget/1000)+" s)…");
  if(crP){try{cr=await crP;}catch(e){cr=null;}}
  cat="Creador y liquidez";
  if(!cr||!cr.creator){add({s:"unk",t:"Creador no identificado",d:"El explorador de Robinhood Chain no respondió o no tiene el origen de este contrato."});}
  else{
    const D=cr.creator.deployer,rep=cr.rep;
    if(rep){
      const others=rep.others,dead=rep.dead,known=rep.dead+rep.alive;
      const K=DBC&&DBC.creators&&DBC.creators[D];
      const kd=K?K[1]:0,ka=K?K[2]:0,kk=kd+ka;
      if(K&&K[7]===1){
        add({s:"unk",t:"Lanzado desde una plataforma",d:short(D)+" es la wallet de una plataforma de lanzamiento (miles de transacciones), no de una persona: su historial no dice nada de este token en particular."});
      }else if(K&&(kk>known||K[0]-1>others)){
        add(dbCreatorCheck(K,DBC,cr.creator.createdAt));
      }else{
        if(others===0&&rep.truncated)add({s:"unk",t:"Historial del creador incompleto",d:short(D)+" tiene muchas transacciones; en las últimas "+rep.txCount+" no encontramos otros tokens, pero no revisamos las anteriores."});
        else if(others===0&&rep.nonce!=null&&rep.nonce>=50)add({s:"unk",t:"Wallet con actividad previa: revisar",d:short(D)+" no creó otros tokens, pero ya había enviado "+num(rep.nonce)+" transacciones: no es una wallet nueva y limpia. Revisa en el explorador qué hizo antes."});
        else if(others===0)add({s:"ok",t:"No lanzó otros tokens",d:"No encontramos otros tokens creados por "+short(D)+" en todo su historial ("+rep.txCount+" transacciones)."});
        else if(known>=3&&dead/known>=0.7)add({s:"high",t:"El creador lanzó "+others+" tokens y "+dead+" murieron",d:"De los que pudimos revisar, "+dead+" de "+known+" ya no tienen liquidez (menos de $1,000). Patrón típico de quien lanza tokens en serie y los abandona."});
        else if(dead>0)add({s:"warn",t:dead===1?"El creador tiene 1 token muerto":"El creador tiene "+dead+" tokens muertos",d:"Lanzó "+others+(others===1?" token":" tokens")+" además de este; "+dead+" de "+known+(known===1?" revisado ya no tiene":" revisados ya no tienen")+" liquidez."});
        else add({s:"ok",t:"Los otros tokens del creador siguen vivos",d:"Lanzó "+others+(others===1?" token":" tokens")+" más; ninguno de los revisados está abandonado."});
      }
      if(pair&&pair.pairCreatedAt&&Date.now()-pair.pairCreatedAt<72*3.6e6&&rep.firstSeen&&cr.creator.createdAt&&cr.creator.createdAt-rep.firstSeen<24*3.6e6)add({s:"warn",t:"Wallet del creador recién creada",d:"Su primera transacción fue menos de 24 h antes de crear el token: típico de wallets desechables."});
      facts["Creador"]=short(D);
      if(K)facts["En la base de PreBuyScan"]=K[0]+" tokens · "+kd+" muertos"+(K[3]?" · "+K[3]+" pendientes":"");
      if(rep.funder)facts["Fondeado por"]=short(rep.funder)+(rep.fundEth!=null?" ("+rep.fundEth+" ETH)":"");
    }else{
      const K=DBC&&DBC.creators&&DBC.creators[D];
      if(K&&K[7]===1)add({s:"unk",t:"Lanzado desde una plataforma",d:short(D)+" es la wallet de una plataforma de lanzamiento, no de una persona."});
      else if(K){add(dbCreatorCheck(K,DBC,cr.creator.createdAt));facts["Creador"]=short(D);facts["En la base de PreBuyScan"]=K[0]+" tokens · "+K[1]+" muertos";}
      else add(explorerMiss(cr,"reputation","Historial del creador no disponible","No se pudo consultar el historial de "+short(D)+"."));
    }
    const lp=cr.lp;
    if(!lp&&!pair){}            // no market: there is no pool whose liquidity could be checked
    else if(!lp)add(explorerMiss(cr,"lp","Control de la liquidez no revisado","No se pudo consultar quién tiene la liquidez del par."));
    else if(lp.kind==="v2"){
      if(lp.creatorShare>=50)add({s:"high",t:"El creador puede retirar la liquidez",d:"Tiene "+lp.creatorShare.toFixed(1)+" % de los tokens LP del par en su wallet, sin bloqueo: puede sacar la liquidez cuando quiera (rug pull)."});
      else if(lp.burned>=90)add({s:"ok",t:"Liquidez quemada",d:lp.burned.toFixed(1)+" % de los tokens LP están en una dirección de quemado: nadie puede retirarla."});
      else if(lp.eoaTop>=50)add({s:"high",t:"Una wallet puede retirar la liquidez",d:"Una sola wallet tiene "+lp.eoaTop.toFixed(1)+" % de los tokens LP, sin bloqueo."});
      else if(lp.contractShare>=50)add(lp.lockUntil?{s:lockState(lp.lockUntil),t:lp.lockUntil*1000<Date.now()?"El bloqueo de la liquidez ya venció":"Liquidez bloqueada",d:lp.contractShare.toFixed(1)+" % de los tokens LP está en "+short(lp.lockAddr)+"."+lockTxt(lp.lockUntil)+(lp.lockUntil*1000<Date.now()?" Ya se puede retirar.":"")}:{s:"unk",t:"Liquidez en un contrato",d:lp.contractShare.toFixed(1)+" % de los tokens LP está en un contrato (posible bloqueo). No pudimos leer hasta cuándo."});
      else add({s:"warn",t:"Liquidez repartida sin bloqueo claro",d:"Quemada "+lp.burned.toFixed(1)+" %, del creador "+lp.creatorShare.toFixed(1)+" %. Parte puede retirarse."});
    }else{
      if(lp.creatorShare!=null&&lp.creatorShare>=50||lp.creatorHasPosition)add({s:"high",t:"El creador puede retirar la liquidez",d:"Su wallet tiene la posición de liquidez del pool"+(lp.creatorShare!=null?" ("+lp.creatorShare.toFixed(0)+" % de la liquidez activa)":"")+", sin bloqueo: puede sacarla cuando quiera (rug pull)."});
      else if(lp.creatorShare>=10)add({s:"warn",t:"El creador controla parte de la liquidez",d:"Su wallet tiene "+lp.creatorShare.toFixed(1)+" % de la liquidez activa del pool."});
      else if(lp.top&&lp.top.length){
        const o=lp.top[0],nm=o.name?" ("+o.name+")":"";
        if(o.kind==="burn")add({s:"ok",t:"Liquidez quemada",d:o.pct+" % de la liquidez del pool está en una dirección de quemado."});
        else if(o.creator&&o.pct>=50)add({s:"high",t:"El creador puede retirar la liquidez",d:"Aportó "+o.pct+" % de la liquidez del pool y la controla desde su wallet."});
        else if(o.kind==="wallet"&&o.pct>=50)add({s:"high",t:"Una wallet controla la liquidez",d:short(o.addr)+" controla "+o.pct+" % de la liquidez del pool, sin bloqueo: puede retirarla cuando quiera."});
        else if((o.kind==="locker"||o.kind==="contract")&&o.pct>=50&&o.lockUntil)add({s:lockState(o.lockUntil),t:o.lockUntil*1000<Date.now()?"El bloqueo de la liquidez ya venció":"Liquidez bloqueada",d:o.pct+" % de la liquidez (posición Uniswap "+lp.kind.toUpperCase()+") está en "+short(o.addr)+nm+"."+lockTxt(o.lockUntil)+(o.lockUntil*1000<Date.now()?" Ya se puede retirar.":"")});
        else if(o.kind==="locker"&&o.pct>=50)add({s:"ok",t:"Liquidez en un contrato de bloqueo",d:o.pct+" % de la liquidez está en "+short(o.addr)+nm+". No pudimos leer hasta cuándo."});
        else if(o.kind==="contract"&&o.pct>=50)add({s:"unk",t:"Liquidez en un contrato",d:o.pct+" % de la liquidez está en "+short(o.addr)+nm+". No sabemos si está bloqueada ni quién lo controla."});
        else add({s:"warn",t:"Liquidez repartida",d:"El mayor proveedor ("+short(o.addr)+nm+", "+(o.kind==="wallet"?"wallet":"contrato")+") tiene "+o.pct+" %. Parte puede retirarse."});
      }
      else add({s:"unk",t:"No sabemos quién tiene la liquidez",d:"El creador no tiene posiciones en este pool ("+lp.kind.toUpperCase()+"), pero no pudimos verificar si el resto está bloqueado."});
    }
    if(ctr&&ctr.rolesPending){const ad=await PBContract.adminAmong(token,[D,cr.creator.factory],rpc).catch(()=>[]);ctr.rolesPending=false;const keep=cat;cat="Contrato";
      if(ad.length)add({s:ctr.risky.length?"high":"warn",t:"El contrato tiene administradores (roles)",d:"Usa AccessControl y "+ad.map(a=>a===D?"el creador ("+short(a)+")":short(a)).join(" y ")+" tiene el rol de administrador."});
      else add({s:"unk",t:"Roles de administración sin titular visible",d:"El contrato usa AccessControl pero no lista a sus administradores, y el creador no es uno de ellos. Puede haber otros con permisos."});cat=keep;}
    if(owner===D){}
    else if(cr.creatorPct>20)add({s:"high",t:"El creador guarda mucho del suministro",d:"Su wallet tiene "+cr.creatorPct+" % de los tokens: puede venderlos de golpe."});
    else if(cr.creatorPct>5)add({s:"warn",t:"El creador guarda una parte importante",d:cr.creatorPct+" % del suministro está en su wallet."});
    if(tr&&tr.wallets){const me=tr.wallets.find(w=>w.addr===D);if(me&&me.sold>100)add({s:"warn",t:"El creador ya vendió",d:"Vendió "+usd(Math.round(me.sold))+" en las operaciones recientes del par."});}
  }
  if(ctr&&ctr.rolesPending){const keep=cat;cat="Contrato";add({s:"unk",t:"Roles de administración sin titular visible",d:"El contrato usa AccessControl pero no lista a sus administradores y no pudimos identificar al creador."});cat=keep;}
  cat="Lanzamiento";
  const S=cr&&cr.snipers;
  if(!S){if(cr&&cr.creator&&pair)add(explorerMiss(cr,"snipers","Snipers no revisados","No se pudo consultar quién compró en el lanzamiento."));}
  else if(S.n===0)add({s:"ok",t:"Sin snipers detectados",d:"Nadie más compró en el primer minuto de operaciones."});
  else{
    if(S.held>=20)add({s:"high",t:"Los snipers aún tienen "+S.held+" %",d:S.n+" wallets compraron en el primer minuto y siguen con "+S.held+" % del suministro: pueden vender de golpe."});
    else if(S.held>=8)add({s:"warn",t:"Los snipers tienen "+S.held+" %",d:S.n+" wallets compraron en el primer minuto; todavía guardan "+S.held+" % del suministro."});
    else add({s:"ok",t:"Los snipers ya casi no tienen tokens",d:S.n+" wallets compraron en el primer minuto; hoy tienen "+S.held+" % del suministro."});
    const ew=PBRisk.earlyWhales(S.wallets,cr.creator&&cr.creator.deployer,5);if(ew)add(ew);
    if(S.linked>=1)add({s:"high",t:S.linked===1?"Un comprador del lanzamiento lo fondeó el creador":S.linked+" compradores del lanzamiento los fondeó el creador",d:"Recibieron su ETH del creador o de quien fondeó al creador: es el propio equipo comprando barato (bundle) para vender después."});
    else if(S.shared>=2)add({s:"warn",t:S.shared+" snipers fondeados por la misma wallet",d:"Recibieron su primer ETH del mismo origen: probablemente son de una sola persona."});
  }
  if(tr&&tr.bigSells&&liqUsd){const b=tr.bigSells[0];if(b&&b.v>=0.1*liqUsd&&Date.now()-b.ts<6*3.6e6)add({s:"warn",t:"Venta grande reciente",d:short(b.addr)+" vendió "+usd(Math.round(b.v))+" ("+Math.round(b.v/liqUsd*100)+" % de la liquidez) en las últimas horas."});}
  cat="Holders";
  const H=cr&&cr.holders;
  if(!H||H.top10==null)add(explorerMiss(cr,"holders","Holders no revisados","No se pudo consultar la lista de holders."));
  else{
    if(H.count)facts["Holders"]=num(H.count);
    const big=H.top[0];
    if(H.top10>50)add({s:"high",t:"Muy concentrado: 10 wallets tienen "+H.top10+" %",d:"Sin contar pools ni quemado. Pocas wallets pueden tirar el precio."});
    else if(H.top10>30)add({s:"warn",t:"Concentrado: 10 wallets tienen "+H.top10+" %",d:"Sin contar pools ni quemado."});
    else add({s:"ok",t:"Holders repartidos",d:"Las 10 wallets más grandes tienen "+H.top10+" % (sin pools ni quemado)."});
    const cl=PBRisk.clonedBalances(H.list);if(cl){add(cl.finding);facts["Saldos clonados"]=cl.n+" wallets";
      const hr=checks.find(c=>c.t==="Holders repartidos");if(hr){hr.s="unk";hr.t="Reparto de holders engañoso";hr.d="Las 10 wallets más grandes tienen "+H.top10+" %, pero muchas tienen el mismo saldo: el reparto puede ser de una sola persona.";}}
    if(big&&big.pct>15&&!(cr.creator&&big.addr===cr.creator.deployer))add({s:"warn",t:"Una wallet tiene "+big.pct+" %",d:short(big.addr)+(big.contract?" (contrato"+(big.name?": "+big.name:"")+")":"")+" guarda una parte grande del suministro."});
  }
  const fb=window.PBSellSim&&window.PBSellSim.usage?Object.entries(window.PBSellSim.usage.fallback):[];
  if(fb.length)facts["RPC de respaldo"]=fb.map(([h,n])=>h+" ("+n+" consultas)").join(", ")+": la RPC oficial falló en esas consultas";
  return {checks,facts,notChecked,tr,cr,pairs:allPairs,pair,sim:simR,simSizes,owner,block:scanBlock,scannedAt,algo:ALGO_VERSION,gtPools,marketInconsistent,contract:ctr,rpcFallback:fb};
}

const CATS=["Venta","Contrato","Creador y liquidez","Lanzamiento","Holders","Mercado"];
const lbl={high:"Riesgo alto",warn:"Precaución",ok:"Bien",unk:"Sin datos"};
const order={high:0,warn:1,unk:2,ok:3};
// Honest score: anything we could not check costs points; it never counts as passed.
const {scoreOf,verdictOf,confidenceOf}=window.PBScore; // scoring.js (tested in tests/)
let last=null;
const safeUrl=u=>{try{const x=new URL(u);return x.protocol==="https:"||x.protocol==="http:"?x.href:null;}catch(e){return null;}};
const SOCIAL={twitter:"X / Twitter",telegram:"Telegram",discord:"Discord",tiktok:"TikTok",instagram:"Instagram",youtube:"YouTube",facebook:"Facebook",reddit:"Reddit",github:"GitHub",medium:"Medium"};
// The GeckoTerminal embed is a full app (~300 requests, trackers, heavy JS). It never loads while a
// scan is running, and on phones only when asked, so it cannot slow the analysis or the scrolling.
// Transparent layer over the chart: the mouse wheel scrolls the page; click (or Ctrl + wheel) to use the chart.
const SHIELD=`<div class="chart-shield" role="button" tabindex="0" aria-label="Usar el gráfico"><span>Haz clic o usa Ctrl + rueda para mover el gráfico</span></div>`;
function chartSection(pair,defer){
  if(!pair||!pair.pairAddress)return "";
  const dark=document.documentElement.dataset.theme==="dark"||(!document.documentElement.dataset.theme&&matchMedia("(prefers-color-scheme: dark)").matches);
  const pool=String(pair.pairAddress).toLowerCase();
  if(!/^0x[0-9a-f]{40}([0-9a-f]{24})?$/.test(pool))return "";
  const u="https://www.geckoterminal.com/robinhood/pools/"+pool+"?embed=1&info=0&swaps=0&grayscale=0&light_chart="+(dark?"0":"1");
  if(defer==null)defer=false;
  const frame=`<iframe src="${esc(u)}" loading="eager" title="Gráfico de precio en GeckoTerminal" referrerpolicy="no-referrer" allow="clipboard-write"></iframe>`;
  const body=defer==="scan"?`<div class="chart chart-wait"><span>El gráfico se carga al terminar el análisis.</span></div>`
    :defer?`<div class="chart chart-wait"><button type="button" class="btn2" data-chart="${esc(u)}">Ver gráfico</button></div>`:`<div class="chart">${frame}${SHIELD}</div>`;
  return `<section><h3>Gráfico</h3>${body}
    <div class="tnote">Gráfico en vivo de GeckoTerminal del par principal. <a href="https://www.geckoterminal.com/robinhood/pools/${esc(pool)}" target="_blank" rel="noopener">Abrir en GeckoTerminal</a>${pair.url?` · <a href="${esc(pair.url)}" target="_blank" rel="noopener">DexScreener</a>`:""}.</div></section>`;
}

let lastRes=null;
let stopMarket=()=>{};
const linkFor=t=>location.origin+location.pathname+"?t="+t;
function flash(m){m=uiText(m);const e=$("#out .shmsg");if(!e)return;if(e){e.textContent=m;setTimeout(()=>{if(e.textContent===m)e.textContent="";},3000);}}
async function copyLink(){try{await navigator.clipboard.writeText(linkFor(last.token));flash("Enlace copiado");}catch(e){prompt(uiText("Copia el enlace:"),linkFor(last.token));}}
function cardCanvas(){
  const W=1200,Hh=630,c=document.createElement("canvas");c.width=W;c.height=Hh;const g=c.getContext("2d");
  const fill=(t,...args)=>g.fillText(uiText(t),...args);
  const col={high:"#ff5f6d",warn:"#ffb547",ok:"#27e6a3",unk:"#8ba1ae"}[last.v[0]];
  g.fillStyle="#060b10";g.fillRect(0,0,W,Hh);
  const mk=$(".brand .mark");if(mk&&mk.complete&&mk.naturalWidth)try{g.drawImage(mk,60,42,96,96);}catch(e){}
  g.fillStyle="#e3e9ed";g.font="800 44px Sora, Arial, sans-serif";fill("PreBuy",176,90);
  const pw=g.measureText("PreBuy").width;g.fillStyle="#27e6a3";fill("Scan",176+pw,90);
  g.fillStyle="#93a3ae";g.font="500 26px Manrope, Arial, sans-serif";fill("Scan before the scam · Robinhood Chain",176,130);
  g.fillStyle="#e3e9ed";g.font="700 50px Sora, Arial, sans-serif";
  let name=last.name;while(g.measureText(name).width>760&&name.length>4)name=name.slice(0,-2);if(name!==last.name)name+="…";
  g.fillText(name,60,225);
  g.fillStyle="#93a3ae";g.font="400 24px 'JetBrains Mono', monospace";fill(last.token,60,265);
  g.save();g.translate(1010,200);g.rotate(-0.05);g.strokeStyle=col;g.lineWidth=6;g.strokeRect(-150,-95,300,190);
  g.fillStyle=col;g.textAlign="center";g.font="800 34px Sora, Arial, sans-serif";fill(last.v[1].toUpperCase(),0,-35);
  g.font="800 84px Sora, Arial, sans-serif";fill(String(last.score),0,40);g.font="600 24px Sora, Arial, sans-serif";fill("/100",0,80);g.restore();
  g.textAlign="left";let y=345;
  for(const ck of last.checks.filter(x=>x.s!=="ok").slice(0,4)){
    const cc={high:"#ff5f6d",warn:"#ffb547",unk:"#8ba1ae"}[ck.s];g.fillStyle=cc;g.beginPath();g.arc(72,y-9,9,0,7);g.fill();
    g.fillStyle="#e3e9ed";g.font="500 30px Manrope, Arial, sans-serif";let t=uiText(ck.t);while(g.measureText(t).width>1040&&t.length>4)t=t.slice(0,-2);fill(t,95,y);y+=52;
  }
  if(y===345){g.fillStyle="#27e6a3";g.font="500 30px Manrope, Arial, sans-serif";fill("Sin alertas en las revisiones (no garantiza que sea seguro)",60,y);}
  // Origin proof: report id + SHA-256 of the canonical report (verifiable with the link), analysis date and block.
  const R=lastRes&&lastRes.token===last.token?lastRes.res:null,P=last.proof;
  g.fillStyle="#27e6a3";g.font="600 22px Manrope, Arial, sans-serif";fill("492gueq-gif.github.io/PreBuyScan/?t="+last.token.slice(0,10)+"…"+(P?"&r="+P.id:""),60,572);
  g.fillStyle="#93a3ae";g.font="500 16px 'JetBrains Mono', monospace";
  fill((P?"Reporte "+P.id+" · SHA-256 "+P.hash.slice(0,16)+"… · ":"")+"Analizado "+new Date(R&&R.scannedAt||Date.now()).toLocaleString((globalThis.PBI18N?.locale||"es-MX"),{dateStyle:"medium",timeStyle:"short"})+(R&&R.block?" · bloque "+R.block.toLocaleString((globalThis.PBI18N?.locale||"es-MX")):""),60,606);
  return c;
}
async function ensureProof(){
  if(!last||last.proof||!lastRes||lastRes.token!==last.token||!window.PBShare||!PBScore.isEvaluable(lastRes.res.checks))return;
  try{last.proof=await PBShare.verifiableLink(PBShare.buildReport(lastRes.token,lastRes.res,shareCtx()));}catch(e){}
}
const cardBlob=async()=>{await ensureProof();return new Promise(r=>cardCanvas().toBlob(r,"image/png"));};
async function downloadCard(){const b=await cardBlob();const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="prebuyscan-"+last.token.slice(0,8)+".png";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);flash("Imagen descargada");}
async function shareIt(){
  const text=last.name+": "+last.v[1]+" ("+last.score+"/100) en PreBuyScan. Scan before the scam.";
  try{
    const b=await cardBlob();const f=new File([b],"prebuyscan.png",{type:"image/png"});
    if(navigator.canShare&&navigator.canShare({files:[f]}))await navigator.share({files:[f],text,url:linkFor(last.token)});
    else if(navigator.share)await navigator.share({text,url:linkFor(last.token)});
    else{await navigator.clipboard.writeText(text+" "+linkFor(last.token));flash("Texto y enlace copiados");}
  }catch(e){if(e&&e.name!=="AbortError")copyLink();}
}
// ---------- Smart Share Engine glue ----------
let shareSet=null;
async function ensureQR(){
  if(window.qrcode)return;
  for(const src of ["https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js","https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"]){try{await loadScript(src);if(window.qrcode)return;}catch(e){}}
}
function shareCtx(){const res=lastRes.res;return {score:scoreOf(res.checks),verdict:verdictOf(res.checks)[0],confidence:confidenceOf(res).score,algo:ALGO_VERSION,logoUrl:res.pair&&res.pair.info&&safeUrl(res.pair.info.imageUrl)};}
async function makeCards(btn){
  if(!lastRes||!window.PBShare)return;const box=$("#out .sc-out");const token=lastRes.token;
  if(!PBScore.isEvaluable(lastRes.res.checks)){box.innerHTML=`<div class="empty">Este análisis no tiene ninguna comprobación concluyente: no se genera una tarjeta para compartir. Reintenta el análisis.</div>`;return;}
  if(btn)btn.disabled=true;box.innerHTML=`<div class="busy"><span>Generando las tres tarjetas…</span></div>`;
  try{
    await ensureQR();
    shareSet=await window.PBShare.makeAll(token,lastRes.res,shareCtx());
    if(!current())return;
    const im=(c,alt)=>`<img src="${c.toDataURL("image/png")}" alt="${esc(alt)}" loading="lazy">`;
    const id=shareSet.link.id;
    box.innerHTML=`<div class="sc-grid">
      <figure>${im(shareSet.cards.x,"Tarjeta para X")}<figcaption>X · 1600×900</figcaption></figure>
      <figure>${im(shareSet.cards.telegram,"Tarjeta para Telegram")}<figcaption>Telegram · 1080×1080</figcaption></figure>
      <figure>${im(shareSet.cards.premium,"Reporte premium")}<figcaption>Reporte premium · 1080×1350 · con QR</figcaption></figure></div>
     <div class="sc-actions">
      <button type="button" class="btn2" data-share="x">Compartir en X</button><button type="button" class="btn2" data-share="tg">Compartir en Telegram</button>
      <button type="button" class="btn2" data-share="native">Compartir imagen</button>
      <button type="button" class="btn2" data-dl="x">Descargar PNG (X)</button><button type="button" class="btn2" data-dl="telegram">Descargar PNG (Telegram)</button><button type="button" class="btn2" data-dl="premium">Descargar reporte premium</button><button type="button" class="btn2" data-dl="premium" data-fmt="webp">Premium en WebP</button>
      <button type="button" class="btn2" data-share="copy">Copiar enlace verificable</button><span class="shmsg sc-msg" role="status"></span></div>
     <div class="tnote">Reporte <b>${esc(id)}</b> · SHA-256 <span style="font-family:var(--mono)">${esc(shareSet.link.hash.slice(0,32))}…</span>${shareSet.qr?" · QR de "+shareSet.qr.modules+" módulos":" · QR no disponible"}. X y Telegram no permiten adjuntar una imagen desde un enlace: el botón abre la publicación con el texto y el enlace; descarga la imagen y súbela tú. Nada se publica sin que tú lo envíes.
      El enlace y el QR llevan una copia del reporte: la página recalcula su huella y confirma que no fue alterado. Todavía no hay firma digital (requiere servidor), así que no prueba quién lo generó.</div>`;
  }catch(e){box.innerHTML=`<div class="empty">No se pudieron generar las tarjetas en este navegador.</div>`;if(btn)btn.disabled=false;}
}
function scMsg(m){m=uiText(m);const e=$("#out .sc-msg");if(e){e.textContent=m;setTimeout(()=>{if(e.textContent===m)e.textContent="";},4000);}}
const shareText=()=>{const r=shareSet.rep;const v={high:"Riesgo alto",warn:"Precaución",ok:"Sin alertas",unk:"Sin datos"}[r.vd];return (r.n||r.s||"Token")+(r.s?" ($"+r.s+")":"")+": "+v+" · "+r.sc+"/100 en PreBuyScan (100 = menor riesgo). Reporte "+shareSet.link.id+". Scan before the scam.";};
function dl(kind,fmt){const c=shareSet.cards[kind];const type=fmt==="webp"?"image/webp":"image/png";
  c.toBlob(b=>{if(!b)return scMsg("Tu navegador no pudo exportar la imagen.");const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="prebuyscan-"+kind+"-"+shareSet.link.id+(fmt==="webp"?".webp":".png");document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);scMsg("Descargada");},type,0.95);}
$("#out").addEventListener("click",async e=>{
  const d=e.target.closest("[data-dl]");if(d&&shareSet){dl(d.dataset.dl,d.dataset.fmt);return;}
  const sh=e.target.closest("[data-share]");if(!sh||!shareSet)return;
  const k=sh.dataset.share,url=shareSet.link.url,text=shareText();
  if(k==="x")window.open("https://twitter.com/intent/tweet?text="+encodeURIComponent(text)+"&url="+encodeURIComponent(url),"_blank","noopener");
  else if(k==="tg")window.open("https://t.me/share/url?url="+encodeURIComponent(url)+"&text="+encodeURIComponent(text),"_blank","noopener");
  else if(k==="copy"){try{await navigator.clipboard.writeText(url);scMsg("Enlace verificable copiado");}catch(err){prompt(uiText("Copia el enlace:"),url);}}
  else if(k==="native"){try{const b=await new Promise(r=>shareSet.cards.x.toBlob(r,"image/png"));const f=new File([b],"prebuyscan-"+shareSet.link.id+".png",{type:"image/png"});
    if(navigator.canShare&&navigator.canShare({files:[f]}))await navigator.share({files:[f],text,url});else{dl("x");scMsg("Tu navegador no comparte imágenes: la descargué.");}}catch(err){}}
});
async function showVerification(){
  if(!window.PBShare)return;const v=await window.PBShare.verifyFromLocation(location);if(!v)return;
  const box=$("#verify");const r=v.rep||{};
  const when=r.ts?new Date(r.ts*1000).toLocaleString((globalThis.PBI18N?.locale||"es-MX"),{day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}):"—";
  const vtxt={high:"Riesgo alto",warn:"Precaución",ok:"Sin alertas",unk:"Sin datos"}[r.vd]||"—";
  const ic=a=>a[0]==="confirmed"?["high","✕"]:a[0]==="suspicious"?["warn","!"]:a[0]==="clear"?["ok","✓"]:["unk","?"];
  box.innerHTML=v.ok?`<section class="card verifybox ok"><h3>✓ Reporte verificado <span class="tag ok">${esc(v.id)}</span></h3><div class="tnote" style="font-size:.86rem;padding-top:0">
     El contenido de este enlace coincide con su huella SHA-256 (<span style="font-family:var(--mono)">${esc(v.hash.slice(0,24))}…</span>): no fue alterado desde que se generó.
     Analizado el ${esc(when)}${r.b?" en el bloque "+Number(r.b).toLocaleString((globalThis.PBI18N?.locale||"es-MX")):""} con el algoritmo ${esc(r.al||"")}: <b>${esc(vtxt)} · ${esc(r.sc)}/100</b>, confianza de los datos ${esc(r.cf)} %.
     <br>Sin firma digital todavía: esto prueba que el reporte no cambió, no quién lo generó. Abajo está el análisis actualizado de hoy para comparar.</div>
     <ul class="secrows">${(r.x||[]).map(a=>`<li><i class="s-${ic(a)[0]}">${ic(a)[1]}</i><span class="k">${esc(a[2])}</span><span class="val">${esc(a[1])}</span></li>`).join("")}</ul></section>`
   :`<section class="card verifybox bad"><h3>✕ Reporte no verificado</h3><div class="tnote" style="font-size:.86rem;padding-top:0">${esc(v.reason)} No confíes en la imagen que te compartieron; abajo está el análisis real de hoy.</div></section>`;
}

// Subresource Integrity for every third-party script (hashes computed in CI from the served files).
const SRI={
 "https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js":"sha384-CjloA8y00+1SDAUkjs099PVfnY2KmDC2BZnws9kh8D/lX1s46w6EPhpXdqMfjK6i",
 "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js":"sha384-mZT2gIty7ZDdOGkxfP6joZcYdMW1Jvj9dRlfpTmaJAKKXTqzygtB22k7FLe+KZC1",
 "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js":"sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k"};
function loadScript(src){return new Promise((ok,ko)=>{const s=document.createElement("script");s.src=src;
  const h=SRI[src];if(h&&!/PENDING/.test(h)){s.integrity=h;s.crossOrigin="anonymous";}
  s.onload=ok;s.onerror=ko;document.head.appendChild(s);});}
function mapLoadingHtml(){let dots="",lines="";const pts=[];for(let k=0;k<16;k++){const a=k*2.4,rr=40+((k*37)%140);pts.push([50+Math.cos(a)*rr/3.2,50+Math.sin(a)*rr/4.2]);}
  pts.forEach((p,k)=>{if(k)lines+=`<line class="ml-line" x1="${p[0]}%" y1="${p[1]}%" x2="${pts[(k*7)%k][0]}%" y2="${pts[(k*7)%k][1]}%" stroke="#2a6f96" stroke-opacity=".45"/>`;
    dots+=`<circle class="ml-dot" cx="${p[0]}%" cy="${p[1]}%" r="${3+(k%4)*2}" fill="${window.PBMap?window.PBMap.PALETTE[k%8]:"#27e6a3"}" fill-opacity=".5" style="animation-delay:${(k*0.17).toFixed(2)}s"/>`;});
  return `<div class="maploading"><svg aria-hidden="true">${lines}${dots}</svg><span id="mapmsg">Armando el grafo de wallets (hasta 90 s)…</span></div>`;}
// Start only after the final report is painted; never during inspect().
function autoMap(){
  const box=$("#mapout");
  setTimeout(()=>{
    if(!box||!box.isConnected||$("#mapout")!==box)return;
    const btn=box.closest(".mapsec").querySelector("[data-act=map]");
    if(btn&&!btn.disabled)loadMap(btn);
  },0);
}
async function loadMap(btn){
  if(!lastRes||!btn||btn.disabled)return;const {token,res}=lastRes;const cr=res.cr||{};const box=$("#mapout");
  if(!box||!box.isConnected)return;
  const current=()=>box.isConnected&&$("#mapout")===box&&lastRes&&lastRes.res===res;
  btn.disabled=true;btn.hidden=true;box.innerHTML=mapLoadingHtml();
  try{
    if(!window.d3)await loadScript("https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js");
    if(!current())return;
    const g=await window.PBMap.build(token,{pairs:res.pairs,creator:cr.creator&&cr.creator.deployer,creatorFunder:cr.rep&&cr.rep.funder,snipers:cr.snipers},
      {progress:m=>{const e=box.querySelector("#mapmsg");if(current()&&e)e.textContent=m;}});
    if(!current())return;
    renderMap(g,cr);btn.remove();
  }catch(e){if(!current())return;box.innerHTML=`<div class="busy">No se pudo armar el mapa: el explorador no respondió. Prueba de nuevo en un minuto.</div>`;btn.disabled=false;btn.hidden=false;}
}
function renderMap(g,cr){
  const box=$("#mapout");const P=window.PBMap.PALETTE;const hasCreator=!!(cr&&cr.creator);
  const cg=g.groups.find(x=>x.creator);const other=g.groups.filter(x=>!x.creator&&x.holders>=2).sort((a,b)=>b.pct-a.pct)[0];
  const lines=[];
  if(!hasCreator)lines.push(["unk","Creador no identificado","No podemos ubicar al creador en el mapa."]);
  else if(cg&&cg.holders>=2&&cg.pct>=20)lines.push(["high","El grupo del creador controla "+cg.pct+" %",cg.holders+" wallets ligadas al creador (por fondeo o transferencias) tienen "+cg.pct+" % del suministro: pueden vender juntas."]);
  else if(g.creatorPct>=20)lines.push(["high","El creador controla "+g.creatorPct+" %","Su wallet tiene "+g.creatorPct+" % del suministro: puede vender de golpe."]);
  else if(g.creatorPct>=8)lines.push(["warn","El grupo del creador tiene "+g.creatorPct+" %",(cg?cg.holders+" wallets ligadas al creador":"La wallet del creador")+" con "+g.creatorPct+" % del suministro."]);
  else lines.push(["ok","El grupo del creador tiene "+g.creatorPct+" %",cg?cg.holders+" wallet(s) ligadas al creador entre los holders revisados.":"No encontramos wallets ligadas al creador entre los mayores holders."]);
  if(other&&other.pct>=20)lines.push(["warn","Otro grupo controla "+other.pct+" %",other.holders+" wallets conectadas entre sí (sin el creador) tienen "+other.pct+" %."]);
  const part=(g.partial.funders?" No pudimos revisar el fondeo de "+g.partial.funders+" wallet(s).":"")+(g.partial.transfers?" Faltaron transferencias del token.":"");
  box.innerHTML=`<ol class="checks">${lines.map(l=>`<li><span class="pill ${l[0]}">${lbl[l[0]]}</span><div class="ck"><b>${esc(l[1])}</b><span>${esc(l[2])}</span></div></li>`).join("")}</ol>
   <div id="mapsvg" class="mapsvg"></div>
   <div class="maplegend"><span>★ creador</span><span>S sniper del primer minuto</span><span><i class="lg dash"></i> fondeó</span><span><i class="lg"></i> transfirió el token</span><span><i class="lg ring"></i> no es holder (solo conecta)</span></div>
   <div id="mapinfo" class="mapinfo" aria-live="polite">Toca una burbuja para ver la wallet.</div>
   ${g.groups.length?`<div class="tw"><table class="tt"><thead><tr><th>Grupo</th><th>Wallets</th><th>% del total</th></tr></thead><tbody>${g.groups.slice(0,8).map(x=>`<tr><td><i class="dot" style="background:${P[(x.n-1)%P.length]}"></i> ${x.creator?"Del creador ★":"Grupo "+x.n}</td><td>${x.holders}</td><td>${x.pct.toLocaleString((globalThis.PBI18N?.locale||"es-MX"),{maximumFractionDigits:2})} %</td></tr>`).join("")}</tbody></table></div>`:""}
   <div class="tnote">Mostramos ${g.holdersShown} holders (los mayores, sin pools ni quemado, más los snipers que aún tienen tokens). Exchanges y puentes con miles de transacciones no cuentan como «mismo dueño».${part} Este grupo no cambia la puntuación de arriba.</div>`;
  window.PBMap.draw($("#mapsvg"),g,{onPick:n=>{
    const f=g.nodes.find(m=>m.id===n.id);
    $("#mapinfo").innerHTML=`<b class="w">${esc(n.id.split("@")[0])}</b> · ${n.creator?"creador · ":""}${n.sniper?"sniper · ":""}${n.timeNode?"contrato que fondeó a varias wallets en la misma hora: "+esc(n.id.split("@")[0])+" · ":""}${n.deployer?"creó el contrato que fondeó · ":""}${n.kind==="magic"?"no es holder":(n.pct||0).toLocaleString((globalThis.PBI18N?.locale||"es-MX"),{maximumFractionDigits:2})+" % del total"}${n.contract?" · contrato"+(n.name?" ("+esc(n.name)+")":""):""}${n.group?" · grupo "+n.group:""}`;
  }});
}

const quick=PBAlpha.quick; // alpha.js (tested)
const WETH_ID=PBAlpha.WETH_ID;

// ================= UI (redesign) =================
const store={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch(e){return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}};
const ago=ts=>{const m=(Date.now()-ts)/6e4;return isNaN(m)?"—":m<1?"ahora":m<60?"hace "+Math.round(m)+" min":m<1440?"hace "+Math.round(m/60)+" h":"hace "+Math.round(m/1440)+" d";};
const ageTxt=h=>h==null?"—":h<1?Math.max(1,Math.round(h*60))+" min":h<48?h.toFixed(h<10?1:0)+" h":Math.round(h/24)+" días";
const clsOf=score=>score>=80?"ok":score>=40?"warn":"high";
function ringSvg(score,cls,size){const r=52,c=2*Math.PI*r,off=c*(1-Math.max(0,Math.min(100,score))/100);
  return `<svg viewBox="0 0 120 120" aria-hidden="true"${size?` width="${size}" height="${size}"`:""}><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--sheet2)" stroke-width="11"/><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--${cls})" stroke-width="11" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg>`;}
function miniRing(score){if(score==null)return "";const cls=clsOf(score);return `<span class="mini" style="position:relative;display:inline-block" title="${score}/100">${ringSvg(score,cls,40).replace('<svg','<svg style="transform:rotate(-90deg)"')}<b style="position:absolute;inset:0;display:grid;place-items:center;font-family:var(--display);font-size:.8rem">${score}</b></span>`;}
const avatar=(img,txt)=>img?`<img class="av" src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-fallback="${esc((txt||"?").slice(0,2))}">`:`<span class="av">${esc((txt||"?").slice(0,2))}</span>`;

// ---------- history & favorites (this browser only) ----------
function addHistory(e){const h=store.get("pbs_hist",[]).filter(x=>x.t!==e.t);h.unshift(e);store.set("pbs_hist",h.slice(0,40));renderRecent();}
const favs=()=>store.get("pbs_fav",[]);
const isFav=t=>favs().some(x=>x.t===t);
function toggleFav(e){let f=favs();if(f.some(x=>x.t===e.t))f=f.filter(x=>x.t!==e.t);else f.unshift(e);store.set("pbs_fav",f.slice(0,60));return isFav(e.t);}
function itemRow(x){return `<li data-scan="${esc(x.t)}">${avatar(x.img,x.sym||x.name)}<div class="grow"><b>${esc(x.name||short(x.t))}</b><small>${esc(x.sym?x.sym+" · ":"")}${esc(short(x.t))}${x.at?" · "+ago(x.at):""}</small></div>${miniRing(x.score)}</li>`;}
function renderRecent(){
  const h=store.get("pbs_hist",[]);
  const html=h.length?h.slice(0,5).map(itemRow).join(""):`<li class="empty" style="cursor:default">Aún no has analizado tokens en este navegador.</li>`;
  const a=$("#recent-m"),b=$("#recent-d");if(a)a.innerHTML=html;if(b)b.innerHTML=html;
}
function renderHistory(tab){
  tab=tab||"hist";document.querySelectorAll("#v-history [data-h]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.h===tab));
  const list=tab==="fav"?favs():store.get("pbs_hist",[]);
  $("#hist-list").innerHTML=list.length?list.map(itemRow).join(""):`<li class="empty" style="cursor:default">${tab==="fav"?"Aún no tienes favoritos. Toca ☆ Favorito en un análisis.":"Aún no hay análisis guardados."}</li>`;
}

// ---------- explore (GeckoTerminal lists + DexScreener icons) ----------
const exploreCache={};
async function exploreRows(kind){
  const c=exploreCache[kind];if(c&&Date.now()-c.at<60000)return c.rows;
  const path=kind==="new"?"new_pools?page=1":kind==="volume"?"pools?page=1&sort=h24_volume_usd_desc":"trending_pools?page=1";
  const j=await timed("https://api.geckoterminal.com/api/v2/networks/robinhood/"+path,{},12000);
  const seen=new Set();
  let rows=(j.data||[]).map(p=>{const a=p.attributes||{},r=p.relationships||{};
    let tid=r.base_token&&r.base_token.data&&r.base_token.data.id;let nm=(a.name||"").split(" / ")[0];let inv=false;
    if(tid===WETH_ID){tid=r.quote_token&&r.quote_token.data&&r.quote_token.data.id;nm=(a.name||"").split(" / ")[1]||nm;inv=true;}
    const t=(tid||"").split("_")[1];const tx=(a.transactions||{}).h6||{};
    const ageH=a.pool_created_at?(Date.now()-Date.parse(a.pool_created_at))/3.6e6:null;const liq=a.reserve_in_usd!=null?Number(a.reserve_in_usd):null;
    const price=Number(inv?a.quote_token_price_usd:a.base_token_price_usd);const ch=inv?null:Number((a.price_change_percentage||{}).h24);
    return {t,nm,ageH,liq,price,ch:isNaN(ch)?null:ch,vol:Number((a.volume_usd||{}).h24)||0,b:tx.buys||0,s:tx.sells||0,q:quick(liq,tx.buys||0,tx.sells||0,ageH)};})
    .filter(x=>/^0x[0-9a-f]{40}$/.test(x.t||"")&&!seen.has(x.t)&&seen.add(x.t));
  if(kind==="gainers")rows=rows.filter(x=>x.ch!=null&&(x.liq||0)>=5000).sort((a,b)=>b.ch-a.ch);
  rows=rows.slice(0,20);
  try{const ps=await timed(DEX+rows.map(x=>x.t).join(","),{},9000);const img={};
    for(const p of ps||[]){const b=(p.baseToken&&p.baseToken.address||"").toLowerCase();if(!img[b]&&p.info&&p.info.imageUrl)img[b]=safeUrl(p.info.imageUrl);}
    rows.forEach(x=>{x.img=img[x.t]||null;});}catch(e){}
  exploreCache[kind]={at:Date.now(),rows};return rows;
}
const SUB="₀₁₂₃₄₅₆₇₈₉";
const fmtPrice=p=>{if(p==null||isNaN(p))return "—";if(p>=1)return "$"+p.toLocaleString((globalThis.PBI18N?.locale||"es-MX"),{maximumFractionDigits:2});if(p>=0.001)return "$"+p.toPrecision(3);
  if(p<=0)return "$0";const z=Math.floor(-Math.log10(p));const digits=Math.round(p*Math.pow(10,z+3));return "$0.0"+String(z).split("").map(d=>SUB[d]).join("")+String(digits).slice(0,4).replace(/0+$/,"");};
function exploreRow(x,i){return `<li data-scan="${esc(x.t)}"><span class="num" style="width:1.4rem;color:var(--muted)">${i+1}</span>${avatar(x.img,x.nm)}<div class="grow"><b>${esc(x.nm.slice(0,18))}</b><small>${usd(x.liq==null?null:Math.round(x.liq))} liq. · ${ageTxt(x.ageH)}</small></div><div class="num">${fmtPrice(x.price)}<br>${x.ch==null?"":`<span class="${x.ch>=0?"pos":"neg"}">${x.ch>=0?"+":""}${x.ch.toFixed(1)} %</span>`}</div><span class="pill ${x.q}">${lbl[x.q]}</span></li>`;}
// ---------- Alpha Radar: early-activity filters + observed signals (no opportunity score until validated) ----------
const ALPHA_DEFAULT=PBAlpha.DEFAULTS;
const alphaCfg=()=>({...ALPHA_DEFAULT,...store.get("pbs_alpha",{})});
let alphaCache=null;
async function alphaPools(){
  if(alphaCache&&Date.now()-alphaCache.at<60000)return alphaCache.pools;
  const B="https://api.geckoterminal.com/api/v2/networks/robinhood/";
  const paths=["new_pools?page=1","new_pools?page=2","new_pools?page=3","trending_pools?page=1","pools?page=1&sort=h24_volume_usd_desc","pools?page=2&sort=h24_volume_usd_desc","pools?page=1&sort=h24_tx_count_desc"];
  const pools={};
  let failed=0;
  const reasons=[];
  for(const pth of paths){try{const j=await timed(B+pth,{},12000);for(const p of j.data||[]){const a=p.attributes||{};if(a.address)pools[a.address.toLowerCase()]=p;}}catch(e){failed++;reasons.push(pth.split("?")[0]+":"+(e.kind||"error")+(e.status?" "+e.status:""));}}
  if(failed===paths.length)throw new Error("GeckoTerminal unavailable");
  const list=Object.values(pools);alphaCache={at:Date.now(),pools:list,failed,reasons};return list;
}
function alphaRow(x,i){
  const blocked=!x.favourable;
  const lc=x.liqChange?`<span class="sig ${x.liqChange.pct<0?"bad":""}">Liquidez ${x.liqChange.pct>=0?"+":""}${Math.round(x.liqChange.pct)} % desde ${esc(ago(x.liqChange.since))}</span>`:"";
  return `<li class="al" data-scan="${esc(x.t)}"><span class="num" style="width:1.4rem;color:var(--muted)">${i+1}</span>${avatar(x.img,x.nm)}<div class="grow"><b>${esc(x.nm.slice(0,18))}${x.priority?` <span class="prio" title="Par con menos de ${ALPHA_DEFAULT.priority} h">⚡ &lt;${alphaCfg().priority} h</span>`:""}</b><small>${usd(Math.round(x.liq))} liq. · ${usd(Math.round(x.vol1))} vol 1 h · ${x.tx1} tx (${x.buys1} compras / ${x.sells1} ventas) · ${ageTxt(x.ageH)}</small></div>
    <div class="num">${fmtPrice(x.price)}</div>
    <div class="scores"><span class="alphab" title="Alpha Signal Score: actividad observada, no seguridad ni predicción">Actividad <b>${x.alpha}</b></span><span class="pill ${x.q}" title="Riesgo rápido con datos de mercado; el análisis completo es Risk Shield">Riesgo: ${lbl[x.q]}</span></div>
    <div class="sigs">${x.q==="high"?`<span class="sig bad">Riesgo alto: sin etiqueta favorable</span>`:""}${x.warn.map(z=>`<span class="sig bad">${esc(z)}</span>`).join("")}${lc}${!blocked&&x.sig.length?x.sig.map(z=>`<span class="sig">${esc(z)}</span>`).join(""):!x.warn.length&&x.q!=="high"?`<span class="sig dim">Sin señales extra</span>`:""}</div></li>`;
}
let exploreKind="new";
async function loadAlpha(){
  const box=$("#explore-list");box.innerHTML=`<li class="busy" style="cursor:default">Buscando entre los pools nuevos y activos…</li>`;
  const cfg=alphaCfg();const f=$("#alpha-f");for(const k of Object.keys(cfg))if(f.elements[k])f.elements[k].value=cfg[k];
  try{
    const pools=await alphaPools();if(exploreKind!=="alpha")return;const now=Date.now();const prev=store.get("pbs_alpha_liq",{});
    const rows=pools.map(p=>{const a=p.attributes||{};return PBAlpha.evaluate(p,cfg,now,prev[String(a.address||"").toLowerCase()]||null);});
    // Remember liquidity per pool in this browser to show its change on the next visit.
    const next={};for(const x of rows)if(x&&x.pool&&x.liq>0)next[x.pool]={liq:x.liq,at:now};
    for(const [k,v] of Object.entries(prev))if(!next[k]&&now-v.at<7*86400e3)next[k]=v;
    store.set("pbs_alpha_liq",Object.fromEntries(Object.entries(next).slice(-600)));
    let uniq=PBAlpha.rank(rows).slice(0,25);
    try{const ps=await timed(DEX+uniq.map(x=>x.t).join(","),{},9000);const img={};for(const p of ps||[]){const b=(p.baseToken&&p.baseToken.address||"").toLowerCase();if(!img[b]&&p.info&&p.info.imageUrl)img[b]=safeUrl(p.info.imageUrl);}uniq.forEach(x=>{x.img=img[x.t]||null;});}catch(e){}
    const when=new Date(alphaCache.at).toLocaleTimeString((globalThis.PBI18N?.locale||"es-MX"),{hour:"2-digit",minute:"2-digit"});
    const head=`<li class="empty" style="cursor:default">Fuente: GeckoTerminal (${pools.length} pools) · actualizado ${esc(when)}${alphaCache.failed?` · ${alphaCache.failed} consulta(s) fallaron: lista incompleta`:""}. «Actividad» es el Alpha Signal Score: mide movimiento, no seguridad ni ganancias.</li>`;
    box.innerHTML=uniq.length?head+`<li class="empty" style="cursor:default">${uniq.length} token(s) pasan los filtros. Toca uno para el análisis completo (Risk Shield).</li>`+uniq.map(alphaRow).join(""):head+`<li class="empty">Ningún token pasa los filtros ahora mismo. Prueba con una edad mayor o menos liquidez mínima.</li>`;
  }catch(e){if(exploreKind==="alpha")box.innerHTML=`<li class="empty">Error de conexión con GeckoTerminal. Prueba en un momento.</li>`;}
}
$("#alpha-f").addEventListener("change",()=>{const f=$("#alpha-f");const c={};for(const k of Object.keys(ALPHA_DEFAULT)){const v=Number(f.elements[k].value);if(!isNaN(v))c[k]=v;}store.set("pbs_alpha",c);loadAlpha();});
$("#alpha-reset").addEventListener("click",()=>{store.set("pbs_alpha",{});loadAlpha();});
async function loadExplore(kind){
  kind=kind||"new";exploreKind=kind;
  $("#v-explore").dataset.mode=kind;
  $("#v-explore .vh h2").textContent=kind==="alpha"?"Alpha Radar":"Explorar tokens";
  document.querySelector(".alphabox").hidden=kind!=="alpha";
  if(kind==="alpha"){document.querySelectorAll("#v-explore [data-k]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.k==="alpha"));return loadAlpha();}
  kind=kind||"new";document.querySelectorAll("#v-explore [data-k]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.k===kind));
  const box=$("#explore-list");
  if(kind==="fav"||kind==="history"){
    const list=kind==="fav"?favs():store.get("pbs_hist",[]);
    box.innerHTML=list.length?list.map(itemRow).join(""):`<li class="empty" style="cursor:default">${kind==="fav"?"Aún no tienes favoritos. Toca ☆ Favorito en un análisis.":"Aún no hay análisis guardados."}</li>`;
    return;
  }
  box.innerHTML=`<li class="busy" style="cursor:default">Cargando…</li>`;
  try{const rows=await exploreRows(kind);if(exploreKind!==kind)return;box.innerHTML=rows.length?rows.map(exploreRow).join(""):`<li class="empty">No hay datos ahora mismo.</li>`;}
  catch(e){if(exploreKind===kind)box.innerHTML=`<li class="empty">No se pudo cargar la lista. Prueba en un momento.</li>`;}
}
async function loadRail(kind){
  kind=kind||"new";document.querySelectorAll(".rail [data-rk]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.rk===kind));
  const box=$("#rail-trend");box.innerHTML=`<li class="busy" style="cursor:default">Cargando…</li>`;
  try{const rows=(await exploreRows(kind)).slice(0,6);box.innerHTML=rows.map((x,i)=>exploreRow(x,i)).join("")||`<li class="empty">Sin datos.</li>`;}
  catch(e){box.innerHTML=`<li class="empty">No se pudo cargar.</li>`;}
}

// ---------- chain status (public RPC) ----------
let chainOkAt=0;
async function chainTick(){
  try{const b=parseInt(await rpc("eth_blockNumber",[]),16);const g=parseInt(await rpc("eth_gasPrice",[]),16)/1e9;
    if(!isFinite(b)||!isFinite(g))throw new Error("invalid");
    chainOkAt=Date.now();$("#cblock").textContent=b.toLocaleString((globalThis.PBI18N?.locale||"es-MX"));$("#cgas").textContent=(g<0.01?g.toFixed(4):g.toFixed(3))+" gwei";}
  catch(e){}
  chainState();
}
// Healthy only with a successful check in the last 90 s; never a stale "Conectado".
function chainState(){
  const age=chainOkAt?Math.round((Date.now()-chainOkAt)/1000):null;const ok=age!=null&&age<=90;
  $("#cstate").textContent=ok?"Conectado · hace "+age+" s":chainOkAt?"Sin comprobación reciente":"Sin respuesta";
  document.querySelectorAll(".dot").forEach(d=>{d.style.background=ok?"":"var(--warn)";d.style.boxShadow=ok?"":"none";});
}

// ---------- views ----------
const isDesk=()=>matchMedia("(min-width:1100px)").matches;
function setView(v,opt={}){
  if(v==="analyze"){v=lastRes||last?"result":"home";setTimeout(()=>{const i=isDesk()?$("#addr"):$("#addr2");if(v==="home"&&i)i.focus();},50);}
  if(v==="accuracy"){v=lastRes||last?"result":"home";setTimeout(()=>$("#accuracy").scrollIntoView({behavior:"smooth"}),50);}
  if(v==="method"){v=lastRes||last?"result":"home";setTimeout(()=>$("#metodo").scrollIntoView({behavior:"smooth"}),50);}
  document.body.dataset.view=v;
  const navKey=v==="result"?"home":v;
  document.querySelectorAll(".side [data-nav], .tabbar [data-nav]").forEach(b=>{const on=b.dataset.nav===navKey&&(v==="explore"&&opt.kind==="alpha"?b.dataset.kind==="alpha":!b.dataset.kind)&&!b.dataset.tab;on?b.setAttribute("aria-current","page"):b.removeAttribute("aria-current");});
  if(v==="explore")loadExplore(opt.kind);
  if(v==="sim")renderSimView();
  if(v==="history")renderHistory(opt.tab);
  if(v==="settings"){notifState();applyTheme(store.get("pbs_theme","dark"));}
  if(!opt.keepScroll)window.scrollTo({top:0,behavior:"instant"in window?"instant":"auto"});
}
document.addEventListener("click",e=>{
  const n=e.target.closest("[data-nav]");
  if(n){e.preventDefault();setView(n.dataset.nav,{kind:n.dataset.kind,tab:n.dataset.tab});return;}
  const s=e.target.closest("[data-scan]");
  if(s&&!e.target.closest("a")){analyze(s.dataset.scan);return;}
  const k=e.target.closest("#v-explore [data-k]");if(k){loadExplore(k.dataset.k);return;}
  const rk=e.target.closest(".rail [data-rk]");if(rk){loadRail(rk.dataset.rk);return;}
  const h=e.target.closest("#v-history [data-h]");if(h){renderHistory(h.dataset.h);return;}
});

// ---------- security summary (derived from the findings) ----------
function secRows(res){
  const {checks,cr,sim}=res;const has=re=>checks.find(c=>re.test(c.t));const rows=[];
  const contract=!has(/^(Contrato no revisado|No hay contrato)/);
  if(has(/^La venta simulada falla/))rows.push(["Honeypot (venta simulada)","Sí","high"]);
  else if(has(/^(La venta simulada funciona|Pérdida (muy )?alta al vender)/))rows.push(["Honeypot (venta simulada)","No","ok"]);
  else if(has(/^Solo se puede operar/))rows.push(["Honeypot (venta simulada)","Router propio","warn"]);
  else rows.push(["Honeypot (venta simulada)","Sin simular","unk"]);
  if(sim&&sim.retention!=null){const loss=Math.max(0,100-sim.retention*100);rows.push(["Costo al vender (simulado)",loss.toFixed(1)+" %",loss<10?"ok":loss<30?"warn":"high"]);}
  const lq=has(/^(El creador puede retirar la liquidez|Una wallet controla la liquidez|Una wallet puede retirar la liquidez)/);
  if(lq)rows.push(["Liquidez","Retirable","high"]);
  else if(has(/^(Liquidez en un contrato de bloqueo|Liquidez quemada)/))rows.push(["Liquidez",has(/^Liquidez quemada/)?"Quemada":"Bloqueada","ok"]);
  else if(has(/^(Liquidez repartida|El creador controla parte)/))rows.push(["Liquidez","Parcialmente retirable","warn"]);
  else rows.push(["Liquidez","Sin verificar","unk"]);
  const fn=(label,re)=>{const c=has(re);rows.push([label,c?"Sí":contract?"No":"—",c?c.s:contract?"ok":"unk"]);};
  fn("Puede crear tokens (mint)",/^Puede crear tokens nuevos/);
  fn("Lista negra",/^Puede bloquear wallets/);
  fn("Cambiar comisiones",/^Puede cambiar las comisiones/);
  fn("Pausar el trading",/^Puede pausar o activar/);
  if(has(/^Propiedad renunciada/))rows.push(["Propiedad renunciada","Sí","ok"]);
  else{const o=has(/^El contrato tiene dueño activo/);rows.push(["Propiedad renunciada",o?"No":"Sin owner()",o?o.s:"unk"]);}
  const px=has(/^Contrato actualizable/);rows.push(["Contrato actualizable",px?"Sí":contract?"No":"—",px?"warn":contract?"ok":"unk"]);
  const H=cr&&cr.holders;if(H&&H.top10!=null)rows.push(["Top 10 holders",H.top10+" %",H.top10>50?"high":H.top10>30?"warn":"ok"]);
  const S=cr&&cr.snipers;if(S)rows.push(["Snipers (aún tienen)",S.n?S.held+" %":"0",S.held>=20?"high":S.held>=8?"warn":"ok"]);
  const cre=checks.find(c=>c.c==="Creador y liquidez"&&/(creador|Creador|plataforma)/.test(c.t)&&!/liquidez/i.test(c.t));
  if(cre)rows.push(["Creador",cre.s==="ok"?"Sin historial malo":cre.s==="high"?"Riesgo alto":cre.s==="warn"?"A revisar":"Sin datos",cre.s]);
  return rows;
}
const ICON={ok:"✓",warn:"!",high:"✕",unk:"?"};

// ---------- simulator ----------
function simCard(res,where){
  if(!res||!res.pair||!Number(res.pair.priceUsd))return `<div class="card"><div class="empty">Analiza un token primero; el simulador usa su precio y su venta simulada.</div></div>`;
  const p=res.pair,sym=p.baseToken&&p.baseToken.symbol||"tokens";
  return `<section class="card a-sim simbox" data-where="${where}"><div class="h3">Simulador de compra/venta <span class="tag">${esc(sym)}</span></div>
   <div class="sim">
    <div class="seg" role="group"><button type="button" data-mode="buy" aria-pressed="true">Compra</button><button type="button" data-mode="sell" aria-pressed="false">Venta</button></div>
    <div><label>Monto (USD)</label><input type="number" inputmode="decimal" min="1" step="1" value="100" class="s-amt" aria-label="Monto en dólares"></div>
    <div class="amts">${[25,50,100,500,1000].map(a=>`<button type="button" class="chip" data-amt="${a}" aria-pressed="${a===100}">${a}</button>`).join("")}</div>
    <div><label>Slippage máximo</label><select class="s-slip"><option value="0.01">1 %</option><option value="0.03" selected>3 %</option><option value="0.05">5 %</option><option value="0.1">10 %</option></select></div>
    <div class="simout s-out"></div>
    <div class="disc">Cálculo con el precio actual y la venta simulada de PreBuyScan. No compra ni vende nada; los escenarios de subida son hipotéticos, no predicciones.</div>
   </div></section>`;
}
function bindSim(root,res){
  root.querySelectorAll(".simbox").forEach(box=>{
    const p=res.pair,price=Number(p.priceUsd),ret=res.sim&&res.sim.retention!=null?res.sim.retention:null;let mode="buy";
    const draw=()=>{
      const amt=Math.max(0,Number(box.querySelector(".s-amt").value)||0),slip=Number(box.querySelector(".s-slip").value);
      const tokens=amt/price;const rows=[];
      if(mode==="buy"){
        rows.push(["Tokens a recibir",tokens.toLocaleString((globalThis.PBI18N?.locale||"es-MX"),{maximumFractionDigits:tokens<10?4:0})],["Precio por token",fmtPrice(price)],["Costo máximo (slippage "+Math.round(slip*100)+" %)",usd(+(amt*(1+slip)).toFixed(2))],
          ["Si vendieras enseguida",ret==null?"sin simulación":usd(+(amt*ret).toFixed(2))+" ("+(ret*100).toFixed(1)+" %)"]);
      }else rows.push(["Valor a vender",usd(amt)],["Recibirías (venta simulada)",ret==null?"sin simulación":usd(+(amt*ret).toFixed(2))],["Pérdida por comisiones e impacto",ret==null?"—":usd(+(amt*(1-ret)).toFixed(2))]);
      const sc=[0.5,1,3].map(x=>{const v=amt*(1+x)*(ret==null?1:ret);return `<div>+${x*100} % → ${fmtPrice(price*(1+x))}</div><div class="${v>=amt?"pos":"neg"}">${usd(+v.toFixed(2))} (${v>=amt?"+":"−"}${usd(Math.abs(+(v-amt).toFixed(2)))})</div>`;}).join("");
      box.querySelector(".s-out").innerHTML=`<h5>Resultado estimado</h5><div class="kv">${rows.map(r=>`<div>${esc(r[0])}</div><div>${esc(r[1])}</div>`).join("")}</div>
        ${mode==="buy"?`<h5>Escenarios de salida${ret==null?"":" (descontando el costo simulado al vender)"}</h5><div class="kv">${sc}</div>`:""}`;
    };
    box.addEventListener("click",e=>{const m=e.target.closest("[data-mode]");if(m){mode=m.dataset.mode;box.querySelectorAll("[data-mode]").forEach(b=>b.setAttribute("aria-pressed",b===m));draw();}
      const a=e.target.closest("[data-amt]");if(a){box.querySelector(".s-amt").value=a.dataset.amt;box.querySelectorAll("[data-amt]").forEach(b=>b.setAttribute("aria-pressed",b===a));draw();}});
    box.querySelector(".s-amt").addEventListener("input",()=>{box.querySelectorAll("[data-amt]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.amt===box.querySelector(".s-amt").value));draw();});
    box.querySelector(".s-slip").addEventListener("change",draw);
    draw();
  });
}
function renderSimView(){
  const host=$("#sim-host");const res=lastRes&&lastRes.res;
  const head=res&&res.pair?`<section class="card"><ul class="list"><li data-scan="${esc(lastRes.token)}">${avatar(safeUrl(res.pair.info&&res.pair.info.imageUrl),res.pair.baseToken&&res.pair.baseToken.symbol)}<div class="grow"><b>${esc(res.pair.baseToken&&res.pair.baseToken.name||"")}</b><small>${esc(res.pair.baseToken&&res.pair.baseToken.symbol||"")} · precio ${fmtPrice(Number(res.pair.priceUsd))}</small></div>${miniRing(scoreOf(res.checks))}</li></ul></section>`:"";
  host.innerHTML=head+simCard(res,"view");if(res)bindSim(host,res);
}

// ---------- data confidence (how much of the review could actually be completed) ----------
// ---------- token report ----------
function tagList(pair,cr){
  const t=[["Robinhood Chain",""]];if(pair)t.push([(pair.dexId||"")+((pair.labels||[]).length?" "+pair.labels.join(" ").toUpperCase():""),""]);
  if(cr&&cr.creator&&cr.creator.verified)t.push(["Código verificado","ok"]);
  return `<div class="tags">${t.map(x=>`<span class="tag ${x[1]}">${esc(x[0])}</span>`).join("")}</div>`;
}
function linksOf(pair){
  const info=pair&&pair.info||{};
  return [...(info.websites||[]).map(w=>({u:safeUrl(w.url),t:w.label&&!/^website$/i.test(w.label)?w.label:"Web"})),
    ...(info.socials||[]).map(x=>({u:safeUrl(x.url),t:SOCIAL[(x.type||"").toLowerCase()]||x.type||"Red social"}))].filter(l=>l.u).slice(0,6);
}
function groupsHtml(checks){
  return CATS.map(c=>{const g=checks.filter(x=>x.c===c).sort((a,b)=>order[a.s]-order[b.s]);if(!g.length)return "";
    const ok=g.filter(x=>x.s==="ok").length;
    return `<div class="grp"><h4>${esc(c)}<span>${ok} de ${g.length} bien</span></h4><ol class="checks">${g.map(x=>`<li><span class="pill ${x.s}${x.err?" err":""}">${esc(PBScore.labelOf(x))}</span><div class="ck"><b>${esc(x.t)}</b><span>${gloss(x.d)}</span>${x.src?`<em class="src">Fuente: ${esc(x.src)}</em>`:""}</div></li>`).join("")}</ol></div>`;}).join("");
}
// Desktop columns flow independently; placeholders restore the original mobile tabs.
let reportSlots=[];
function arrangeReportColumns(){
  const grid=$("#out .panes");
  if(!grid){reportSlots=[];return;}
  if(!matchMedia("(min-width:1100px)").matches){
    for(const {node,marker} of reportSlots)if(marker.isConnected){marker.before(node);marker.remove();}
    grid.querySelectorAll(":scope > .report-main,:scope > .report-details").forEach(el=>el.remove());
    reportSlots=[];return;
  }
  if(grid.querySelector(":scope > .report-main"))return;
  reportSlots=[];
  const left=[".a-chart",".a-map",".a-sim"].flatMap(q=>Array.from(grid.querySelectorAll(q)));
  const right=Array.from(grid.querySelectorAll(".a-sec,.a-info"));
  for(const [cls,nodes] of [["report-main",left],["report-details",right]]){
    const column=document.createElement("div");column.className=cls;
    for(const node of nodes){const marker=document.createComment("report position");node.before(marker);reportSlots.push({node,marker});column.append(node);}
    grid.append(column);
  }
}
function render(token,res){
  const {checks,facts,notChecked,tr,cr,pair,sim}=res;lastRes={token,res};
  const n=k=>checks.filter(c=>c.s===k).length;
  const v=verdictOf(checks),cls=v[0];
  // Not evaluable (no conclusive check): no number is shown or stored, never a favourable-looking score.
  const score=PBScore.isEvaluable(checks)?scoreOf(checks):null;
  const sorted=checks.slice().sort((a,b)=>order[a.s]-order[b.s]);
  last={token,name:facts.name||token,v,score,checks:sorted};
  const info=pair&&pair.info||{};const img=safeUrl(info.imageUrl),banner=safeUrl(info.header);
  const name=(pair&&pair.baseToken&&pair.baseToken.name)||(cr&&cr.creator&&cr.creator.tokenName)||short(token),sym=pair&&pair.baseToken&&pair.baseToken.symbol||"";
  const ringLbl=score==null?"No evaluable":{high:"Riesgo alto",warn:"Precaución",ok:"Sin alertas",unk:"Sin datos"}[cls];
  const hl=sorted.filter(c=>c.s!=="ok").slice(0,5);while(hl.length<5){const o=sorted.find(c=>c.s==="ok"&&!hl.includes(c));if(!o)break;hl.push(o);}
  const links=linksOf(pair);
  const h24=pair&&pair.txns&&pair.txns.h24||{},pc=pair&&pair.priceChange||{},vol=pair&&pair.volume||{};
  const ageH=pair&&pair.pairCreatedAt?(Date.now()-pair.pairCreatedAt)/3.6e6:null;
  const chg=x=>x==null?"":`<small class="${x>=0?"pos":"neg"}">${x>=0?"+":""}${Number(x).toFixed(1)} %</small>`;
  const stats=pair?[["Precio (USD)",fmtPrice(Number(pair.priceUsd)),chg(pc.h24)],["Market cap",usd(pair.marketCap??pair.fdv),""],["Liquidez",usd(pair.liquidity&&pair.liquidity.usd),""],
    ["Volumen 24 h",usd(vol.h24),chg(null)],["Holders",cr&&cr.holders&&cr.holders.count?num(cr.holders.count):"—",""],["Antigüedad",ageTxt(ageH),""],["Transacciones 24 h",num((h24.buys||0)+(h24.sells||0)),`<small style="color:var(--muted)">${num(h24.buys)} compras · ${num(h24.sells)} ventas</small>`]]:[];
  const sr=secRows(res);const conf=confidenceOf(res);const cov=PBScore.coverageOf(checks),ast=PBScore.analysisStateOf(checks);const nS=k=>checks.filter(c=>PBScore.stateOf(c)===k).length;const confCls=conf.score>=80?"ok":conf.score>=50?"warn":"high";
  const sizes=res.simSizes&&res.simSizes.length?`<div class="tw"><table class="tt"><thead><tr><th>Compra simulada</th><th>Impacto de precio</th><th>Si vendes enseguida</th></tr></thead><tbody>${res.simSizes.map(z=>`<tr><td>${z.eth} ETH</td><td class="${z.impact==null?"":z.impact>=0.15?"neg":z.impact>=0.05?"":"pos"}">${z.impact==null?"—":z.eth===0.01?"referencia":"+"+(z.impact*100).toFixed(1)+" %"}</td><td>${z.ret!=null?"recuperas "+(z.ret*100).toFixed(1)+" %":z.status==="sell_failed"?"la venta falla":"sin dato"}</td></tr>`).join("")}</tbody></table></div><div class="tnote">Compras simuladas de distinto tamaño: «impacto» = cuánto más caro sale cada token frente a la compra de 0.01 ETH. Vender enseguida recupera casi todo el impacto, por eso la última columna cambia poco; lo que pierdes ahí son comisiones e impuestos.</div>`:"";
  const rep=cr&&cr.rep;const S=cr&&cr.snipers;const H=cr&&cr.holders;
  const tbl=(title,head,rows,note,area)=>rows?`<section class="card ${area||"a-half"}"><h3>${title}</h3><div class="tw"><table class="tt"><thead><tr>${head.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>${note?`<div class="tnote">${note}</div>`:""}</section>`:"";
  const link=a=>`<a href="?t=${esc(a)}">${esc(short(a))}</a>`;
  const winners=tr&&tr.top.length?tbl("Mayores ganadores al vender",["Wallet","Compró","Vendió","Resultado"],tr.top.map(x=>`<tr><td class="w">${link(x.addr)}${tr.clone.some(c=>c.addr===x.addr)?" ⚑":""}${cr&&cr.creator&&x.addr===cr.creator.deployer?" ★":""}</td><td>${usd(Math.round(x.bought))} <small>(${x.nb})</small></td><td>${usd(Math.round(x.sold))} <small>(${x.ns})</small></td><td class="${x.pnl>=0?"pos":"neg"}">${x.pnl>=0?"+":"−"}${usd(Math.round(Math.abs(x.pnl)))}</td></tr>`).join(""),"Últimas "+tr.n+" operaciones del par principal (GeckoTerminal). Entre paréntesis, número de operaciones."):"";
  const bigs=tr&&tr.bigSells&&tr.bigSells.length?tbl("Ventas más grandes recientes",["Wallet","Vendió","Hace"],tr.bigSells.map(b=>`<tr><td class="w">${link(b.addr)}${cr&&cr.creator&&b.addr===cr.creator.deployer?" ★":""}</td><td>${usd(Math.round(b.v))}</td><td>${ago(b.ts).replace("hace ","")}</td></tr>`).join(""),""):"";
  const snip=S&&S.wallets&&S.wallets.length?tbl("Compradores del primer minuto",["Wallet","Compró","Tiene hoy","Fondeo"],S.wallets.map(w=>`<tr><td class="w">${link(w.addr)}${w.creator?" ★":""}</td><td>${w.boughtPct==null?"—":w.boughtPct.toLocaleString((globalThis.PBI18N?.locale||"es-MX"),{maximumFractionDigits:2})+" %"}</td><td class="${w.sold?"pos":""}">${w.pct==null?"—":w.pct.toLocaleString((globalThis.PBI18N?.locale||"es-MX"),{maximumFractionDigits:2})+" %"}${w.sold?" (vendió)":""}</td><td class="${w.linked?"neg":""}">${w.creator?"creador":w.linked?"del creador":w.funder?(w.shared?"compartido ":"")+link(w.funder):"—"}</td></tr>`).join(""),"% del suministro total. «Fondeo» = de dónde recibieron su primer ETH. ★ = creador."):"";
  const launches=rep&&rep.launches&&rep.launches.length?tbl("Otros tokens del creador",["Token","Liquidez hoy","Estado"],rep.launches.map(l=>`<tr><td class="w">${l.addr?link(l.addr):"—"}</td><td>${l.liq==null?"—":usd(Math.round(l.liq))}</td><td class="${l.liq==null?"":l.liq<1000?"neg":"pos"}">${l.liq==null?"sin datos":l.liq<1000?"muerto":"activo"}</td></tr>`).join(""),"«Muerto» = menos de $1,000 de liquidez hoy."):"";
  const holders=H&&H.top&&H.top.length?tbl("Mayores holders",["Wallet","Tipo","% del total"],H.top.map(x=>`<tr><td class="w">${link(x.addr)}${cr.creator&&x.addr===cr.creator.deployer?" ★":""}</td><td>${x.contract?esc(x.name||"contrato"):"wallet"}</td><td>${x.pct.toLocaleString((globalThis.PBI18N?.locale||"es-MX"),{maximumFractionDigits:2})} %</td></tr>`).join(""),"Sin pools"+(H.pools?" ("+H.pools.toFixed(1)+" %)":"")+" ni quemado"+(H.burned?" ("+H.burned.toFixed(1)+" %)":"")+". ★ = creador."):"";
  const C=cr&&cr.creator;
  const infoRows=[["Dirección",`<span>${esc(short(token))}</span> <button class="iconbtn" style="width:auto;height:auto;display:inline" data-act="copyaddr" aria-label="Copiar dirección">⧉</button>`],["Red","Robinhood Chain (4663)"],["Tipo","ERC-20"],
    ["Creado",C&&C.createdAt?new Date(C.createdAt).toLocaleString((globalThis.PBI18N?.locale||"es-MX"),{dateStyle:"medium",timeStyle:"short"}):pair&&pair.pairCreatedAt?new Date(pair.pairCreatedAt).toLocaleDateString((globalThis.PBI18N?.locale||"es-MX")):"—"],
    ["Creador",C?link(C.deployer):"—"],["Dueño (owner)",res.owner?(/^0x0+$/.test(res.owner)?"renunciado":link(res.owner)):"sin owner()"],["Código",C?(C.verified?"verificado en el explorador":"no verificado"):"—"]];
  const now=new Date().toLocaleString((globalThis.PBI18N?.locale||"es-MX"),{dateStyle:"medium",timeStyle:"short"});
  const fav=isFav(token);
  $("#out").innerHTML=`<div class="rcard"><h1 class="sr">Análisis de ${esc(name)} en PreBuyScan</h1>
   <div class="rhead"><button class="iconbtn mobile-only" data-nav="home" aria-label="Volver">‹</button><h2>Análisis de token</h2><span class="done st-${ast.key}" title="${esc(ast.detail)}">${esc(ast.label.toUpperCase())}</span><time>${esc(now)}</time>
    <div class="ractions">${pair&&pair.url?`<a class="btn2 sm" href="${esc(pair.url)}" target="_blank" rel="noopener">DexScreener ↗</a>`:""}<a class="btn2 sm" href="https://robinhoodchain.blockscout.com/token/${esc(token)}" target="_blank" rel="noopener">Explorador ↗</a>
     <button class="btn2 sm" type="button" data-act="share">Compartir</button><button class="btn2 sm" type="button" data-act="copy">Copiar enlace</button><button class="btn2 sm" type="button" data-act="img">Imagen</button>
     <button class="btn2 sm" type="button" data-act="fav" aria-pressed="${fav}">${fav?"★":"☆"} Favorito</button><span class="shmsg" role="status"></span></div></div>
   ${summaryBox(checks,score,v,conf)}
   ${ast.key!=="complete"?`<div class="astate st-${ast.key}" role="status"><b>${esc(ast.label)}.</b> ${esc(ast.detail)}${cov.errors?` <button type="button" class="btn2 sm" data-act="retry">Reintentar análisis</button>`:""}</div>`:""}
   ${banner?`<img class="banner" src="${esc(banner)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-onerr="remove">`:""}
   <section class="card"><div class="rtop">
    <div><div class="ident">${img?`<img class="ticon" src="${esc(img)}" alt="" referrerpolicy="no-referrer" data-onerr="remove">`:`<span class="ticon ph">${esc((sym||"?").slice(0,2))}</span>`}
      <div style="min-width:0"><h2 data-no-translate>${esc(name)}</h2><div class="sym">${esc(sym)}${pair&&pair.quoteToken?" / "+esc(pair.quoteToken.symbol):""}</div>
      <span class="addr">${esc(short(token))}<button type="button" data-act="copyaddr" aria-label="Copiar dirección">⧉</button></span></div></div>
      ${tagList(pair,cr)}
      ${links.length?`<div class="links" style="margin-top:10px">${links.map(l=>`<a class="btn2 sm" href="${esc(l.u)}" target="_blank" rel="noopener noreferrer nofollow">${esc(l.t)} ↗</a>`).join("")}</div>`:`<div class="disc" style="margin-top:8px">Sin web ni redes registradas en DexScreener.</div>`}
    </div>
    ${liveRing(score,cls,ringLbl)}
    <ul class="hl">${hl.map(c=>`<li><i class="${c.s}">${ICON[c.s]}</i><span>${esc(c.t)}</span></li>`).join("")}<li style="color:var(--muted);font-size:.78rem">${["high","warn","ok","unk","err"].filter(k=>nS(k)).map(k=>nS(k)+" "+PBScore.LABEL[k].toLowerCase()).join(" · ")}</li>
     <li class="confline"><span>Cobertura</span><span class="confbar"><i class="fill ${cov.pct>=80?"ok":cov.pct>=50?"warn":"high"}" style="width:${cov.pct}%"></i></span><b>${cov.done} de ${cov.total}</b></li>
     <li class="confline"><span>Data Confidence</span><span class="confbar"><i class="fill ${confCls}" style="width:${conf.score}%"></i></span><b class="s-${confCls}">${conf.score} %</b></li></ul>
   </div>
   ${scoreReason(checks,score)}
   <div class="rtabs" role="tablist">${[["resumen","Resumen"],["seguridad","Seguridad"],["actividad","Actividad"],["holders","Holders"]].map((t,i)=>`<button role="tab" data-tab="${t[0]}" aria-selected="${i===0}">${t[1]}</button>`).join("")}</div></section>
   <div class="panes">
    <div class="pane on" data-pane="resumen">
     ${stats.length?`<dl class="stats a-stats">${stats.map(s=>`<div class="stat"><dt>${s[0]}</dt><dd>${s[1]}${s[2]}</dd></div>`).join("")}</dl>`:""}
     ${pair?`<section class="card a-chart">${chartSection(pair).replace(/^<section>/,"").replace(/<\/section>$/,"")}<div id="market-tape" class="market-tape"></div></section>`:""}
    </div>
    <div class="pane" data-pane="seguridad">
     <section class="card a-sec"><h3>Seguridad del contrato</h3><ul class="secrows">${sr.map(r=>`<li><i class="s-${r[2]}">${ICON[r[2]]}</i><span class="k">${esc(r[0])}</span><span class="val s-${r[2]}">${esc(r[1])}</span></li>`).join("")}</ul>${sizes}</section>
     <section class="card a-info"><h3>Data Confidence <b class="s-${confCls}">${conf.score} %</b></h3><ul class="secrows">${conf.parts.map(p=>`<li><i class="s-${p[2]?"ok":"unk"}">${p[2]?"✓":"?"}</i><span class="k">${esc(p[0])}</span><span class="val ${p[2]?"s-ok":"s-unk"}">${p[2]?"verificado":"NO VERIFICADO"}</span></li>`).join("")}</ul><div class="tnote">Qué parte de la revisión se pudo completar (peso de cada parte en %: mercado 15, venta 20, contrato 15, dueño 5, creador 10, historial 10, liquidez 10, snipers 5, holders 5, operaciones 5). Lo no verificado nunca cuenta como seguro.</div></section>
     <section class="card a-wide"><h3>Todos los hallazgos <span class="disc">Safety Score: empieza en 100 y resta por cada alerta; lo no revisado también resta.</span></h3>${groupsHtml(checks)}</section>
    </div>
    <div class="pane on" data-pane="resumen">
     ${simCard(res,"report")}
     <section class="card a-wide sharecards"><h3>Tarjetas para compartir <span class="disc">X 1600×900 · Telegram 1080×1080 · Reporte premium 1080×1350</span></h3>
      <div class="sc-intro"><p class="disc">Imágenes generadas con los datos reales de este análisis, con un enlace y un QR verificables.</p><button type="button" class="cta" data-act="cards" style="padding:10px 18px;font-size:.92rem">Crear tarjetas</button></div>
      <div class="sc-out"></div></section>
     <section class="card a-info"><h3>Información del contrato <a href="https://robinhoodchain.blockscout.com/token/${esc(token)}" target="_blank" rel="noopener">Ver en explorador →</a></h3><div class="kv">${infoRows.map(r=>`<div>${r[0]}</div><div>${r[1]}</div>`).join("")}</div></section>
    </div>
    <div class="pane" data-pane="actividad">${winners}${bigs}${snip}${launches}${!winners&&!bigs&&!snip&&!launches?`<section class="card a-wide"><div class="empty">Sin actividad para mostrar.</div></section>`:""}</div>
    <div class="pane" data-pane="holders">${holders}</div>
    <div class="pane on" data-pane="resumen">
     <section class="card mapsec a-wide a-map"><h3>Mapa de wallets <span class="disc">grafo de entidades · en vivo</span></h3>
      <div class="mapintro"><p>Pasa el cursor o el dedo sobre el mapa para verlo en 3D. Burbujas = mayores holders. Las une quién les dio su primer ETH o si se pasaron el token. Un grupo de color suele ser una sola persona con varias wallets.</p>
      <button class="btn2" type="button" data-act="map">Reintentar mapa de wallets</button></div><div id="mapout"></div></section></div>
   </div>
   <div class="note">${notChecked.length?"No revisado: "+esc(notChecked.join("; "))+". ":""}Liquidez bloqueada en contratos de terceros: no se verifica hasta cuándo.<br>Revisado ${res.block?"en el bloque "+res.block.toLocaleString((globalThis.PBI18N?.locale||"es-MX"))+" · ":""}${esc(new Date(res.scannedAt||Date.now()).toLocaleString((globalThis.PBI18N?.locale||"es-MX")))} · algoritmo ${esc(res.algo||ALGO_VERSION)} · <a href="#metodo" data-nav="method">cómo calculamos</a>.</div>
  </div>`;
  arrangeReportColumns();bindSim($("#out"),res);autoMap();animateRings();
  stopMarket();
  stopMarket=window.PBLive&&pair?PBLive.mount($("#market-tape"),{token,pool:pair.pairAddress,holders:H,fetchJSON:timed,isActive:()=>document.body.dataset.view==="result"}):()=>{};
  addHistory({t:token,name,sym,img,score,v:cls,at:Date.now(),type:"token",algo:ALGO_VERSION,conf:conf.score});
}
// ---------- wallet profile ----------
function renderProfile(addr,p){
  const checks=p.checks.map(c=>({...c,c:"Perfil"}));
  const n=k=>checks.filter(c=>c.s===k).length;
  const v=verdictOf(checks),cls=v[0],score=PBScore.isEvaluable(checks)?scoreOf(checks):null;
  const title={high:"Wallet de alto riesgo",warn:"Wallet con señales a revisar",ok:"Sin señales de estafa",unk:"Sin datos suficientes"}[cls];
  last={token:addr,name:"Wallet "+short(addr),v:[cls,title],score,checks:checks.slice().sort((a,b)=>order[a.s]-order[b.s])};lastRes=null;
  const age=d=>d==null?"—":d<1?Math.round(d*24)+" h":d<60?Math.round(d)+" días":Math.round(d/30)+" meses";
  const nCreated=Math.max(p.created.length,p.db?p.db.launched:0);
  const stats=[["Transacciones",p.nonce==null?"—":num(p.nonce)],["Edad",age(p.ageDays)],["Tokens creados",num(nCreated)],["Wallets que fondeó",p.funded.length?(p.funded.length+(p.fundedMore?"+":"")):"0"],["Fondeada por",p.funder?`<a href="?t=${esc(p.funder)}">${esc(short(p.funder))}</a>`:p.established?"wallet antigua":"—"]];
  if(p.db)stats.push(["En la base de PreBuyScan",p.db.launched+" tokens · "+p.db.dead+" muertos"]);
  const st=l=>l==null?["","sin datos"]:l<1000?["neg","muerto"]:["pos","activo"];
  const link=a=>`<a href="?t=${esc(a)}">${esc(short(a))}</a>`;
  const ringLbl=score==null?"No evaluable":{high:"Riesgo alto",warn:"Precaución",ok:"Sin alertas",unk:"Sin datos"}[cls];
  $("#out").innerHTML=`<div class="rcard">
   <div class="rhead"><button class="iconbtn mobile-only" data-nav="home" aria-label="Volver">‹</button><h2>Perfil de wallet</h2><span class="done">COMPLETADO</span>
    <div class="ractions"><a class="btn2 sm" href="https://robinhoodchain.blockscout.com/address/${esc(addr)}" target="_blank" rel="noopener">Explorador ↗</a><button class="btn2 sm" type="button" data-act="share">Compartir</button><button class="btn2 sm" type="button" data-act="copy">Copiar enlace</button><button class="btn2 sm" type="button" data-act="img">Imagen</button><span class="shmsg" role="status"></span></div></div>
   <section class="card"><div class="rtop">
    <div class="ident"><span class="ticon ph">W</span><div style="min-width:0"><h2>${esc(title)}</h2><span class="addr">${esc(short(addr))}<button type="button" data-act="copyaddr" aria-label="Copiar dirección">⧉</button></span>
     <div class="tags"><span class="tag">Robinhood Chain</span><span class="tag">${p.platform?"Plataforma / servicio":"Wallet"}</span></div></div></div>
    ${liveRing(score,cls,ringLbl)}
    <ul class="hl">${last.checks.slice(0,5).map(c=>`<li><i class="${c.s}">${ICON[c.s]}</i><span>${esc(c.t)}</span></li>`).join("")}</ul>
   </div></section>
   <dl class="stats">${stats.map(s=>`<div class="stat"><dt>${s[0]}</dt><dd>${s[1]}</dd></div>`).join("")}</dl>
   <section class="card"><h3>Hallazgos</h3><ol class="checks">${last.checks.map(x=>`<li><span class="pill ${x.s}${x.err?" err":""}">${esc(PBScore.labelOf(x))}</span><div class="ck"><b>${esc(x.t)}</b><span>${esc(x.d)}</span></div></li>`).join("")}</ol></section>
   ${p.created.length?`<section class="card"><h3>Tokens que creó</h3><div class="tw"><table class="tt"><thead><tr><th>Token</th><th>Liquidez hoy</th><th>Estado</th></tr></thead><tbody>${p.created.map(t=>{const x=st(t.liq);return `<tr><td class="w">${link(t.token)}${t.name?" "+esc(t.name):""}</td><td>${t.liq==null?"—":usd(Math.round(t.liq))}</td><td class="${x[0]}">${x[1]}</td></tr>`;}).join("")}</tbody></table></div><div class="tnote">«Muerto» = menos de $1,000 de liquidez hoy en DexScreener.</div></section>`:""}
   ${p.funded.length?`<section class="card"><h3>Wallets que fondeó</h3><div class="tnote" style="padding-top:0">${p.funded.slice(0,20).map(link).join(" · ")}${p.funded.length>20||p.fundedMore?" …":""}<br>De ${p.fundedSample} revisadas, ${p.fundedFresh} recibieron de esta wallet su primer ETH.</div></section>`:""}
   ${p.traded.length?`<section class="card"><h3>Tokens con los que operó hace poco</h3><div class="tw"><table class="tt"><thead><tr><th>Token</th><th>Último movimiento</th><th>Estado</th></tr></thead><tbody>${p.traded.map(t=>{const x=st(t.liq);return `<tr><td class="w">${link(t.token)}${t.symbol?" "+esc(t.symbol):""}</td><td>${t.dir}${t.ts?" · "+new Date(t.ts).toLocaleDateString((globalThis.PBI18N?.locale||"es-MX"),{day:"numeric",month:"short"}):""}</td><td class="${x[0]}">${x[1]}</td></tr>`;}).join("")}</tbody></table></div></section>`:""}
   <div class="note">${p.partial.length?"No revisado: "+esc(p.partial.join(", "))+". ":""}Datos públicos del explorador, la RPC y DexScreener. Un perfil limpio no garantiza nada.</div></div>`;
  animateRings();
  addHistory({t:addr,name:"Wallet "+short(addr),sym:"W",img:null,score,v:cls,at:Date.now(),type:"wallet"});
}

// ---------- report interactions ----------
$("#out").addEventListener("click",async e=>{
  const t=e.target.closest(".rtabs [data-tab]");
  if(t){const k=t.dataset.tab;$("#out").querySelectorAll(".rtabs [data-tab]").forEach(b=>b.setAttribute("aria-selected",b===t));
    $("#out").querySelectorAll(".pane").forEach(p=>p.classList.toggle("on",p.dataset.pane===k));return;}
  const cb=e.target.closest("[data-chart]");
  if(cb){const w=cb.parentElement;w.classList.remove("chart-wait");w.innerHTML=`<iframe src="${esc(cb.dataset.chart)}" title="Gráfico de precio en GeckoTerminal" referrerpolicy="no-referrer" allow="clipboard-write"></iframe>${SHIELD}`;return;}
  const sh=e.target.closest(".chart-shield");if(sh){sh.parentElement.classList.add("chart-on");return;}
  const gl=e.target.closest("abbr.gl");if(gl&&matchMedia("(hover: none)").matches){flash(gl.textContent+": "+gl.title);return;}
  const b=e.target.closest("[data-act]");if(!b||!last)return;
  const act=b.dataset.act;
  if(act==="copyaddr"){try{await navigator.clipboard.writeText(last.token);flash("Dirección copiada");}catch(err){prompt(uiText("Copia la dirección:"),last.token);}return;}
  if(act==="fav"){const r=lastRes&&lastRes.res;const p=r&&r.pair;const on=toggleFav({t:last.token,name:p&&p.baseToken&&p.baseToken.name||last.name,sym:p&&p.baseToken&&p.baseToken.symbol||"",img:p&&p.info&&safeUrl(p.info.imageUrl),score:last.score,v:last.v[0],at:Date.now(),liq:p&&p.liquidity&&p.liquidity.usd||0,price:p?Number(p.priceUsd)||0:0});
    b.setAttribute("aria-pressed",on);b.textContent=(on?"★":"☆")+" Favorito";flash(on?"Guardado en favoritos":"Quitado de favoritos");return;}
  if(act==="retry"&&last){netCacheClear();nextExplorerBudget=window.PBCreator?window.PBCreator.RETRY_BUDGET_MS:0;analyze(last.token);return;}
  if(act==="cards"){makeCards(b);return;}
  if((act==="share"||act==="img")&&lastRes){const sc=$("#out .sharecards");if(sc){sc.scrollIntoView({behavior:"smooth",block:"start"});if(!shareSet||shareSet.rep.a!==lastRes.token)makeCards($("#out [data-act=cards]"));}return;}
  ({copy:copyLink,share:shareIt,img:downloadCard,map:loadMap})[act]?.(b);
});

const STAGES=[["Mercado y gráfico",/^Revisando 0x/],["Venta simulada",/^Simulando compra/],["Venta con montos mayores",/^Simulando montos/],["Operaciones recientes",/^Revisando operaciones/],["Contrato",/^Revisando el contrato/],["Creador, liquidez, snipers y holders",/^Revisando creador/]];
let stageIdx=0;
function liveRing(score,cls,lbl){const c=(2*Math.PI*52).toFixed(1),off=score==null?c:(2*Math.PI*52*(1-Math.max(0,Math.min(100,score))/100)).toFixed(1);
  const sparks=Array.from({length:8},(_,i)=>{const a=i/8*Math.PI*2;return `<circle class="lr-spark" cx="${(60+Math.cos(a)*60).toFixed(1)}" cy="${(60+Math.sin(a)*60).toFixed(1)}" r="1.8" style="animation-delay:${(i*0.35).toFixed(2)}s"/>`;}).join("");
  return `<div class="ring live lr-${cls}" role="img" tabindex="0" aria-label="${score==null?"Safety Score no evaluable: ninguna comprobación concluyó":"Safety Score "+score+" de 100 (100 = menor riesgo detectado), "+esc(lbl)}" data-score="${score==null?"":score}">
   <div class="lr-halo"></div><div class="lr-ripple"></div><div class="lr-ripple r2"></div>
   <svg viewBox="0 0 120 120" aria-hidden="true">
    <circle class="lr-track" cx="60" cy="60" r="52" fill="none" stroke-width="9"/>
    <circle class="lr-prog" cx="60" cy="60" r="52" fill="none" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-off="${off}"/>
    <g class="lr-spin"><circle cx="60" cy="60" r="52" fill="none" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="18 309"/></g>
    <g class="lr-spin2"><circle cx="60" cy="60" r="58" fill="none" stroke-width="1.2" stroke-dasharray="2 9" opacity=".6"/></g>
    <circle class="lr-ticks" cx="60" cy="60" r="43" fill="none" stroke-width="2" stroke-dasharray="1.5 5.2"/>
    ${sparks}</svg>
   <div class="v"><span class="lr-cap">Safety Score</span><b><span class="lr-num">${score==null?"—":"0"}</span><small>/100</small></b><span class="lr-lbl">${esc(lbl)}</span></div></div>`;}
function animateRings(){document.querySelectorAll("#out .ring.live:not(.go)").forEach(el=>{
  const still=matchMedia("(prefers-reduced-motion: reduce)").matches;const target=+el.dataset.score||0;const prog=el.querySelector(".lr-prog"),num=el.querySelector(".lr-num");
  el.classList.add("go");
  if(el.dataset.score===""){num.textContent="—";el.classList.add("done");return;}
  if(still){prog.setAttribute("stroke-dashoffset",prog.dataset.off);num.textContent=target;el.classList.add("done");return;}
  requestAnimationFrame(()=>requestAnimationFrame(()=>prog.setAttribute("stroke-dashoffset",prog.dataset.off)));
  const t0=performance.now(),D=1400;const tick=t=>{const k=Math.min(1,(t-t0)/D),e=1-Math.pow(1-k,3);num.textContent=Math.round(target*e);if(k<1)requestAnimationFrame(tick);else{el.classList.add("done");}};requestAnimationFrame(tick);
  el.addEventListener("pointermove",e=>{const b=el.getBoundingClientRect();const x=(e.clientX-b.left)/b.width-.5,y=(e.clientY-b.top)/b.height-.5;el.style.setProperty("--ty",(x*24).toFixed(1)+"deg");el.style.setProperty("--tx",(-y*24).toFixed(1)+"deg");});
  el.addEventListener("pointerleave",()=>{el.style.setProperty("--tx","0deg");el.style.setProperty("--ty","0deg");});
  el.addEventListener("click",()=>{el.classList.remove("burst");void el.offsetWidth;el.classList.add("burst");});
});}
function scanRing(){const c=(2*Math.PI*52).toFixed(1);
  const blips=[[38,34],[84,44],[72,86],[34,76],[60,24]].map((b,i)=>`<circle class="sr-blip" cx="${b[0]}" cy="${b[1]}" r="2.4" fill="var(--accent)" style="animation-delay:${(i*0.56).toFixed(2)}s"/>`).join("");
  return `<div class="scanring" role="progressbar" tabindex="0" aria-label="Analizando" aria-valuemin="0" aria-valuemax="${STAGES.length}" aria-valuenow="0" title="Toca para ver en qué paso va">
   <div class="sr-glow"></div><svg viewBox="0 0 120 120" aria-hidden="true">
    <defs><linearGradient id="srg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent2)"/></linearGradient>
     <linearGradient id="srs" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--accent)" stop-opacity="0"/><stop offset="1" stop-color="var(--accent)" stop-opacity=".35"/></linearGradient></defs>
    <circle class="sr-track" cx="60" cy="60" r="52" fill="none" stroke-width="9"/>
    <circle class="sr-prog" cx="60" cy="60" r="52" fill="none" stroke="url(#srg)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}"/>
    <g class="sr-spin"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--accent2)" stroke-width="3" stroke-linecap="round" stroke-dasharray="26 301" opacity=".9"/></g>
    <circle class="sr-ticks" cx="60" cy="60" r="43" fill="none" stroke="var(--line2)" stroke-width="2" stroke-dasharray="1.5 5.2"/>
    <g class="sr-sweep"><path d="M60 60 L60 21 A39 39 0 0 1 93.8 40.5 Z" fill="url(#srs)"/></g>
    ${blips}</svg>
   <div class="v"><b class="sr-pct">0%</b><span class="sr-lbl">Analizando</span></div></div>`;}
let srShowStage=false;
function paintRing(){const el=$("#out .scanring");if(!el)return;const n=STAGES.length,done=Math.min(stageIdx,n);
  const pct=Math.round(Math.min(95,(done/n)*100+(100/n)*0.35));const c=2*Math.PI*52;
  el.querySelector(".sr-prog").setAttribute("stroke-dashoffset",(c*(1-pct/100)).toFixed(1));
  el.querySelector(".sr-pct").textContent=srShowStage?(done+1)+"/"+n:pct+"%";
  el.querySelector(".sr-lbl").textContent=srShowStage?(STAGES[Math.min(done,n-1)][0].split(",")[0]):"Analizando";
  el.setAttribute("aria-valuenow",done);el.setAttribute("aria-label","Analizando: paso "+(done+1)+" de "+n+", "+STAGES[Math.min(done,n-1)][0]);}
function bindRing(){const el=$("#out .scanring");if(!el)return;
  const flip=()=>{srShowStage=!srShowStage;paintRing();};
  el.addEventListener("click",flip);el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();flip();}});
  el.addEventListener("pointermove",e=>{const b=el.getBoundingClientRect();const x=(e.clientX-b.left)/b.width-.5,y=(e.clientY-b.top)/b.height-.5;el.style.setProperty("--ty",(x*22).toFixed(1)+"deg");el.style.setProperty("--tx",(-y*22).toFixed(1)+"deg");});
  el.addEventListener("pointerleave",()=>{el.style.setProperty("--tx","0deg");el.style.setProperty("--ty","0deg");});
  paintRing();}
function paintStages(){paintRing();const ul=$("#out .stages");if(!ul)return;ul.innerHTML=STAGES.map((st,i)=>`<li class="${i<stageIdx?"st-done":i===stageIdx?"st-now":""}"><i>${i<stageIdx?"✓":""}</i>${st[0]}</li>`).join("");}
function step(m){const b=$("#out .busy span");if(b)b.textContent=m;const i=STAGES.findIndex(st=>st[1].test(m));if(i>=0){stageIdx=Math.max(stageIdx,i);paintStages();}}
// Shown as soon as market data arrives; the full report replaces it when every check finishes.
// Glossary: key terms in findings get a definition (title tooltip; tap shows it on phones).
const GLOSS={"FDV":"Valor total si todos los tokens valieran el precio actual (Fully Diluted Valuation).","snipers":"Bots o wallets que compran en el primer minuto del lanzamiento para revender.","sniper":"Bot o wallet que compra en el primer minuto del lanzamiento para revender.",
  "deslizamiento":"Diferencia entre el precio que ves y el que realmente pagas o recibes por el tamaño de tu operación (slippage).","slippage":"Diferencia entre el precio que ves y el que realmente pagas o recibes (deslizamiento).",
  "honeypot":"Token que deja comprar pero no vender.","rug pull":"El creador retira la liquidez y el token se queda sin valor.","LP":"Tokens que representan la liquidez aportada a un pool.",
  "holders":"Wallets que tienen el token.","bundle":"El propio equipo compra en el lanzamiento con varias wallets para vender después.","wash trading":"Compras y ventas entre wallets del mismo dueño para inflar el volumen.",
  "proxy":"Contrato que delega en otro y puede cambiar su código.","hook":"Código extra de un pool Uniswap V4 que puede cambiar reglas o comisiones.","cooldown":"Tiempo de espera obligatorio entre operaciones."};
const GLOSS_RE=new RegExp("\\b("+Object.keys(GLOSS).sort((a,b)=>b.length-a.length).map(k=>k.replace(/ /g,"\\s")).join("|")+")\\b","g");
function gloss(text){const seen=new Set();return esc(text).replace(GLOSS_RE,m=>{const k=Object.keys(GLOSS).find(x=>x.toLowerCase()===m.toLowerCase().replace(/\s+/g," "));if(!k||seen.has(k))return m;seen.add(k);return `<abbr class="gl" tabindex="0" title="${esc(GLOSS[k])}">${m}</abbr>`;});}
// Explain this report's score using its actual findings, never a canned token diagnosis.
function scoreReason(checks,score){
  const pending=checks.filter(c=>c.s==="unk"||c.s==="err");
  const critical=checks.filter(c=>c.s==="high");
  const cautions=checks.filter(c=>c.s==="warn");
  const top=critical.concat(cautions).slice(0,3);
  let text;
  if(score==null)text="No hay suficientes comprobaciones concluyentes para asignar una puntuación.";
  else if(top.length){
    text="La puntuación de "+score+"/100 se debe principalmente a: "+top.map(c=>c.t).join("; ")+".";
    if(critical.length)text+=" Una señal de riesgo alto limita la puntuación a un máximo de 39/100.";
    else text+=" Las señales de precaución limitan la puntuación a un máximo de 79/100.";
  }else text="No se detectaron alertas en las comprobaciones concluyentes. Esto no garantiza que el token sea seguro.";
  if(pending.length)text+=" Hay "+pending.length+" comprobación(es) pendientes o con error técnico: reducen la puntuación por falta de datos, pero no prueban una vulnerabilidad.";
  const tone=critical.length?"high":cautions.length?"warn":score==null||pending.length?"unk":"ok";
  return `<div class="score-reason ${tone}" aria-label="Explicación de la puntuación"><b>¿Por qué recibe esta puntuación?</b><p>${esc(text)}</p></div>`;
}
// Three lines to decide fast: verdict, what matters most, what is missing.
function summaryBox(checks,score,v,conf){
  const top=checks.filter(c=>c.s==="high").concat(checks.filter(c=>c.s==="warn")).slice(0,2).map(c=>c.t);
  const miss=checks.filter(c=>c.s==="unk").length;
  const l1=score==null?"No evaluable: ninguna comprobación concluyó.":{high:"Riesgo alto",warn:"Precaución",ok:"Sin alertas",unk:"Sin datos"}[v[0]]+" · Safety Score "+score+"/100 · Data Confidence "+conf.score+" %.";
  const l2=top.length?"Lo más importante: "+top.join(" · ")+".":"No encontramos señales de riesgo en las comprobaciones que terminaron.";
  const l3=miss?miss+" comprobación(es) sin resultado concluyente; «sin alertas» nunca garantiza que sea seguro.":"Todas las comprobaciones dieron resultado; aun así, no garantiza que sea seguro.";
  return `<section class="summary ${v[0]}" aria-label="Resumen"><b>Resumen</b><p>${esc(l1)}</p><p>${esc(l2)}</p><p>${esc(l3)}</p></section>`;
}
// Preliminary Safety Score from market, sale and contract checks (usually < 10 s); the explorer part can only add risks.
function renderPrelim({checks}){
  const el=$("#out .prelim");if(!el||!checks||!PBScore.isEvaluable(checks))return;
  const sc=scoreOf(checks),v=verdictOf(checks),risks=checks.filter(c=>c.s==="high"||c.s==="warn").sort((a,b)=>order[a.s]-order[b.s]).slice(0,3);
  el.innerHTML=`<div class="pre-score ${v[0]}"><b>${sc}</b><span>/100 preliminar · ${esc({high:"Riesgo alto",warn:"Precaución",ok:"Sin alertas",unk:"Sin datos"}[v[0]])}</span></div>
    <div class="pre-note">Con mercado, venta simulada y contrato. Falta creador, liquidez, snipers y holders: el resultado final puede bajar.</div>
    ${risks.length?`<ul class="pre-risks">${risks.map(c=>`<li class="${c.s}">${esc(c.t)}</li>`).join("")}</ul>`:""}`;
}
function renderPartial(token,{pair,facts}){
  if(stageIdx<1)stageIdx=1;
  const info=pair.info||{};const img=safeUrl(info.imageUrl),banner=safeUrl(info.header);
  const name=pair.baseToken&&pair.baseToken.name||short(token),sym=pair.baseToken&&pair.baseToken.symbol||"";
  const h24=pair.txns&&pair.txns.h24||{},pc=pair.priceChange||{},vol=pair.volume||{};
  const ageH=pair.pairCreatedAt?(Date.now()-pair.pairCreatedAt)/3.6e6:null;
  const chg=x=>x==null?"":`<small class="${x>=0?"pos":"neg"}">${x>=0?"+":""}${Number(x).toFixed(1)} %</small>`;
  const stats=[["Precio (USD)",fmtPrice(Number(pair.priceUsd)),chg(pc.h24)],["Market cap",usd(pair.marketCap??pair.fdv),""],["Liquidez",usd(pair.liquidity&&pair.liquidity.usd),""],["Volumen 24 h",usd(vol.h24),""],["Antigüedad",ageTxt(ageH),""],["Transacciones 24 h",num((h24.buys||0)+(h24.sells||0)),""]];
  const links=linksOf(pair);
  $("#out").innerHTML=`<div class="rcard">
   <div class="rhead"><button class="iconbtn mobile-only" data-nav="home" aria-label="Volver">‹</button><h2>Analizando token</h2><span class="done" style="background:var(--warn-bg);color:var(--warn)">EN CURSO</span></div>
   ${banner?`<img class="banner" src="${esc(banner)}" alt="" referrerpolicy="no-referrer" data-onerr="remove">`:""}
   <section class="card"><div class="rtop scanning">
    <div><div class="ident">${img?`<img class="ticon" src="${esc(img)}" alt="" referrerpolicy="no-referrer" data-onerr="remove">`:`<span class="ticon ph">${esc((sym||"?").slice(0,2))}</span>`}
      <div style="min-width:0"><h2 data-no-translate>${esc(name)}</h2><div class="sym">${esc(sym)}${pair.quoteToken?" / "+esc(pair.quoteToken.symbol):""}</div><span class="addr">${esc(short(token))}</span></div></div>
      ${tagList(pair,null)}
      ${links.length?`<div class="links" style="margin-top:10px">${links.map(l=>`<a class="btn2 sm" href="${esc(l.u)}" target="_blank" rel="noopener noreferrer nofollow">${esc(l.t)} ↗</a>`).join("")}</div>`:""}</div>
    ${scanRing()}
    <div class="grow"><div class="busy" style="padding:0 0 8px"><span>Simulando compra y venta…</span></div><div class="prelim" aria-live="polite"></div><ul class="stages"></ul></div>
   </div></section>
   <dl class="stats">${stats.map(st=>`<div class="stat"><dt>${st[0]}</dt><dd>${st[1]}${st[2]}</dd></div>`).join("")}</dl>
   <section class="card">${chartSection(pair,"scan").replace(/^<section>/,"").replace(/<\/section>$/,"")}</section>
  </div>`;
  bindRing();paintStages();
}
let running=false;
async function analyze(raw){
  const token=String(raw||"").trim().toLowerCase();
  document.querySelectorAll(".addr-in").forEach(i=>{i.value=token;});
  setView("result");
  if(!/^0x[0-9a-f]{40}$/.test(token)){$("#out").innerHTML=`<section class="card"><div class="empty">Esa dirección no es válida. Debe empezar con 0x y tener 40 caracteres hexadecimales después.</div></section>`;return;}
  if(running)return;stopMarket();running=true;stageIdx=0;shareSet=null;
  document.querySelectorAll(".go").forEach(b=>b.disabled=true);
  $("#out").innerHTML=`<section class="card"><div class="scanwrap">${scanRing()}<div class="grow"><div class="busy"><span>Revisando ${esc(short(token))}…</span></div><ul class="stages"></ul></div></div><div class="tnote">Simulamos la compra y la venta, revisamos el contrato, el creador, la liquidez, los snipers y los holders. Tarda de 20 a 60 segundos.</div></section>`;
  bindRing();paintStages();
  try{
    let code=null;try{code=await rpc("eth_getCode",[token,"latest"]);}catch(e){}
    if(code==="0x"||(code&&code.toLowerCase().startsWith("0xef0100"))){
      step("Es una wallet: armando su perfil…");
      renderProfile(token,await window.PBProfile.build(token,{db:await creatorDB(),progress:step}));
    }else{const res=await inspect(token,pp=>{if(!running)return;if(pp.prelim)renderPrelim(pp);else renderPartial(token,pp);});render(token,res);afterReport(token,res);}
    try{const q=new URLSearchParams(location.search);if(q.get("t")!==token){q.set("t",token);history.replaceState(null,"","?"+q.toString());}}catch(e){}
  }catch(e){$("#out").innerHTML=`<section class="card"><div class="empty">No se pudo completar la revisión. Comprueba tu conexión y vuelve a intentarlo.</div></section>`;}
  finally{running=false;document.querySelectorAll(".go").forEach(b=>b.disabled=false);}
}
for(const id of ["#f","#f2"])$(id).addEventListener("submit",e=>{e.preventDefault();analyze(e.target.querySelector(".addr-in").value);});
const ADDR_RE=/^0x[0-9a-fA-F]{40}$/;
function hint(form,m){m=uiText(m);const h=form.querySelector(".pastehint");if(h){h.textContent=m;if(m)setTimeout(()=>{if(h.textContent===m)h.textContent="";},6000);}}
document.querySelectorAll(".paste").forEach(btn=>btn.addEventListener("click",async()=>{
  const form=btn.closest("form"),inp=form.querySelector(".addr-in");
  try{
    const t=((await navigator.clipboard.readText())||"").trim();
    const m=t.match(/0x[0-9a-fA-F]{40}/);
    if(m){inp.value=m[0];hint(form,"");analyze(m[0]);}
    else{inp.focus();hint(form,t?"Lo que copiaste no es una dirección (0x + 40 caracteres).":"No hay nada copiado. Copia la dirección del contrato y vuelve a tocar «Pegar».");}
  }catch(e){inp.focus();hint(form,"Tu navegador no dejó leer el portapapeles: mantén presionado el campo y elige «Pegar»; la búsqueda empieza sola.");}
}));
// Auto-search: as soon as a complete address is in the field (pasted or typed), analyze it.
document.querySelectorAll(".addr-in").forEach(inp=>{
  let timer=null;
  const tryAuto=()=>{clearTimeout(timer);timer=setTimeout(()=>{
    const raw=inp.value.trim();const m=raw.match(/0x[0-9a-fA-F]{40}/);
    if(!m)return;const t=m[0].toLowerCase();
    if(raw!==m[0])inp.value=m[0];
    if(running||(last&&last.token===t&&document.body.dataset.view==="result"))return;
    hint(inp.closest("form"),"");analyze(t);
  },250);};
  inp.addEventListener("paste",()=>setTimeout(tryAuto,0));
  inp.addEventListener("input",tryAuto);
});
function flashGlobal(m){const o=$("#out");setView("result");o.innerHTML=`<section class="card"><div class="empty">${esc(m)}</div></section>`;}

// ---------- favourites watch (this browser only) ----------
const alertsList=()=>store.get("pbs_alerts",[]);
function pushAlert(a){const l=alertsList();if(l.some(x=>x.key===a.key))return;l.unshift(a);store.set("pbs_alerts",l.slice(0,30));if(a.s!=="ok")notify(a);}
function renderAlerts(){
  const l=alertsList();const box=$("#alerts");
  document.querySelectorAll(".badge").forEach(b=>{b.textContent=l.length;b.hidden=!l.length;});
  if(!box)return;box.hidden=!l.length;
  $("#alert-list").innerHTML=l.map(a=>`<li data-scan="${esc(a.t)}">${avatar(a.img,a.sym||a.name)}<div class="grow"><b>${esc(a.name||short(a.t))}</b><small>${esc(a.msg)} · ${ago(a.at)}</small></div><span class="pill ${a.s}">${a.s==="high"?"Urgente":a.s==="ok"?"Bueno":"Revisar"}</span></li>`).join("");
}
$("#alerts-clear").addEventListener("click",e=>{e.stopPropagation();store.set("pbs_alerts",[]);renderAlerts();});
function afterReport(token,res){
  // When a favourite is analysed again: note a verdict change, then refresh its snapshot.
  const f=favs();const i=f.findIndex(x=>x.t===token);if(i<0)return;
  const old=f[i],v=verdictOf(res.checks)[0],score=scoreOf(res.checks),p=res.pair;
  if(old.v&&old.v!==v)pushAlert({key:token+":v:"+old.at,t:token,name:old.name,sym:old.sym,img:old.img,at:Date.now(),s:order[v]<order[old.v]?"high":"ok",
    msg:"El veredicto cambió de «"+lbl[old.v]+"» ("+old.score+") a «"+lbl[v]+"» ("+score+")"});
  f[i]={...old,score,v,at:Date.now(),liq:p&&p.liquidity&&p.liquidity.usd||old.liq,price:p?Number(p.priceUsd)||old.price:old.price};
  store.set("pbs_fav",f);renderAlerts();
}
async function checkFavourites(){
  const f=favs().filter(x=>/^0x[0-9a-f]{40}$/.test(x.t)&&x.sym!=="W").slice(0,30);if(!f.length)return;
  const lastCheck=store.get("pbs_fav_check",0);if(Date.now()-lastCheck<10*60e3)return;store.set("pbs_fav_check",Date.now());
  let ps=null;try{ps=await timed(DEX+f.map(x=>x.t).join(","),{},10000);}catch(e){return;}
  const best={};for(const p of ps||[]){const b=(p.baseToken&&p.baseToken.address||"").toLowerCase();if(!best[b]||(p.liquidity&&p.liquidity.usd||0)>(best[b].liquidity&&best[b].liquidity.usd||0))best[b]=p;}
  for(const x of f){
    const p=best[x.t];const liq=p?(p.liquidity&&p.liquidity.usd||0):0,price=p?Number(p.priceUsd)||0:0;const base={t:x.t,name:x.name,sym:x.sym,img:x.img,at:Date.now()};
    if(!p&&x.liq>0)pushAlert({...base,key:x.t+":gone:"+x.at,s:"high",msg:"Ya no tiene mercado en DexScreener"});
    else if(p&&x.liq>=1000&&liq<1000)pushAlert({...base,key:x.t+":rug:"+x.at,s:"high",msg:"Se quedó sin liquidez (posible rug): de "+usd(Math.round(x.liq))+" a "+usd(Math.round(liq))});
    else if(p&&x.liq>0&&liq<=x.liq*0.5)pushAlert({...base,key:x.t+":liq:"+x.at,s:"warn",msg:"La liquidez cayó "+Math.round((1-liq/x.liq)*100)+" % desde que lo guardaste"});
    if(p&&x.price>0&&price<=x.price*0.5)pushAlert({...base,key:x.t+":px:"+x.at,s:"warn",msg:"El precio cayó "+Math.round((1-price/x.price)*100)+" % desde que lo guardaste"});
    else if(p&&x.price>0&&price>=x.price*2)pushAlert({...base,key:x.t+":up:"+x.at,s:"ok",msg:"El precio subió "+Math.round((price/x.price-1)*100)+" % desde que lo guardaste"});
  }
  renderAlerts();
}

// ---------- theme ----------
function applyTheme(pref){store.set("pbs_theme",pref);const dark=pref==="auto"?matchMedia("(prefers-color-scheme: dark)").matches:pref!=="light";document.documentElement.dataset.theme=dark?"dark":"light";
  document.querySelector('meta[name="theme-color"]').content=dark?"#060b10":"#eef3f5";
  document.querySelectorAll("[data-theme-set]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.themeSet===pref));}
document.querySelectorAll("[data-theme-set]").forEach(b=>b.addEventListener("click",()=>applyTheme(b.dataset.themeSet)));
document.querySelector(".themebtn").addEventListener("click",()=>applyTheme(document.documentElement.dataset.theme==="dark"?"light":"dark"));
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change",()=>{if(store.get("pbs_theme","dark")==="auto")applyTheme("auto");});
applyTheme(store.get("pbs_theme","dark"));
document.querySelectorAll("[data-clear]").forEach(b=>b.addEventListener("click",()=>{store.set(b.dataset.clear,b.dataset.clear==="pbs_alpha"?{}:[]);renderRecent();renderAlerts();b.textContent="Listo ✓";}));

// ---------- browser notifications (opt-in) ----------
const notifOn=()=>store.get("pbs_notif",false)&&"Notification" in window&&Notification.permission==="granted";
function notifState(){const e=$("#notif-state");if(!e)return;e.textContent=!("Notification" in window)?"Este navegador no permite notificaciones.":Notification.permission==="denied"?"Bloqueadas en los ajustes del navegador.":notifOn()?"Activadas.":"Desactivadas.";}
$("#notif-on").addEventListener("click",async()=>{if(!("Notification" in window))return notifState();const r=await Notification.requestPermission();store.set("pbs_notif",r==="granted");notifState();});
$("#notif-off").addEventListener("click",()=>{store.set("pbs_notif",false);notifState();});
async function notify(a){
  if(!notifOn())return;
  const lastAt=store.get("pbs_notif_last",0);if(Date.now()-lastAt<60e3)return;store.set("pbs_notif_last",Date.now());   // at most one per minute
  const opts={body:uiText(a.msg),icon:"icon-192.png",badge:"icon-192.png",tag:a.key,data:{url:"./?t="+a.t}};
  try{const reg=await navigator.serviceWorker?.ready;if(reg)return reg.showNotification("PreBuyScan · "+(a.name||short(a.t)),opts);}catch(e){}
  try{new Notification("PreBuyScan · "+(a.name||short(a.t)),opts);}catch(e){}
}
notifState();

// ---------- install as an app ----------
let installEvt=null;
const standalone=()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
function showInstall(on){document.querySelectorAll(".installbtn").forEach(b=>{b.hidden=!on;});const r=$(".installrow");if(r)r.hidden=!on;}
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installEvt=e;if(!standalone())showInstall(true);});
window.addEventListener("appinstalled",()=>{installEvt=null;showInstall(false);});
document.querySelectorAll(".installbtn").forEach(b=>b.addEventListener("click",async()=>{
  if(installEvt){installEvt.prompt();try{await installEvt.userChoice;}catch(e){}installEvt=null;showInstall(false);return;}
  const h=$(".installhint");if(h)h.textContent=isIOS?"En iPhone: toca Compartir (el cuadro con flecha ⬆) y luego «Agregar a pantalla de inicio».":"Abre el menú del navegador (⋮) y elige «Instalar app» o «Agregar a pantalla de inicio».";
}));
if(isIOS&&!standalone())showInstall(true);
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));

// ---------- start ----------
{const b=$("#boot");if(b){b.classList.add("gone");setTimeout(()=>b.remove(),400);}}
document.querySelectorAll(".algov").forEach(e=>{e.textContent=ALGO_VERSION;});
showVerification();
renderRecent();renderAlerts();checkFavourites();
if(isDesk())loadRail("new");
chainTick();setInterval(()=>{if(!document.hidden)chainTick();},30000);setInterval(chainState,10000);
(()=>{const q=new URLSearchParams(location.search).get("t")||location.hash.slice(1);if(q&&/^0x[0-9a-fA-F]{40}$/.test(q.trim()))analyze(q.trim());})();
matchMedia("(min-width:1100px)").addEventListener?.("change",ev=>{if(ev.matches&&$("#rail-trend").querySelector(".empty, .busy"))loadRail("new");});

matchMedia("(min-width:1100px)").addEventListener?.("change",arrangeReportColumns);


// Pointer interaction affects only the home background, never the content.
{
  const hero=document.querySelector(".hero"),bg=hero?.querySelector(".globe");
  const reduced=matchMedia("(prefers-reduced-motion: reduce)");
  if(hero&&bg){
    hero.addEventListener("pointermove",e=>{
      if(reduced.matches||e.pointerType==="touch")return;
      const r=hero.getBoundingClientRect();
      bg.style.setProperty("--hero-x",((e.clientX-r.left)/r.width*16-8).toFixed(1)+"px");
      bg.style.setProperty("--hero-y",((e.clientY-r.top)/r.height*12-6).toFixed(1)+"px");
    },{passive:true});
    hero.addEventListener("pointerleave",()=>{bg.style.removeProperty("--hero-x");bg.style.removeProperty("--hero-y");});
  }
}
