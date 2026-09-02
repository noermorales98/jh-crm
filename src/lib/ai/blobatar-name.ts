/** Semilla estable: el mismo chat siempre dibuja el mismo blobatar. */
export function chatBlobatarName(chatId: string) {
  return `jh-chat:${chatId}`;
}
