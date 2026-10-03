# Auditoría de código — AppChess

Fecha: 2026-10-03 · Commit auditado: `ee6bf0c` (main) · Alcance: lectura estática + herramientas. No se pulsó la app contra datos reales.

## Estado de la corrección (misma fecha)

Después de la auditoría se corrigió todo lo que se podía sin una decisión tuya o sin la base de datos real. Comprobado: `tsc` 0 errores · ESLint 0 problemas (antes 91) · 43 pruebas pasan (antes 0) · `next build` OK · humo local de los endpoints (400/401/429/503 según el caso).

| ID | Estado | Qué se hizo / por qué no |
|---|---|---|
| A1 RLS | **Preparado, falta aplicar** | Revisado en el panel tras la restauración: RLS está DESACTIVADO en 7 de 8 tablas (solo `champion_progress` tenía política, y era ALL). Quedó escrita `supabase/migrations/010_rls_hardening.sql`: activa RLS y deja a `anon` solo las operaciones que la app usa (sin DELETE salvo `moves` e `insights`, sin UPDATE en `users`). Evita el borrado masivo, no la lectura ni la manipulación: eso exige login real. Falta ejecutarla en Supabase y probar la app. |
| A2 Cookie | **Pendiente (producto)** | Firmar la cookie no sirve mientras cualquiera pueda pedir una firmada para cualquier usuario público; requiere login real (OAuth) — decisión de producto. Documentado en el README. |
| A3 insights/pending | Hecho | El usuario sale solo de la cookie; error genérico. |
| A4 Motor y seed | Hecho | FEN y `elo` validados, límite por IP, cola del motor con tope (503 si está llena), `puzzles/seed` exige sesión. |
| M1 Importación | Hecho | Usuario validado, URL codificada, 5 importaciones por 10 min por IP. |
| M2 Cabeceras | Hecho | `nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`. CSP queda fuera a propósito (rompe páginas si se hace mal). |
| M3 Cola del motor | Parcial | Tope de cola y 503 hechos; mover búsquedas puntuales al motor del navegador no. |
| M4 Pruebas | Hecho | Vitest, 43 pruebas (clasificación, "brillante", precisión, Elo, libro, PGN, validaciones, límite de uso). Se extrajo `moveClassification.ts` para poder probarlo. |
| M5 CI | Hecho en el repo | `.github/workflows/ci.yml` (tipos, lint, pruebas, build) y se quitó `keep-alive.yml`. **Subirlos requiere el permiso `workflow` del token; si el push los rechaza, créalos desde la web de GitHub.** |
| M6 Imágenes | Hecho | 60 archivos PNG/JPG a WebP: 42.7 MB a 4.2 MB. |
| M7 Dependencias | Hecho | Se quitó `next-pwa`; Next 16.2.9 a 16.3.8 (corrige el aviso crítico). Quedan 9 avisos altos solo en la cadena de herramientas de desarrollo (`shadcn` CLI, `eslint-config-next`), que no corre en producción; `shadcn` se conserva porque `globals.css` importa su CSS. |
| M8 Lint de scripts | Hecho | `scripts/**` excluido; prefijo `_` para parámetros intencionalmente sin uso. |
| M9 Hooks de React | Hecho | Los 12 errores se resolvieron derivando estado en vez de usar efectos. Cambio visible: el aviso "Brillante/Genial" ya no se repite al volver a la misma jugada. |
| M10 Partir archivos | **No hecho** | `coachComment.ts` y `blunderDetector.ts` siguen grandes; partirlos sin pruebas de pantalla es riesgo alto de regresión. Se avanzó extrayendo `moveClassification.ts`. |
| B1 Duplicados | Parcial | Tabla `PIECE_VALUE` unificada en `attackMap.ts`. `CapturedTray` sigue en dos versiones porque sus props y estilos difieren. |
| B2 Código muerto | Hecho | Se eliminó el modo historia (inalcanzable: nada lo iniciaba), `MoveTable` y los imports/variables sin uso. |
| B3 Ventana de 1000 | Pendiente | Mostrar "últimas 1000" en cada tarjeta es un cambio de diseño. |
| B4 Compatibilidad de esquema | Pendiente | Hay que confirmar que las migraciones 003 y 004 ya están aplicadas en producción antes de quitar el camino de compatibilidad. |
| B5 Mensajes | Hecho | Mensajes de API en español. |
| B6 README | Hecho | README real: cómo correr, cómo se verifica, modelo de acceso, estructura. |
| B7 Emoji del libro | Sin cambio | Se pidió expresamente. |

Corrección a este informe: la sección de comparables decía que faltaba la precisión por win% de Lichess y el listado de aperturas CC0; el código ya las usa (`accuracy.ts`, `ecoOpenings.ts`), no son pendientes.

## Resultado en breve

El código compila limpio y está bien comentado, pero tiene **un riesgo grave de datos (RLS/anon key), cero pruebas automáticas y ningún CI**. Lo demás es deuda de mantenimiento (archivos gigantes, lint, dependencias, peso de imágenes).

