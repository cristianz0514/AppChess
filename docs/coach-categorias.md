# Catálogo de comentarios del coach

**Generado automáticamente** desde `src/lib/coachComment.ts` con
`node scripts/genCategoryDoc.cjs`. No lo edites a mano: se regenera y pierdes
los cambios. Para cambiar un texto, cámbialo en el código (o dime cuál y lo
cambio yo) y vuelve a generar este archivo.

- **Categorías:** 137
- **Variantes de texto:** 369
- **Sin nombre humano todavía:** 29

Los huecos entre `${...}` los rellena el programa: `f.playedPiece` es la pieza
que se movió, `f.playedTo` la casilla de destino, y así. Al reescribir un texto,
manténlos tal cual.

## Cómo se combinan

Un comentario se arma con hasta **dos** ranuras: siempre A (qué pasó), más B
(cómo cambió la partida) **o** C (qué era mejor), nunca las tres. Por eso los
textos deben ser cortos: dos de ellos van a aparecer juntos.

El nivel *Descriptivo* es distinto: se usa cuando la jugada no fue un error, y
va solo.


---

## (auxiliar)

### (sin nombrar)

_Bandera:_ `(varios)`

1. y después te llevas la torre de d5
2. un ataque a la descubierta
3. una doble amenaza
4. una doble amenaza con jaque
5. podías capturar ${art(m.piece)} de ${m.square}, que estaba sin defensa
6. había una pieza sin defensa

---

## Jugadas del rival — descriptivo

### Jaque mate ejecutado

_Bandera:_ `isMate`

1. El rival da jaque mate con ${piece} en ${to}.

### Táctica que la jugada montó

_Bandera:_ `playedMotifs`

1. te hace un doble: ${piece} en ${to} ataca dos de tus piezas a la vez, y solo puedes salvar una
2. te clava una pieza: ${piece} en ${to} la deja inmóvil contra tu rey
3. te hace una enfilada: ${piece} en ${to} ataca dos de tus piezas en línea, y al mover la de delante cae la de atrás
4. te da jaque a la descubierta: el jaque viene de la pieza que estaba detrás
5. El rival captura ${art(f.capturedPiece)} en ${to} y ${clause}.
6. ¡Cuidado! El rival ${clause}.
7. Cuidado: tu ${loose.piece} de ${loose.square} se queda sin defensa.
8. Ojo, nadie defiende tu ${loose.piece} de ${loose.square}.

### isRecapture

_Bandera:_ `isRecapture`

1. El rival recupera en ${to}: el cambio queda saldado.${check}
2. El rival retoma en ${to} y el material vuelve a estar igual.${check}

### Veredicto del cambio (gana / parejo / pierde)

_Bandera:_ `tradeVerdict`

1. El rival se lleva ${cp} de ${to} y gana material.${check}
2. ${cap(cp)} de ${to} cae y el rival no lo paga: sale ganando.${check}
3. El rival cambia ${cp} en ${to}: un cambio parejo.${check}
4. Cambio parejo en ${to}: el rival se lleva ${cp} y tú recuperas.${check}
5. El rival captura ${cp} en ${to}.${check}
6. El rival se lleva ${cp} de ${to}.${check}

### Jaque

_Bandera:_ `gaveCheck`

1. El rival da jaque con ${piece} en ${to}.
2. Jaque: ${piece} del rival entra en ${to}.

### Amenaza propia creada (null-move)

_Bandera:_ `ownThreat`

1. ¡Cuidado! El rival amenaza mate en ${t.square}.
2. Cuidado: el rival amenaza ${mine} de ${t.square}.
3. Ojo, ahora va contra ${mine} de ${t.square}.

### Coronación

_Bandera:_ `isPromotion`

1. El rival corona en ${to}.

### Enroque

_Bandera:_ `isCastle`

1. El rival enroca y pone su rey a salvo.

### Jugada de libro (apertura)

_Bandera:_ `isBook`

1. El rival sigue la teoría: ${piece} a ${to}.

### Material tras los cambios (quiescence)

_Bandera:_ `dustMaterial`

1. Los cambios que vienen dejan al rival con material de más.
2. Cuando se resuelvan las capturas, el rival sale ganando material.
3. La secuencia de cambios te favorece: acabas con material de más.
4. Cuando se resuelvan las capturas, sales ganando material.

### Amenaza del rival ignorada (null-move)

_Bandera:_ `ignoredThreat`

1. El rival no para tu mate en ${it.square}. Ahí lo tienes.
2. El rival no atiende tu amenaza: puedes llevarte ${art(it.piece)} de ${it.square}.
3. Tu amenaza sigue en pie y él no la ve: ${art(it.piece)} de ${it.square} se puede caer.

### Más atacantes que defensores

_Bandera:_ `underDefended`

1. ${cap(art(ud.piece))} del rival en ${ud.square} tiene más atacantes que defensores: puedes apretar ahí.
2. Al rival no le alcanzan los defensores en ${ud.square}. Vale la pena sumar presión.

### Ataca una pieza mayor (gana tiempo)

_Bandera:_ `attacksBigger`

1. El rival ataca ${art(f.attacksBigger)} con ${piece} en ${to}.

### Presión sobre el rey rival

