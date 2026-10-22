"""Read-only capability probe for PreBuyScan features (no keys, no transactions)."""
import json, urllib.request, time
RPC="https://rpc.mainnet.chain.robinhood.com"
PM="0x8366a39cc670b4001a1121b8f6a443a643e40951"
INIT="0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438"
V4_POOLS=["0x383947b7d40a42354119700a2f4097debd50e61bb7c868fc5f9ff5c7aafa0c79","0xec0d72f0c70983525d99f777303e92f82b3cbb2e89aede6d44c9f22f8abc3f55"]
V3_POOL="0x6693cf7e87a7039e36fa5f3c0d7e06818d259468"
out={}
def req(url,body=None,headers=None):
    r=urllib.request.Request(url,data=json.dumps(body).encode() if body else None,headers={"Content-Type":"application/json","Accept":"application/json","User-Agent":"PreBuyScan-probe","Origin":"https://492gueq-gif.github.io",**(headers or {})})
    with urllib.request.urlopen(r,timeout=20) as resp:
        return dict(resp.headers), json.load(resp)
def rpc(m,p):
    h,j=req(RPC,{"jsonrpc":"2.0","id":1,"method":m,"params":p})
    return h,j
def note(k,f):
    try: out[k]=f()
    except Exception as e: out[k]={"error":type(e).__name__,"msg":str(e)[:200]}
note("rpc_cors",lambda: rpc("eth_blockNumber",[])[0].get("Access-Control-Allow-Origin"))
head=int(rpc("eth_blockNumber",[])[1]["result"],16);out["head"]=head
for pid in V4_POOLS:
    def full(pid=pid):
        h,j=rpc("eth_getLogs",[{"address":PM,"topics":[INIT,pid],"fromBlock":"0x0","toBlock":"latest"}])
        return j.get("error") or {"n":len(j["result"]),"first":j["result"][:1]}
    note("v4_init_full_range_"+pid[:10],full)
def ranges():
    res={}
    for span in (10_000,100_000,1_000_000,10_000_000):
        h,j=rpc("eth_getLogs",[{"address":PM,"topics":[INIT],"fromBlock":hex(head-span),"toBlock":hex(head)}])
        res[span]=j.get("error",{}).get("message","ok n=%d"%len(j.get("result",[])))[:120]
    return res
note("v4_init_ranges",ranges)
note("simulateV1_support",lambda: (lambda j: j.get("error") or "ok")(rpc("eth_simulateV1",[{"blockStateCalls":[{"calls":[]}]},"latest"])[1]))
for name,addr in (("ur_8876","0x8876789976decbfcbbbe364623c63652db8c0904"),("ur_204f","0x204FAca1764B154221e35c0d20aBb3c525710498"),("permit2","0x000000000022D473030F116dDEE9F6B43aC78BA3"),("v2_router","0x89e5db8b5aa49aa85ac63f691524311aeb649eba")):
    note("code_"+name,lambda a=addr:(len(rpc("eth_getCode",[a,"latest"])[1]["result"])-2)//2)
def gecko(pool):
    h,j=req("https://api.geckoterminal.com/api/v2/networks/robinhood/pools/%s/trades"%pool)
    d=j.get("data",[])
    return {"cors":h.get("Access-Control-Allow-Origin"),"n":len(d),"attrs":sorted(d[0]["attributes"].keys()) if d else None,"sample":d[0]["attributes"] if d else None}
note("gecko_trades_v3",lambda: gecko(V3_POOL))
time.sleep(3)
note("gecko_trades_v4",lambda: gecko(V4_POOLS[0]))
time.sleep(3)
def dex():
    h,j=req("https://api.dexscreener.com/tokens/v1/robinhood/0x39dbed3a2bd333467115de45665cc57f813c4571")
    return {"cors":h.get("Access-Control-Allow-Origin"),"keys":sorted(j[0].keys()) if j else None}
note("dexscreener",dex)
s=json.dumps(out,default=str)
print(s)
for i in range(0,len(s),3500):
    print("::notice title=probe_%d::"%(i//3500)+s[i:i+3500].replace("%","%25"))
