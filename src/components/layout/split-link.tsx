"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

export function SplitLink({
  href,
  id,
  children,
  className,
}: {
  href: string;
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const params = useSearchParams();
  const next = new URLSearchParams(params.toString());
  next.set("id", id);
  return (
    <Link href={`${href}?${next.toString()}`} className={className} scroll={false}>
      {children}
    </Link>
  );
}