_Bandera:_ `theirKingWorse`

1. El rival suma presión sobre tu rey con ${piece} en ${to}.
2. ${cap(piece)} en ${to} aprieta el cerco sobre tu rey.

### Torre a la séptima

_Bandera:_ `rookToSeventh`

1. El rival mete la torre en tu séptima fila, donde más muerde.
2. Torre rival en tu séptima: desde ${to} muerde tus peones y encierra a tu rey.

### Estructura de peones

_Bandera:_ `structure`

1. El rival crea un peón pasado en ${f.structure.createdPassed}: pesará en el final.
2. Esa captura te deja peones doblados en la columna ${f.structure.brokeTheirStructure}.
3. El rival te aísla el peón de ${f.structure.isolatedTheirs}: ya no tiene quién lo defienda.

### Oposición de reyes

_Bandera:_ `opposition`

1. El rival toma la oposición: tu rey tiene que ceder terreno.

### Regla del cuadrado (final de peones)

_Bandera:_ `squareRule`

1. Tu rey no entra en el cuadrado: el peón rival de ${sr.pawnSquare} corona solo.
2. Cuenta el cuadrado: el peón rival de ${sr.pawnSquare} llega antes que tu rey.
3. El peón rival de ${sr.pawnSquare} no corona solo: tu rey llega a tiempo para frenarlo.
4. Tu rey entra en el cuadrado del peón de ${sr.pawnSquare} y lo detiene.

### defendsAttacked

_Bandera:_ `defendsAttacked`

1. El rival defiende ${art(f.defendsAttacked.piece)} de ${f.defendsAttacked.square}, que tenías atacado.

### Torres dobladas

_Bandera:_ `doublesRooks`

1. El rival dobla las torres en la columna ${to[0]}.

### battery

_Bandera:_ `battery`

1. El rival dobla dos piezas mayores en la misma línea.
2. El rival forma una batería con ${art(b.front)} y ${art(b.back)} en la misma línea.

### Puesto avanzado

_Bandera:_ `outpost`

1. El rival instala ${piece} en ${to}: ningún peón tuyo puede echarlo.

### Torre a columna abierta

_Bandera:_ `rookToOpenFile`

1. El rival toma la columna abierta ${to[0]} con la torre.

### Torre a columna semiabierta

_Bandera:_ `rookToSemiOpen`

1. El rival pone la torre en la columna ${to[0]}, semiabierta.

### Caballo centralizado

_Bandera:_ `knightToCenter`

1. El rival centraliza el caballo en ${to}.

### Fianchetto

_Bandera:_ `fianchetto`

1. Fianchetto del rival: el alfil a ${to}, sobre la diagonal larga.

### Ruptura de peones

_Bandera:_ `pawnBreak`

1. Ruptura del rival: el peón de ${to} golpea tu estructura.

### Refuerza la cadena de peones

_Bandera:_ `supportsPawnChain`

1. El rival apuntala su cadena con el peón de ${to}.

### Peón pasado avanzando

_Bandera:_ `pawnRunsToPromote`

1. El peón pasado del rival avanza a ${to}. Hay que frenarlo.

### Rey activo en el final

_Bandera:_ `kingActivates`

1. El rival activa su rey hacia ${to}: en el final es una pieza más.

### Torre detrás del peón pasado

_Bandera:_ `rookBehindPassed`

1. El rival pone la torre detrás de su peón pasado: lo empuja según avanza.

### Torres conectadas

_Bandera:_ `connectsRooks`

1. El rival conecta sus torres.
2. El rival tiene dos peones pasados conectados (${f.connectedPassed!.slice(0, 2).join(" y ")}): hay que frenarlos ya.

### connectedPassed

_Bandera:_ `connectedPassed`

1. El peón pasado del rival en ${f.connectedPassed[0]} va apoyado por otro peón. Vigílalo.
2. Cuidado con el pasado del rival en ${f.connectedPassed[0]}: tiene compañero al lado.

### majority

_Bandera:_ `majority`

1. El rival tiene mayoría de peones en el flanco de ${f.majority}: de ahí le va a salir un pasado.

### endgameKind

_Bandera:_ `endgameKind`

1. Estamos en un ${f.endgameKind}. ${cap(piece)} del rival va a ${to}.
2. ${cap(piece)} del rival a ${to}, en un ${f.endgameKind}.

### Da aire al rey

_Bandera:_ `givesKingLuft`

1. El rival le da aire a su rey: gana casilla de escape.

### Término de evaluación que cambió

_Bandera:_ `dominantTerm`

1. El rival gana movilidad con ${piece} en ${to}.
2. El rival gana espacio en tu campo.
3. El rival suma una pieza al juego: va por delante en desarrollo.
4. El rival refuerza la cobertura de su rey.

### Debilita el escudo del rey

_Bandera:_ `weakensKingShield`

1. El rival adelanta un peón de su escudo y abre líneas hacia su rey.

### Caballo a la banda

_Bandera:_ `knightToRim`

1. El caballo del rival se va a la banda en ${to}: desde ahí controla poco.

### Mueve la misma pieza dos veces

_Bandera:_ `movesPieceTwice`

