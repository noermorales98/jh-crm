/**
 * XSS almacenado en contratos: un nombre de cliente hostil debe quedar inerte
 * en el `contentSnapshot` y en el HTML que pinta el portal del cliente.
 * Parte 1 sin DB (filtro de HTML); parte 2 contra la base local desechable.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npm run smoke:contract-xss
 */
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import { withinParseBudget } from "../../src/lib/contracts/parse-budget";
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

/** El texto que ve la persona: las cinco entidades de texto decodificadas. */
function decodeTextEntities(html: string) {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
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
const BAD_STYLE = /attr\s*\(|&(?!quot;|#39;|#x27;|amp;)|position\s*:\s*(?:fixed|sticky)|\\|expression|url|image-set|image\s*\(|cross-fade|element\s*\(|src\s*\(|@import|behavior|binding|javascript:/i;

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
      if ((name === "background" || name === "poster") && value) return true;
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
    "onload en una imagen": '<img src="https://x.test/a.png" onload=alert(1)>',
    "position:sticky": '<div style="position: sticky; top: 0">x</div>',
    "data:image con cola tras el base64": '<img src="data:image/png;base64,AAAA?x=1">',
    "data:image/svg con espacio delante": '<img src=" data:image/svg+xml;base64,PHN2Zz4=">',
    "estilo con attr()": '<p title="https://x.test/a.png" style="background:attr(title url)">x</p>',
    "background remoto en celda": '<table><tr><td background="https://x.test/a.png">x</td></tr></table>',
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
    "conserva la firma en data:image/png (el serializador quita solo la `/` final)",
    sanitizeContractHtml(signature) === signature.replace(" />", ">"),
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
  // DOMPurify construye un DOM: el coste es cuadrático con la profundidad y se desborda la pila.
  const deep: Record<string, string> = {
    "20 000 `<div>` anidados": "<div>".repeat(20000) + "x",
    "20 000 tablas anidadas": "<table><tr><td>".repeat(20000),
    "20 000 listas anidadas": "<ul><li>".repeat(20000),
    "entrada de 2 millones de caracteres": "<p>a</p>".repeat(250000),
  };
  for (const [label, html] of Object.entries(deep)) {
    const t0 = performance.now();
    const out = sanitizeContractHtml(html);
    const ms = performance.now() - t0;
    check(
      `entrada desmesurada se entrega como texto y sin esperar: ${label}`,
      ms < 1000 && !/<(?:div|table|ul|li|p)\b/.test(out),
      `${ms.toFixed(0)} ms`,
    );
  }
  let threw = false;
  try {
    sanitizeContractHtml("<table><tr><td>".repeat(499) + "x");
    sanitizeContractHtml("<ul><li>".repeat(740) + "x");
  } catch {
    threw = true;
  }
  check("la profundidad máxima permitida no lanza una excepción", !threw);
  check(
    "un contrato largo y plano (1 000 párrafos) se conserva entero",
    sanitizeContractHtml("<p>a</p>".repeat(1000)) === "<p>a</p>".repeat(1000),
  );
  check(
    "un valor con comilla sin cerrar no deja un manejador vivo",
    !looksExecutable(sanitizeContractHtml('<p>x</p><img alt="y src=x onerror=alert(1)>')),
    sanitizeContractHtml('<p>x</p><img alt="y src=x onerror=alert(1)>'),
  );

  // Forma exacta de la salida: quitar lo peligroso no rompe el HTML de alrededor ni sobre-escapa.
  const exact: Array<[string, string, string]> = [
    ["conserva el HTML de alrededor", '<p>a</p><img src="x" onerror="alert(1)"><p>b &amp; c</p>', '<p>a</p><img src="x"><p>b &amp; c</p>'],
    ["quita svg sin tocar lo demás", "<h2>T</h2><svg/onload=alert(1)><p>ok</p></svg>", "<h2>T</h2><p>ok</p>"],
    ["neutraliza el enlace y deja su texto", '<p><a href="javascript:alert(1)">ver</a></p>', "<p><a>ver</a></p>"],
    ["comilla sin cerrar: el navegador descarta la etiqueta", '<p>x</p><img alt="y src=x onerror=alert(1)>', "<p>x</p>"],
    ["etiqueta sin `>`: el navegador la descarta", "<p>x</p><img src=x", "<p>x</p>"],
    ["quita el bloque script con su contenido", "<p>a</p><script>alert(1)</script><p>b</p>", "<p>a</p><p>b</p>"],
    ["quita el bloque style con su contenido", "<p>a</p><style>p{color:red}</style><p>b</p>", "<p>a</p><p>b</p>"],
    ["quita comentarios", "<p>a</p><!-- nota --><p>b</p>", "<p>a</p><p>b</p>"],
    ["una comilla doble dentro de un valor con comilla simple no abre atributos", "<a title='x\" onclick=alert(1) y'>t</a>", '<a title="x&quot; onclick=alert(1) y">t</a>'],
    ["el primer atributo repetido gana, como en el navegador", '<a href="https://a.test/" href="https://b.test/">t</a>', '<a href="https://a.test/">t</a>'],
    ["un `<` que no abre etiqueta queda como texto", "<p>5 < 6, I <3 you</p>", "<p>5 &lt; 6, I &lt;3 you</p>"],
    ["`=` al empezar un atributo no abre un valor", '<img /="x><base href=https://evil.example/>" a="">', '<img>" a=""&gt;'],
    ["un `<!…>` raro se descarta hasta el primer `>`", '<!x <img alt="> <base href=https://evil.example/>">', '"&gt;'],
    ["texto crudo (`xmp`) no esconde etiquetas", '<xmp><img alt="</xmp><base href=x>">', '"&gt;'],
    ["comentario cerrado con `--!>`", "<!-- a --!><base href=x><p>b</p>", "<p>b</p>"],
    ["`İ` antes de un bloque no descuadra el texto", "İİİİİİİİİİİİ<script>x</script><p>ok</p><b>fin</b>", "İİİİİİİİİİİİ<p>ok</p><b>fin</b>"],
    ["espacio entre `=` y el valor entre comillas", '<a title= "x" href="https://a.test/">t</a>', '<a title="x" href="https://a.test/">t</a>'],
    ["mayúsculas: el bloque SCRIPT no se come lo que sigue", "<SCRIPT>a</SCRIPT><p>b</p>", "<p>b</p>"],
    ["mayúsculas en etiquetas normales", "<P>Hola</P>", "<p>Hola</p>"],
    ["atributo sin valor se conserva (como `reversed=\"\"`)", "<ol reversed><li>a</li></ol>", '<ol reversed=""><li>a</li></ol>'],
    ["estilo con comillas en font-family se conserva", '<p style="font-family: &quot;Inter&quot;, sans-serif">a</p>', '<p style="font-family: &quot;Inter&quot;, sans-serif">a</p>'],
    ["estilo normal de TipTap se conserva", '<p style="text-align: center; color: #333">a</p>', '<p style="text-align: center; color: #333">a</p>'],
    ["firma en data:image/jpeg", '<img src="data:image/jpeg;base64,/9j/4AAQ">', '<img src="data:image/jpeg;base64,/9j/4AAQ">'],
    ["imagen data:image/gif", '<img src="data:image/gif;base64,R0lGODlh">', '<img src="data:image/gif;base64,R0lGODlh">'],
    ["imagen data:image/webp", '<img src="data:image/webp;base64,UklGRg==">', '<img src="data:image/webp;base64,UklGRg==">'],
    ["una etiqueta desconocida conserva su texto", "<p>a <font color=red>b</font> c</p>", "<p>a b c</p>"],
    ["los data-* ajenos se quitan, los propios se conservan", '<p data-x="1" data-jh-section="fees" aria-label="x" id="y" name="z">a</p>', '<p data-jh-section="fees">a</p>'],
    ["target añade rel noopener", '<a href="https://a.test/" target="_blank">t</a>', '<a href="https://a.test/" target="_blank" rel="noopener noreferrer">t</a>'],
    ["rel ajeno se reemplaza si hay target", '<a href="https://a.test/" target="_blank" rel="opener">t</a>', '<a href="https://a.test/" target="_blank" rel="noopener noreferrer">t</a>'],
    ["mailto y tel se conservan", '<a href="mailto:a@b.test">m</a><a href="tel:+15550100">t</a>', '<a href="mailto:a@b.test">m</a><a href="tel:+15550100">t</a>'],
    ["enlace relativo y ancla se conservan", '<a href="/x">r</a><a href="#s">a</a>', '<a href="/x">r</a><a href="#s">a</a>'],
    ["protocolo desconocido fuera", '<a href="foo:bar">x</a>', "<a>x</a>"],
    ["`data:` en href fuera aunque sea imagen", '<a href="data:image/png;base64,iVBORw0KGgo=">x</a>', "<a>x</a>"],
    ["`data:` de imagen en un atributo que no es src fuera", '<img src="https://a.test/x.png" title="data:text/html,x" alt="data:image/png;base64,AAAA">', '<img src="https://a.test/x.png">'],
    ["data:image con cola tras el base64 se descarta", '<img src="data:image/png;base64,AAAA?x=1">', "<img>"],
    ["data:image/svg con espacio delante se descarta", '<img src=" data:image/svg+xml;base64,PHN2Zz4=">', "<img>"],
    ["estilo con element() se descarta", '<p style="background:element(#x)">a</p>', "<p>a</p>"],
    ["estilo con behavior se descarta", '<p style="behavior: foo">a</p>', "<p>a</p>"],
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

  // Contenido legítimo: cada etiqueta y atributo de la lista cerrada sale tal cual. Si alguien
  // quita `td`, `colspan`, `u`... de la lista, un contrato firmado perdería su formato.
  const legit =
    '<h1>t1</h1><h2>t2</h2><h3>t3</h3><h4>t4</h4><h5>t5</h5><h6>t6</h6>' +
    '<p class="x" title="tt" style="text-align: center">a <strong>b</strong> <b>b</b> <em>c</em> <i>i</i> <u>u</u> <s>s</s> <strike>k</strike> <sub>2</sub> <sup>3</sup> <small>sm</small> <mark>mk</mark><br>fin</p>' +
    '<hr><blockquote><p>q</p></blockquote><pre><code>c = 1</code></pre>' +
    '<div data-jh-section="fees" align="center"><span class="jh-template-var" data-template-var="clientName">n</span></div>' +
    '<div data-jh-agency-signature="1" style="margin-top:2.5rem"><p>Fecha</p></div>' +
    '<ul><li>a</li><li>b</li></ul><ol start="3" reversed="" type="a"><li>c</li></ol>' +
    '<a href="https://a.test/x?y=1" title="l" target="_blank" rel="noopener noreferrer">l</a>' +
    '<img src="https://a.test/i.png" alt="i" width="10" height="20" class="im" style="max-width:50%">' +
    '<table><colgroup><col colwidth="100" width="50%"></colgroup><caption>cap</caption><thead><tr><th colspan="2" align="left">h</th></tr></thead>' +
    '<tbody><tr><td rowspan="2" colwidth="100" style="width: 25%">x</td><td>y</td></tr><tr><td>z</td></tr></tbody><tfoot><tr><td colspan="2">f</td></tr></tfoot></table>';
  check("el contenido legítimo sale idéntico (todas las etiquetas y atributos permitidos)", sanitizeContractHtml(legit) === legit, sanitizeContractHtml(legit));

  // Presupuesto del parser (nodos y profundidad), medido con el mismo parser que usa jsdom.
  const table = "<table><tbody>" + "<tr><td><p>a</p></td><td><p>b</p></td></tr>".repeat(600) + "</tbody></table>";
  check("una tabla de 600 filas con párrafos en las celdas se conserva", sanitizeContractHtml(table) === table);
  check("3 000 párrafos planos se conservan", sanitizeContractHtml("<p>a</p>".repeat(3000)) === "<p>a</p>".repeat(3000));
  check("10 001 párrafos (más de 20 000 nodos) se entregan como texto", sanitizeContractHtml("<p>a</p>".repeat(10001)).startsWith("&lt;p&gt;"));
  check("298 niveles anidados se conservan", sanitizeContractHtml("<div>".repeat(298) + "x" + "</div>".repeat(298)).startsWith("<div><div>"));
  check("299 niveles anidados se entregan como texto", sanitizeContractHtml("<div>".repeat(299) + "x" + "</div>".repeat(299)).startsWith("&lt;div&gt;"));
  const distinctFormats = (n: number, k: number) =>
    "<div>" + Array.from({ length: n }, (_, i) => `<b x="${i}">`).join("") + "</div>" + "<div>t</div>".repeat(k);
  check("100 elementos de formato distintos sin cerrar + 100 `<div>` se filtran", !sanitizeContractHtml(distinctFormats(100, 100)).startsWith("&lt;"));
  for (const [label, html] of Object.entries({
    "reconstrucción de formato 800 + 800 (agotaba la memoria con 18 KB)": distinctFormats(800, 800),
    "reconstrucción de formato 200 + 200": distinctFormats(200, 200),
    "`<table><td>` ×1 499 (6 s con el tope antiguo)": "<table><td>".repeat(1499),
    "`<DIV>` en mayúsculas ×20 000": "<DIV>".repeat(20000),
    "`<!-->` y 7 900 `<div>` (comentario ya cerrado)": "<!-->" + "<div>".repeat(7900),
    "`<!--->` y 7 900 `<div>`": "<!--->" + "<div>".repeat(7900),
    "`<noscript>` sin cerrar y 7 900 `<div>`": "<noscript>" + "<div>".repeat(7900),
    "comentario cerrado con `--!>` y 7 900 `<div>`": "<!--x--!>" + "<div>".repeat(7900) + "-->",
    "`<div/>` ×7 900": "<div/>".repeat(7900),
    "cierre falso dentro de un atributo ×3 001": '<div title="</div>">'.repeat(3001),
    "`=` al empezar un atributo ×3 001": '<div =" >'.repeat(3001),
    "`<span/>` ×3 001": "<span/>".repeat(3001),
  })) {
    const t0 = performance.now();
    const out = sanitizeContractHtml(html);
    const ms = performance.now() - t0;
    check(`el presupuesto no se esquiva: ${label}`, ms < 1500 && out.startsWith("&lt;"), `${ms.toFixed(0)} ms`);
  }
  // El peor caso que cabe en el presupuesto cuesta un par de segundos con jsdom: se mide y se acota.
  const tWorst = performance.now();
  sanitizeContractHtml(distinctFormats(140, 140));
  check("el peor caso dentro del presupuesto (140 formatos + 140 bloques) termina en menos de 15 s", performance.now() - tWorst < 15000, `${(performance.now() - tWorst).toFixed(0)} ms`);
  // Fronteras exactas del presupuesto (20 000 nodos, 300 niveles): cada tipo de nodo cuenta.
  check("19 997 elementos (+ html, head y body = 20 000) caben", withinParseBudget("<span></span>".repeat(19997)));
  check("19 998 elementos no caben", !withinParseBudget("<span></span>".repeat(19998)));
  check("19 997 comentarios caben", withinParseBudget("<!--a-->".repeat(19997)));
  check("19 998 comentarios no caben", !withinParseBudget("<!--a-->".repeat(19998)));
  check("9 998 tablas con texto (dos nodos cada una) caben", withinParseBudget("<table>x</table>".repeat(9998)));
  check("9 999 tablas con texto no caben", !withinParseBudget("<table>x</table>".repeat(9999)));
  check("`<table>` + 298 `<div>` (el primero se inserta antes de la tabla) caben", withinParseBudget("<table>" + "<div>".repeat(298)));
  check("`<table>` + 299 `<div>` no caben", !withinParseBudget("<table>" + "<div>".repeat(299)));
  const voids = "<br>".repeat(500) + '<img src="https://a.test/x.png">'.repeat(500) + "<hr>".repeat(500);
  check("los elementos vacíos no cuentan como profundidad", sanitizeContractHtml(voids).startsWith("<br>"), sanitizeContractHtml(voids).slice(0, 30));
  const t60 = performance.now();
  presentContractHtml('<span data-template-var="clientName">'.repeat(60000));
  check("60 000 chips sin cerrar se procesan en menos de 500 ms", performance.now() - t60 < 500, `${(performance.now() - t60).toFixed(0)} ms`);
  const chipPos = presentContractHtml('<p>{{clientName}}</p><span data-template-var="otra">{{clientFullName}}</span>');
  check(
    "el icono va justo tras la apertura de cada chip",
    /<span class="jh-template-var" data-template-var="clientName"><svg [^>]*>[\s\S]*?<\/svg><span>Nombre del usuario<\/span><\/span><\/p>/.test(chipPos) &&
      (chipPos.match(/<svg /g) ?? []).length === 1 &&
      !/jhtplicon/.test(chipPos),
    chipPos,
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
      decodeTextEntities(portalHtml(contract.contentSnapshot)).includes(`${firstName} Prueba`),
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