| Métrica | Valor |
|---|---|
| TS/TSX en `src/` | ~15.8k líneas |
| `tsc --noEmit` | 0 errores |
| ESLint | 91 problemas: 45 `no-unused-vars`, 31 `no-require-imports` (scripts .cjs), 10 `set-state-in-effect`, 2 `immutability`, 2 `no-explicit-any`, 1 `exhaustive-deps` |
| `npm audit` (prod) | moderadas y altas: `brace-expansion` (alta, DoS), `@hono/node-server`, `baseline-browser-mapping` — todas con `npm audit fix` |
| Pruebas automáticas | **0** |
| CI | solo `keep-alive.yml` (ping cada 10 min, poco fiable) |
| `public/` | **42.8 MB**; retratos de campeones PNG de ~1.3 MB c/u |
| Archivos más grandes | `coachComment.ts` 2711 · `blunderDetector.ts` 1336 · `GameViewer.tsx` 1228 líneas |

## Hallazgos ALTA

| ID | Dónde | Qué pasa | Propuesta | Esfuerzo |
|---|---|---|---|---|
| A1 | `supabase/migrations/*.sql` (ninguna define RLS) | Las políticas viven solo en el panel de Supabase, no en el repo. La `anon key` es pública (va en el bundle). Con la política abierta `using(true) with check(true)` que se aplicó a `champion_progress`, **cualquiera con esa key puede leer/modificar/borrar** esa tabla directo por PostgREST; hay que asumir lo mismo para `games`, `moves`, `users`, `puzzle_*`. Desde el clon no pude leer las políticas vivas. | 1) Revisar en Supabase → Authentication → Policies qué tablas permiten escritura a `anon`. 2) Mover el acceso a escritura a rutas del servidor con un identificador firmado y dejar `anon` solo lectura donde aplique. 3) Versionar las políticas en una migración `010_rls.sql`. | M–L |
| A2 | `src/app/page.tsx:133`, `src/lib/getUsername.ts` | La "sesión" es la cookie `bv_username` escrita por JS, sin firma ni `HttpOnly`. Quien conozca un usuario de chess.com pone la cookie y escribe progreso de puzzles/Campeones como esa persona. | Cookie firmada (HMAC) emitida por el servidor, `HttpOnly; Secure; SameSite=Lax`. Mientras tanto, dejar documentado que es identidad declarada, no autenticación. | M |
| A3 | `src/app/api/insights/route.ts`, `analyze/pending/route.ts` | `insights` toma `username` del body sin cookie ni verificación y regenera insights de cualquier usuario; `pending` deja que `?username=` pise la cookie. Además `insights` devuelve `err.message` crudo al cliente. | Derivar el usuario siempre de la cookie (como ya hace `champions/complete`), ignorar `username` externo, mensaje de error genérico. | S |
| A4 | `/api/bestmove`, `/api/champions/move`, `/api/exercise`, `/api/puzzles/seed` | Sin autenticación ni límite de uso: cada llamada ocupa el motor (4–13 s de CPU) en una cola serial sin tope; un script puede dejar el servicio sin respuesta. `fen` y `elo` no se validan (FEN inválida va directo al motor; `elo` sin rango). `puzzles/seed` dispara descargas externas y escrituras a BD sin sesión. | Validar FEN con `chess.js` y `elo` en rango antes del motor; límite por IP/usuario (p. ej. Upstash/`@vercel/kv` o contador en memoria como mínimo); tope de cola; exigir cookie en `seed`. | M |

## Hallazgos MEDIA

