# Guía de estilo — assets de "Nacimiento de un Campeón"

Referencia común para todos los prompts de Stitch de los capítulos 1-7. Repetir
este bloque (o pegarlo primero) en cada generación mantiene a Judit y al resto
del elenco visualmente consistentes de capítulo a capítulo.

## Estilo general

> Ilustración digital estilizada e icónica, NO fotorrealista — estilo de arte
> de videojuego móvil narrativo (piensa en un juego de aventuras narrativas
> tipo visual novel). Paletas cálidas, líneas limpias, formas simples y
> expresivas. Nada de texturas de foto ni renders 3D.

## Retratos de personajes (bust/busto, no cuerpo completo)

- Encuadre: cabeza y hombros, mirando ligeramente hacia la cámara.
- **Fondo transparente** (pide "transparent background" explícitamente — ver
  nota abajo, Stitch a veces lo simula con un patrón de damero sobre un JPEG,
  eso no sirve, se procesa aparte).
- Expresión con personalidad clara — cada personaje necesita un gesto/mirada
  distinguible a tamaño pequeño (los retratos se muestran a ~44px en la app).
- Consistencia de paleta con Judit (`judit.png`), Zsófia (`zsofia.png`) y
  László (`laszlo.png`) ya existentes: tonos cálidos, piel con sombreado
  suave, ropa de época (Budapest, años 80).

## Escenas de fondo

- Formato vertical/retrato (se usa como fondo detrás de diálogo en móvil).
- Debe sentirse como un LUGAR real de la historia, no un fondo genérico:
  detalles de época y contexto (relojes de ajedrez, tableros, decoración
  húngara de los 80 según corresponda).
- **Sin texto ni captions incrustados en la imagen** — Stitch a veces mete un
  subtítulo de mockup dentro del render (nos pasó con `sala.jpg`, tocó
  recortarlo). Pide explícitamente "no text or captions in the image".
- Composición con espacio "de aire" en la mitad superior — ahí se superpone
  el cuadro de diálogo.

## Cómo me las envías

1. Genera en Stitch.
2. Abre el proyecto y copia el **código fuente HTML** de la página (no uses
   el diálogo "Export", ese exporta a Figma/AI Studio, no imágenes sueltas).
3. Pega ese HTML tal cual en el chat — ahí vienen las URLs reales de
   `lh3.googleusercontent.com` que puedo descargar y procesar (quitar fondo
   real con `rembg`, recortar si trae texto pegado).

## Nota técnica sobre "fondo transparente"

Los primeros 3 retratos (Judit/Zsófia/László) vinieron como JPEG con un
patrón de damero PINTADO en los píxeles simulando transparencia — un JPEG no
puede tener canal alfa real. Si pasa de nuevo, no es un error tuyo: yo les
quito el fondo de verdad con una herramienta de segmentación (`rembg`) del
lado del procesamiento, así que solo necesito la imagen tal como salga de
Stitch.