1. El rival mueve otra vez ${piece} en vez de desarrollar.
2. ${cap(piece)} del rival vuelve a moverse; le quedan piezas sin sacar.

### Dama fuera demasiado pronto

_Bandera:_ `queenOutEarly`

1. El rival saca la dama pronto: puedes ganar tiempos atacándola.

### Repliegue de pieza

_Bandera:_ `retreats`

1. El rival repliega ${piece} a ${to}.
2. El rival retira ${piece} a ${to} para reagrupar.

### Desarrolla una pieza

_Bandera:_ `developsPiece`

1. El rival pone ${piece} en juego desde ${to}.
2. El rival desarrolla ${piece} a ${to}.
3. ${cap(piece)} del rival entra en juego en ${to}.

### Ocupa el centro

_Bandera:_ `toCenter`

1. El rival ocupa el centro con ${piece} en ${to}.
2. El rival planta ${piece} en ${to} y reclama el centro.

### Pieza olvidada / pasiva

_Bandera:_ `passivePiece`

1. ${aside} Aparte, ${art(pp.piece)} rival de ${pp.square} sigue sin entrar en juego.
2. ${aside} El rival todavía no desarrolla ${art(pp.piece)} de ${pp.square}: ahí no hace nada.
3. ${aside} Aparte, ${art(pp.piece)} rival de ${pp.square} está en mal sitio y controla poco.
4. ${aside} Mientras tanto, ${art(pp.piece)} rival de ${pp.square} no está haciendo nada ahí.

### isEndgame

_Bandera:_ `isEndgame`

1. ${cap(piece)} del rival va a ${to}. Seguimos en el final.
2. Jugada de final del rival: ${piece} a ${to}.
3. El rival juega ${piece} a ${to}.
4. ${cap(piece)} del rival va a ${to}.
5. Jugada tranquila del rival: ${piece} a ${to}.
6. El rival mueve ${piece} a ${to}, sin cambios en la posición.

---

## Jugadas del rival — su fallo

### Genérico por clasificación

_Bandera:_ `classification`

1. El rival comete un error grave.
2. Error grave del rival.
3. El rival se equivoca.
4. Fallo del rival.
5. El rival no juega lo más preciso.
6. Imprecisión del rival.

---

## Jugadas del rival — tu oportunidad

### variantSeed

_Bandera:_ `variantSeed`

1. Tienes mate con ${art(o.piece)} en ${o.to}.
2. Puedes capturar en ${o.to} con ${art(o.piece)}.
3. Puedes llevarte ${art(o.captures)} con ${art(o.piece)} a ${o.to}.
4. Ahí tienes ${art(o.captures)} de ${o.to}.
5. Ahí tienes ${art(o.captures)}: ${art(o.piece)} a ${o.to}.
6. Tu oportunidad: ${art(o.piece)} a ${o.to}.
7. Aprovéchalo con ${art(o.piece)} a ${o.to}.

---

## Tus jugadas — ¿aprovechaste la oportunidad?

### tookOpportunity

_Bandera:_ `tookOpportunity`

1. Lo viste y lo aprovechaste.
2. Bien: era exactamente la jugada.
3. Aprovechada. Esa era.
4. Se te escapó: podías ${what}.
5. Ahí estaba la oportunidad: ${what}.

---

## Tus jugadas — descriptivo

### variantSeed

_Bandera:_ `variantSeed`

1. en una posición muy difícil

### Táctica que la jugada montó

_Bandera:_ `playedMotifs`

1. haces un doble: ${p} en ${f.playedTo} ataca dos piezas a la vez, y solo puedes salvar una
2. clavas una pieza: ${p} en ${f.playedTo} la deja inmóvil, porque detrás está el rey rival
3. haces una enfilada: ${p} en ${f.playedTo} ataca dos piezas en la misma línea, y al mover la de delante cae la de atrás
4. das jaque a la descubierta: al mover ${p}, el jaque lo da la pieza que estaba detrás
5. ${cap(art(loose.piece))} de ${loose.square} se queda sin defensa: puedes llevártela.
6. Ojo a ${art(loose.piece)} de ${loose.square}: nadie la defiende.

### openingName

_Bandera:_ `openingName`

1.  Vienes de la ${f.openingName}.
2. Última jugada de teoría.${named} A partir de aquí decides tú.
3. Aquí se acaba el libro.${named} Lo que siga ya es tu propio plan.

### Enroque

_Bandera:_ `isCastle`

1. Jugada de libro: enrocas y pones el rey a salvo.
2. Enrocas y pones el rey a salvo.
3. Enrocas: el rey queda protegido y la torre entra en juego.

### Desarrolla una pieza

_Bandera:_ `developsPiece`

1. Jugada de libro: sacas ${art(f.playedPiece)} a ${f.playedTo}, desarrollo normal de la apertura.
2. Teoría: ${art(f.playedPiece)} va a ${f.playedTo} para entrar en juego.
3. Desarrollo de libro. ${cap(art(f.playedPiece))} a ${f.playedTo} es la jugada principal aquí.
4. Sigues la teoría: ${art(f.playedPiece)} a ${f.playedTo}.
5. ${cap(art(f.playedPiece))} entra en juego desde ${f.playedTo}.
6. Pones ${art(f.playedPiece)} en ${f.playedTo}, fuera de su casilla inicial.
7. Sumas ${art(f.playedPiece)} al juego: sale a ${f.playedTo}.

