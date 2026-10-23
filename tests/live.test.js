'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Live=require('../live.js');
const T='0x'+'11'.repeat(20),Q='0x'+'22'.repeat(20),W='0x'+'33'.repeat(20);
function row(id,attrs={}){return {id,attributes:{from_token_address:Q,to_token_address:T,tx_from_address:W,tx_hash:'0x'+'aa'.repeat(32),price_to_in_usd:'0.025',price_from_in_usd:'3000',volume_in_usd:'25',block_timestamp:'2026-10-23T00:00:00Z',...attrs}};}
test('market tape: derives direction and token price from addresses, not provider kind',()=>{
 const r=Live.normalize([row('a',{kind:'sell'}),row('b',{kind:'buy',from_token_address:T,to_token_address:Q,price_from_in_usd:'0.03'})],T);
 assert.equal(r[0].side,'buy');assert.equal(r[0].price,.025);assert.equal(r[1].side,'sell');assert.equal(r[1].price,.03);
});
test('market tape: unknown numbers stay unknown; missing addresses and duplicates rejected',()=>{
 const r=Live.normalize([row('a',{volume_in_usd:null,price_to_in_usd:''}),row('a'),row('b',{tx_from_address:'<bad>'}),row('c',{from_token_address:Q,to_token_address:Q})],T);
 assert.equal(r.length,1);assert.equal(r[0].usd,null);assert.equal(r[0].price,null);
 assert.equal(Live.normalize([row('d',{tx_hash:'javascript:alert(1)'})],T)[0].hash,null);
});
test('market tape: most recent 100 swaps, including separate events of one transaction',()=>{
 const r=Live.normalize(Array.from({length:105},(_,i)=>row(String(i),{block_timestamp:new Date(Date.UTC(2026,9,23,0,0,i)).toISOString()})),T);
 assert.equal(r.length,100);assert.equal(r[0].id,'104');assert.equal(r.at(-1).id,'5');
});
test('market traders: ranks sample volume, excludes anomalous/unknown values, never invents profit',()=>{
 const r=Live.normalize([row('a'),row('b',{from_token_address:T,to_token_address:Q,volume_in_usd:'10'}),row('c',{volume_in_usd:null}),row('d',{is_anomalous:true,volume_in_usd:'1000000'})],T);
 const w=Live.aggregate(r);assert.equal(w.length,1);assert.equal(w[0].buy,25);assert.equal(w[0].sell,10);assert.equal(w[0].n,2);assert(!('pnl' in w[0]));
});
