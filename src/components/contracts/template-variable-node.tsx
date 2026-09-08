"use client";

import {
  mergeAttributes,
  Node,
  nodeInputRule,
  nodePasteRule,
} from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { UserRound } from "lucide-react";
import {
  getTemplateVariable,
  isTemplateVariableKey,
  type TemplateVariableKey,
} from "@/src/lib/contracts/template-variables";

function TemplateVariableView({ node }: ReactNodeViewProps) {
  const key = String(node.attrs.key ?? "clientName");
  const meta = getTemplateVariable(key);
  const label = meta?.label ?? "Variable";

  return (
    <NodeViewWrapper
      as="span"
      className="jh-template-var"
      data-template-var={key}
      contentEditable={false}
      style={{ whiteSpace: "nowrap" }}
    >
      <UserRound className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
      <span>{label}</span>
    </NodeViewWrapper>
  );
}

export const TemplateVariable = Node.create({
  name: "templateVariable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      key: {
        default: "clientName" satisfies TemplateVariableKey,
        parseHTML: (element) => element.getAttribute("data-template-var"),
        renderHTML: (attributes) => ({
          "data-template-var": attributes.key,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-template-var]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const key = isTemplateVariableKey(String(node.attrs.key))
      ? String(node.attrs.key)
      : "clientName";
    const token = getTemplateVariable(key)?.token ?? `{{${key}}}`;
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "jh-template-var" }),
      token,
    ];
  },

  renderText({ node }) {
    const key = String(node.attrs.key ?? "clientName");
    return getTemplateVariable(key)?.token ?? `{{${key}}}`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(TemplateVariableView, { as: "span" });
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: /\{\{(?:clientName|clientFullName)\}\}$/,
        type: this.type,
        getAttributes: (match) => ({ key: match[0].slice(2, -2) }),
      }),
    ];
  },

  addPasteRules() {
    return [
      nodePasteRule({
        find: /\{\{(clientName|clientFullName)\}\}/g,
        type: this.type,
        getAttributes: (match) => ({ key: match[1] }),
      }),
    ];
  },
});