### Ocupa el centro

_Bandera:_ `toCenter`

1. Jugada de libro: disputas el centro con ${art(f.playedPiece)} en ${f.playedTo}.
2. Teoría. ${cap(art(f.playedPiece))} a ${f.playedTo} reclama su parte del centro.
3. De libro: plantas ${art(f.playedPiece)} en ${f.playedTo}, en plena disputa del centro.
4. Jugada de libro: ${art(f.playedPiece)} a ${f.playedTo} sigue la teoría.
5. Teoría de la apertura, ${art(f.playedPiece)} a ${f.playedTo}.
6. Ocupas el centro con ${art(f.playedPiece)} en ${f.playedTo}.

### Coronación

_Bandera:_ `isPromotion`

1. Coronas en ${f.playedTo} y quedas ${standing}.

### isRecapture

_Bandera:_ `isRecapture`

1. Recuperas ${cp} en ${f.playedTo}: el cambio queda saldado.
2. Retomas en ${f.playedTo} y el material vuelve a estar igual.

### Veredicto del cambio (gana / parejo / pierde)

_Bandera:_ `tradeVerdict`

1. Capturas ${cp} en ${f.playedTo} y ganas material.
2. Te llevas ${cp} de ${f.playedTo} sin compensación para el rival.
3. ${cap(cp)} de ${f.playedTo} cae gratis: el rival no lo recupera.
4. Ganas material en ${f.playedTo}: la captura sale a tu favor.
5. Cambias ${cp} en ${f.playedTo}: un cambio parejo.
6. Cambio parejo en ${f.playedTo}.
7. Te llevas ${cp} y el rival recupera: quedan iguales.
8. Cambio de piezas en ${f.playedTo}, sin ventaja para ninguno.
9. Te llevas ${cp} y quedas ${standing}.

### Jaque

_Bandera:_ `gaveCheck`

1. Das jaque con ${art(f.playedPiece)} y quedas ${standing}.
2. Los cambios que vienen te dejan material de más.
3. Cuando se resuelvan las capturas, sales ganando material.

### Amenaza propia creada (null-move)

_Bandera:_ `ownThreat`

1. Amenazas mate en ${ot.square}: el rival está obligado a defenderse.
2. Ahora amenazas ${art(ot.piece)} de ${ot.square}.
3. La jugada arma una amenaza: ${art(ot.piece)} de ${ot.square} está en el aire.
4. Con esto pones ${art(ot.piece)} de ${ot.square} en el punto de mira.

### defendsAttacked

_Bandera:_ `defendsAttacked`

1. Defiendes ${art(d.piece)} de ${d.square}, que estaba atacado.
2. Cubres ${art(d.piece)} de ${d.square} justo a tiempo.

### Regla del cuadrado (final de peones)

_Bandera:_ `squareRule`

1. El rey rival ya no entra en el cuadrado: el peón de ${sr.pawnSquare} corona solo.
2. Cuenta el cuadrado: el peón de ${sr.pawnSquare} llega antes que el rey rival.
3. El rey rival está dentro del cuadrado y detiene el peón de ${sr.pawnSquare}: hace falta acercar tu rey.
4. Así el peón de ${sr.pawnSquare} no corona solo; el rey rival llega. Tienes que apoyarlo con el tuyo.

### Peón pasado avanzando

_Bandera:_ `pawnRunsToPromote`

1. El peón pasado avanza a ${f.playedTo}: cada casilla lo acerca a coronar.
2. Empujas el peón pasado hasta ${f.playedTo}. El rival tendrá que gastar una pieza en frenarlo.

### Oposición de reyes

_Bandera:_ `opposition`

1. Tomas la oposición: el rey rival tiene que ceder terreno.

### Rey activo en el final

_Bandera:_ `kingActivates`

1. En el final el rey es una pieza más, y lo llevas al centro.
2. Activas el rey hacia ${f.playedTo}: en el final es donde más pesa.

### Torre detrás del peón pasado

_Bandera:_ `rookBehindPassed`

1. Torre detrás del peón pasado, que es su sitio: lo empuja según avanza.

### Torres conectadas

_Bandera:_ `connectsRooks`

1. Conectas las torres: ya se defienden entre ellas.
2. Tienes dos peones pasados conectados (${f.connectedPassed!.slice(0, 2).join(" y ")}): avanzan apoyándose y son muy difíciles de parar.
3. Peones pasados conectados en ${f.connectedPassed!.slice(0, 2).join(" y ")}. Empújalos juntos: se defienden solos.

### connectedPassed

_Bandera:_ `connectedPassed`

1. Tu peón pasado de ${f.connectedPassed[0]} tiene un compañero al lado que lo apoya: eso es lo que lo hace peligroso.
2. El pasado de ${f.connectedPassed[0]} va acompañado. Avanza con los dos, no solo con uno.

### majority

_Bandera:_ `majority`

1. Tienes mayoría de peones en el flanco de ${f.majority}: ahí está tu peón pasado, empuja por ese lado.
2. Mayoría en el flanco de ${f.majority}. El plan es crear un pasado con ella.

