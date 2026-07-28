# Catálogo de categorías del coach — AnaliChess IA

Documento de trabajo. **Cristian corrige la columna "Frase"; el resto es
información técnica de apoyo.**

- ✅ implementada · 🆕 recién implementada · ⚠️ comodín (hay que matarla) · ⬜ pendiente
- **Costo**: `geo` = geometría pura, gratis · `motor` = usa Stockfish (ya disponible) · `caro` = búsqueda extra

## Cómo se arma un comentario

Hasta **dos ranuras**, nunca tres (para que quede corto como chess.com):

- **A — Qué pasó** (siempre): la consecuencia concreta.
- **B — Cómo cambió la partida** (a veces): contexto de evaluación.
- **C — Qué era mejor** (a veces): la alternativa.

Siempre A, más B **o** C. Si A ya nombra material perdido, B se omite. C nunca
en jugadas buenas ni en mates. Cada categoría admite 2-3 redacciones,
elegidas por el número de jugada.

### Reglas de estilo

Sin cifras de peones en la prosa · sin notación algebraica · segunda persona ·
español LatAm · vocabulario exacto (horquilla, clavada, pincho, ataque a la
descubierta, pieza colgada) · nombrar pieza y casilla · sin relleno ·
concordancia de género · nunca invertir quién hace qué.

---

## RANURA A1 — Jugadas buenas

| # | Categoría | Detección | Costo | Estado | Frase |
|---|---|---|---|---|---|
| 1 | Jaque mate | SAN con `#` | geo | ✅ | ¡Jaque mate! El caballo remata en f7. |
| 2 | Única jugada buena | 1ª línea supera a la 2ª por ≥1.5 | motor | ✅ | ¡Solo había una jugada buena y la encontraste! |
| 3 | Táctica ejecutada | Patrón verificado | geo | ✅ | Muy buena: montas una horquilla sobre la dama de d8. |
| 4 | Sacrificio correcto | Entrega material, motor lo confirma | motor | ✅ | Sacrificio correcto: entregas el alfil y hay compensación. |
| 5 | Gana material | Captura sin recaptura | geo | ✅ | Capturas el caballo en f3 y ganas material. |
| 6 | Jugada precisa | Es la mejor, nada más que destacar | motor | ✅ | Jugada precisa: el motor la confirma como la mejor. |
| 7 | Defensa exacta | Estabas peor y encontraste la única defensa | motor | ⬜ | |
| 8 | Contraataque | Respondes a una amenaza creando otra mayor | geo | ⬜ | |
| 9 | Profilaxis | Impides el plan del rival antes de que empiece | caro | ⬜ | |
| 10 | Simplificación ganadora | Con ventaja, cambias piezas hacia un final ganado | geo | ⬜ | |
| 11 | Rey a la caja | Metes al rey rival en una red de mate | motor | ⬜ | |
| 12 | Peón pasado creado | Tu jugada genera un peón pasado | geo | ⬜ | |

## RANURA A2 — Errores

