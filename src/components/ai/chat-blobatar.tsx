"use client";

import { Blobatar } from "@blobatar/react";
import "blobatar/motion.css";

export function ChatBlobatar({
  name,
  size = 36,
  className,
  title,
}: {
  name: string;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <Blobatar
      name={name}
      size={size}
      animate="hover"
      title={title}
      className={className}
    />
  );
}
