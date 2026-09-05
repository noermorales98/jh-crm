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
import { Button } from "@/src/components/ui/button";

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
      className={`inline-flex size-8 items-center justify-center rounded-[8px] transition-colors disabled:opacity-40 ${
        active
          ? "bg-nav-active text-action-primary"
          : "text-text-secondary hover:bg-nav-hover hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function EditorToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border-subtle/80 bg-surface-panel px-2 py-1.5">
      <ToolbarButton
        label="Deshacer"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className="size-3.5" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Rehacer"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 className="size-3.5" aria-hidden />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border-subtle" aria-hidden />
      <ToolbarButton
        label="Título"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="size-3.5" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Subtítulo"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="size-3.5" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Negrita"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-3.5" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Cursiva"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-3.5" aria-hidden />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border-subtle" aria-hidden />
      <ToolbarButton
        label="Lista"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-3.5" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Lista numerada"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-3.5" aria-hidden />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border-subtle" aria-hidden />
      <ToolbarButton
        label="Alinear izquierda"
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        <AlignLeft className="size-3.5" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Centrar"
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        <AlignCenter className="size-3.5" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Alinear derecha"
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        <AlignRight className="size-3.5" aria-hidden />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border-subtle" aria-hidden />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="ml-0.5 h-8 gap-1.5 px-2 text-xs"
        onClick={() =>
          editor.chain().focus().insertContent("{{clientName}}").run()
        }
      >
        <UserRound className="size-3.5" aria-hidden />
        Nombre del cliente
      </Button>
    </div>
  );
}

/**
 * Editor visual tipo documento (Word/Docs).
 * Guarda HTML internamente; el usuario solo ve texto formateado.
 */
export function DocumentEditor({
  value,
  onChange,
  editable = true,
}: {
  value: string;
  onChange?: (html: string) => void;
  editable?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Placeholder.configure({
        placeholder: "Escribe el contrato como en un documento…",
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ],
    content: value || "<p></p>",
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "jh-doc-editor prose-contract min-h-[22rem] max-w-none px-8 py-8 text-[15px] leading-[1.65] text-ink outline-none sm:px-12 sm:py-10",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  if (!editor) {
    return (
      <div className="min-h-[28rem] rounded-[12px] border border-border-subtle bg-surface-panel" />
    );
  }

  return (
    <div className="overflow-hidden rounded-[12px] border border-border-subtle bg-[#f3f1ec]">
      {editable ? <EditorToolbar editor={editor} /> : null}
      <div className="max-h-[min(28rem,55dvh)] overflow-y-auto px-3 py-4 sm:px-6">
        <div className="jh-overlay-shadow mx-auto min-h-[22rem] max-w-[40rem] bg-white">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

/** Vista de solo lectura del contrato (portal / preview). */
export function DocumentView({ html }: { html: string }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-border-subtle bg-[#f3f1ec]">
      <div className="max-h-[min(28rem,50dvh)] overflow-y-auto px-3 py-4 sm:px-6">
        <div
          className="jh-overlay-shadow prose-contract mx-auto min-h-[12rem] max-w-[40rem] bg-white px-8 py-8 text-[15px] leading-[1.65] text-ink sm:px-12 sm:py-10"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