| # | Categoría | Detección | Costo | Estado | Frase |
|---|---|---|---|---|---|
| 13 | Mate desperdiciado | Tenías mate forzado | motor | ✅ | Tenías jaque mate forzado y se te escapó. |
| 14 | Pieza propia colgada | Tu pieza sin defensor | geo | ✅ | El alfil de c4 queda sin defensa. |
| 15 | Pérdida de material | Línea de castigo te cuesta una pieza | motor | ✅ | Con esta jugada pierdes el alfil. |
| 16 | Pérdida tras cambios | Igual, en secuencia de capturas | motor | ✅ | Tras los cambios pierdes la dama. |
| 17 | Captura gratis del rival | Su respuesta te quita una pieza | motor | ✅ | El rival te captura el alfil. |
| 18 | Pieza atrapada | Sin casilla segura | geo | 🆕 | El caballo de a5 queda atrapado: no tiene casilla segura. |
| 19 | Rey en última fila | Encerrado tras sus peones | geo | 🆕 | Tu rey queda encerrado en la última fila. |
| 20 | Táctica desperdiciada | Había patrón y no lo viste | geo | ✅ | Tenías un pincho sobre la torre de b2 y la dejas pasar. |
| 21 | Permites horquilla | Su respuesta crea horquilla | geo | ⬜ | |
| 22 | Permites clavada | Su respuesta clava una pieza tuya | geo | ⬜ | |
| 23 | Permites descubierta | Su respuesta es ataque a la descubierta | geo | ⬜ | |
| 24 | Mueves pieza clavada | La pieza estaba clavada | geo | ⬜ | |
| 25 | Rompes tu enroque | Mueves un peón del escudo del rey | geo | ⬜ | |
| 26 | Rey al centro | Rey sale sin necesidad en medio juego | geo | ⬜ | |
| 27 | Dama atrapada | La dama pierde casillas de escape | geo | ⬜ | |
| 28 | Ignoras la amenaza | Había amenaza y no la atiendes | motor | ⬜ | |
| 29 | Cambio desfavorable | Cambias tu pieza buena por una mala suya | geo | ⬜ | |
| 30 | Debilitas casillas | El avance de peón deja huecos permanentes | geo | ⬜ | |
| 31 | Peón retrasado | Creas un peón que no puede avanzar | geo | ⬜ | |
| 32 | Peones doblados | El cambio te deja peones doblados | geo | ⬜ | |
| 33 | Peón aislado | Creas un peón sin apoyo de vecinos | geo | ⬜ | |
| 34 | Pierdes la pareja de alfiles | Cambias un alfil sin motivo | geo | ⬜ | |
| 35 | Pieza a la banda | Caballo al borde sin destino | geo | ⬜ | |
| 36 | Repites jugadas | Mueves atrás y adelante, pierdes tiempo | geo | ⬜ | |
| 37 | Torre pasiva | Tu torre queda encerrada por su propio rey | geo | ⬜ | |
| 38 | Permites peón pasado | Su jugada crea un pasado y no lo frenas | geo | ⬜ | |
| 39 | Sueltas la columna abierta | Cedes la única columna abierta | geo | ⬜ | |
| 40 | Error genérico | Nada concreto detectado | — | ⚠️ | Con esta jugada pierdes el hilo de la posición. |

## RANURA A3 — Jugadas normales

| # | Categoría | Detección | Costo | Estado | Frase |
|---|---|---|---|---|---|
| 41 | Jugada de libro | Está en el libro ECO (3.807 líneas) | geo | ✅ | Jugada de libro: disputas el centro con el peón en e5. |
| 42 | Enroque | O-O / O-O-O | geo | ✅ | Enrocas: el rey queda protegido y la torre entra en juego. |
| 43 | Coronación | Promoción | geo | ✅ | Coronas en d8 y quedas con ventaja decisiva. |
| 44 | Cambio favorable | Saldo positivo | geo | 🆕 | Capturas el peón en e5 y ganas material. |
| 45 | Cambio parejo | Saldo cero | geo | 🆕 | Cambio parejo en f3. |
| 46 | Da jaque | SAN con `+` | geo | ✅ | Das jaque con la dama y quedas con ventaja. |
| 47 | Desarrollo | Caballo/alfil sale de casilla inicial | geo | ✅ | Desarrollas el alfil a e7. |
| 48 | Ocupa el centro | Llega a d4/e4/d5/e5 | geo | ✅ | Ocupas el centro con el peón en e4. |
| 49 | Torre a columna abierta | Columna sin peones | geo | ⬜ | |
| 50 | Torre a la séptima | Torre llega a 7ª/2ª fila | geo | ⬜ | |
| 51 | Conecta las torres | Ya no hay piezas entre ellas | geo | ⬜ | |
| 52 | Puesto avanzado | Caballo donde ningún peón lo expulsa | geo | ⬜ | |
| 53 | Fianchetto | Alfil a g2/b2/g7/b7 | geo | ⬜ | |
| 54 | Cadena de peones | Avance que forma cadena | geo | ⬜ | |
| 55 | Ruptura de peones | Peón que abre líneas | geo | ⬜ | |
| 56 | Recaptura | Retomas en la casilla del cambio | geo | ⬜ | |
| 57 | Retirada a salvo | Sacas la pieza de un ataque | geo | ⬜ | |
| 58 | Defiendes pieza | Tu jugada defiende algo atacado | geo | ⬜ | |
| 59 | Bloqueas el paso | Frenas un peón pasado rival | geo | ⬜ | |
| 60 | Activas el rey (final) | Rey avanza en el final | geo | ⬜ | |
| 61 | Da aire al rey | Creas casilla de escape | geo | ⬜ | |
| 62 | Ganas espacio | Avance de peón que gana terreno | geo | ⬜ | |
| 63 | Doblas torres | Segunda torre a la misma columna | geo | ⬜ | |
| 64 | Centraliza la dama | Dama a casilla central segura | geo | ⬜ | |
| 65 | Jugada de espera | No cambia nada, mantiene tensión | motor | ⬜ | |
| 66 | Jugada tranquila | Nada de lo anterior | — | ⚠️ | Jugada sólida, quedas en una posición equilibrada. |

