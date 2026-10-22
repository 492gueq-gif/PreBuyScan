const RPC = "https://rpc.mainnet.chain.robinhood.com";
const rpc = async (m, p) => (await (await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) })).json()).result;
(async () => {
  const pool = "0x7dea41a4b4efc11c5be19d4f41989c8d66fb7f67ffd4d6f0c6d4f18237ca8b88";
  const trades = (await (await fetch("https://api.geckoterminal.com/api/v2/networks/robinhood/pools/" + pool + "/trades")).json()).data.map(d => d.attributes);
  const buys = trades.filter(t => t.kind === "buy").slice(0, 5);
  const seen = {};
  for (const t of buys) {
    const tx = await rpc("eth_getTransactionByHash", [t.tx_hash]);
    const rc = await rpc("eth_getTransactionReceipt", [t.tx_hash]);
    const k = tx.to + " " + tx.input.slice(0, 10);
    seen[k] = (seen[k] || 0) + 1;
    console.log("::notice title=buy_" + t.tx_hash.slice(0, 8) + "::" + JSON.stringify({ to: tx.to, sel: tx.input.slice(0, 10), value: tx.value, usd: t.volume_in_usd, status: rc.status, logs: rc.logs.length, from_token: t.from_token_address }));
    await new Promise(r => setTimeout(r, 700));
  }
  const code = await rpc("eth_getCode", ["0x24cdcbc73a5978df5a22c614396f30b88f3f4a80", "latest"]);
  console.log("::notice title=hook::" + JSON.stringify({ hook_code_bytes: (code.length - 2) / 2, routers: seen }));
})();
