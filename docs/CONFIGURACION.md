# Configuración y puesta en marcha

La app necesita **dos variables**. Sin ellas no abre ninguna cuenta (el login responde 503 con el mensaje que lo dice).

| Variable | Dónde se saca |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → tu proyecto → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API Keys → **anon / public** (nunca la `service_role`) |

## Dónde viven (y por qué se pierden)

- **En tu PC:** `.env.local` en la carpeta del proyecto. Git la ignora a propósito, así que **no viaja con un clon, un `git pull` ni una carpeta nueva**. Al mover o clonar el proyecto hay que copiarla.
- **En el servidor (Vercel/Render):** en el panel, Settings → Environment Variables. Se incrustan **al construir**: si cambian, hay que redesplegar.
- **Respaldo:** guarda las dos líneas en tu gestor de contraseñas. La anon key es pública por diseño, pero la URL y la clave correctas son justo lo que se pierde.

## Cómo saber qué falla en 5 segundos

Abre `https://TU-DOMINIO/api/health` (o `http://localhost:3000/api/health`):

| Respuesta | Significa |
|---|---|
| `{"ok":true,"env":true,"db":"ok"}` | todo bien |
| `"env":false` | faltan las variables (este servidor/carpeta no tiene `.env.local` o el panel no las tiene) |
| `"env":true,"db":"error"` | variables puestas pero la base no responde: proyecto de Supabase **pausado**, URL/clave de otro proyecto, o RLS/tablas ausentes |

## Supabase gratis se pausa

El plan gratuito pausa el proyecto tras ~1 semana sin actividad. `vercel.json` llama a `/api/health` una vez al día (cron), que consulta la base y lo mantiene despierto. Si ya está pausado: Supabase → Restore project, y revisar `/api/health`.

## Despliegue en Vercel

1. vercel.com → Add New → Project → importar `cristianz0514/AppChess`.
2. Environment Variables: las dos de arriba (Production, Preview y Development).
3. Deploy. Cada `git push` a `main` redespliega solo.
4. Probar `/api/health` y luego entrar con tu usuario.

## Motor de análisis en el navegador (Vercel)

El análisis de partidas corre Stockfish **en el navegador**, desde `/engine/*.wasm`. Esos archivos no están en git: los copia `scripts/copyEngine.cjs`. `vercel.json` usa `buildCommand`, que **no ejecuta** el gancho `prebuild` de npm, así que el comando incluye la copia (`ENGINE_LITE_ONLY=1`: solo las versiones ligeras, 14 MB; las completas de 108 MB no se usan por defecto). Si `/engine/stockfish-18-lite-single.wasm` responde 404, las partidas se quedan en "Analizando con Stockfish…".
