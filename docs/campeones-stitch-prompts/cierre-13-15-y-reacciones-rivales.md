# Prompts pendientes — cerrar 13-15 y expresiones de reacción de rivales

Dos frentes, en orden de prioridad. Mismo flujo de siempre: generas en Stitch,
me pasas el HTML fuente de la página (no el diálogo "Export") o las URLs de
`lh3.googleusercontent.com`, y yo las proceso e integro todas de una pasada.

Estilo base — repítelo o pégalo primero en cada generación (ver también
`00-guia-de-estilo.md`):

> Ilustración digital estilizada e icónica, NO fotorrealista, estilo visual
> novel de videojuego móvil, paleta cálida consistente con el elenco ya
> generado (Judit, Zsófia, László, Károly...), sin texto ni captions
> incrustados en la imagen. Retratos: cabeza y hombros, fondo transparente,
> expresión legible a ~44px.

---

## Frente 1 — Terminar capítulos 13-15 (lo único que bloquea cerrar la historia)

Son los 3 assets que faltan. `exhibicion-mundial.jpg` (cap. 15) y el resto de
escenas ya existen y se reutilizan — no hay que tocarlas.

### `sala-elite.jpg` — escena, capítulos 13 y 14

> Un salón de torneo de máximo nivel — pisos de mármol o madera fina, mesas
> espaciadas con mucho protocolo, cámaras y prensa acreditada, público
> detrás de cordones, ambiente de evento de clase mundial de los años 90.
> Debe sentirse un escalón por encima de `torneo-internacional.jpg`: más
> solemne, más prensa, más protocolo. Formato vertical, espacio despejado
> en la mitad superior para el cuadro de diálogo. Sin texto ni captions en
> la imagen.

### `karpov.png` — retrato, capítulo 13 (Anatoli Kárpov, hecho real)

> Busto de un ex-campeón mundial de ajedrez, hombre de mediana edad,
> aspecto distinguido y sereno, traje formal de alto nivel, mirada calmada
> y profesional — el primer ex-campeón mundial que Judit enfrenta, no un
> rival cualquiera, así que su presencia debe sentirse pesada aunque su
> gesto sea tranquilo. Mismo estilo icónico que el resto del elenco — **NO
> parecido fotorrealista de una persona real**, es una figura estilizada
> genérica. Fondo transparente.

### `kasparov.png` — retrato, capítulo 15 (Garry Kaspárov, hecho real — clímax de la historia)

> Busto del campeón mundial de ajedrez #1, hombre de mediana edad, aspecto
> intenso y carismático, cejas pronunciadas, mirada de concentración feroz,
> traje formal de competencia de alto nivel. Es el rival final de toda la
> historia — su expresión debe sentirse más intensa que la de cualquier
> otro rival anterior. Mismo estilo icónico que el resto del elenco — **NO
> parecido fotorrealista de una persona real**. Fondo transparente.

---

## Frente 2 — Expresiones de reacción para rivales existentes

Cada rival ya tiene diálogo propio en el desenlace (`outroWin` /
`outroLoseOrDraw`) pero hoy se muestra con el mismo retrato neutro sin
importar si ganó o perdió. La idea es la misma que ya funcionó con Judit
(`judit-victoria.png` / `judit-derrota.png`): un segundo retrato por rival
que se muestra solo en esa línea de reacción.

Para cada rival hacen falta dos variantes:
- **`-sorpresa`** → el rival ACABA DE PERDER contra Judit (se usa en
  `outroWin`). Shock, incredulidad, respeto forzado — el gesto que ya
  probamos con Zsófia (`zsofia-sorpresa.png`) y que funciona muy bien a
  tamaño pequeño.
- **`-satisfecho`** → el rival ACABA DE GANAR (se usa en
  `outroLoseOrDraw`). Alivio o satisfacción contenida, sin ser cruel — casi
  todos estos rivales tienen líneas amables tipo "habrá otra oportunidad".

Empieza por los dos que mencionaste — son el primer hito narrativo fuerte
(cap. 5, el primer Maestro) y el rival fundacional (cap. 2). El resto
queda listo para cuando quieras seguir.

### Prioridad 1 — Maestro (capítulo 5)

**`maestro-sorpresa.png`**
> Busto del mismo Maestro de ajedrez húngaro (50-60 años, chaqueta formal,
> gafas de marco grueso) que ya existe en `maestro.png`, mismo personaje y
> ropa — pero ahora con expresión de shock genuino y respeto forzado,
> cejas levantadas, como si acabara de perder contra una niña de 9 años y
> todavía no lo procesara. Fondo transparente.

