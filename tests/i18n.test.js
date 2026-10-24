'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const i=require('../i18n.js');
const spanish=/[áéíóúñ¿]|\b(?:del|que|para|sin|con|El|las|los|una|tiene|está|puede|comprobaciones)\b/;
test('English: all static page text and accessible labels have translations',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g,'');
  const strings=[...html.matchAll(/>([^<>]+)</g)].map(m=>m[1].trim());
  strings.push(...[...html.matchAll(/(?:placeholder|aria-label|title|alt)="([^"]+)"/g)].map(m=>m[1]));
  for(const s of strings.filter(s=>s&&!s.startsWith('Español')))assert.ok(!spanish.test(i.tr(s)),s+' => '+i.tr(s));
});
test('English: dynamic score reasons, providers, market tape and wallet descriptions',()=>{
  for(const s of [
    'La puntuación de 39/100 se debe principalmente a: Liquidez baja. Una señal de riesgo alto limita la puntuación a un máximo de 39/100.',
    '2 comprobación(es) pendientes o con error técnico: reducen la puntuación por falta de datos, pero no prueban una vulnerabilidad.',
    'Última consulta correcta: 12:04 · 50 operaciones.',
    'No se pudo armar el mapa: el explorador no respondió. Prueba de nuevo en un minuto.',
    'Todas las comprobaciones corrieron; 2 sin resultado concluyente (cuentan como «sin datos»).',
    'El creador lanzó 4 tokens y 3 murieron',
    'Sin actualización: datos posiblemente desactualizados. Sin una consulta correcta todavía.',
    'Fondeó a 5 wallets nuevas',
    '↑ Compra', '↓ Venta', 'Error de conexión', 'Análisis parcial',
    'Precio según DexScreener: $0.02; según GeckoTerminal: $0.03. Confía menos en las cifras de mercado.'
  ])assert.ok(!spanish.test(i.tr(s)),s+' => '+i.tr(s));
});
test('English: translation is idempotent and preserves addresses and numbers',()=>{
  const address='0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd';
  assert.equal(i.tr(address),address);assert.equal(i.tr('$569,890 · 95 %'),'$569,890 · 95 %');
  for(const s of Object.keys(i.EXACT)){const en=i.tr(s);assert.equal(i.tr(en),en,'second pass: '+s);}
});