### endgameKind

_Bandera:_ `endgameKind`

1. Estamos en un ${f.endgameKind}. ${cap(art(f.playedPiece))} a ${f.playedTo}.
2. ${cap(art(f.playedPiece))} a ${f.playedTo}, en un ${f.endgameKind}.

### backwardPawn

_Bandera:_ `backwardPawn`

1. El peón de ${f.backwardPawn} está retrasado: no puede avanzar ni recibir apoyo, y en el final eso pesa.

### islands

_Bandera:_ `islands`

1. Tienes ${f.islands.mine} islas de peones contra ${f.islands.theirs}: tu estructura está más partida y es más difícil de defender.

### Ataca una pieza mayor (gana tiempo)

_Bandera:_ `attacksBigger`

1. ${cap(art(f.playedPiece))} a ${f.playedTo} ataca ${art(f.attacksBigger)}: el rival tiene que responder.
2. Ganas un tiempo: desde ${f.playedTo} amenazas ${art(f.attacksBigger)}.

### Ruptura de peones

_Bandera:_ `pawnBreak`

1. Ruptura de peones: el peón de ${f.playedTo} golpea la cadena rival.
2. Atacas la estructura del rival con el peón a ${f.playedTo}.

### Puesto avanzado

_Bandera:_ `outpost`

1. ${cap(art(f.playedPiece))} se instala en ${f.playedTo}: apoyado por tu peón y sin peones rivales que lo echen.
2. Puesto avanzado en ${f.playedTo}. Ningún peón rival puede desalojar ${art(f.playedPiece)} de ahí.

### Caballo centralizado

_Bandera:_ `knightToCenter`

1. Centralizas el caballo en ${f.playedTo}, desde donde controla más casillas.
2. El caballo en ${f.playedTo} está en su mejor sitio: el centro.

### Da aire al rey

_Bandera:_ `givesKingLuft`

1. Le das aire a tu rey: ahora tiene casilla de escape.
2. Mueves el rey a ${f.playedTo} y evitas sustos en la última fila.

### Repliegue de pieza

_Bandera:_ `retreats`

1. Repliegas ${art(f.playedPiece)} a ${f.playedTo} para reagrupar.
2. ${cap(art(f.playedPiece))} vuelve a ${f.playedTo} y espera mejor momento.

### Torre a la séptima

_Bandera:_ `rookToSeventh`

1. Metes la torre en la séptima: desde ${f.playedTo} muerde los peones y encierra al rey.
2. Torre a la séptima. Es la fila donde más daño hace.

### Torres dobladas

_Bandera:_ `doublesRooks`

1. Doblas las torres en la columna ${f.playedTo[0]}: juntas pesan mucho más.

### Torre a columna abierta

_Bandera:_ `rookToOpenFile`

1. Colocas la torre en la columna ${f.playedTo[0]}, que está abierta.
2. La torre toma la columna abierta ${f.playedTo[0]}.

### Torre a columna semiabierta

_Bandera:_ `rookToSemiOpen`

1. La torre toma la columna ${f.playedTo[0]}, semiabierta: presiona el peón rival.
2. Torre a la columna ${f.playedTo[0]}, donde no tienes peones que te estorben.

### Fianchetto

_Bandera:_ `fianchetto`

1. Fianchetto: el alfil a ${f.playedTo} apunta a la diagonal larga.

### Dama fuera demasiado pronto

_Bandera:_ `queenOutEarly`

1. Sacas la dama pronto: cuidado, el rival puede ganar tiempos atacándola.

### Mueve la misma pieza dos veces

_Bandera:_ `movesPieceTwice`

1. Vuelves a mover ${art(f.playedPiece)} en vez de sacar una pieza nueva.
2. ${cap(art(f.playedPiece))} se mueve otra vez; quedan piezas por desarrollar.

### Estructura de peones

_Bandera:_ `structure`

1. Creas un peón pasado en ${f.structure.createdPassed}: nada lo frena camino a coronar.
2. El peón de ${f.structure.createdPassed} queda pasado, y eso pesa en el final.
3. Le dejas peones doblados en la columna ${f.structure.brokeTheirStructure}: un defecto permanente.
4. Aíslas el peón rival de ${f.structure.isolatedTheirs}: ya no tiene quién lo defienda.
5. Te quedan peones doblados en la columna ${f.structure.gaveSelfDoubled}: es un defecto permanente, pesa sobre todo en el final.
6. Ojo: peones doblados en ${f.structure.gaveSelfDoubled}. Ya no se arregla.
7. El peón de ${f.structure.gaveSelfIsolated} queda aislado: nadie lo puede defender con otro peón.
8. Dejas aislado tu peón de ${f.structure.gaveSelfIsolated}; tendrás que defenderlo con piezas.

### Presión sobre el rey rival

_Bandera:_ `theirKingWorse`

1. Sumas presión sobre el rey rival: ${art(f.playedPiece)} apunta a su posición.
2. ${cap(art(f.playedPiece))} en ${f.playedTo} aprieta el cerco al rey rival.

### battery

_Bandera:_ `battery`

