"use client";

import Link from "next/link";
import type { ReactNode } from "react";

function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (trimmed.includes("{") || trimmed.includes("%7B") || trimmed.includes(":id")) {
    return null;
  }
  if (trimmed.startsWith("/crm/")) return trimmed;
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;
  return null;
}

const LINK_CLASS =
  "font-medium text-action-primary underline decoration-action-primary/30 underline-offset-2 hover:decoration-action-primary";

function CrmLink({ href, children }: { href: string; children: ReactNode }) {
  const safe = safeHref(href);
  if (!safe) return <>{children}</>;
  if (safe.startsWith("/crm/")) {
    return (
      <Link href={safe} className={LINK_CLASS}>
        {children}
      </Link>
    );
  }
  return (
    <a href={safe} target="_blank" rel="noreferrer" className={LINK_CLASS}>
      {children}
    </a>
  );
}

function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const parts: ReactNode[] = [];
  const re =
    /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*\*[^*]+?\*\*\*|\*\*[^*]+?\*\*|__[^_]+?__|~~[^~]+?~~|\*[^*\n]+?\*|_[^_\n]+?_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  const k = () => `${keyPrefix}-${key++}`;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const token = match[0];
    const id = k();
    const md = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (md) {
      parts.push(
        <CrmLink key={id} href={md[2]}>
          {md[1]}
        </CrmLink>,
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code key={id} className="rounded-md bg-surface-elevated px-1 py-0.5 font-mono text-[0.8em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("***") && token.endsWith("***")) {
      parts.push(
        <strong key={id} className="font-semibold italic">
          {renderInline(token.slice(3, -3), `${id}-n`)}
        </strong>,
      );
    } else if (
      (token.startsWith("**") && token.endsWith("**")) ||
      (token.startsWith("__") && token.endsWith("__"))
    ) {
      parts.push(
        <strong key={id} className="font-semibold">
          {renderInline(token.slice(2, -2), `${id}-b`)}
        </strong>,
      );
    } else if (token.startsWith("~~") && token.endsWith("~~")) {
      parts.push(<s key={id}>{renderInline(token.slice(2, -2), `${id}-s`)}</s>);
    } else if (
      (token.startsWith("*") && token.endsWith("*")) ||
      (token.startsWith("_") && token.endsWith("_"))
    ) {
      parts.push(<em key={id}>{renderInline(token.slice(1, -1), `${id}-e`)}</em>);
    } else {
      parts.push(token);
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function headingClass(level: number): string {
  if (level === 1) return "text-base font-semibold tracking-tight text-ink";
  if (level === 2) return "text-sm font-semibold text-ink";
  return "text-sm font-medium text-ink";
}

function parseHeading(line: string): { level: number; text: string } | null {
  const match = line.trim().match(/^(#{1,6})(?:\s+|(?=[^#\s]))(.+?)\s*#*\s*$/);
  if (!match) return null;
  return { level: match[1].length, text: match[2].trim() };
}

function splitTableCells(line: string): string[] {
  const trimmed = line.trim();
  const inner = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function isSeparatorRow(line: string): boolean {
  const cells = splitTableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s/g, "")));
}

function looksLikeTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  if (parseHeading(trimmed)) return false;
  return true;
}

function cellAlign(separator: string): "left" | "center" | "right" {
  const token = separator.replace(/\s/g, "");
  const left = token.startsWith(":");
  const right = token.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  return "left";
}

function alignClass(align: "left" | "center" | "right"): string {
  if (align === "center") return "text-center";
  if (align === "right") return "text-right";
  return "text-left";
}

function parseTable(
  lines: string[],
  start: number,
): { headers: string[]; aligns: ("left" | "center" | "right")[]; rows: string[][]; next: number } | null {
  if (start >= lines.length || !looksLikeTableRow(lines[start])) return null;

  const headers = splitTableCells(lines[start]);
  if (headers.length < 2) return null;

  const hasSeparator = start + 1 < lines.length && isSeparatorRow(lines[start + 1]);
  const aligns = hasSeparator
    ? splitTableCells(lines[start + 1]).map(cellAlign)
    : headers.map(() => "left" as const);
  while (aligns.length < headers.length) aligns.push("left");

  const rows: string[][] = [];
  let i = start + (hasSeparator ? 2 : 1);
  while (i < lines.length && looksLikeTableRow(lines[i]) && !isSeparatorRow(lines[i])) {
    const cells = splitTableCells(lines[i]);
    if (!hasSeparator && cells.length < 2) break;
    rows.push(headers.map((_, col) => cells[col] ?? ""));
    i += 1;
  }

  if (!hasSeparator && rows.length === 0) return null;
  return { headers, aligns, rows, next: i };
}

function renderHeading(level: number, text: string, key: string): ReactNode {
  const Tag = (`h${Math.min(level, 6)}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6");
  return (
    <Tag key={key} className={headingClass(level)}>
      {renderInline(text, key)}
    </Tag>
  );
}

function renderTable(
  table: NonNullable<ReturnType<typeof parseTable>>,
  key: string,
): ReactNode {
  return (
    <div key={key} className="overflow-x-auto rounded-control border border-border-subtle bg-surface-elevated">
      <table className="min-w-full divide-y divide-border-subtle text-sm">
        <thead className="bg-surface-app">
          <tr>
            {table.headers.map((header, col) => (
              <th
                key={`${key}-h-${col}`}
                scope="col"
                className={`whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-secondary ${alignClass(table.aligns[col] ?? "left")}`}
              >
                {renderInline(header, `${key}-h-${col}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {table.rows.length === 0 ? (
            <tr>
              <td
                colSpan={table.headers.length}
                className="px-3 py-2 text-text-secondary"
              >
                Sin filas
              </td>
            </tr>
          ) : (
            table.rows.map((row, ri) => (
              <tr key={`${key}-r-${ri}`}>
                {row.map((cell, ci) => (
                  <td
                    key={`${key}-r-${ri}-${ci}`}
                    className={`px-3 py-2 align-top text-text-secondary-strong ${alignClass(table.aligns[ci] ?? "left")}`}
                  >
                    {cell ? renderInline(cell, `${key}-r-${ri}-${ci}`) : "\u00a0"}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function renderBlock(block: string, index: number): ReactNode {
  const trimmed = block.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("```")) {
    const inner = trimmed.replace(/^```[a-zA-Z0-9_-]*\n?/, "").replace(/```$/, "").trimEnd();
    const innerLines = inner.replace(/^\n/, "").split("\n");
    const table = parseTable(innerLines, 0);
    if (table && innerLines.slice(table.next).every((line) => !line.trim())) {
      return renderTable(table, `fence-tbl-${index}`);
    }
    return (
      <pre
        key={index}
        className="overflow-x-auto rounded-control bg-surface-elevated px-3 py-2 font-mono text-xs leading-5 text-ink"
      >
        {inner.trimEnd()}
      </pre>
    );
  }

  const lines = trimmed.split("\n");
  return (
    <div key={index} className="space-y-2">
      {groupLines(lines, index)}
    </div>
  );
}

function groupLines(lines: string[], blockIndex: number): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const heading = parseHeading(line);
    if (heading) {
      out.push(renderHeading(heading.level, heading.text, `h-${blockIndex}-${i}`));
      i += 1;
      continue;
    }

    if (/^\s*[-*_]{3,}\s*$/.test(line)) {
      out.push(<hr key={`hr-${blockIndex}-${i}`} className="border-border-subtle" />);
      i += 1;
      continue;
    }

    const table = parseTable(lines, i);
    if (table) {
      out.push(renderTable(table, `tbl-${blockIndex}-${i}`));
      i = table.next;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      out.push(
        <blockquote
          key={`q-${blockIndex}-${i}`}
          className="border-l-2 border-action-primary/40 pl-3 text-text-secondary-strong"
        >
          {renderInline(quote.join("\n"), `q${blockIndex}-${i}`)}
        </blockquote>,
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i]);
        i += 1;
      }
      out.push(
        <ul key={`ul-${blockIndex}-${i}`} className="list-disc space-y-1 pl-4 text-sm leading-5">
          {items.map((item, li) => (
            <li key={li}>
              {renderInline(item.replace(/^\s*[-*]\s+/, ""), `ul${blockIndex}-${li}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i]);
        i += 1;
      }
      out.push(
        <ol key={`ol-${blockIndex}-${i}`} className="list-decimal space-y-1 pl-4 text-sm leading-5">
          {items.map((item, li) => (
            <li key={li}>
              {renderInline(item.replace(/^\s*\d+\.\s+/, ""), `ol${blockIndex}-${li}`)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      !parseHeading(lines[i]) &&
      !/^\s*[-*_]{3,}\s*$/.test(lines[i]) &&
      !parseTable(lines, i) &&
      !/^\s*>/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    if (para.length === 0) {
      i += 1;
      continue;
    }
    out.push(
      <p key={`p-${blockIndex}-${i}`} className="text-sm leading-5">
        {para.flatMap((item, pi) => {
          const nodes: ReactNode[] = renderInline(item, `p${blockIndex}-${i}-${pi}`);
          if (pi < para.length - 1) nodes.push(<br key={`br-${blockIndex}-${i}-${pi}`} />);
          return nodes;
        })}
      </p>,
    );
  }
  return out;
}

function splitBlocks(text: string): string[] {
  const blocks: string[] = [];
  const fence = /```[\s\S]*?```/g;
  let last = 0;
  let match: RegExpExecArray | null;
  const fences: { start: number; end: number; body: string }[] = [];
  while ((match = fence.exec(text)) !== null) {
    fences.push({ start: match.index, end: match.index + match[0].length, body: match[0] });
  }
  const pushProse = (chunk: string) => {
    const parts = chunk.split(/\n{2,}/);
    for (const part of parts) {
      if (part.trim()) blocks.push(part);
    }
  };
  for (const item of fences) {
    if (item.start > last) pushProse(text.slice(last, item.start));
    blocks.push(item.body);
    last = item.end;
  }
  if (last < text.length) pushProse(text.slice(last));
  return blocks;
}

export function MarkdownText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const blocks = splitBlocks(text);
  return (
    <div className={`space-y-2 text-sm leading-5 text-ink ${className}`}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}

export function hintLinksForText(text: string): { href: string; label: string }[] {
  const lower = text.toLowerCase();
  const out: { href: string; label: string }[] = [];
  const add = (href: string, label: string) => {
    if (out.some((item) => item.href === href)) return;
    out.push({ href, label });
  };
  if (lower.includes("cliente")) {
    add("/crm/clientes/nuevo", "Nuevo cliente");
    add("/crm/clientes", "Clientes");
  }
  if (lower.includes("expediente") || lower.includes("documento")) {
    add("/crm/clientes", "Clientes / expediente");
  }
  if (lower.includes("caso")) add("/crm/casos", "Casos");
  if (lower.includes("cotiz")) add("/crm/cotizaciones/nueva", "Nueva cotización");
  if (lower.includes("pago")) add("/crm/pagos/nuevo", "Registrar pago");
  if (lower.includes("recibo")) add("/crm/recibos", "Recibos");
  if (lower.includes("tarea")) add("/crm/tareas", "Tareas");
  if (lower.includes("ronda")) add("/crm/rondas", "Rondas");
  if (lower.includes("usuario") || lower.includes("invitar")) add("/crm/usuarios", "Usuarios");
  if (lower.includes("etapa") || lower.includes("pipeline")) {
    add("/crm/configuracion/etapas", "Etapas");
  }
  if (lower.includes("configur") || lower.includes("empresa")) {
    add("/crm/configuracion", "Configuración");
  }
  if (lower.includes("dashboard") || lower.includes("tablero")) {
    add("/crm/dashboard", "Dashboard");
  }
  if (lower.includes("chat")) add("/crm/chats", "Chats");
  return out.slice(0, 4);
}

export function AssistantMessage({ text }: { text: string }) {
  const hasExplicitCrmLink = /\]\(\/crm\/[^)]+\)|\/crm\/[A-Za-z]/.test(text);
  const hints = hasExplicitCrmLink ? [] : hintLinksForText(text);
  return (
    <div>
      <MarkdownText text={text} />
      {hints.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {hints.map((hint) => (
            <Link
              key={hint.href}
              href={hint.href}
              className="rounded-control bg-surface-elevated px-2 py-1 text-xs font-medium text-action-primary hover:bg-nav-active"
            >
              {hint.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
