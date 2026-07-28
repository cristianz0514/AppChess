# Catálogo de categorías del coach — AnaliChess IA

Documento de trabajo para redactar las plantillas. **Cristian corrige la columna
"Frase"; el resto es información técnica de apoyo.**

## Cómo se arma un comentario

Cada comentario se compone de hasta **dos ranuras** (nunca tres, para que quede
corto como chess.com):

- **A — Qué pasó** (siempre): la consecuencia concreta.
- **B — Cómo cambió la partida** (a veces): el contexto de evaluación.
- **C — Qué era mejor** (a veces): la alternativa.

Regla: siempre A, más B **o** C. Si A ya nombra material perdido, B se omite
(sería obvio). C nunca aparece en jugadas buenas ni en mates.

Cada categoría admite **2-3 redacciones alternativas**, elegidas por el número
de jugada — así la misma jugada siempre da el mismo texto, pero jugadas
distintas no suenan calcadas.

### Convenciones de estilo acordadas

- **Sin cifras de peones en la prosa.** Chess.com muestra el número en un
  recuadro aparte y mantiene la frase cualitativa. Nuestra barra ya lo muestra.
- **Sin notación algebraica** (`Bxd5`). Se dice "el alfil captura en d5".
- **Segunda persona** para el jugador ("dejas", "pierdes", "encontraste").
- Vocabulario ajedrecístico exacto cuando esté verificado: horquilla, clavada,
  pincho, ataque a la descubierta, pieza colgada, doble amenaza.

---

## RANURA A — Qué pasó

### A1. Jugadas buenas / fuertes

| # | Categoría | Cuándo se dispara | Estado | Frase actual (corregir) |
|---|---|---|---|---|
| 1 | Jaque mate | La jugada da mate | ✅ Hecho | ¡Jaque mate! El caballo remata en f7. |
| 2 | Única jugada buena | La 1ª línea del motor supera a la 2ª por ≥1.5 peones | ✅ Hecho | ¡Solo había una jugada buena y la encontraste! |
| 3 | Táctica ejecutada | Patrón verificado por geometría | ✅ Hecho | Muy buena: montas una horquilla sobre la dama de d8. |
| 4 | Sacrificio correcto | Entrega material y el motor lo confirma | ✅ Hecho | Sacrificio correcto: entregas el alfil y el motor confirma que hay compensación. |
| 5 | Gana material | Captura sin recaptura posible | ✅ Hecho | Capturas el caballo en f3 y ganas material. |
| 6 | Jugada precisa | Es la mejor, sin nada más que destacar | ✅ Hecho | Jugada precisa: el motor la confirma como la mejor de la posición. |

### A2. Errores (solo si el motor la clasificó como imprecisión / error / error grave)

| # | Categoría | Cuándo se dispara | Estado | Frase actual (corregir) |
|---|---|---|---|---|
| 7 | Mate desperdiciado | Tenías mate forzado y no lo jugaste | ✅ Hecho | Tenías jaque mate forzado y se te escapó. |
| 8 | Pieza propia colgada | Tu pieza queda sin defensor | ✅ Hecho | El alfil de c4 queda sin defensa. |
| 9 | Pérdida de material | La línea de castigo te cuesta una pieza | ✅ Hecho | Con esta jugada pierdes el alfil. |
| 10 | Pérdida tras cambios | Igual, pero en secuencia de capturas | ✅ Hecho | Tras los cambios pierdes la dama. |
| 11 | Captura gratis del rival | Su respuesta te quita una pieza | ✅ Hecho | El rival te captura el alfil. |
| 12 | Pieza atrapada | Tu pieza no tiene casilla segura | 🆕 Nuevo | El caballo de a5 queda atrapado: no tiene casilla segura. |
| 13 | Rey en última fila | Rey encerrado tras sus peones, sin escape | 🆕 Nuevo | Tu rey queda encerrado en la última fila, sin casilla de escape. |
| 14 | Táctica desperdiciada | Había un patrón verificado y no lo viste | ✅ Hecho | Tenías un pincho sobre la torre de b2 y la dejas pasar. |
| 15 | Error genérico | Nada concreto detectado | ⚠️ Comodín | Con esta jugada pierdes el hilo de la posición. |

### A3. Jugadas normales (sin error)