1. Doblas dos piezas mayores en la misma línea: juntas pesan mucho más.
2. Formas una batería: ${art(b.front)} con ${art(b.back)} detrás, apuntando a la misma línea.
3. ${cap(art(b.front))} se apoya en ${art(b.back)}: dos piezas presionando la misma línea.

### Refuerza la cadena de peones

_Bandera:_ `supportsPawnChain`

1. Refuerzas la cadena: el peón de ${f.playedTo} sostiene a su compañero.
2. El peón a ${f.playedTo} apuntala tu estructura y le quita casillas al rival.
3. Cadena de peones: ${f.playedTo} respalda al peón de delante.

### Término de evaluación que cambió

_Bandera:_ `dominantTerm`

1. Ganas movilidad: tus piezas cubren más casillas desde aquí.
2. ${cap(art(f.playedPiece))} a ${f.playedTo} le da aire a tus piezas.
3. Ganas espacio en el campo rival.
4. Avanzas tu frente y le quitas terreno al rival.
5. Sumas una pieza al juego: vas por delante en desarrollo.
6. Tu rey queda mejor cubierto tras esta jugada.
7. Mejoras la seguridad de tu rey: menos líneas abiertas hacia él.

### Pieza propia atrapada

_Bandera:_ `trappedPiece`

1. ${lead} Ojo: ${art(f.trappedPiece.piece)} de ${f.trappedPiece.square} se queda sin casillas seguras.
2. ${lead} Cuidado con ${art(f.trappedPiece.piece)} de ${f.trappedPiece.square}: no tiene por dónde salir.

### Riesgo de mate en la última fila

_Bandera:_ `backRankRisk`

1. ${lead} Ojo a la última fila: tu rey no tiene casilla de escape.
2. ${lead} Tu rey sigue encerrado en la última fila; conviene darle aire.

### Defensor sobrecargado

_Bandera:_ `overloaded`

1. ${lead} Ojo: ${art(f.overloaded.piece)} defiende dos cosas a la vez y no puede con ambas.
2. ${lead} Le pides demasiado a ${art(f.overloaded.piece)}: es el único defensor de dos piezas.

### Más atacantes que defensores

_Bandera:_ `underDefended`

1. ${lead} Ojo: ${art(f.underDefended.piece)} de ${f.underDefended.square} tiene más atacantes que defensores.
2. ${lead} No te alcanzan los defensores en ${f.underDefended.square}.

### Pieza olvidada / pasiva

_Bandera:_ `passivePiece`

1. ${aside} Ojo aparte: ${art(pp.piece)} de ${pp.square} sigue sin entrar en juego.
2. ${aside} Te falta desarrollar ${art(pp.piece)} de ${pp.square}: ahí no hace nada.
3. ${aside} Mientras tanto, ${art(pp.piece)} de ${pp.square} está encerrado por tus propias piezas.
4. ${aside} Ojo aparte: ${art(pp.piece)} de ${pp.square} casi no tiene casillas.
5. ${aside} Aparte, ${art(pp.piece)} de ${pp.square} está en mal sitio: desde la banda controla muy poco.
6. ${aside} Mientras tanto, ${art(pp.piece)} de ${pp.square} no está haciendo nada ahí; su lugar está más al centro.

### isEndgame

_Bandera:_ `isEndgame`

1. ${cap(art(f.playedPiece))} a ${f.playedTo}. En el final ${stays} ${standing}.
2. ${cap(art(f.playedPiece))} a ${f.playedTo} en el final; la posición ${shifted ? "queda" : "sigue"} ${state}.
3. ${cap(art(f.playedPiece))} a ${f.playedTo}. En el final ${stays} ${standing}.
4. Jugada de final tranquila: quedas ${standing}.
5. ${cap(art(f.playedPiece))} a ${f.playedTo} en el final, y ${stays} ${standing}.
6. Maniobra de final con ${art(f.playedPiece)} a ${f.playedTo}; nada cambia de fondo.
7. ${cap(art(f.playedPiece))} a ${f.playedTo}: la posición ${shifted ? "queda" : "sigue"} ${state}.
8. Jugada sólida, quedas ${standing}.
9. Jugada tranquila. La posición ${shifted ? "queda" : "sigue"} ${state}.
10. ${cap(art(f.playedPiece))} a ${f.playedTo}: la posición ${shifted ? "queda" : "sigue"} ${state}.

---

## Tus jugadas — ranura A: qué pasó

### Jaque mate ejecutado

_Bandera:_ `isMate`

1. ¡Jaque mate! ${cap(art(f.playedPiece))} remata en ${f.playedTo}.
2. ¡Jaque mate con ${art(f.playedPiece)} en ${f.playedTo}! Se acabó la partida.

### Única jugada buena, y la encontró

_Bandera:_ `onlyGoodMove`

1. ¡Solo había una jugada buena y la encontraste!
2. Era la única jugada que servía, y la viste.

### Táctica que la jugada montó

_Bandera:_ `playedMotifs`

1. Muy buena: ${hangingPhrase(m)}.
2. Muy buena: montas ${motifArt(m.label)}${target}.

### Sacrificio correcto

_Bandera:_ `isSacrificeConfirmed`

1. Sacrificio correcto: entregas ${art(f.playedPiece)} y el motor confirma que hay compensación.

