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
- `sanitizeContractHtml` (`src/lib/contracts/sanitize.ts`) se endurece: manejadores `on*=` tras
  espacio, `/`, comilla o acento grave; reglas de atributos solo dentro de etiquetas (no toca texto
  escapado); más etiquetas bloqueadas (`svg`, `math`, `template`, `frame`...); URLs
  `javascript:`/`vbscript:`/`data:` con normalización de entidades y espacios (se permite
  `data:image/...;base64` en `src`, que usa la firma); fuera `srcdoc`/`srcset` y estilos con
  `expression(`/`url(`; se repite hasta que no cambia.
- Fuera de alcance: añadir una dependencia (DOMPurify o similar). El filtro es un tokenizador propio
  que sigue los estados de HTML y reconstruye las etiquetas; la defensa principal sigue siendo el
  escape en origen.

## Checklist

- [x] Escape de los tokens al crear el contrato — smoke `snapshot guarda el nombre escapado`.
- [x] Filtro bloquea `/onload=` y demás vectores — smoke, 14 vectores.
- [x] Snapshots antiguos con el nombre en crudo se pintan inertes — smoke `un snapshot antiguo...`.
- [x] Plantilla JH v1.0, firma `data:image/png` y enlaces https salen intactos — smoke.
- [x] Smoke nuevo `npm run smoke:contract-xss` (DB solo `jh_gates` en 127.0.0.1:3399).
- [x] Smokes de contratos existentes siguen en verde.
- [ ] Revisión de un revisor (tier 1).
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

## Siguiente paso

En espera (2026-11-14): la spec aprobada deja fuera «un sanitizador basado en parser (DOMPurify o
similar)» y el filtro actual es un tokenizador propio. Noe decide entre DOMPurify y el filtro
propio antes del push y el PR. El escape del nombre en origen no depende de esa decisión.
