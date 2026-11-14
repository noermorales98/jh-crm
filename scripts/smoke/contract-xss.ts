/**
 * XSS almacenado en contratos: un nombre de cliente hostil debe quedar inerte
 * en el `contentSnapshot` y en el HTML que pinta el portal del cliente.
 * Parte 1 sin DB (filtro de HTML); parte 2 contra la base local desechable.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npm run smoke:contract-xss
 */
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import {
  JH_SERVICE_CONTRACT_HTML,
  escapeHtml,
  sanitizeContractHtml,
} from "../../src/lib/contracts/sanitize";
import {
  fillTemplateVariables,
  presentContractHtml,
} from "../../src/lib/contracts/template-variables";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/^mysql:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\/jh_gates(\?|$)/.test(databaseUrl)) {
  throw new Error("contract-xss solo corre contra la base local desechable jh_gates.");
}

const MARK = `xss${Date.now()}`;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

/** Lo que el portal entrega a `dangerouslySetInnerHTML`. */
function portalHtml(snapshot: string) {
  return presentContractHtml(sanitizeContractHtml(snapshot));
}

/** Decodifica las entidades que un navegador resuelve dentro de un atributo. */
function decodeEntities(text: string) {
  return text
    .replace(/&#x0*([0-9a-f]+);?/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#0*([0-9]+);?/g, (_m, d: string) => String.fromCharCode(Number(d)))
    .replace(/&tab;/gi, "\t")
    .replace(/&newline;/gi, "\n")
    .replace(/&colon;/gi, ":");
}

const LIVE_TAGS =
  /^<(?:noembed|noframes|title|xmp|plaintext|video|audio|source|track|script|style|svg|iframe|frame|frameset|object|embed|applet|math|template|form|button|input|textarea|select|link|meta|base|portal|noscript)\b/i;

const URL_ATTRS = /^(?:href|src|xlink:href|action|formaction|background|poster|data|cite|ping|longdesc|usemap|lowsrc|dynsrc)$/;
const BAD_SCHEME = /^(?:javascript|vbscript|livescript|mocha):/;
const BAD_STYLE = /&(?!quot;|#39;|#x27;|amp;)|position\s*:\s*(?:fixed|sticky)|\\|expression|url|image-set|image\s*\(|cross-fade|element\s*\(|src\s*\(|@import|behavior|binding|javascript:/i;

/**
 * Etiquetas de apertura tal como las corta el navegador: una comilla solo abre un valor
 * justo después de `=` (tras espacios opcionales). Si la entrada acaba dentro de una
 * etiqueta, se devuelve el resto entero (se juzga igual, de forma conservadora).
 */
function browserTags(html: string): string[] {
  const tags: string[] = [];
  let i = html.indexOf("<");
  while (i !== -1) {
    if (!/[a-z]/i.test(html[i + 1] ?? "")) {
      i = html.indexOf("<", i + 1);
      continue;
    }
    let j = i + 1;
    let end = -1;
    while (j < html.length) {
      const ch = html[j]!;
      if (ch === ">") {
        end = j;
        break;
      }
      if (ch === "=" && !/[\t\n\f\r /<]/.test(html[j - 1]!)) {
        j += 1;
        while (j < html.length && /[\t\n\f\r ]/.test(html[j]!)) j += 1;
        const q = html[j];
        if (q === '"' || q === "'") {
          const k = html.indexOf(q, j + 1);
          j = k === -1 ? html.length : k + 1;
        }
        continue;
      }
      j += 1;
    }
    if (end === -1) {
      tags.push(html.slice(i));
      break;
    }
    tags.push(html.slice(i, end + 1));
    i = html.indexOf("<", end + 1);
  }
  return tags;
}

/**
 * Oráculo independiente del filtro: ¿queda algo que el navegador ejecutaría o cargaría?
 * Corta las etiquetas con la regla del navegador (`browserTags`). Los valores entre
 * comillas se leen como valores y se juzgan según su atributo; todo lo demás de la
 * etiqueta se juzga de forma conservadora.
 */
function looksExecutable(html: string) {
  // El icono del chip de variables (lo añade `presentContractHtml` tras filtrar) es nuestro.
  const own = html.replace(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="14"[\s\S]*?<\/svg>/g, "");
  const tags = browserTags(own);
  return tags.some((raw) => {
    if (LIVE_TAGS.test(raw)) return true;
    const skeleton = raw.replace(/=[\t\n\f\r ]*(?:"[^"]*"|'[^']*')/g, '=""');
    const dskel = decodeEntities(skeleton).replace(/[\u0000- \u007f-\u009f]/g, "");
    if (
      /[\s/"'`]on[a-z]+\s*=/i.test(skeleton) ||
      /\b(?:srcdoc|srcset)\s*=/i.test(skeleton) ||
      /(?:javascript|vbscript|livescript):/i.test(dskel) ||
      /data:(?!image\/(?:png|jpeg|gif|webp);base64,)/i.test(dskel) ||
      BAD_STYLE.test(dskel)
    ) {
      return true;
    }
    for (const [, rawName, dq, sq] of raw.matchAll(/([^\s"'<>/=]+)[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"]*)"|'([^']*)')/g)) {
      const name = rawName!.toLowerCase();
      const value = decodeEntities(dq ?? sq ?? "").replace(/[\u0000- \u007f-\u009f]/g, "").toLowerCase();
      if (name.startsWith("on") || name === "srcdoc" || name === "srcset" || name === "ping") return true;
      if (URL_ATTRS.test(name)) {
        if (BAD_SCHEME.test(value)) return true;
        if (value.startsWith("data:") && !(name === "src" && /^data:image\/(?:png|jpeg|gif|webp);base64,/.test(value))) return true;
      }
      if (name === "style" && BAD_STYLE.test(value)) return true;
    }
    return false;
  });
}

const HOSTILE_NAMES = [
  "<svg/onload=alert(1)>",
  "<img src=x onerror=alert(1)>",
  "\"><script>alert(1)</script>",
  "<a href=javascript:alert(1)>x</a>",
  "<iframe srcdoc=\"<script>alert(1)</script>\"></iframe>",
];

function filterChecks() {
  console.log("\n[contract-xss] filtro de HTML (sin DB)\n");

  const vectors: Record<string, string> = {
    "manejador tras `/` en etiqueta permitida (`<img/src=x/onerror=`)": "<img/src=x/onerror=alert(1)>",
    "manejador sin espacio previo en svg (`/onload=`)": "<svg/onload=alert(1)>",
    "manejador tras comilla de cierre": '<img src="x"onerror="alert(1)">',
    "manejador tras acento grave": "<img src=`x`onerror=alert(1)>",
    "manejador con mayúsculas y tabulador": "<img src=x\tOnErRoR=alert(1)>",
    "manejador tras `>` entre comillas": '<a title="a>b" onclick=alert(1)>x</a>',
    "manejador que se recompone al quitar otro": '<img src=x o onerror=""nerror=alert(1)>',
    "etiqueta que se recompone al quitar otra": "<ifr<iframe>ame src=x>",
    "script partido que se recompone": "<scr<script>x</script>ipt>alert(1)</script>",
    "javascript: sin comillas": "<a href=javascript:alert(1)>x</a>",
    "javascript: con &Tab;": '<a href="java&Tab;script:alert(1)">x</a>',
    "javascript: con entidad hex y &colon;": '<a href=" jav&#x09;ascript&colon;alert(1)">x</a>',
    "javascript: con entidad decimal": '<a href="&#106;avascript:alert(1)">x</a>',
    "javascript: con caracteres de control": '<a href="\u0001javascript:alert(1)">x</a>',
    "vbscript:": '<a href="vbscript:msgbox(1)">x</a>',
    "javascript: en xlink:href": '<a xlink:href="javascript:alert(1)">x</a>',
    "data:text/html en enlace": '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>',
    "data:image/svg+xml en src": '<img src="data:image/svg+xml;base64,PHN2Zz4=">',
    "iframe con srcdoc": '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    "srcdoc en otra etiqueta": '<div srcdoc="x">y</div>',
    "srcset": '<img srcset="https://x.test/a.png 1x">',
    "math/mtext": "<math><mtext><img src=x onerror=alert(1)></mtext></math>",
    "template": "<template><img src=x onerror=alert(1)></template>",
    "object": '<object data="https://x.test/a.swf"></object>',
    "embed": '<embed src="https://x.test/a.swf">',
    "link": '<link rel="stylesheet" href="https://x.test/a.css">',
    "meta refresh": '<meta http-equiv="refresh" content="0;url=https://x.test">',
    "base": '<base href="https://x.test/">',
    "estilo con expression()": '<p style="width:expression(alert(1))">x</p>',
    "estilo con url()": '<p style="background:URL(https://x.test/a.png)">x</p>',
    "estilo con @import": "<p style=\"@import 'https://x.test/a.css'\">x</p>",
    "estilo con javascript:": '<p style="background:javascript:alert(1)">x</p>',
    "form con formaction": '<button formaction="javascript:alert(1)">x</button>',
    "href tras `/`": "<a/href=javascript:alert(1)>x</a>",
    "manejador tras comilla simple": "<img src='x'onerror=alert(1)>",
    "manejador con espacio antes de `=`": "<img src=x onerror =alert(1)>",
    "JAVASCRIPT: en mayúsculas": '<a href="JAVASCRIPT:alert(1)">x</a>',
    "javascript: con &NewLine;": '<a href="java&NewLine;script:alert(1)">x</a>',
    "entidad decimal sin `;`": '<a href="&#106avascript:alert(1)">x</a>',
    "`>` en valor con espacio tras `=`": '<a title= ">" onclick=alert(1)>x</a>',
    "`>` en valor con comilla simple": "<a title='>' onclick=alert(1)>x</a>",
    "etiqueta sin cerrar al final": "<p>x</p><img src=x onerror=alert(1)",
    "url() con entidad en estilo": '<p style="background:u&#114;l(https://x.test/a.png)">x</p>',
    "background=javascript:": '<td background="javascript:alert(1)">x</td>',
    "svg en mayúsculas": "<SVG onload=alert(1)>",
    "texto crudo noembed": '<noembed><img alt="</noembed><img src=x onerror=alert(1)>">',
    "texto crudo noframes": '<noframes><img alt="</noframes><img src=x onerror=alert(1)>">',
    "texto crudo textarea": '<textarea><img alt="</textarea><img src=x onerror=alert(1)>">',
    "texto crudo title": '<title><img alt="</title><img src=x onerror=alert(1)>">',
    "texto crudo noscript": '<noscript><img alt="</noscript><img src=x onerror=alert(1)>">',
    "plaintext": '<plaintext><img src=x onerror=alert(1)>',
    "entidad hex sin `;`": '<a href="&#x6a&#x61vascript:alert(1)">x</a>',
    "input type=image": '<input type=image src="https://x.test/p.png">',
    "portal": '<portal src="https://x.test/"></portal>',
    "estilo position:fixed (aviso falso a pantalla completa)": '<div style="position: fixed; inset: 0">x</div>',
    "video remoto": '<video src="https://x.test/a.mp4"></video>',
    "ping en enlace": '<a href="https://a.test/" ping="https://x.test/">x</a>',
    "estilo con url&lpar;": '<div style="background:url&lpar;https://x.test/a.png&rpar;">x</div>',
    "estilo con image-set&lpar;": "<div style=\"cursor:image-set&lpar;'https://x.test/a.png' 1x)\">x</div>",
    "estilo con entidad numérica": '<div style="background:url&#40;https://x.test/a.png)">x</div>',
    "estilo con src()": "<div style=\"background:src('https://x.test/a.png')\">x</div>",
    "estilo con image()": "<div style=\"background:image('https://x.test/a.png')\">x</div>",
    "estilo con cross-fade()": "<div style=\"background:cross-fade(50%, 'https://x.test/a.png')\">x</div>",
    "estilo con escape CSS": '<p style="background:\\75rl(https://x.test/p.png)">x</p>',
    "estilo con image-set()": "<p style=\"background:image-set('https://x.test/p.png' 1x)\">x</p>",
    "estilo con comentario partiendo url": '<p style="background:u/**/rl(https://x.test/p.png)">x</p>',
  };
  for (const [label, html] of Object.entries(vectors)) {
    const out = sanitizeContractHtml(html);
    check(`bloquea ${label}`, !looksExecutable(out), out);
  }

  const signature =
    '<p><img src="data:image/png;base64,iVBORw0KGgo=" alt="Firma" style="max-height:72px;max-width:260px" /></p>';
  check(
    "conserva la firma en data:image/png",
    sanitizeContractHtml(signature) === signature,
    sanitizeContractHtml(signature),
  );
  check(
    "la plantilla JH v1.0 sale intacta",
    sanitizeContractHtml(JH_SERVICE_CONTRACT_HTML) === JH_SERVICE_CONTRACT_HTML,
  );
  check(
    "conserva enlaces https normales",
    sanitizeContractHtml('<a href="https://jh-multiservices.com/">web</a>') ===
      '<a href="https://jh-multiservices.com/">web</a>',
  );
  check(
    "no toca texto que solo menciona «on»",
    sanitizeContractHtml("<p>persona on=line</p>") === "<p>persona on=line</p>",
  );
  check(
    "no toca un nombre ya escapado en el texto",
    sanitizeContractHtml("<p>&lt;svg/onload=alert(1)&gt;</p>") === "<p>&lt;svg/onload=alert(1)&gt;</p>",
  );

  // Rendimiento: entradas hostiles grandes no bloquean el servidor ni la pestaña (ReDoS).
  const heavy: Record<string, string> = {
    "comillas sin cerrar ni `>`": '<a ' + '"x '.repeat(20000),
    "valores con comilla sin cerrar": '<a ' + 'b="x '.repeat(20000),
    "muchos `<script` sin cierre": "<script".repeat(20000),
    "muchos comentarios sin cierre": "<!--".repeat(20000),
    "muchos `on` sin `=`": "<a " + " on".repeat(20000) + ">",
    "muchos `<svg ` sin `>`": "<svg ".repeat(40000),
    "muchos `</form` sin `>`": "</form".repeat(40000),
    "muchos `<input x` sin `>`": "<input x".repeat(30000),
    "un `<span` con muchas variables y sin `>`": "<span " + 'data-template-var="x" '.repeat(10000),
    "muchas aperturas de chip sin cierre": '<span data-template-var="clientName">'.repeat(20000),
    "comentario con muchos guiones sin cierre": "<!--" + "-".repeat(160000),
  };
  for (const [label, html] of Object.entries(heavy)) {
    const t0 = performance.now();
    const out = presentContractHtml(sanitizeContractHtml(html));
    const ms = performance.now() - t0;
    check(`responde rápido con ${label} (${html.length} car.)`, ms < 500 && !looksExecutable(out), `${ms.toFixed(0)} ms`);
  }
  check(
    "un valor con comilla sin cerrar no deja un manejador vivo",
    !looksExecutable(sanitizeContractHtml('<p>x</p><img alt="y src=x onerror=alert(1)>')),
    sanitizeContractHtml('<p>x</p><img alt="y src=x onerror=alert(1)>'),
  );

  // Forma exacta de la salida: quitar lo peligroso no rompe el HTML de alrededor ni sobre-escapa.
  const exact: Array<[string, string, string]> = [
    ["conserva el HTML de alrededor", '<p>a</p><img src="x" onerror="alert(1)"><p>b &amp; c</p>', '<p>a</p><img src="x"><p>b &amp; c</p>'],
    ["quita svg sin tocar lo demás", "<h2>T</h2><svg/onload=alert(1)><p>ok</p></svg>", "<h2>T</h2><p>ok</p>"],
    ["neutraliza el enlace y deja su texto", '<p><a href="javascript:alert(1)">ver</a></p>', '<p><a href="#">ver</a></p>'],
    ["comilla sin cerrar: el resto queda como texto", '<p>x</p><img alt="y src=x onerror=alert(1)>', '<p>x</p>&lt;img alt=&quot;y src=x onerror=alert(1)&gt;'],
    ["etiqueta sin `>`: el resto queda como texto", "<p>x</p><img src=x", "<p>x</p>&lt;img src=x"],
    ["quita el bloque script con su contenido", "<p>a</p><script>alert(1)</script><p>b</p>", "<p>a</p><p>b</p>"],
    ["quita el bloque style con su contenido", "<p>a</p><style>p{color:red}</style><p>b</p>", "<p>a</p><p>b</p>"],
    ["quita comentarios", "<p>a</p><!-- nota --><p>b</p>", "<p>a</p><p>b</p>"],
    ["una comilla doble dentro de un valor con comilla simple no abre atributos", "<a title='x\" onclick=alert(1) y'>t</a>", '<a title="x&quot; onclick=alert(1) y">t</a>'],
    ["el primer atributo repetido gana, como en el navegador", '<a href="https://a.test/" href="https://b.test/">t</a>', '<a href="https://a.test/">t</a>'],
    ["un `<` que no abre etiqueta queda como texto", "<p>5 < 6, I <3 you</p>", "<p>5 &lt; 6, I &lt;3 you</p>"],
    ["`=` al empezar un atributo no abre un valor", '<img /="x><base href=https://evil.example/>" a="">', '<img>" a="">'],
    ["un `<!…>` raro se descarta hasta el primer `>`", '<!x <img alt="> <base href=https://evil.example/>">', ' ">'],
    ["texto crudo (`xmp`) no esconde etiquetas", '<xmp><img alt="</xmp><base href=x>">', '">'],
    ["comentario cerrado con `--!>`", "<!-- a --!><base href=x><p>b</p>", "<p>b</p>"],
    ["`İ` antes de un bloque no descuadra el texto", "İİİİİİİİİİİİ<script>x</script><p>ok</p><b>fin</b>", "İİİİİİİİİİİİ<p>ok</p><b>fin</b>"],
    ["espacio entre `=` y el valor entre comillas", '<a title= "x" href="https://a.test/">t</a>', '<a title="x" href="https://a.test/">t</a>'],
    ["mayúsculas: el bloque SCRIPT no se come lo que sigue", "<SCRIPT>a</SCRIPT><p>b</p>", "<p>b</p>"],
    ["mayúsculas en etiquetas normales", "<P>Hola</P>", "<p>Hola</p>"],
    ["atributo sin valor se conserva", "<ol reversed><li>a</li></ol>", "<ol reversed><li>a</li></ol>"],
    ["estilo con comillas en font-family se conserva", '<p style="font-family: &quot;Inter&quot;, sans-serif">a</p>', '<p style="font-family: &quot;Inter&quot;, sans-serif">a</p>'],
    ["estilo normal de TipTap se conserva", '<p style="text-align: center; color: #333">a</p>', '<p style="text-align: center; color: #333">a</p>'],
    ["firma en data:image/jpeg", '<img src="data:image/jpeg;base64,/9j/4AAQ">', '<img src="data:image/jpeg;base64,/9j/4AAQ">'],
    ["imagen data:image/gif", '<img src="data:image/gif;base64,R0lGODlh">', '<img src="data:image/gif;base64,R0lGODlh">'],
    ["imagen data:image/webp", '<img src="data:image/webp;base64,UklGRg==">', '<img src="data:image/webp;base64,UklGRg==">'],
    ["quita form (y su action)", '<form action="https://x.test/"><p>a</p></form>', "<p>a</p>"],
    ["estilo sin comillas con NBSP no esconde url()", "<p style=color:red;\u00a0background:url(https://x.test/a.png)>x</p>", "<p>x</p>"],
  ];
  for (const [label, input, expected] of exact) {
    const out = sanitizeContractHtml(input);
    check(label, out === expected, out);
  }

  const twoChips = presentContractHtml("<p>{{clientName}} y {{clientFullName}}</p>");
  check(
    "dos chips pendientes llevan icono y no dejan el marcador",
    (twoChips.match(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="14"/g) ?? []).length === 2 &&
      !/jhtplicon/.test(twoChips),
    twoChips,
  );
  const filledSpan = presentContractHtml(
    '<p>Firma: <span data-template-var="clientFullName" class="jh-template-var">Ana Perez</span></p>',
  );
  check(
    "una variable ya sustituida se ve como texto, no como chip",
    filledSpan === "<p>Firma: Ana Perez</p>",
    filledSpan,
  );
  const markerInAttr =
    "<img alt=\"{{clientName}}<a title='{{clientName}}<img src=x onerror=window.PWNED=1>'>\">";
  check(
    "el icono del chip no entra dentro de un atributo",
    !looksExecutable(presentContractHtml(markerInAttr)) && !looksExecutable(portalHtml(markerInAttr)),
    presentContractHtml(markerInAttr),
  );
  for (const tricky of [
    '<p title="{{clientName}}">{{clientName}}</p>',
    '<a href="https://a.test/{{clientFullName}}">{{clientFullName}}</a>',
    "<img alt='{{clientName}}' src=x>",
  ]) {
    const out = presentContractHtml(tricky);
    const icons = (out.match(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="14"/g) ?? []).length;
    check(`el icono solo aparece en chips de texto: ${tricky}`, icons <= 1 && !/jhtplicon/.test(out) && !looksExecutable(out), out);
  }
  const almostToken = presentContractHtml(
    '<p><span data-template-var="clientName" class="jh-template-var">{{clientName}} extra</span></p>',
  );
  check("solo el token exacto se convierte en chip", almostToken === "<p>{{clientName}} extra</p>", almostToken);
  const preWrapped = presentContractHtml(
    '<p><span data-template-var="clientName" class="jh-template-var">{{clientName}}</span></p>',
  );
  check(
    "un chip ya envuelto no se envuelve dos veces",
    (preWrapped.match(/<\/span>/g) ?? []).length === 2 && (preWrapped.match(/<span/g) ?? []).length === 2,
    preWrapped,
  );
  const distinct = fillTemplateVariables("<p>{{clientName}}|{{clientFullName}}</p>", {
    clientName: "Ana <A>",
    clientFullName: "Ana <B> Perez",
  });
  check(
    "cada token recibe su propio valor escapado",
    distinct === "<p>Ana &lt;A&gt;|Ana &lt;B&gt; Perez</p>",
    distinct,
  );

  const reflow = '<img alt=<span data-template-var="k"> src=x onerror=alert(1)>X</span>';
  check(
    "la reescritura del chip no reabre un manejador (orden filtro → presentación)",
    !looksExecutable(portalHtml(reflow)) && !looksExecutable(presentContractHtml(reflow)),
    portalHtml(reflow),
  );
  const reflowKnown =
    '<img alt=<span data-template-var="clientName"> src=x onerror=alert(1)>{{clientName}}</span>';
  check(
    "ni con una variable conocida",
    !looksExecutable(presentContractHtml(reflowKnown)),
    presentContractHtml(reflowKnown),
  );
  const chip = presentContractHtml("<p>{{clientName}}</p>");
  check(
    "el chip de variable pendiente conserva su icono",
    chip.includes('<svg xmlns="http://www.w3.org/2000/svg" width="14"') && chip.includes("Nombre del usuario"),
    chip,
  );
  // Defensa adicional: `presentContractHtml` solo trata como chip las variables propias.
  check(
    "una clave heredada del prototipo no cuenta como variable",
    presentContractHtml('<span data-template-var="toString">x</span>') === "x",
  );

  // Valor esperado escrito a mano (no con `escapeHtml`), para que la prueba no sea circular.
  check(
    "escapeHtml cubre & < > \" '",
    escapeHtml(`a&b<c>d"e'f`) === "a&amp;b&lt;c&gt;d&quot;e&#39;f",
    escapeHtml(`a&b<c>d"e'f`),
  );
  const fillCases: Array<[string, string]> = [
    ["<svg/onload=alert(1)>", "&lt;svg/onload=alert(1)&gt;"],
    ['"><script>alert(1)</script>', "&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"],
    ["O'Brien & Hijos", "O&#39;Brien &amp; Hijos"],
  ];
  for (const [name, expected] of fillCases) {
    const filled = fillTemplateVariables(
      '<p title="{{clientFullName}}">Cliente: <strong>{{clientName}}</strong></p>',
      { clientName: name, clientFullName: name },
    );
    check(
      `la sustitución escapa ${JSON.stringify(name)} en texto y atributo`,
      filled === `<p title="${expected}">Cliente: <strong>${expected}</strong></p>`,
      filled,
    );
  }
}

async function dbChecks(prisma: PrismaClient) {
  console.log("\n[contract-xss] contrato real desde plantilla (DB)\n");
  const { createContractFromTemplate, markSent } = await import("../../src/server/contracts");

  const user = await prisma.user.create({
    data: { email: `${MARK}@example.test`, passwordHash: "x", name: "Gate" },
  });
  const org = await prisma.organization.create({ data: { name: `TEST JH-CRM ${MARK}` } });
  await prisma.organizationMember.create({
    data: { userId: user.id, organizationId: org.id, role: "OWNER" },
  });
  await prisma.organizationSettings.create({ data: { organizationId: org.id } });
  const ctx: OrganizationContext = { userId: user.id, organizationId: org.id, role: "OWNER" };

  const template = await prisma.contractTemplate.create({
    data: {
      organizationId: org.id,
      name: "Contrato XSS",
      version: "1.0",
      contentHtml: `${JH_SERVICE_CONTRACT_HTML}<p>Firma: <span data-template-var="clientFullName" class="jh-template-var">{{clientFullName}}</span></p>`,
      active: true,
    },
  });

  for (const [i, firstName] of HOSTILE_NAMES.entries()) {
    const client = await prisma.client.create({
      data: {
        organizationId: org.id,
        clientCode: `X${i}-${MARK}`.slice(0, 20),
        firstName,
        lastName: "Prueba",
        status: "ACTIVE",
      },
    });
    const contract = await createContractFromTemplate(ctx, {
      clientId: client.id,
      templateId: template.id,
      cancellationDeadlineDays: 3,
    });
    const escaped = escapeHtml(`${firstName} Prueba`);
    check(
      `snapshot guarda el nombre escapado (${JSON.stringify(firstName)})`,
      contract.contentSnapshot.includes(escaped) && !contract.contentSnapshot.includes(firstName),
    );
    check(
      "el snapshot no lleva tokens sin resolver",
      !/\{\{client(?:Full)?Name\}\}/.test(contract.contentSnapshot),
    );
    check("el HTML del portal queda inerte", !looksExecutable(portalHtml(contract.contentSnapshot)));
    check(
      "el portal muestra el nombre como texto",
      portalHtml(contract.contentSnapshot).includes(escaped),
    );

    const sent = await markSent(ctx, contract.id);
    check("tras enviar, sigue inerte", !looksExecutable(portalHtml(sent.contentSnapshot)));
  }

  // Un snapshot heredado (antes del arreglo) con el nombre en crudo: el filtro del portal lo neutraliza.
  const legacy = JH_SERVICE_CONTRACT_HTML.replace("{{clientName}}", "<svg/onload=alert(1)>");
  check("un snapshot antiguo sin escapar se pinta inerte", !looksExecutable(portalHtml(legacy)), portalHtml(legacy));
}

async function main() {
  filterChecks();
  const prisma = new PrismaClient();
  try {
    await dbChecks(prisma);
  } finally {
    await prisma.$disconnect();
  }
  if (failed > 0) {
    console.error(`\n[contract-xss] FALLÓ (${failed})\n`);
    process.exit(1);
  }
  console.log("\n[contract-xss] OK\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