### Captura (veredicto por SEE)

_Bandera:_ `capturedPiece`

1. Te llevas ${art(f.capturedPiece)}.
2. Jugada precisa: el motor la confirma como la mejor de la posición.

### Mate forzado que se escapó

_Bandera:_ `missedForcedMate`

1. Tenías jaque mate forzado y esta jugada lo desperdicia.
2. Había mate forzado a tu favor: esta jugada lo deja ir.

### Deja una pieza propia colgada

_Bandera:_ `selfHang`

1. ${cap(p)} de ${sq} queda sin defensa.
2. Dejas ${p} de ${sq} sin ningún defensor.
3. ${cap(p)} de ${sq} se queda colgado.
4. Capturas ${cp} en ${f.playedTo} y el cambio te favorece.
5. Cambias ${cp} en ${f.playedTo}: un cambio parejo.

### Material perdido en la línea de castigo

_Bandera:_ `materialLostPiece`

1. Tras los cambios pierdes ${p}.
2. La secuencia de cambios te cuesta ${p}.
3. Con esta jugada pierdes ${p}.
4. Esto entrega ${p} sin compensación.

### El rival captura algo tuyo

_Bandera:_ `oppCapturesPiece`

1. El rival te captura ${art(f.oppCapturesPiece)}
2. El rival te captura ${art(f.oppCapturesPiece)}.
3. Le regalas ${art(f.oppCapturesPiece)} al rival.

### punishFollowUp

_Bandera:_ `punishFollowUp`

1. ${opener}, y la lucha en ${f.punishFocusSquare} acaba a su favor.

### Permite una táctica del rival

_Bandera:_ `allowsMotif`

1. El rival responde con ${motifArt(am.label)}${target}.

### Permite captura al paso

_Bandera:_ `allowsEnPassant`

1. Ese avance de dos casillas se puede capturar al paso, y pierdes el peón.
2. Cuidado con la captura al paso: el peón de ${f.playedTo} cae igual.

### Material tras los cambios (quiescence)

_Bandera:_ `dustMaterial`

1. Cuando terminen los cambios te quedas con material de menos.
2. La secuencia de capturas no te favorece: acabas perdiendo material.

### Amenaza del rival ignorada (null-move)

_Bandera:_ `ignoredThreat`

1. Te estaban amenazando mate en ${it.square} y la jugada no lo evita.
2. Dejas pasar la amenaza: el rival se lleva ${art(it.piece)} de ${it.square}.
3. La amenaza sobre ${it.square} seguía ahí, y ahora ${art(it.piece)} cae.

### Más atacantes que defensores

_Bandera:_ `underDefended`

1. ${cap(art(ud.piece))} de ${ud.square} recibe más ataques que defensas.
2. No alcanzan los defensores ${deArt(ud.piece)} en ${ud.square}.

### Defensor sobrecargado

_Bandera:_ `overloaded`

1. ${cap(art(f.overloaded.piece))} está sobrecargado: defiende dos cosas a la vez y no puede con ambas.
2. Le pides demasiado a ${art(f.overloaded.piece)}: es el único defensor de dos piezas.

### Estructura de peones

_Bandera:_ `structure`

1. Te quedan peones doblados en la columna ${f.structure.gaveSelfDoubled}: se defienden mal y no avanzan.
2. Doblas tus peones en la columna ${f.structure.gaveSelfDoubled}, un defecto que ya no se arregla.
3. El peón de ${f.structure.gaveSelfIsolated} queda aislado: ningún peón tuyo puede defenderlo.

### Debilita el escudo del rey

_Bandera:_ `weakensKingShield`

1. Adelantas un peón del escudo de tu rey y abres líneas hacia él.
2. Ese avance debilita la cobertura de tu rey.

### Rey al centro con piezas en juego

_Bandera:_ `kingToCenter`

1. Llevas el rey hacia el centro con piezas aún en juego: queda expuesto.
2. El rey camina al centro demasiado pronto y se vuelve un blanco.

### Caballo a la banda

_Bandera:_ `knightToRim`

1. El caballo en ${f.playedTo} queda en la banda, con pocas casillas útiles.
2. Caballo a la banda: desde ${f.playedTo} controla muy poco.

### Dama fuera demasiado pronto

_Bandera:_ `queenOutEarly`

1. Sacas la dama antes de terminar el desarrollo: el rival gana tiempos atacándola.
2. La dama sale muy pronto y se convierte en blanco de las piezas menores.

### Mueve la misma pieza dos veces

_Bandera:_ `movesPieceTwice`

1. Mueves ${art(f.playedPiece)} por segunda vez con piezas sin desarrollar.
2. Otra vez ${art(f.playedPiece)}: pierdes un tiempo que hacía falta para desarrollar.

### Repliegue de pieza

_Bandera:_ `retreats`

1. Retrocedes ${art(f.playedPiece)} y pierdes actividad.
2. Volver atrás con ${art(f.playedPiece)} le regala un tiempo al rival.

### Pieza propia atrapada

_Bandera:_ `trappedPiece`

1. ${cap(tp)} de ${f.trappedPiece.square} queda atrapado: no tiene casilla segura.
2. Dejas ${tp} de ${f.trappedPiece.square} sin escapatoria.

