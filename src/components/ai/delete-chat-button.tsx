"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/src/components/ui";
import { deleteAiChat } from "@/src/actions/ai-chats";

export function DeleteChatButton({ chatId }: { chatId: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      title="Eliminar chat"
      message="Se borra esta conversación. No se puede deshacer."
      confirmLabel="Eliminar"
      danger
      onConfirm={async () => {
        const result = await deleteAiChat(chatId);
        if (!result.ok) return result.error;
        router.refresh();
      }}
      trigger={
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-full text-text-secondary hover:bg-nav-hover hover:text-ink"
          aria-label="Eliminar chat"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      }
    />
  );
}
