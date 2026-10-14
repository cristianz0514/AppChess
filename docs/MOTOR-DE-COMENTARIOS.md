# Motor de comentarios y Elo: qué cambió, cómo se verifica

Este documento explica la mejora del análisis de partidas: por qué los comentarios eran malos, qué se hizo, y **cómo se comprobó** (con partidas reales, no a ojo). El motor de ajedrez no cambió (profundidad 16, Stockfish); lo que cambió es cómo se **expresa** el análisis y cómo se calcula y muestra el Elo.

## 1. El diagnóstico (medido sobre partidas reales)

Se analizaron 8 partidas reales de cristianz05 con el código de producción (`analyzeGame`) y un Stockfish real, y se leyó cada comentario. Los fallos eran de seis tipos:

| Fallo | Ejemplo real |
|---|---|
| Solo hablaba de la jugada, no de lo que viene | "Be3" se describía; el motivo del error era Ng4+ con jaque y doble |
| Explicaba el error con una causa equivocada | Un error de 289 centipeones se explicaba con "peones doblados" |
| Se contradecía con su propia etiqueta | Jugada "excelente" + "la mejor de la posición" + "ahí estaba la oportunidad" |
| Oportunidades inventadas | "Tu oportunidad: el peón a a5, y después el peón a c6" (dos jugadas tranquilas) |
| Afirmaciones falsas de material | "El rival se lleva el caballo y gana material" al cerrar un cambio parejo |
| Repetición | La misma frase de "peones pasados conectados" en 8 jugadas seguidas; "Teoría de la apertura…" en 8 plies |

## 2. La solución: la "historia de la jugada" (`src/lib/lineStory.ts`)

Un motor lee la **variación principal que Stockfish ya devolvió** (no busca nada extra), la reproduce con chess.js y cuenta qué pasa en las siguientes 2–3 jugadas, como causa y efecto:

- Un error: *"Al mover el alfil dejas sin defensa el caballo de e5, y el alfil del rival se lo lleva."*
- Una táctica con su resultado: *"Permites un doble con jaque: el caballo del rival llega a g4, da jaque y ataca también el alfil de e3. Acabas perdiendo una pieza."*
- Lo que valía la jugada mejor: *"Con la dama a d4 atacabas la dama de b6 y el caballo de f6 a la vez, y ganabas más de una pieza."*
- Un mate: *"Esta jugada permite mate forzado en 3: el rival empieza con jaque de la dama en h7."*
- El error del rival visto desde el jugador: *"El rival deja el caballo en c6 sin defensa: te lo llevas con el alfil."*
- Lo que el jugador dejó pasar, con su razón: *"Se te escapó: con el caballo a d6 te llevabas el peón de a4."*

**Regla de oro: cada afirmación se verifica o no se dice.**

- El material se cuenta con una búsqueda de capturas (quiescence) al final de la línea, porque el motor corta la línea a mitad de un cambio y leer el tablero en el último ply cuenta capturas cuya recaptura quedó fuera.
- Una táctica (doble, jaque a la descubierta) solo se nombra si la línea **cobra** con ella (captura ≥ una pieza menor en las siguientes jugadas y neto ≥ 2 peones). La geometría sola sobre-dispara.
- La causa de una pérdida sale de las tablas de ataque antes/después: pieza sola y sin defensa, defensor que se movió, amenaza que ya estaba y se ignoró, línea que la jugada abrió.
- Dos mediciones independientes deben coincidir: la línea dice **qué** cae, la evaluación dice **cuánto** costó la posición.
- Si algo no se verifica, el módulo calla y hablan las reglas descriptivas de siempre.

Pruebas: `src/lib/lineStory.test.ts` (24 casos con posiciones armadas a mano: pieza colgada, defensor movido, amenaza ignorada, doble de caballo, mate, líneas que no se cobran, líneas ilegales, etc.).

### 2.1 Historia para TODAS las jugadas (sin búsquedas extra)

Solo las ~48 jugadas notables reciben una búsqueda profunda propia; el resto se comentaba solo por su forma. Pero el barrido que evalúa cada posición ya calculaba la **variación principal** y la tiraba (solo guardaba la mejor jugada). Ahora `EvalResult.pv` la conserva: la línea de la posición posterior a la jugada es la **respuesta**, y la de la posición anterior es la **mejor línea**. Con eso las jugadas tranquilas tienen la misma historia verificada, a costo cero de motor.

Lo que aporta a una jugada tranquila, siempre verificado contra la línea:

- una pérdida que el rival cobra después (imprecisiones: *"Tras la torre del rival a c5, acaba llevándose el peón de f5: pierdes un peón"*);
- una ganancia que la jugada **crea** (*"Con el peón a b4 atacas el caballo de a5 y el alfil de c5 a la vez: el rival no puede evitar perder una pieza"*);
- un peón que la línea lleva a coronar, o el cambio de damas que la línea hace (ideas más débiles: solo reemplazan una frase genérica).

Guardas que evitan atribuir mérito falso (todas con prueba):

- si la ganancia **ya estaba en el tablero** antes de la jugada (el rival dejó una pieza colgada), no se le acredita a esta jugada;
- una captura es parte de un cambio y se cuenta como tal; "ya no puede evitar perder…" queda para tácticas y sacrificios;
- la misma ganancia forzada se anuncia **una vez** por bando, no en cada jugada hasta cobrarla;
- no tapa un **amenaza de mate** ni el rescate de una pieza atacada, que son más urgentes.

Medido con `scripts/measureStories.cjs` sobre las mismas 41 partidas (porcentaje de comentarios que cuentan una historia verificada):

| | Antes | Después |
|---|---|---|
| Imprecisiones (las dos partes) | 20 % | **33 %** (genéricos: 36 % → 30 %) |
| Mis jugadas buenas | 5 % | 8 % |
| Mis errores / errores del rival | 63 % / 60 % | 64 % / 59 % (ya tenían búsqueda profunda: no era su límite) |

Lint tras el cambio: 0 problemas en 2783 comentarios. Lo que falta para subir los errores es el paso 2 (errores posicionales) y el 3 (causas de casos concretos), ver abajo.
### 2.2 Errores posicionales (`src/lib/positionalDiff.ts`)

Cuando un error no pierde material ni permite una táctica, el motor igual lo marca, y el coach solo podía decir "pasa de igualada a algo mejor". La razón está en **cómo termina la posición** unas jugadas después. Se compara el final de la línea que juegas con el final de la mejor línea (mismo largo, en un punto tranquilo: sin captura ni jaque en la última jugada, y con el mismo material) y se nombra lo que **empeora para quien movió**:

| Qué cambia | Ejemplo |
|---|---|
| Un peón pasado del rival | *En la línea principal el rival consigue un peón pasado en b4. Con el alfil a e6 lo evitabas.* |
| La pareja de alfiles | *En la línea principal te quedas sin la pareja de alfiles. Con el rey a g1 la conservabas.* |
| Una columna abierta | *En la línea principal el rival se hace con la columna c. Con la torre a c1 la controlabas tú.* |
| El enroque / el rey | *…te quedas sin poder enrocar y con el rey en el centro* · *tu rey queda más expuesto: los ataques sobre su zona pasan de 1 a 5* |
| Peones doblados o aislados | *En la línea principal te quedan peones doblados en la columna g.* |
| Una pieza encerrada o mal colocada | *En la línea principal el alfil de c1 queda encerrado, casi sin casillas.* |
| Actividad / desarrollo | *…tus piezas quedan bastante menos activas…* · *te quedas con 2 piezas menores menos desarrolladas* |

Reglas para no decir más de lo que se sabe:

- Solo se reporta lo que es **peor** para quien movió; nunca una diferencia que le favorece.
- Con el material distinto (aunque sea un peón) se calla: eso es de la historia de material.
- **Cuanto mayor el error, mayor debe ser la diferencia**: umbral 1.5 para una imprecisión, 2 para un error, 3 para un error grave (un peón aislado explica una imprecisión, no un error grave).
- Las frases describen dos tableros, no adivinan la causa de la evaluación. Se evitaron números inventados ("controlan 15 casillas menos" era un conteo interno mal nombrado) y frases demasiado fuertes ("sin casillas útiles" para una pieza con una casilla libre).

Medido con `scripts/measureStories.cjs` sobre las mismas 41 partidas:

| | Paso 1 | Paso 2 |
|---|---|---|
| Imprecisiones con texto genérico | 29 % | **21 %** |
| Errores míos con texto genérico | 12 % | 11 % |
| Errores del rival con texto genérico | 19 % | 18 % |
| Errores y errores graves con explicación posicional | — | 17 de 307 (5 %) |
| Imprecisiones + errores con explicación posicional | — | 75 de 611 |

**Lectura honesta:** el paso 2 ayuda sobre todo a las imprecisiones. En los errores y errores graves rinde poco (17 de 307) porque casi todos ya tenían material o táctica que contar; los que no, suelen ser situaciones donde la diferencia entre dos finales de línea no es tan nítida como para nombrarla con seguridad. Lint: 0 problemas en 2783 comentarios. 155 pruebas.
### 2.3 Patrones concretos, sacados de los datos (no adivinados)

