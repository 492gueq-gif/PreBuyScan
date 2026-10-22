# PRECISION_V1 — ¿predicen las señales de PreBuyScan el colapso de un token?

Protocolo congelado el 22 oct 2026 (UTC) ANTES de que existan resultados de BASE_RATES_V1. Autorizado por el jefe («Adelante», medir la precisión antes de lanzar). Código: `precision_study.py`; pruebas: `test_precision_study.py`. Investigación descriptiva paper.

## Datos
- Señales: lo que Lite registró en la primera vista de cada token (`research_data/lite_vistos_*.csv`, mismos SHA256 que BASE_RATES_V1): liquidez, compras y ventas de 6 h, edad.
- Resultados: `base_rates_v1_tokens.json` de BASE_RATES_V1 (misma muestra congelada).
- Antes de congelar solo se miró la distribución de veredictos (1,995 riesgo alto / 1,814 precaución / 411 sin alertas en el universo), nunca un resultado de precio.

## Veredicto de PreBuyScan (reglas de mercado de la página, con datos de 6 h)
- Riesgo alto: liquidez < 5,000 USD, o ≥ 20 compras y 0 ventas.
- Precaución: liquidez < 25,000 USD, o ventas/compras < 0.15, o menos de 1 h de vida.
- Sin alertas: nada de lo anterior. Sin datos: liquidez o transacciones ilegibles.
- NO se incluyen las revisiones del contrato (dueño, mint, lista negra, proxy) porque no hay estado histórico; esto mide solo la parte de mercado.

## Resultado observado
- Colapso: sin ninguna operación en los 30 min posteriores a la vista, o caída ≥ 90 % dentro de 24 h (mínimo o cierre).
- Pérdida de la mitad: sin operación, o retorno a 24 h ≤ −50 %.
- `provider_unavailable` y `not_processed` se excluyen y se cuentan.

## Métricas (todas, por mitad y total)
Para cada veredicto: n, tasa de colapso, tasa de pérdida de la mitad. Además, la cobertura: qué fracción de todos los colapsos marcó «riesgo alto».

## Prueba preregistrada (única)
La señal se considera útil solo si la tasa de colapso de «riesgo alto» supera a la de «sin alertas» por al menos 20 puntos porcentuales en AMBAS mitades (descubrimiento y confirmación). Si no, se reporta como no útil, sin ajustar umbrales.

## Límites
Periodo de 4.5 días; datos de 6 h, no 24 h; precio de operaciones ajenas, no ejecución propia; un token que «no colapsa» puede seguir siendo honeypot.
