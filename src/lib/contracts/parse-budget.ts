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
export const MAX_DEPTH = 300;

const OVER_BUDGET = Symbol("over-budget");

type Adapter = typeof defaultTreeAdapter;

/** `true` si el HTML cabe en el presupuesto del parser; `false` si lo supera. */
export function withinParseBudget(html: string): boolean {
  let nodes = 0;
  const depth = new WeakMap<object, number>();
  const count = () => {
    nodes += 1;
    if (nodes > MAX_NODES) throw OVER_BUDGET;
  };
  const place = (parent: object, child: object) => {
    const d = (depth.get(parent) ?? 0) + 1;
    if (d > MAX_DEPTH) throw OVER_BUDGET;
    depth.set(child, d);
  };

  const adapter: Adapter = {
    ...defaultTreeAdapter,
    createElement(...args: Parameters<Adapter["createElement"]>) {
      count();
      return defaultTreeAdapter.createElement(...args);
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