Para saber qué patrones valían la pena se agregó un gancho de diagnóstico (`analyzeGame(..., trace)`, no lo usa la app) que registra, por cada jugada, las líneas que recibió el comentarista y qué historia salió. `scripts/minePatterns.cjs` etiqueta con características simples y comprobables los errores que **siguen sin explicación** y cuenta cuáles se repiten.

Lo que mostró, sobre 611 errores e imprecisiones reales: 398 ya tenían historia y **213 no**, y esos 213 son una cola larga de imprecisiones pequeñas, sobre todo de apertura, donde las dos jugadas son tranquilas (166 de 240 en la medición previa). No hay un patrón dominante: el que yo suponía ("capturar con la pieza equivocada") aparece en 7 de 240. Por eso se implementó solo lo que es **exacto y comprobable**:

| Patrón | Qué comprueba | Ejemplo |
|---|---|---|
| **Pérdida ya decisiva** (ajuste, no patrón) | Con |eval| ≥ 3 la evaluación casi no se mueve con el material (perdido por 5 o por 7), así que exigir que "la caída corrobore" bloqueaba pérdidas reales de una torre. Ahora la línea basta en posiciones decisivas | *Tras la torre del rival a c5, acaba llevándose el peón de f5: pierdes un peón.* |
| **Pierdes un tiempo** | La respuesta ataca la pieza que moviste (con algo más barato o sin defensa), esa pieza tiene que moverse otra vez, y la mejor línea no pierde ese tiempo | *El peón del rival ataca el caballo en g6 y tienes que moverlo otra vez: pierdes un tiempo. Con el peón a f5 no lo perdías.* |
| **Caballo rival inatacable** | Un caballo rival avanzado donde ningún peón tuyo podrá atacarlo, que la mejor línea no permite | *En la línea principal el caballo del rival se instala en d5, donde ningún peón tuyo puede echarlo.* |
| **Captura con la pieza equivocada** | La mejor jugada captura lo mismo con una pieza más barata y la jugada elegida pierde la más cara en el cambio | *Capturas en d5 con la torre y te la recapturan: es el cambio más caro. Con el caballo a d5 cambiabas más barato.* |

Medido sobre las mismas 41 partidas (`measureStories.cjs`):

| | Paso 2 | Paso 3 |
|---|---|---|
| Errores y imprecisiones sin explicación | 246 de 630 (39 %) | **213 de 611 (35 %)** |
| Imprecisiones con historia / genéricas | 32 % / 21 % | **36 % / 19 %** |
| Mis errores con historia | 62 % | 64 % |
| Patrones nuevos disparados | — | pierdes un tiempo 15 · caballo inatacable 17 · captura equivocada 0 |

**Lectura honesta:** es una mejora real pero pequeña, y es lo que los datos permiten. El 35 % restante es, en su mayoría, diferencias sutiles entre dos jugadas tranquilas que ni un entrenador humano resumiría en una frase comprobable; para esas, el comentario se queda en la jugada mejor y en el efecto en la evaluación, sin inventar una causa. Si aparecen más patrones en partidas futuras, se agregan donde ya hay lugar (`positionalDiff.ts` para diferencias entre finales de línea, `lineStory.ts` para causas dentro de la línea), cada uno con su prueba.

## 3. Contradicciones y repetición (`src/lib/coachComment.ts`)

- "Se te escapó" solo sobre una jugada que fue un error; nunca junto a "mejor/excelente".
- "La mejor de la posición" solo si la jugada es `best`; "desperdicias la ventaja" solo si el motor la marcó como error.
- Una oportunidad solo se anuncia si **gana** algo (captura, mate o jaque con plan); antes bastaba con que fuera la primera del motor.
- Un "sacrificio correcto" solo si la mejor respuesta del motor **realmente se lleva** la pieza movida; "brillante" exige lo mismo.
- "Gana material" se corrige con el cambio completo: una captura que cierra un cambio (aunque haya una jugada tranquila en medio) es un cambio parejo.
- Hechos permanentes (peones pasados conectados, tipo de final…) no se repiten: si ya hablaron en las últimas 3 jugadas del mismo bando, habla la regla siguiente (`recentRules` / `STANDING_RULES`).
- La teoría de apertura se comenta en las dos primeras jugadas de cada bando y al terminar el libro, no en cada jugada.
- Errores de plantilla corregidos: "jaque de el alfil" → "del alfil"; "la torre … colgado" → "colgada"; un jaque doble se describía como "a la descubierta"; "enfilada" con un peón detrás.

