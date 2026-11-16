/**
 * Presupuesto de trabajo del parser, antes de entregar el HTML a DOMPurify.
 *
 * DOMPurify construye un DOM completo. Con jsdom (servidor) el coste no lo acota el tamaño ni el
 * número de etiquetas: el anidamiento profundo es cuadrático (20 000 `<div>`: 78 s) y la
 * reconstrucción de elementos de formato del parser HTML multiplica los nodos (800 `<b x="i">`
 * sin cerrar seguidos de 800 `<div>`: ~640 000 nodos y la memoria se agota con 18 KB de entrada).
 * Medir el HTML con regex o con un lector propio se descartó: cada diferencia con el parser real
 * era una forma de esquivarlo.
 *
 * Aquí se pasa la entrada por el MISMO parser que usa jsdom (parse5, misma versión fijada) con un
 * adaptador de árbol que cuenta los nodos que se crean y la profundidad a la que se insertan, y
 * aborta al pasar el presupuesto. Lo que supera el presupuesto se entrega como texto inerte.
 * El trabajo de jsdom sobre una entrada que cabe en el presupuesto queda acotado por el mismo
 * presupuesto, porque construye el mismo árbol.
 */
import { defaultTreeAdapter, parse } from "parse5";

/** Nodos (elementos, comentarios y textos) que se permite crear. Un contrato real: cientos. */
export const MAX_NODES = 20_000;
/** Profundidad máxima de inserción (cuenta `html` y `body`). Un contrato real: ~10 niveles. */
export const MAX_DEPTH = 50;
/** Atributos por elemento. Uno real lleva menos de 10 (TipTap: `class`, `style`, `colspan`...). */
export const MAX_ATTRS_PER_ELEMENT = 100;
/** Atributos en todo el documento. */
export const MAX_TOTAL_ATTRS = 40_000;
/**
 * Hijos directos de un mismo elemento. DOMPurify mueve los hijos de un elemento que quita uno a uno
 * (cuadrático); `body` con 4 000 párrafos es normal, 5 000+ no.
 */
export const MAX_CHILDREN = 5_000;

/**
 * Palabras sueltas dentro de una misma etiqueta (fuera de comillas). parse5 revisa cada atributo
 * nuevo contra los anteriores de su etiqueta (cuadrático): 30 000 atributos tardaban 2,5 s en el
 * propio parser y 100 000 más de un minuto, antes de que el adaptador viera la etiqueta. Se mide
 * en el texto, antes de parsear. Solo sobrestima: ignora la regla de comillas del navegador y
 * trata cualquier comilla como apertura.
 */
export const MAX_TAG_TOKENS = 500;

const OVER_BUDGET = Symbol("over-budget");

/** Separadores de atributos en HTML: espacio y `/` (`<p/a/b/c>` son tres atributos). */
function isSeparator(c: string): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\f" || c === "\r" || c === "/";
}

/** `true` si alguna etiqueta tiene más de `MAX_TAG_TOKENS` palabras. Tiempo lineal. */
function tagTooBusy(html: string): boolean {
  const n = html.length;
  let i = html.indexOf("<");
  while (i !== -1 && i < n - 1) {
    const first = html.charCodeAt(i + 1) | 32;
    if (first < 97 || first > 122) {
      i = html.indexOf("<", i + 1);
      continue;
    }
    let j = i + 1;
    let tokens = 0;
    let inToken = false;
    while (j < n) {
      const c = html[j]!;
      if (c === ">") break;
      if (c === '"' || c === "'") {
        const close = html.indexOf(c, j + 1);
        if (close === -1) return false; // comilla sin cerrar: parse5 la descarta entera
        j = close + 1;
        // Tras unas comillas puede empezar otro atributo sin espacio (`a="1"b="2"`).
        tokens += 1;
        if (tokens > MAX_TAG_TOKENS) return true;
        inToken = false;
        continue;
      }
      if (isSeparator(c)) {
        inToken = false;
      } else if (!inToken) {
        inToken = true;
        tokens += 1;
        if (tokens > MAX_TAG_TOKENS) return true;
      }
      j += 1;
    }
    i = html.indexOf("<", j + 1);
  }
  return false;
}

