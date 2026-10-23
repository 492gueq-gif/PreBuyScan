# Despliegue

- **Producción:** GitHub Pages sirve la rama `gh-pages` en https://492gueq-gif.github.io/PreBuyScan/.
- **Desarrollo:** ramas de trabajo (`feature/…`). Cada cambio entra por Pull Request hacia `gh-pages`.
- **Regla:** no se fusiona ni se publica sin autorización explícita del jefe. La CI debe estar en verde: lint, unitarias, SRI y navegador. Las comprobaciones con servicios reales no bloquean, pero se revisan.
- **Después de publicar:** el service worker (`sw.js`, versión `pbs-shell-vN`) usa red primero, así que los usuarios reciben la versión nueva en la siguiente visita. Si se cambia la lista de archivos del shell, se sube la versión.
- **Trabajos programados (rama `main`):** `creator-db.yml` (cada hora, minuto 41) y `precision-v2.yml` (cada hora, hasta el 29 oct).
- **Resultados de CI:** capturas y JSON en ramas `ci/ui-<run>` y `ci/live-<run>`; las ramas de resultados se pueden borrar sin afectar el sitio.
- **Reversión:** fusionar una PR de reversión hacia `gh-pages` (nunca force push).