### Riesgo de mate en la última fila

_Bandera:_ `backRankRisk`

1. Tu rey queda encerrado en la última fila, sin casilla de escape.
2. Cuidado con la última fila: tu rey no tiene por dónde salir.

### Táctica disponible que se dejó pasar

_Bandera:_ `bestMotifs`

1. Tenías ${motifArt(bm.label)}${target} y la dejas pasar.

### Término de evaluación que cambió

_Bandera:_ `dominantTerm`

1. Tus piezas se quedan sin casillas: pierdes movilidad.
2. Después de esta jugada tus piezas tienen mucho menos por dónde moverse.
3. Cedes espacio: el rival manda ahora en tu mitad del tablero.
4. Le entregas terreno al rival.
5. Tu rey queda más expuesto tras esta jugada.
6. La jugada deja al rey con menos cobertura.
7. Te retrasas en el desarrollo y el rival toma la delantera.
8. Pierdes tiempo de desarrollo.

### bestTo

_Bandera:_ `bestTo`

1. Imprecisión: cedes algo de terreno.
2. No es grave, pero hay algo mejor aquí.
3. Se puede jugar mejor, aunque no es un error grave.
4. Pequeña imprecisión; la posición aguanta.

### Genérico por clasificación

_Bandera:_ `classification`

1. Error grave: sueltas mucha ventaja de golpe, aunque la posición sigue a tu favor.
2. Eso regala buena parte de tu ventaja. Sigues mejor, pero era mucho más fácil antes.
3. Error grave: la posición se te complica de golpe.
4. Esta jugada le entrega la partida al rival.
5. Esto cambia la partida, y no a tu favor.
6. Error importante: a partir de aquí el rival lleva la iniciativa.
7. Error: cedes parte de la ventaja, aunque sigues por delante.
8. Eso le devuelve juego al rival. La posición todavía es tuya.
9. Error: le das la iniciativa al rival.
10. Con esta jugada pierdes el hilo de la posición.
11. Aquí se te escapa el control de la partida.
12. Jugada equivocada: el rival pasa a mandar.

---

## Tus jugadas — ranura B: cómo cambió la partida

### variantSeed

_Bandera:_ `variantSeed`

1. Le das la vuelta a la partida: de estar peor pasas a mandar.
2. Gran cambio de rumbo: venías peor y ahora tienes ventaja.
3. Recuperas: la partida vuelve a estar pareja.
4. Enderezas la posición y queda igualada.
5. Tomas la iniciativa desde una posición pareja.
6. De estar igualado pasas a llevar la ventaja.
7. Sigues peor, pero la posición ya no está perdida.
8. Reduces el daño: la partida deja de estar perdida.

### good

_Bandera:_ `good`

1. Estaba parejo y ahora el rival toma la ventaja.
2. De una posición igualada pasas a estar peor.
3. Tenías ventaja y la dejas escapar: queda igualada.
4. Se te va la ventaja y la partida se iguala.
5. Ibas con ventaja y ahora estás peor.
6. Pasas de mandar en la partida a estar en desventaja.

### evalAfter

_Bandera:_ `evalAfter`

1. Ya venías mal, así que esto no la decide, pero tampoco ayuda.
2. La posición ya era difícil de antes.
3. Sigues ganando, pero desperdicias parte de la ventaja.
4. Aún ganas, aunque cediste terreno.

---

## Tus jugadas — ranura C: qué era mejor

### Mate forzado que se escapó

_Bandera:_ `missedForcedMate`

1. Con ${bp} a ${sq} forzabas el mate.

### La mejor jugada defendía la pieza colgada

_Bandera:_ `bestDefendsHung`

1. Con ${bp} a ${sq} lo defendías.

### bestTradeVerdict

_Bandera:_ `bestTradeVerdict`

1. Con ${bp} a ${sq} cambiabas ${art(f.bestCapturedPiece)}, un cambio parejo.
2. ${cap(bp)} a ${sq} cambiaba ${art(f.bestCapturedPiece)} en igualdad.
3. ${cap(bp)} a ${sq} era mejor.
4. Con ${bp} a ${sq} te llevabas ${art(f.bestCapturedPiece)}.

### bestFollowUp

_Bandera:_ `bestFollowUp`

1. Lo indicado era ${bp} a ${sq}, ${f.bestFollowUp}.
2. ${cap(bp)} a ${sq} era mejor, ${f.bestFollowUp}.

### bestLineForced

_Bandera:_ `bestLineForced`

1. ${cap(bp)} a ${sq} abría una secuencia forzada que gana ${art(f.bestLineWins.piece)}.

### La mejor jugada daba jaque

_Bandera:_ `bestGivesCheck`

1. ${cap(bp)} a ${sq} daba jaque y cambiaba el ritmo.

### La mejor jugada era enrocar

_Bandera:_ `bestIsCastle`

1. Enrocar primero dejaba al rey a salvo.

### La mejor jugada era un peón al centro

_Bandera:_ `bestIsCenterPawn`

1. Atacar el centro con el peón a ${sq} era mejor.
2. ${cap(bp)} a ${sq} era mejor.
3. Lo indicado era ${bp} a ${sq}.
