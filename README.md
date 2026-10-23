# PreBuyScan

**Scan before the scam.** Revisa antes de comprar. Por VIGIA.

Escáner de riesgo de tokens de **Robinhood Chain (chain 4663)** que corre en tu navegador: venta simulada (`eth_simulateV1`, sin firmar ni enviar nada), funciones peligrosas del contrato, dueño y proxy, creador e historial, control de la liquidez, holders, snipers, wallets ligadas, mapa de wallets y Alpha Radar.

- **Risk Shield:** Safety Score 0–100 (100 = menor riesgo *detectado*, nunca «seguro»), Data Confidence, cobertura y estado del análisis. Ver [SCORING_METHODOLOGY.md](SCORING_METHODOLOGY.md).
- **Alpha Radar:** filtros configurables y Alpha Signal Score de actividad, independiente del Safety Score; no predice precio.
- **Fuentes públicas sin claves:** RPC de Robinhood Chain, Blockscout, DexScreener, GeckoTerminal y la base de creadores propia. Ver [DATA_SOURCES.md](DATA_SOURCES.md).
- **Privacidad:** no pide wallet ni datos personales. Historial, favoritos y ajustes se guardan solo en tu navegador (`localStorage`).

Documentación: [PROJECT_STATUS.md](PROJECT_STATUS.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [AUDIT_REPORT.md](AUDIT_REPORT.md) · [SCORING_METHODOLOGY.md](SCORING_METHODOLOGY.md) · [DATA_SOURCES.md](DATA_SOURCES.md) · [TEST_RESULTS.md](TEST_RESULTS.md) · [DEPLOYMENT.md](DEPLOYMENT.md) · [docs/SMART_SHARE.md](docs/SMART_SHARE.md).

**Aviso:** herramienta informativa, no asesoría financiera ni auditoría. «Sin alertas» no significa «seguro» y ninguna revisión garantiza que puedas vender.