| ID | Dónde | Qué pasa | Propuesta | Esfuerzo |
|---|---|---|---|---|
| M1 | `src/app/api/import` + `services/gameImport.ts` | Cualquiera puede importar el historial completo de cualquier usuario público (miles de partidas, escrituras en lotes de 300) sin límite; crea filas en `users`. `username` va sin codificar en `https://api.chess.com/pub/player/${username}`. | `encodeURIComponent`, validar patrón `^[A-Za-z0-9_-]{3,25}$`, límite de frecuencia, tope de partidas por importación. | S |
| M2 | `next.config.js` | Solo hay cabeceras COOP/COEP. Faltan `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`/`frame-ancestors` y una CSP. | Añadir el bloque estándar de cabeceras; CSP en modo `Report-Only` primero. | S |
| M3 | `src/services/stockfish.ts` | Motor singleton a nivel de módulo con cadena de promesas (`chain`). En serverless con varias instancias cada una carga su propio WASM; en Render de 1 CPU, la cola serial se satura con pocas peticiones. Los timeouts (4–13 s) devuelven resultado parcial sin avisar al cliente. | Tope de cola con 503 explícito; mover búsquedas puntuales al motor del navegador (ya existe `browserEngine.ts`) y dejar el servidor solo de respaldo. | M |
| M4 | Todo el repo | **Cero pruebas.** La lógica que decide las cifras (clasificación, precisión, Elo estimado, libro de aperturas, parser PGN) cambia seguido y ya hubo regresiones. | Vitest con casos fijos: cambio alfil-por-caballo no es brillante; mate = best; ACPL→Elo monótono; prefijos del libro; PGN con promoción/enroque. Empezar con `accuracy`, `eloEstimate`, `openingBook`, `pgnParser`, `classify`. | M |
| M5 | `.github/workflows/` | Sin CI de `tsc`/`lint`/`build`. `keep-alive.yml` es poco fiable (huecos de 50 min a 3 h) y quedó sustituido por el Worker de Cloudflare. | Reemplazar por un workflow `ci.yml` (`npm ci`, `tsc`, `eslint`, `build`); borrar `keep-alive.yml`. | S |
| M6 | `public/campeones/*.png` (42.8 MB) | Retratos PNG de ~1.3 MB; cada capítulo precarga varios. Pesa en móvil y en el ancho de banda de Render. | Convertir a WebP/AVIF (≈10× menos) con el `sharp` que ya está en devDependencies; `next/image` o `<picture>`. | S |
| M7 | `package.json` | `next-pwa` está con `disable: true` y arrastra `glob@7`, `workbox-*`, `rollup-plugin-terser` (deprecados). `npm audit` marca `brace-expansion` (alta). | Quitar `next-pwa` y `withPWA` (o migrar a Serwist si se quiere PWA real); `npm audit fix`. | S |
| M8 | `eslint.config.mjs` | 31 errores `no-require-imports` son de `scripts/*.cjs`, que no son código de la app; ocultan los problemas reales. | Excluir `scripts/**` o permitir `require` allí. | S |
| M9 | `GameViewer.tsx`, `ReviewSummaryModal.tsx` y otros | 10 `set-state-in-effect` + 2 `immutability` (`setX` usado antes de declararse): funcionan hoy pero son el patrón que React 19 desaconseja y propenso a bucles. | Derivar estado en render o con `useMemo`; ordenar declaraciones. Atender de a uno con prueba visual. | M |
| M10 | `coachComment.ts` (2711 líneas), `blunderDetector.ts` (1336), `GameViewer.tsx` (1228) | Archivos únicos con varias responsabilidades; difíciles de revisar y de probar. | Partir por responsabilidad: `coach/{motifs,templates,endgame,compose}.ts`; `analysis/{classify,brilliant,explain}.ts`; `GameViewer` → `CoachCard`, `NavRow`, `ActionRow`, `useBestMove`. | L |

## Hallazgos BAJA

| ID | Dónde | Qué pasa | Propuesta |
|---|---|---|---|
| B1 | `GameViewer.tsx` y `ChampionBattle.tsx` | `CapturedTray` y `PIECE_VALUE` duplicados. | Un solo `components/CapturedTray.tsx` y `lib/pieceValues.ts`. |
| B2 | `GameViewer.tsx` | Código muerto: `TABS`, `MoveTable`, `Zap`/`CheckCircle2`, funciones del modo historia sin uso (45 `no-unused-vars` en total). | Borrar o conectar. |
| B3 | `src/services/dashboardData.ts` | Ventana fija de 1000 partidas (`DASHBOARD_WINDOW`); está documentada, pero la UI no siempre dice "últimas 1000". | Mostrar la ventana en el título de cada tarjeta que la use. |
| B4 | `services/gameImport.ts` | Reintento sin columnas nuevas ante error `42703` (compatibilidad con esquema viejo): dos esquemas posibles dan cifras distintas entre pantallas. | Exigir la migración y quitar el camino de compatibilidad. |
| B5 | `api/*/route.ts` | Mensajes de error en inglés y español mezclados (`"missing data"`, `"fen required"`, `"Datos inválidos"`). | Unificar a español. |
| B6 | `docs/`, `README.md`, `AGENTS.md` | Documentación del coach extensa; el README no describe el modo Campeones ni cómo correr `scripts/audit*.cjs`. | Sección "Cómo se verifica" en el README. |
| B7 | UI (📖 en el visor) | El libro de apertura usa emoji; el resto de la UI usa glifos. Se hizo a pedido, pero choca con la preferencia de UI seria. | Cambiar a icono SVG `BookOpen` de lucide si molesta. |

## Qué NO se revisó (límites)

- No se recorrió la app pulsando botones ni se cruzaron cifras contra chess.com o la BD real (por tu regla de no tocar datos).
- No se auditó línea a línea `coachComment.ts`, `blunderDetector.ts` ni los textos narrativos de `champions.ts`.
- No se midió accesibilidad (contraste, teclado, lector de pantalla) ni coherencia de totales entre dashboard/stats/aperturas.
- No se buscaron proyectos comparables en GitHub (se pidió no gastar tokens en agentes). El código ya adopta dos ideas de Lichess (precisión por win% y aperturas ECO); queda por revisar su multihilo WASM con `SharedArrayBuffer` (ya hay cabeceras COOP/COEP) y la evaluación en lotes.
- La auditoría multiagente se detuvo a pedido tuyo; este informe es el resultado de la pasada directa.

## Orden sugerido

1. **Ya (S):** A3, M1, M2, M5, M7, M8, M6.
2. **Esta semana (M):** A1 y A2 (decidir modelo de acceso a la BD), A4, M4.
3. **Estructural (L):** M9, M10, B1–B2.