type Adapter = typeof defaultTreeAdapter;

/** `true` si el HTML cabe en el presupuesto del parser; `false` si lo supera. */
export function withinParseBudget(html: string): boolean {
  if (tagTooBusy(html)) return false;
  let nodes = 0;
  const depth = new WeakMap<object, number>();
  const count = () => {
    nodes += 1;
    if (nodes > MAX_NODES) throw OVER_BUDGET;
  };
  const children = new WeakMap<object, number>();
  let attrs = 0;
  const countAttrs = (n: number) => {
    if (n > MAX_ATTRS_PER_ELEMENT) throw OVER_BUDGET;
    attrs += n;
    if (attrs > MAX_TOTAL_ATTRS) throw OVER_BUDGET;
  };
  // El contenido de `<template>` es otro fragmento: su profundidad es la de su `<template>`, que
  // se conoce al insertarlo (después de crearlo), por eso se resuelve al usarla.
  const templateOf = new WeakMap<object, object>();
  const depthOf = (node: object): number => depth.get(node) ?? (templateOf.has(node) ? depthOf(templateOf.get(node)!) : 0);
  const place = (parent: object, child: object) => {
    const d = depthOf(parent) + 1;
    if (d > MAX_DEPTH) throw OVER_BUDGET;
    depth.set(child, d);
    const c = (children.get(parent) ?? 0) + 1;
    if (c > MAX_CHILDREN) throw OVER_BUDGET;
    children.set(parent, c);
  };

  const adapter: Adapter = {
    ...defaultTreeAdapter,
    createElement(...args: Parameters<Adapter["createElement"]>) {
      count();
      countAttrs(args[2].length);
      return defaultTreeAdapter.createElement(...args);
    },
    // Sin esto, 9 000 `<template>` anidadas reiniciaban la cuenta y desbordaban la pila del parser.
    setTemplateContent(templateElement, contentElement) {
      templateOf.set(contentElement, templateElement);
      defaultTreeAdapter.setTemplateContent(templateElement, contentElement);
    },
    // parse5 suma al `html`/`body` los atributos de etiquetas repetidas: también cuentan.
    adoptAttributes(recipient, attrList) {
      countAttrs(attrList.length);
      defaultTreeAdapter.adoptAttributes(recipient, attrList);
    },
    createCommentNode(...args: Parameters<Adapter["createCommentNode"]>) {
      count();
      return defaultTreeAdapter.createCommentNode(...args);
    },
    appendChild(parent, child) {
      place(parent, child);
      defaultTreeAdapter.appendChild(parent, child);
    },
    insertBefore(parent, child, reference) {
      place(parent, child);
      defaultTreeAdapter.insertBefore(parent, child, reference);
    },
    // parse5 entrega el texto por trozos y el adaptador los une en un solo nodo (jsdom igual): solo
    // cuenta cuando el texto abre un nodo nuevo, es decir, si el último hijo no es ya un texto.
    insertText(parent, text) {
      const children = defaultTreeAdapter.getChildNodes(parent);
      const last = children[children.length - 1];
      if (!last || !defaultTreeAdapter.isTextNode(last)) count();
      defaultTreeAdapter.insertText(parent, text);
    },
    insertTextBefore(parent, text, reference) {
      count();
      defaultTreeAdapter.insertTextBefore(parent, text, reference);
    },
  };

  try {
    // Sin scripting, como el DOMParser de jsdom y de los navegadores: el contenido de `<noscript>`
    // se parsea como elementos (con scripting activo sería texto y escondería nodos).
    parse(html, { treeAdapter: adapter, scriptingEnabled: false });
    return true;
  } catch (error) {
    if (error === OVER_BUDGET) return false;
    throw error;
  }
}
