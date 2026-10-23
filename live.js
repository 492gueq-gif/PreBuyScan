/* Read-only market tape. Public GeckoTerminal snapshots, not a WebSocket or order book. */
(function(root){
  'use strict';
  const addr=x=>/^0x[0-9a-f]{40}$/i.test(x||'');
  const num=x=>x==null||x===''||!Number.isFinite(Number(x))?null:Number(x);
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=x=>x==null?'—':x.toLocaleString('es-MX',{style:'currency',currency:'USD',maximumFractionDigits:2});
  const price=x=>x==null?'—':'$'+x.toLocaleString('es-MX',{maximumSignificantDigits:7});
  const short=x=>x.slice(0,6)+'…'+x.slice(-4);
  function normalize(data,token){
    const seen=new Set();token=token.toLowerCase();
    return (data||[]).flatMap(d=>{
      const a=d.attributes||{},from=String(a.from_token_address||'').toLowerCase(),to=String(a.to_token_address||'').toLowerCase();
      if(!d.id||seen.has(d.id)||!addr(a.tx_from_address)||(from!==token&&to!==token))return [];
      seen.add(d.id);const buy=to===token;
      return [{id:d.id,side:buy?'buy':'sell',usd:num(a.volume_in_usd),price:num(buy?a.price_to_in_usd:a.price_from_in_usd),wallet:a.tx_from_address.toLowerCase(),hash:/^0x[0-9a-f]{64}$/i.test(a.tx_hash||'')?a.tx_hash:null,time:Date.parse(a.block_timestamp),anomalous:!!a.is_anomalous}];
    }).sort((a,b)=>(Number.isFinite(b.time)?b.time:0)-(Number.isFinite(a.time)?a.time:0)).slice(0,100);
  }
  function aggregate(rows){
    const wallets=new Map();
    for(const r of rows){if(r.anomalous||r.usd==null)continue;let w=wallets.get(r.wallet);if(!w){w={wallet:r.wallet,buy:0,sell:0,n:0};wallets.set(r.wallet,w);}w[r.side]+=r.usd;w.n++;}
    return [...wallets.values()].sort((a,b)=>(b.buy+b.sell)-(a.buy+a.sell));
  }
  function mount(el,{token,pool,holders,fetchJSON,isActive=()=>true}){
    if(!el||!addr(token)||!/^0x[0-9a-f]{40}([0-9a-f]{24})?$/i.test(pool||''))return ()=>{};
    let rows=[],tab='trades',side='all',minimum=0,paused=false,busy=false,dead=false,stamp=null,timer=null;
    const link=w=>addr(w)?`<a href="?t=${esc(w)}">${esc(short(w))}</a>`:'—';
    el.innerHTML=`<div class="market-tabs" role="tablist" aria-label="Datos del mercado"><button type="button" role="tab" data-market-tab="trades" aria-selected="true">Transacciones</button><button type="button" role="tab" data-market-tab="traders" aria-selected="false">Top traders</button><button type="button" role="tab" data-market-tab="holders" aria-selected="false">Holders</button></div>
      <div class="market-tools"><label>Tipo <select class="market-side"><option value="all">Todas</option><option value="buy">Compras</option><option value="sell">Ventas</option></select></label><label>Mín. USD <input class="market-min" type="number" min="0" value="0" inputmode="decimal"></label><button type="button" class="btn2 sm market-pause" aria-pressed="false">Pausar</button></div>
      <p class="market-status" role="status">Cargando operaciones…</p><div class="tw market-table"></div><p class="market-note">Fuente: GeckoTerminal · par principal · consulta cada 30 s; puede haber retraso del proveedor. Operaciones ejecutadas, no órdenes pendientes. Top traders: volumen de la muestra, no ganancias. Holders: captura del análisis. ⚠ = operación marcada anómala por el proveedor.</p>`;
    const table=el.querySelector('.market-table'),status=el.querySelector('.market-status');
    function draw(){
      let head,body;
      if(tab==='holders'){
        head=['Wallet','Tipo','% del suministro'];
        body=(holders?.top||[]).map(h=>`<tr><td>${link(h.addr)}</td><td>${h.contract?'Contrato':'Wallet'}</td><td>${num(h.pct)==null?'—':esc(h.pct)+' %'}</td></tr>`).join('');
      }else if(tab==='traders'){
        head=['Wallet','Compró USD','Vendió USD','Operaciones'];body=aggregate(rows).slice(0,30).map(w=>`<tr><td>${link(w.wallet)}</td><td class="pos">${money(w.buy)}</td><td class="neg">${money(w.sell)}</td><td>${w.n}</td></tr>`).join('');
      }else{
        head=['Hora / tipo','USD','Precio USD','Trader','Tx'];
        body=rows.filter(r=>(side==='all'||r.side===side)&&(minimum===0||(r.usd!=null&&r.usd>=minimum))).map(r=>`<tr class="tape-${r.side}"><td class="${r.side==='buy'?'pos':'neg'}">${r.side==='buy'?'↑ Compra':'↓ Venta'}<small>${Number.isFinite(r.time)?new Date(r.time).toLocaleTimeString('es-MX'):'Hora no disponible'}</small></td><td>${money(r.usd)}${r.anomalous?' ⚠':''}</td><td>${price(r.price)}</td><td>${link(r.wallet)}</td><td>${r.hash?`<a href="https://robinhoodchain.blockscout.com/tx/${esc(r.hash)}" target="_blank" rel="noopener">↗</a>`:'—'}</td></tr>`).join('');
      }
      table.innerHTML=`<table class="tt"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${body||`<tr><td colspan="${head.length}">${tab==='holders'?'Holders no disponibles en este análisis.':rows.length?'Sin resultados para estos filtros.':'Sin operaciones disponibles.'}</td></tr>`}</tbody></table>`;
    }
    const fresh=()=>stamp?'Última consulta correcta: '+new Date(stamp).toLocaleTimeString('es-MX')+' · '+rows.length+' operaciones.':'Sin una consulta correcta todavía.';
    async function tick(){
      if(dead)return;if(!el.isConnected){destroy();return;}if(paused||busy||root.document.hidden||!isActive())return;
      busy=true;
      try{
        const j=await fetchJSON('https://api.geckoterminal.com/api/v2/networks/robinhood/pools/'+pool.toLowerCase()+'/trades',{},12000);
        if(dead||paused||!el.isConnected)return;if(!Array.isArray(j.data))throw new Error('Invalid trade response');
        rows=normalize(j.data,token);stamp=Date.now();draw();status.textContent=(paused?'Pausado. ':'')+fresh();
      }catch(e){if(!dead&&el.isConnected)status.textContent='Sin actualización: datos posiblemente desactualizados. '+fresh();}
      finally{busy=false;}
    }
    function click(e){const b=e.target.closest('[data-market-tab]');if(b){tab=b.dataset.marketTab;el.querySelectorAll('[data-market-tab]').forEach(x=>x.setAttribute('aria-selected',String(x===b)));el.querySelector('.market-tools').hidden=tab!=='trades';draw();}
      if(e.target.closest('.market-pause')){paused=!paused;const p=el.querySelector('.market-pause');p.textContent=paused?'Reanudar':'Pausar';p.setAttribute('aria-pressed',String(paused));status.textContent=(paused?'Pausado. ':'')+fresh();if(!paused)tick();}}
    function change(){side=el.querySelector('.market-side').value;minimum=Math.max(0,Number(el.querySelector('.market-min').value)||0);draw();}
    function destroy(){dead=true;clearInterval(timer);el.removeEventListener('click',click);el.removeEventListener('input',change);root.document.removeEventListener('visibilitychange',visible);}
    function visible(){if(!root.document.hidden)tick();}
    el.addEventListener('click',click);el.addEventListener('input',change);root.document.addEventListener('visibilitychange',visible);
    draw();timer=setInterval(tick,30000);tick();return destroy;
  }
  const api={normalize,aggregate,mount};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.PBLive=api;
})(typeof window!=='undefined'?window:globalThis);
