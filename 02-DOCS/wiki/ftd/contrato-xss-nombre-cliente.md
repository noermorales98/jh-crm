---
branch: claude/youthful-leavitt-d8f81e
status: in-review
date: 2026-11-14
---

# Contratos: nombre de cliente hostil sin XSS en el portal

## Intención

Un cliente con un nombre como `<svg/onload=alert(1)>` no debe poder ejecutar código en el portal
del cliente cuando abre su contrato. Encontrado en la revisión de cierre de la tanda 3a del conector
MCP (ver `../sdd/decisions.md`, 2026-11-14): el problema ya existía con el botón de la app; el
conector solo añade otra vía.

## Alcance

- `createContractFromTemplate` escapa como HTML cada valor que sustituye en `contentSnapshot`
  (`fillTemplateVariables` en `src/lib/contracts/template-variables.ts`). Hoy los únicos tokens son
  `{{clientName}}` y `{{clientFullName}}`. Los datos de la organización en la firma de la agencia ya
  se escapaban (`agencySignatureHtml`).
- `sanitizeContractHtml` (`src/lib/contracts/sanitize.ts`) es DOMPurify (`isomorphic-dompurify@4.6.0`
  con `dompurify@3.4.17`, versiones exactas; decisión de Noe 2026-11-14, enmienda de la spec):
  lista cerrada de etiquetas y atributos, `data:` solo como imagen PNG/JPEG/GIF/WebP en `src`,
  estilos filtrados (`url(`, escapes CSS, `image-set(`, `position: fixed|sticky`...), `rel` seguro con
  `target`. Con topes de entrada (1 000 000 caracteres, 3 000 aperturas de etiqueta) y falla cerrado
  a texto escapado, porque jsdom es cuadrático con la profundidad.
- `presentContractHtml` (portal y vista previa del CRM) filtra su propia salida; el icono del chip
  entra después de filtrar y solo junto a la apertura de un chip.
- Un filtro propio (tokenizador) se construyó y revisó antes de la decisión; se descartó a favor de
  DOMPurify y su historial está en los commits anteriores de la rama.

## Checklist

- [x] Escape de los tokens al crear el contrato — smoke `snapshot guarda el nombre escapado`.
- [x] Filtro bloquea `/onload=` y demás vectores — smoke, 14 vectores.
- [x] Snapshots antiguos con el nombre en crudo se pintan inertes — smoke `un snapshot antiguo...`.
- [x] Plantilla JH v1.0, firma `data:image/png` y enlaces https salen intactos — smoke.
- [x] Smoke nuevo `npm run smoke:contract-xss` (DB solo `jh_gates` en 127.0.0.1:3399).
- [x] Smokes de contratos existentes siguen en verde.
- [ ] Revisión de un revisor (tier 1).
- [x] Sustituido por DOMPurify (decisión de Noe) — smoke, build de Next, SSR con `DocumentView`.
- [ ] Panel de 3 lentes sobre el commit final.
- [ ] PR contra `main`; merge solo con el sí de Noe.

## Evidencia (2026-11-14)

- `DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npm run smoke:contract-xss` → `[contract-xss] OK`.
- Mutante: con el `replaceAll` en crudo y la regla antigua `\son...`, el smoke falla (11 ✗); al
  restaurar, vuelve a OK.
- `smoke:contract-legal-gate`, `smoke:credit-contracts`, `smoke:contract-gates-db` → OK.
- `npm run typecheck` → sin errores. `eslint` sobre los ficheros tocados → limpio.
- `rsc risk` → tier 1, sin aprobación humana obligatoria.

- Revisor de pruebas: 47 de 73 mutantes sobrevivían (oráculo débil, vectores que no probaban lo que
  decían, escape comprobado contra sí mismo). Oráculo nuevo (comillas, entidades, más etiquetas),
  33 vectores, escape con valores escritos a mano. 26 mutantes dirigidos, incluidos todos los
  supervivientes relevantes: 26 muertos.
- Revisor de corrección: ReDoS en el regex de etiquetas (129 caracteres → 15 s). Sustituido por un
  escáner lineal con la regla del navegador (comilla solo tras `=`). Además, los regex perezosos de
  `<script`/`<style`/comentarios (ya en `main`) eran cuadráticos: 140 000 caracteres → 3,3 s; ahora
  corte lineal. Todas las entradas hostiles de prueba (hasta 185 000 caracteres) < 50 ms.
- Panel final sobre `bfcfdef`. Corrección: `DANGEROUS_TAGS` con `[^>]*` era cuadrático sin `>`
  (`<svg ` ×40 000 → 3,2 s); la apertura peligrosa pasa al escáner y el cierre usa `[^<>]*` (6 ms).
  Pruebas: 11 mutantes explotables y 3 funcionales sobrevivían; añadidos sus vectores y checks de
  forma exacta (HTML de alrededor, bloques script/style, comentarios, comilla y etiqueta sin cerrar,
  dos chips, variable ya sustituida, chip ya envuelto, valores distintos por token). 44 mutantes
  dirigidos: 42 muertos; 2 equivalentes (el bucle de punto fijo ya no cambia el resultado porque el
  escáner quita las aperturas peligrosas en una pasada; `[^>]*>?` en el cierre traga el resto en una
  sola coincidencia y sigue lineal).
