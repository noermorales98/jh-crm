"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Undo2,
  UserRound,
} from "lucide-react";
import { useEffect } from "react";
import { TemplateVariable } from "@/src/components/contracts/template-variable-node";
import {
  presentContractHtml,
  wrapTemplateVariablesInHtml,
} from "@/src/lib/contracts/template-variables";

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className="jh-doc-toolbtn"
    >
      {children}
    </button>
  );
}

function insertClientName(editor: Editor) {
  editor
    .chain()
    .focus()
    .insertContent({
      type: "templateVariable",
      attrs: { key: "clientName" },
    })
    .run();
}

function EditorToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="jh-doc-formatbar" role="toolbar" aria-label="Formato del documento">
      <div className="jh-doc-toolgroup">
        <ToolbarButton
          label="Deshacer"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="size-3.5" strokeWidth={1.75} aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Rehacer"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="size-3.5" strokeWidth={1.75} aria-hidden />
        </ToolbarButton>
      </div>
      <div className="jh-doc-toolgroup">
        <ToolbarButton
          label="Título"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="size-3.5" strokeWidth={1.75} aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Subtítulo"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="size-3.5" strokeWidth={1.75} aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Negrita"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-3.5" strokeWidth={2} aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Cursiva"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-3.5" strokeWidth={2} aria-hidden />
        </ToolbarButton>
      </div>
      <div className="jh-doc-toolgroup">
        <ToolbarButton
          label="Lista"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-3.5" strokeWidth={1.75} aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Lista numerada"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-3.5" strokeWidth={1.75} aria-hidden />
        </ToolbarButton>
      </div>
      <div className="jh-doc-toolgroup">
        <ToolbarButton
          label="Alinear izquierda"
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft className="size-3.5" strokeWidth={1.75} aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Centrar"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter className="size-3.5" strokeWidth={1.75} aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Alinear derecha"
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight className="size-3.5" strokeWidth={1.75} aria-hidden />
        </ToolbarButton>
      </div>
      <button
        type="button"
        className="jh-doc-varbtn"
        onClick={() => insertClientName(editor)}
      >
        <UserRound className="size-3.5" strokeWidth={2} aria-hidden />
        Nombre del usuario
      </button>
    </div>
  );
}

function editorExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
    }),
    Placeholder.configure({
      placeholder: "Escribe el contrato como en un documento…",
    }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    TemplateVariable,
  ];
}

/**
 * Editor visual tipo documento (Word/Docs).
 * Guarda HTML internamente; las variables se muestran como chips.
 */
export function DocumentEditor({
  value,
  onChange,
  editable = true,
  variant = "embedded",
}: {
  value: string;
  onChange?: (html: string) => void;
  editable?: boolean;
  variant?: "embedded" | "studio";
}) {
  const studio = variant === "studio";
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: editorExtensions(),
    content: wrapTemplateVariablesInHtml(value || "<p></p>"),
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class: studio
          ? "jh-doc-editor prose-contract min-h-full max-w-none text-[15px] leading-[1.75] text-[#1a1a1a] outline-none"
          : "jh-doc-editor prose-contract min-h-[22rem] max-w-none text-[15px] leading-[1.75] text-[#1a1a1a] outline-none",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  if (!editor) {
    return (
      <div
        className={
          studio
            ? "min-h-0 flex-1 bg-[#eceef2]"
            : "min-h-[28rem] rounded-[12px] border border-border-subtle bg-surface-panel"
        }
      />
    );
  }

  if (studio) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-[#eceef2]">
        {editable ? (
          <div className="jh-doc-chrome shrink-0">
            <EditorToolbar editor={editor} />
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-6 sm:px-8 sm:py-8">
          <div className="jh-doc-page mx-auto">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[12px] border border-black/8 bg-[#eceef2]">
      {editable ? <EditorToolbar editor={editor} /> : null}
      <div className="max-h-[min(28rem,55dvh)] overflow-y-auto px-3 py-4 sm:px-6">
        <div className="jh-doc-page mx-auto min-h-[22rem]">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

/** Vista de solo lectura del contrato (portal / preview). */
export function DocumentView({ html }: { html: string }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-black/8 bg-[#eceef2]">
      <div className="max-h-[min(36rem,60dvh)] overflow-y-auto px-3 py-4 sm:px-6">
        <div
          className="jh-doc-page prose-contract mx-auto text-[15px] leading-[1.75] text-[#1a1a1a]"
          dangerouslySetInnerHTML={{ __html: presentContractHtml(html) }}
        />
      </div>
    </div>
  );
}