| # | Categoría | Cuándo se dispara | Estado | Frase actual (corregir) |
|---|---|---|---|---|
| 16 | Jugada de libro | Está en el libro ECO (3.807 líneas) | ✅ Hecho | Jugada de libro: disputas el centro con el peón en e5. |
| 17 | Enroque | O-O u O-O-O | ✅ Hecho | Enrocas: el rey queda protegido y la torre entra en juego. |
| 18 | Coronación | Promoción de peón | ✅ Hecho | Coronas en d8 y quedas con ventaja decisiva. |
| 19 | Cambio favorable | Captura con saldo positivo | 🆕 Nuevo | Capturas el peón en e5 y ganas material. |
| 20 | Cambio parejo | Captura con saldo cero | 🆕 Nuevo | Cambias el caballo en f3: un cambio parejo. |
| 21 | Da jaque | La jugada da jaque | ✅ Hecho | Das jaque con la dama y quedas con ventaja. |
| 22 | Desarrollo | Caballo/alfil sale de su casilla inicial | ✅ Hecho | Desarrollas el alfil a e7. |
| 23 | Ocupa el centro | Llega a d4/e4/d5/e5 | ✅ Hecho | Ocupas el centro con el peón en e4. |
| 24 | Jugada tranquila | Nada de lo anterior | ⚠️ Comodín | Jugada sólida, quedas en una posición equilibrada. |

---

## RANURA B — Cómo cambió la partida

Se calcula por **bandas de evaluación**: perdida (≤−3) · peor (−3 a −1) ·
igualada (−1 a 1) · mejor (1 a 3) · ganando (≥3).

| # | Transición | Estado | Frase actual (corregir) |
|---|---|---|---|
| 25 | igualada → peor | ✅ Hecho | Estaba parejo y ahora el rival toma la ventaja. |
| 26 | ventaja → igualada | ✅ Hecho | Tenías ventaja y la dejas escapar: queda igualada. |
| 27 | ventaja → peor | ✅ Hecho | Ibas con ventaja y ahora estás peor. |
| 28 | perdida → perdida | ✅ Hecho | Ya venías mal, así que esto no la decide, pero tampoco ayuda. |
| 29 | ganando → ganando | ✅ Hecho | Sigues ganando, pero desperdicias parte de la ventaja. |

---

## RANURA C — Qué era mejor

| # | Condición de la jugada correcta | Estado | Frase actual (corregir) |
|---|---|---|---|
| 30 | Forzaba mate | ✅ Hecho | Con la torre a e7 forzabas el mate. |
| 31 | Defendía la pieza colgada | ✅ Hecho | Con la torre a e1 lo defendías. |
| 32 | Capturaba algo | ✅ Hecho | Con el alfil a f5 te llevabas el caballo. |
| 33 | Montaba una táctica | ✅ Hecho | Con el alfil a c5 montabas un pincho. |
| 34 | Daba jaque | ✅ Hecho | El alfil a b5 daba jaque y cambiaba el ritmo. |
| 35 | Enrocaba | ✅ Hecho | Enrocar primero dejaba al rey a salvo. |
| 36 | Peón al centro | ✅ Hecho | Atacar el centro con el peón a d4 era mejor. |
| 37 | Genérica | ⚠️ Comodín | Lo indicado era el caballo a a5. |

---

## Categorías candidatas — NO implementadas

Ordenadas por relación valor/dificultad. Las de arriba son las que más
reducirían los comodines (#15, #24, #37).

### Detección barata (geometría, sin motor)

| # | Categoría | Qué detectar |
|---|---|---|
| 38 | Peón pasado | Peón sin peones rivales delante en su columna ni adyacentes |
| 39 | Peón doblado / aislado | Estructura de peones tras la jugada |
| 40 | Torre en columna abierta | Torre llega a columna sin peones |
| 41 | Torre en séptima | Torre alcanza la 7ª/2ª fila |
| 42 | Defensor sobrecargado | Una pieza defiende dos cosas a la vez |
| 43 | Rey expuesto | Escudo de peones roto tras el enroque |
| 44 | Desarrollo atrasado | En apertura, pocas piezas menores fuera |
| 45 | Dama temprana | Dama sale antes de la jugada 6 |
| 46 | Casilla débil / puesto avanzado | Caballo en casilla que ningún peón puede expulsar |
| 47 | Pareja de alfiles | Ganas o cedes los dos alfiles |
| 48 | Centro cedido | Cambio que entrega el centro |
| 49 | Ataque al enroque | Piezas apuntando al rey enrocado |
| 50 | Final de peones | Solo quedan peones y reyes |

### Detección media (usa el motor, ya está disponible)

| # | Categoría | Qué detectar |
|---|---|---|
| 51 | Jugada forzada | Solo había una legal razonable |
| 52 | Aguantar la posición | Peor, pero la jugada es la más resistente |
| 53 | Contrajuego permitido | La respuesta del rival crea amenaza propia |
| 54 | Recaptura obligada | Cualquier otra pierde material |
| 55 | Repetición / tablas | La línea lleva a tablas por repetición |

### Descartadas (no fiables sin búsqueda profunda)

Zugzwang · atracción · despeje · interferencia · rayos X · sobrecarga táctica.
Requieren búsqueda profunda y es fácil afirmarlas mal — preferimos no decir
nada antes que decir algo falso.

---

## Estado actual

- **37 categorías implementadas** (24 en A, 5 en B, 8 en C)
- **3 comodines** por eliminar: #15, #24, #37
- **18 candidatas** listadas (38-55)
- Techo realista: **~55 categorías** con la infraestructura actual
