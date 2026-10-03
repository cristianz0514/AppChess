# AnaliChess IA

App web que importa tus partidas de chess.com, las analiza con Stockfish, comenta cada jugada (coach basado en reglas) y tiene un modo narrativo jugable, "Nacimiento de un Campeón" (Judit Polgár).

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Supabase · chess.js · Stockfish (WASM).

## Cómo correrlo

```bash
cp .env.local.example .env.local   # NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY
npm ci
npm run dev                        # http://localhost:3000
```

El motor Stockfish se copia a `public/engine/` antes de `dev` y `build` (`scripts/copyEngine.cjs`).

## Cómo se verifica

| Comando | Qué comprueba |
|---|---|
| `npx tsc --noEmit` | tipos |
| `npm run lint` | ESLint (debe salir sin errores ni avisos) |
| `npm test` | pruebas de la lógica que decide las cifras: clasificación y "brillante", precisión, Elo estimado, libro de aperturas, parser de PGN, validaciones y límite de uso |
| `npm run build` | build de producción (acepta valores ficticios de Supabase) |

GitHub Actions corre las cuatro en cada push a `main` (`.github/workflows/ci.yml`).

`scripts/audit*.cjs` y `scripts/checkPlan.cjs` auditan los comentarios del coach (afirmaciones, cobertura, disparos); sus resultados quedan en `docs/`.

## Modelo de acceso (leer antes de tocar la seguridad)

- **No hay autenticación real.** La "sesión" es la cookie `bv_username`, que solo declara qué usuario de chess.com estás viendo. Los datos de partidas son públicos en chess.com; lo que sí es propio de cada persona es su progreso (puzzles, Campeones).
- La app usa **solo la `anon key` de Supabase** (pública, va en el navegador). Nunca debe usarse ni guardarse una `service_role`.
- Por eso la protección real de los datos depende de las políticas RLS configuradas en el panel de Supabase, **que no están versionadas en `supabase/migrations/`**. Cualquier cambio de modelo de acceso (login real, políticas por usuario) es una decisión de producto que se toma primero ahí.
- Las rutas de API derivan el usuario **siempre de la cookie**, nunca del body ni de la URL, y las que gastan CPU del motor o escriben datos tienen límite de uso por IP (`src/lib/rateLimit.ts`, en memoria por instancia) y validación de entradas (`src/lib/validate.ts`).

## Estructura

- `src/app/` páginas y rutas de API · `src/components/` UI · `src/lib/` lógica pura (probada) · `src/services/` acceso a datos y motor.
- `src/lib/moveClassification.ts` umbrales de clasificación y regla de "brillante".
- `src/lib/coachComment.ts` plantillas de comentario (archivo grande; ver `docs/coach-categorias.md`).
- `supabase/migrations/` esquema, en orden numérico.
- `public/campeones/` retratos y escenas en WebP.