**`maestro-satisfecho.png`**
> Mismo Maestro (`maestro.png`), expresión de alivio sereno y orgullo
> profesional discreto — ganó, pero sin gesto de superioridad, más bien
> "por ahora sigo siendo yo el Maestro". Fondo transparente.

### Prioridad 2 — Károly (capítulo 2)

**`karoly-sorpresa.png`**
> Busto del mismo niño húngaro de club de ajedrez (`karoly.png`), mismo
> personaje y ropa — expresión de sorpresa genuina y un poco de vergüenza
> infantil, como un niño que acaba de perder contra una rival más pequeña
> que él delante de otros. Fondo transparente.

**`karoly-satisfecho.png`**
> Mismo niño (`karoly.png`), sonrisa de niño competitivo pero sin maldad —
> ganó esta vez y está encantado de presumirlo. Fondo transparente.

### Resto del elenco (mismo patrón, para cuando sigas)

Repite exactamente la misma estructura — "mismo personaje que
`{base}.png`, misma ropa, cambia solo la expresión a shock/respeto forzado
o a alivio/satisfacción" — para:

- **`eszter`** (cap. 3, rival infantil) — sorpresa: ojos muy abiertos,
  boca entreabierta; satisfecho: sonrisa tímida de niña que ganó.
- **`nagy`** (cap. 4, adulto de club) — sorpresa: incredulidad de adulto
  vencido por una niña, casi cómica; satisfecho: condescendencia suave de
  "ya decía yo".
- **`rival-internacional`** (cap. 6) — sorpresa: la calma confiada de
  `rival-internacional.png` se le rompe de golpe; satisfecho: confirma su
  confianza inicial, gesto de "lo sabía".
- **`drimer`** (cap. 7, GM Dolfi Drimer, hecho real — recordar: sin
  parecido fotorrealista) — sorpresa: concentración profunda que se
  convierte en shock silencioso, un GM adulto procesando que perdió con
  una niña de 10; satisfecho: alivio profesional serio, sin sonreír mucho.
- **`larisa`** (cap. 8, equipo soviético) — sorpresa: la disciplina
  seria se le quiebra un segundo, sorpresa genuina bajo el uniforme
  serio; satisfecho: vuelve a la seriedad disciplinada de siempre, casi
  sin gesto — "cumplió con lo esperado".
- **`varga`** (cap. 9, GM húngaro) — sorpresa: la tensión que ya tenía
  en `varga.png` explota en shock evidente — sabía que perder sería
  vergonzoso, y pasó; satisfecho: alivio visible de haber evitado esa
  vergüenza.
- **`suarez`** (cap. 10, GM condescendiente) — sorpresa: la
  condescendencia inicial se derrumba en incredulidad; satisfecho: la
  condescendencia se confirma y se acentúa, gesto de "obviamente".
- **`petrov`** (cap. 11, casi-récord) — sorpresa: solemnidad que se
  convierte en shock contenido, consciente de estar en el lado
  equivocado de un récord histórico; satisfecho: alivio serio de
  "todavía no, pero casi".
- **`halasz`** (cap. 12, GM final de la norma, hecho real — resignación
  ya está en su intro/outro) — sorpresa: la resignación respetuosa que
  ya describe su ficha, llevada al extremo — shock + respeto genuino;
  satisfecho: sereno, casi aliviado de que el récord espere un poco más.

---

## Resumen de archivos a generar

**Frente 1 (bloquea cerrar la historia):** `sala-elite.jpg`, `karpov.png`,
`kasparov.png`.

**Frente 2, prioridad inmediata:** `maestro-sorpresa.png`,
`maestro-satisfecho.png`, `karoly-sorpresa.png`, `karoly-satisfecho.png`.

**Frente 2, resto (cuando quieras seguir):** un par sorpresa/satisfecho
para cada uno de `eszter`, `nagy`, `rival-internacional`, `drimer`,
`larisa`, `varga`, `suarez`, `petrov`, `halasz` (18 archivos).

Cuando tengas el Frente 1 completo, dímelo y con eso ya puedo escribir el
contenido narrativo real de los capítulos 13-15 (ahora solo existen como
fila en el roadmap, no como capítulo jugable) y dejar la historia
completa. El Frente 2 se integra en cualquier momento, no bloquea nada.