## RANURA B — Cómo cambió la partida

| # | Transición | Estado | Frase |
|---|---|---|---|
| 67 | igualada → peor | ✅ | Estaba parejo y ahora el rival toma la ventaja. |
| 68 | ventaja → igualada | ✅ | Tenías ventaja y la dejas escapar: queda igualada. |
| 69 | ventaja → peor | ✅ | Ibas con ventaja y ahora estás peor. |
| 70 | perdida → perdida | ✅ | Ya venías mal, esto no la decide pero tampoco ayuda. |
| 71 | ganando → ganando | ✅ | Sigues ganando, pero desperdicias parte de la ventaja. |
| 72 | peor → igualada | ⬜ | (recuperaste: falta) |
| 73 | peor → ventaja | ⬜ | (le diste la vuelta: falta) |
| 74 | igualada → ventaja | ⬜ | (tomaste la iniciativa: falta) |
| 75 | perdida → peor | ⬜ | (te acercas: falta) |
| 76 | ganando → decisivo | ⬜ | (sentencias: falta) |

## RANURA C — Qué era mejor

| # | Condición de la jugada correcta | Estado | Frase |
|---|---|---|---|
| 77 | Forzaba mate | ✅ | Con la torre a e7 forzabas el mate. |
| 78 | Defendía la pieza colgada | ✅ | Con la torre a e1 lo defendías. |
| 79 | Capturaba algo | ✅ | Con el alfil a f5 te llevabas el caballo. |
| 80 | Montaba una táctica | ✅ | Con el alfil a c5 montabas un pincho. |
| 81 | Daba jaque | ✅ | El alfil a b5 daba jaque y cambiaba el ritmo. |
| 82 | Enrocaba | ✅ | Enrocar primero dejaba al rey a salvo. |
| 83 | Peón al centro | ✅ | Atacar el centro con el peón a d4 era mejor. |
| 84 | Salvaba la pieza atacada | ⬜ | |
| 85 | Bloqueaba la amenaza | ⬜ | |
| 86 | Cambiaba a un final ganado | ⬜ | |
| 87 | Ganaba tiempo con jaque | ⬜ | |
| 88 | Activaba la torre | ⬜ | |
| 89 | Creaba un peón pasado | ⬜ | |
| 90 | Genérica | ⚠️ | Lo indicado era el caballo a a5. |

## Categorías de fase de partida (modificadores)

Ajustan el tono según el momento — no son ranuras propias.

| # | Fase | Detección | Estado |
|---|---|---|---|
| 91 | Apertura (1-10) | número de jugada | ⬜ |
| 92 | Medio juego (11-25) | número de jugada | ⬜ |
| 93 | Final (26+) | número de jugada + material | ⬜ |
| 94 | Final de peones | solo peones y reyes | ⬜ |
| 95 | Final de torres | solo torres y peones | ⬜ |
| 96 | Apuro de tiempo | reloj bajo 30s (viene en el PGN) | ⬜ |

## Comentarios sobre el rival (tercera persona)

Chess.com los comenta ("Sacan el caballo para aumentar el control del centro").
Requiere hilar el tratamiento por todas las plantillas y cambiar el visor, que
hoy solo muestra las jugadas del jugador.

| # | Categoría | Estado |
|---|---|---|
| 97 | El rival comete un error | ⬜ |
| 98 | El rival encuentra la mejor | ⬜ |
| 99 | El rival te amenaza algo | ⬜ |
| 100 | El rival sigue teoría | ⬜ |

---

## Descartadas (no fiables sin búsqueda profunda)

Zugzwang · atracción · despeje · interferencia · rayos X · sobrecarga táctica ·
sacrificio posicional a largo plazo. Es fácil afirmarlas mal, y preferimos no
decir nada antes que decir algo falso.

## Estado

- **41 implementadas**, 3 comodines por matar (#40, #66, #90)
- **56 pendientes**, la mayoría de detección barata (geometría)
- Prioridad sugerida: 21-24 (permites táctica), 25-27 (seguridad del rey),
  29-33 (estructura de peones), 49-52 (piezas activas), 72-76 (ranura B
  positiva — hoy solo tenemos transiciones negativas)
