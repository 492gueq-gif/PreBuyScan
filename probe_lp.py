import json
from playwright.sync_api import sync_playwright
JS = r"""async()=>{const out={};try{const B='https://robinhoodchain.blockscout.com/api';const RPC='https://rpc.mainnet.chain.robinhood.com';
const q=async(k,u,n=1500)=>{try{const r=await fetch(u);const j=await r.json();out[k]=JSON.stringify(j).slice(0,n);return j;}catch(e){out[k]='ERR '+e;return null}};
const rpc=async(m,p)=>{const r=await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:m,params:p})});return (await r.json());};
const creator='0xb187ea7defc99a5d2b089047b866697390b6fd19';
await q('nft_creator',B+'/v2/addresses/'+creator+'/nft?type=ERC-721',2500);
await q('holders_1b28',B+'/v2/tokens/0x1b282927b9c5d39d7161f51af3203b44b1a56213/holders',2500);
const d=await (await fetch('https://api.dexscreener.com/tokens/v1/robinhood/0x39dbed3a2bd333467115de45665cc57f813c4571')).json();
out.pons_pairs=JSON.stringify(d.map(p=>[p.dexId,p.labels,p.pairAddress,p.liquidity&&p.liquidity.usd])).slice(0,2500);
const g=await (await fetch('https://api.dexscreener.com/tokens/v1/robinhood/0x1b282927b9c5d39d7161f51af3203b44b1a56213')).json();
out.g_pairs=JSON.stringify(g.map(p=>[p.dexId,p.labels,p.pairAddress])).slice(0,800);
const v2=d.find(p=>(p.labels||[]).includes('v2'));const v3=d.find(p=>(p.labels||[]).includes('v3'));
if(v2)await q('v2_lp_holders',B+'/v2/tokens/'+v2.pairAddress+'/holders',2500);
const head=await rpc('eth_blockNumber',[]);const hb=parseInt(head.result,16);out.head=hb;
if(v3){// Mint(address sender,address indexed owner,int24 indexed,int24 indexed,uint128,uint256,uint256)
 const r=await rpc('eth_getLogs',[{address:v3.pairAddress,topics:['0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde'],fromBlock:'0x'+(hb-9000000).toString(16),toBlock:'latest'}]);
 out.v3_mints=JSON.stringify(r.result?r.result.slice(0,3).map(l=>[l.topics[1],l.data.slice(0,66),l.transactionHash]):r).slice(0,1500);}
// V4 ModifyLiquidity(bytes32 indexed id,address indexed sender,int24,int24,int256,bytes32)
const pid=g[0]&&g[0].pairAddress;
const r4=await rpc('eth_getLogs',[{address:'0x8366a39cc670b4001a1121b8f6a443a643e40951',topics:['0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec',pid],fromBlock:'0x'+(hb-9000000).toString(16),toBlock:'latest'}]);
out.v4_modliq=JSON.stringify(r4.result?r4.result.slice(0,4).map(l=>[l.topics[2],l.data,l.transactionHash]):r4).slice(0,2500);
await q('gt_new',`https://api.geckoterminal.com/api/v2/networks/robinhood/new_pools?page=1`,2500);
await q('gt_new_inc',`https://api.geckoterminal.com/api/v2/networks/robinhood/new_pools?page=1&include=base_token`,600);
}catch(e){out.FATAL=String(e)+' '+(e.stack||'')}return out;}"""
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page()
    pg.goto("https://492gueq-gif.github.io/PreBuyScan/")
    try:
        r=pg.evaluate(JS)
    except Exception as e:
        r={'pyerr':str(e)[:3000]}
    for i,(k,v) in enumerate(r.items()):print("::notice title=lp_%02d::"%i+json.dumps({k:v}).replace("%","%25")[:3800])
    b.close()