## 4. Cómo se verifica (todo reproducible)

| Qué | Cómo |
|---|---|
| Lógica de la historia, motor del navegador, veredictos, Elo | `npm test` (102 pruebas) |
| Lo que la app **realmente dice** en partidas reales | `scripts/analyzeOffline.mts` corre `analyzeGame` real con Stockfish real y sin base de datos |
| Costuras, contradicciones y repeticiones sobre miles de comentarios | `node scripts/lintComments.cjs <salidas.json>` |
| Por qué una jugada tiene o no historia | `scripts/storyDebug.mts` imprime las líneas y la decisión |
| Qué errores siguen sin explicación y qué comparten | `node scripts/minePatterns.cjs <salidas.json> [--show característica]` |
| Reclamos sin su autoridad, cobertura de campos, plan de jugadas | `scripts/auditClaims.cjs`, `auditCoverage.cjs`, `checkPlan.cjs`, `diffComments.cjs` |

Resultado del lint (`scripts/lintComments.cjs`):

| Corpus | Comentarios | Problemas |
|---|---|---|
| 8 partidas reales, **antes** de la mejora | 474 | **31** (reproches en jugadas buenas, "desperdicias la ventaja" tras una buena jugada, la misma frase 4–8 veces) |
| 41 partidas reales, **después** (código final) | 2783 | **0** |

En el camino el lint encontró errores que a ojo no se veían, todos corregidos y con prueba: "jaque de el alfil", "la torre … colgado/atacado", "el alfil … llevártela", "Ojo a el alfil".

`auditClaims`: 0 reclamos sin autoridad · `auditCoverage`: ningún campo sin usar · `checkPlan`: todo OK.

**Validación de punta a punta en producción** (la app real en Vercel, motor en el navegador, base de datos real): se re-analizó una partida de cristianz05 con el botón nuevo; el análisis terminó, escribió 59 jugadas y el resumen mostró el Elo con su rango y el rating real. Se leyeron los comentarios generados y se corrigieron dos defectos de género que solo se veían ahí.

## 5. El Elo: ¿estaba muy alto? Sí, y por una razón más profunda que la fórmula

Se midió contra partidas reales de chess.com cuyos jugadores tenían rating conocido (`scripts/collectCalibrationGames.cjs` + `scripts/calibrateElo.mts`), analizadas con el análisis de producción.

**Muestra:** 102 partidas públicas de chess.com (204 jugadores-partida, ratings 246–3375, blitz y rápidas), analizadas con el análisis real de la app a profundidad 16.

**Hallazgos** (cifras en la sección 5.1):

1. **La fórmula publicada era demasiado empinada para una sola partida.** Mapeaba ACPL 20 a 2400 y ACPL 200 a 420. En las 8 partidas reales de cristianz05 (rating ~1030) la app dio entre **400 y 2400** según la partida: 2250 y 2400 en las partidas sin errores, 400 en la caótica. Sobre toda la muestra, el error típico era de **702 puntos** y sobrestimaba a los jugadores de 600–1200 en +250 a +580.
2. **Una sola partida casi no identifica el rating.** Fuera de muestra (dejando una partida fuera cada vez), en el rango que cubre la app (400–2500) el modelo calibrado se equivoca **426 puntos**; simplemente adivinar el promedio (1284) se equivoca 460. El ACPL de una partida depende de la apertura, la complejidad de la posición y un único descuido.
3. Las alternativas probadas (ACPL con tope 150/300/2000, mediana de pérdida, precisión por probabilidad de ganar, tasa de errores) rindieron parecido; la mejor familia fue ACPL con tope por jugada (300 se eligió por ser lo convencional; 150 rindió igual dentro del ruido). El tope de 2000 de antes era lo peor: un solo "mate perdido" sumaba 87 puntos al promedio de una partida de 23 jugadas.
4. El control de tiempo (blitz/rápida) **no** mejora la estimación (426 → 428): no se usa.

**Qué se cambió** (`src/lib/eloEstimate.ts`):

- Curva ajustada con datos (`ln Elo = a − b·ACPL`), más suave: ya no da 2400 por una partida limpia.
- Tope de 300 por jugada (una catástrofe no define a un jugador).
- Mínimo **12 jugadas reales** (antes 6).
- **Se muestra con su incertidumbre**: "≈ 1100, probable entre 800 y 1550", junto al **rating real** de cada jugador, y el texto aclara que es orientativo.
- Para recalibrar tras cambiar la profundidad o la clasificación: correr `calibrateElo.mts` y actualizar las constantes en un solo lugar.

