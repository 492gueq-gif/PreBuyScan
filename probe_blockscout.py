import json, urllib.request, time
B="https://robinhoodchain.blockscout.com/api/v2/"
def get(path):
    r=urllib.request.Request(B+path,headers={"Accept":"application/json","Origin":"https://492gueq-gif.github.io","User-Agent":"PreBuyScan-probe"})
    with urllib.request.urlopen(r,timeout=20) as resp: return dict(resp.headers), json.load(resp)
def note(k,v):
    s=json.dumps(v,default=str)[:3800];print(k,s);print("::notice title="+k+"::"+s.replace("%","%25"))
for tok in ["0x1b282927b9c5d39d7161f51af3203b44b1a56213","0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd","0x39dbed3a2bd333467115de45665cc57f813c4571"]:
    try:
        h,a=get("addresses/"+tok)
        info={k:a.get(k) for k in ("creator_address_hash","creation_transaction_hash","is_contract","is_verified","has_tokens","implementations")}
        info["cors"]=h.get("Access-Control-Allow-Origin") or h.get("access-control-allow-origin")
        info["ratelimit"]={k:v for k,v in h.items() if "ratelimit" in k.lower()}
        note("addr_"+tok[:8],info)
        tx=get("transactions/"+a["creation_transaction_hash"])[1] if a.get("creation_transaction_hash") else {}
        frm=(tx.get("from") or {}).get("hash"); to=(tx.get("to") or {}).get("hash")
        note("ctx_"+tok[:8],{"from":frm,"to":to,"to_name":(tx.get("to") or {}).get("name"),"method":tx.get("method"),"created":(tx.get("created_contract") or {}).get("hash"),"ts":tx.get("timestamp")})
        if frm:
            h2,c=get("addresses/"+frm+"/counters")
            note("cnt_"+tok[:8],c)
            h3,txs=get("addresses/"+frm+"/transactions")
            items=txs.get("items",[])
            note("txs_"+tok[:8],{"n":len(items),"next":bool(txs.get("next_page_params")),"sample":[{"to":(i.get("to") or {}).get("hash"),"method":i.get("method"),"created":(i.get("created_contract") or {}).get("hash"),"value":i.get("value"),"from":(i.get("from") or {}).get("hash"),"ts":i.get("timestamp")} for i in items[:8]]})
            h4,cc=get("addresses/"+frm+"/transactions?filter=to%20%7C%20from")
        h5,hold=get("tokens/"+tok+"/holders")
        note("hold_"+tok[:8],{"n":len(hold.get("items",[])),"top":[{"a":(i.get("address") or {}).get("hash"),"c":(i.get("address") or {}).get("is_contract"),"v":i.get("value")} for i in hold.get("items",[])[:5]]})
        h6,tk=get("tokens/"+tok)
        note("tok_"+tok[:8],{k:tk.get(k) for k in ("holders_count","holders","total_supply","decimals","type")})
    except Exception as e:
        note("err_"+tok[:8],{"error":type(e).__name__,"msg":str(e)[:200]})
    time.sleep(2)
