# Prompt para pedir apoyo a otras IAs

Copia todo lo que está entre las líneas y pégalo en ChatGPT, Gemini, Claude web,
etc. Añade al final el bloque de categorías de `coach-categorias.md` sobre el
que quieras trabajar.

---

## CONTEXTO

Estoy construyendo el motor de comentarios de una app de análisis de ajedrez en
español (público de Latinoamérica, jugadores de club de ~1000-1400 ELO). Los
comentarios se generan **de forma determinista con plantillas**, NO con un
modelo de lenguaje.

**Por qué plantillas y no IA:** analicé capturas del Game Review de Chess.com y
su texto tiene errores de concordancia propios de interpolación de plantillas
("Tu mejor opción era **ataca** el centro con un peón", "Le has permitido al
oponente **captura** una torre"). Un modelo de lenguaje nunca comete ese error.
Sus comentarios se leen bien precisamente porque son deterministas: cortos,
consistentes y nunca alucinan. La profundidad les viene de **clasificar bien la
situación** y **nombrar la consecuencia concreta**, no de escribir bonito.

Esto se llama **NLG basada en plantillas** (*template-based Natural Language
Generation*) o *data-to-text*.

## ARQUITECTURA

Un motor de ajedrez (Stockfish) analiza la partida y produce **hechos
verificados**: clasificación de la jugada, evaluación antes/después, mejor
jugada alternativa, patrones tácticos detectados por geometría del tablero,
material perdido en la línea de castigo.

Con esos hechos se compone el comentario en hasta **dos ranuras**:

- **A — Qué pasó** (siempre): la consecuencia concreta.
- **B — Cómo cambió la partida** (a veces): contexto de evaluación.
- **C — Qué era mejor** (a veces): la alternativa.

Regla: siempre A, más B **o** C, nunca las tres — así el texto queda corto.
Cada ranura solo se muestra si su dato está verificado.

## REGLAS DE ESTILO (obligatorias)

1. **2 frases máximo, ~25-45 palabras en total.** Breve y contundente.
2. **Prohibidas las cifras de peones en la prosa.** Nada de "pierdes 1.8
   peones" — es jerga de motor. Chess.com pone el número en un recuadro aparte
   y mantiene la frase cualitativa ("ahora tu oponente tiene ventaja").
3. **Prohibida la notación algebraica** ("Bxd5", "Rf4", "O-O"). Se escribe
   "el alfil captura en d5", "el enroque corto".
4. **Segunda persona**, tono de entrenador directo y cercano: "dejas",
   "pierdes", "encontraste". Ni acusador ni condescendiente.
5. **Español neutro de Latinoamérica.** Evitar el registro peninsular ("sacan
   el caballo", "has permitido").
6. **Vocabulario ajedrecístico exacto** cuando el patrón esté verificado:
   horquilla, clavada, pincho, ataque a la descubierta, pieza colgada, doble
   amenaza, peón pasado, columna abierta.
7. **Nombrar piezas y casillas** ("el alfil de c4"), nunca casillas sueltas.
8. **Prohibido el relleno**: "mejorar la posición", "obtener ventaja",
   "controlar el centro" (salvo que sea literalmente el punto), "no
   aprovechaste la oportunidad" sin decir cuál.
9. **Concordancia de género correcta**: "una horquilla", "un pincho", "una
   clavada", "un ataque a la descubierta".
10. **Cuidado con quién hace qué.** Si el jugador captura, "capturas"; si el
    rival captura algo suyo, "el rival te captura". Nunca invertir los papeles.

## LO QUE NECESITO DE TI

Para cada categoría que te pase, redacta **3 variantes** de la frase que
cumplan todas las reglas. Las variantes deben decir lo mismo con distinta
redacción, para que jugadas consecutivas no suenen calcadas.

Formato de respuesta:

```
### [número]. [nombre de la categoría]
1. …
2. …
3. …
```

Los textos entre llaves son huecos que rellena el programa. Úsalos tal cual:
`{pieza}` (ej. "el alfil"), `{casilla}` (ej. "c4"), `{piezaRival}`,
`{patrón}` (ej. "una horquilla"), `{estado}` (ej. "con ventaja").

## EJEMPLOS DE LO QUE YA FUNCIONA BIEN

- `¡Jaque mate! El caballo remata en f7.`
- `Tenías jaque mate forzado y se te escapó. Con la torre a e7 forzabas el mate.`
- `Tras los cambios pierdes la dama. Lo indicado era la torre a b6.`
- `Sacrificio correcto: entregas el alfil y el motor confirma que hay compensación.`
- `Estaba parejo y ahora el rival toma la ventaja.`

## EJEMPLOS DE LO QUE NO SIRVE (y por qué)

- ❌ `Pierdes unos 1.8 peones de ventaja.` → cifra de motor en la prosa
- ❌ `Con esta jugada pierdes el hilo de la posición.` → comodín, no enseña nada
- ❌ `Capturas la torre en d4.` → describe pero no evalúa si el cambio conviene
- ❌ `Sacas el alfil a e7 y ganas actividad.` → genérico, sirve para cualquier jugada
- ❌ `Montabas una pincho.` → concordancia de género mal
- ❌ `Dejas que el caballo del rival capture...` cuando fue el jugador quien capturó → papeles invertidos

---

**Categorías sobre las que quiero trabajar:**

[Pega aquí las filas de `coach-categorias.md`]