- Seguridad (panel final, fuzz de 1,6 M en Chrome): `bfcfdef` limpio; en `eaa4d19`, bypass
  `<img /="x><base href=…>">` (el escáner y el navegador leían distinto un `=` al empezar un
  atributo) y desfase de índices con `İ`. Cambio de diseño: `sanitizeOnce` es ahora un tokenizador
  con los estados de HTML (nombre, atributo, valor; comentarios, `<!…>`, `<?…>`, `</…>`; texto
  crudo) que **reconstruye** cada etiqueta permitida en forma canónica (valores entre comillas
  dobles con `"` escapado, nombres validados, primer atributo repetido gana). Lo que llega al
  navegador es exactamente lo que se revisó; un error de lectura solo puede afectar a la fidelidad.
  Fuzz propio en Chrome sobre el código nuevo: 600 000 entradas, 0 ejecutables (el detector sí
  marca los 3 casos malos de control). Regex del chip en `presentContractHtml` lineal. 19 entradas
  hostiles de hasta 740 000 caracteres: todas < 25 ms en el filtro. 39 mutantes: 38 muertos, 1
  equivalente (`iframe` también se quita como texto crudo).
- Panel sobre `d199d22`. Corrección: sin defectos. Seguridad: XSS por el icono del chip (el
  marcador podía quedar dentro de un atributo y el SVG rompía las comillas); ahora el icono solo
  entra justo tras la apertura canónica del chip y cualquier otro marcador se borra. Seguridad y
  pruebas: estilos con escapes CSS (`\75rl(`) o `image-set(` cargaban imágenes remotas; ahora se
  rechaza cualquier `style` con `\`, `/*`, `image-set(`/`image(`/`cross-fade(`/`src(` o
  `position: fixed|sticky`. Fuera también `ping`, `video`, `audio`, `source`, `track`. El detector
  del smoke corta etiquetas con la regla del navegador y trata `noembed`/`noframes`/`title`/`xmp`/
  `plaintext` como vivas. Chrome: el payload del revisor da `PWNED = 0`; 600 000 entradas nuevas
  (con chips dentro de atributos y trucos CSS), 0 ejecutables. Mutantes: 55 + 9 combinados; quedan
  solo equivalentes (una etiqueta quitada de una sola de las dos listas sigue cubierta por la otra).
- Panel sobre `bc35018`. Corrección: sin defectos. Pruebas: sin supervivientes que ejecuten o
  carguen algo; se fijan `src(`, `image(`, `cross-fade(`. Seguridad: el argumento del chip canónico
  se sostiene; `url&lpar;` esquivaba la lista de estilos (carga remota, no ejecuta). Ahora un
  `style` con cualquier `&` distinto de `&quot;`, `&#39;` o `&amp;` se rechaza entero.
- DOMPurify: 4 × 150 000 entradas aleatorias en Chrome con el build de navegador (más 60 000
  salidas del servidor, jsdom, parseadas en Chrome): 0 ejecutables. Chrome y jsdom difieren en
  ~2 % de las entradas hostiles (parseo de etiquetas rotas), solo en contenido ya inerte.
  `next build` correcto (jsdom queda como paquete externo del servidor). `DocumentView` renderizado
  en servidor sin `onerror`/`onload`. Coste: sin tope, 20 000 `<div>` anidados tardaban 78 s y
  lanzaban `RangeError`; con los topes, < 1 s (700 niveles: ~0,3 s). 82 mutantes del nuevo diseño:
  60 muertos; 22 supervivientes equivalentes o defensivos (etiquetas/atributos que DOMPurify ya
  descarta por estructura al estar su etiqueta contenedora prohibida, `/*` sin efecto sin `\`,
  tope de caracteres cubierto por el de aperturas, `catch` inalcanzable dentro de los topes, y
  comprobaciones redundantes del chip).
- Panel sobre `5920e62`. Seguridad: sin hallazgos (70 payloads de mXSS en Chrome, 15 000 fuzz, marcador
  del chip no falsificable, lockfile solo con el árbol de jsdom). Corrección: el tope de 1 500
  aperturas convertía en texto una tabla legítima larga; ahora manda la profundidad
  (`estimateMaxDepth`, 200 niveles, lectura como el navegador: comillas tras `=`, comentarios, texto
  crudo, cierres solo si coinciden; `<div/>` se cuenta como apertura porque HTML ignora la barra) y
  el total de aperturas sube a 8 000. Pruebas: el smoke no notaba perder etiquetas o atributos
  legítimos, mayúsculas en el tope ni el bucle lento de chips; ahora hay un documento con todas las
  etiquetas y atributos permitidos que sale idéntico, los límites 200/201 y 8 000/8 001, siete trucos
  contra el medidor y 60 000 chips. 74 + 4 mutantes más muertos (quitar cada etiqueta y atributo de
  las listas, y el medidor); equivalentes: `tbody` (el navegador lo reinserta), `rel` sin `target`,
  `'` en el medidor (solo sobrestima). Añadido `engines.node` (`^22.22.2 || ^24.15.0 || >=26`) por
  los requisitos de jsdom 30 y `attr(` a los estilos bloqueados.
- Panel sobre `a2752dd`. Seguridad y corrección reprodujeron la misma clase de fallo en el medidor
  de profundidad: `<!-->`, `<!--->`, `--!>` o un `<noscript>` sin cerrar devolvían profundidad 0
  con ~7 900 niveles reales (7–10 s de CPU), además de `<div/>`. Cada diferencia con el parser era
  una evasión; se eliminó el medidor y queda un tope duro de 3 000 aperturas (no interpreta nada).
  Peor caso medido: 2 999 `<div>` anidados ≈ 2,2 s; 7 900 variantes del truco → texto en < 1 s.
  Coste aceptado: documentos con más de 3 000 etiquetas (tablas de >600 filas) se ven como texto.

## Siguiente paso

Panel final sobre el commit, push y PR contra `main`. Sin merge hasta el sí de Noe.