### 5.1 Resultados de la calibración

Todo sale de `node scripts/calibrateElo.mts <salidas de analyzeOffline>`.

| | Error típico (rmse) | Error mediano |
|---|---|---|
| **Antes** (fórmula publicada, tope 2000), toda la muestra | 702 | 534 |
| Adivinar siempre el promedio (rango 400–2500) | 460 | — |
| **Ahora** (curva calibrada, tope 300), fuera de muestra, rango 400–2500 | **426** | **323** |

Sesgo por banda de rating, **antes** → los de abajo salían muy altos y los de arriba muy bajos:

| Rating real | 0–900 | 900–1200 | 1200–1500 | 1500–1800 | 1800–2100 | 2100–2500 |
|---|---|---|---|---|---|---|
| Sesgo antes (puntos) | +582 | +249 | +117 | −75 | −283 | −310 |

**Lo que sigue siendo verdad** y ninguna fórmula arregla: una estimación hecha con una sola partida tiende hacia el centro de la población (~1300). Sale algo alta para quien tiene 700 y algo baja para quien tiene 2000. Es el precio de un predictor débil (correlación −0.5), y por eso la app muestra **el rango y el rating real al lado**.

**El rango mostrado** es `[Elo/1.5, Elo·1.5]`: fuera de muestra contuvo el rating real el **79 %** de las veces (1.3 → 51 %, 1.7 → 90 %). Es ancho a propósito: ese ancho es lo poco que dice una partida.

**En las 8 partidas reales de cristianz05** (rating ~1030):

| | Rango de las 8 partidas | Promedio |
|---|---|---|
| Antes | 400 – 2400 | 1319 |
| Ahora | 950 – 1620 (y el rango mostrado contiene su rating real en las 8) | 1319 |

El promedio coincide por casualidad; lo que cambia es que ya no hay partidas de "2400" ni de "400" para el mismo jugador.

## 6. El motor del navegador (`src/lib/browserEngine.ts`)

Tres defectos que falseaban el análisis en dispositivos lentos o ante un fallo:

1. **Una búsqueda cortada por plazo contaminaba la siguiente.** El plazo resolvía la promesa y dejaba el motor pensando; las líneas `info` y el `bestmove` de la búsqueda vieja caían en el manejador de la nueva. Ahora el plazo envía `stop` y espera el `bestmove`.
2. **Un motor colgado o caído se leía como "posición igual".** Sin líneas `info` se devolvía 0.00; tras un error de memoria del WASM, el resto de la partida se clasificaba como igualada. Ahora "sin puntuación" es un fallo: se reemplaza el motor y se reintenta una vez; si no responde, la posición queda sin evaluar (nunca con un 0.00 inventado). Una posición sin jugadas legales (mate/ahogado) es una respuesta válida y no reinicia nada.
3. **El plazo decidía la profundidad.** El tope de 10 s por posición hacía que un teléfono lento buscara menos profundo y registrara menos pérdida → Elo inflado según el dispositivo. Los plazos pasan a 60 s / 120 s: son una red de seguridad contra un motor colgado, no un presupuesto de tiempo. Un dispositivo lento tarda más; no busca menos.

Pruebas con un Worker simulado: `src/lib/browserEngine.test.ts` (búsqueda normal, parada por plazo sin contaminar la siguiente, motor colgado, motor caído, sin respuesta nunca, mate/ahogado, líneas MultiPV con su profundidad).

## 7. Partidas ya analizadas

Los comentarios se guardan en la base de datos al analizar. Las partidas analizadas antes de esta mejora conservan el texto viejo hasta volver a analizarlas:

- Una partida: botón **"Volver a analizar"** en la cabecera de la partida.
- Todas: botón **"Volver a analizar todo con el coach mejorado"** en la tarjeta "Análisis del Motor" (usa las últimas 200 partidas; tarda, y debe quedarse la pestaña abierta).

## 8. Límites conocidos

- Los comentarios de jugadas tranquilas (sin error ni táctica) siguen siendo descriptivos: no hay una línea del motor para esas jugadas. Es deliberado: decir más sería inventar.
- El análisis sigue siendo secuencial en el navegador (un motor). Paralelizarlo con varios Workers sería más rápido pero no se hizo: no se pudo verificar de punta a punta en un navegador real con la base de datos de producción.
- La calibración del Elo es tan buena como su muestra (partidas públicas de chess.com, jugadores colombianos y del ranking). Conviene repetirla si cambia la profundidad.
