import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { DomainError } from "@/src/server/errors";
import { prisma } from "@/src/lib/db";
import * as letterService from "@/src/server/letters";
import { LetterHtmlView } from "@/src/components/letters/letter-html-view";
import { LetterActions } from "@/src/components/letters/letter-actions";
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";

export const metadata: Metadata = {
  title: "Carta de disputa",
};

export default async function LetterViewPage({
  params,
}: {
  params: Promise<{ caseId: string; roundId: string; letterId: string }>;
}) {
  const { caseId, roundId, letterId } = await params;
  const ctx = await requireOrganization();
  if (!can(ctx.role, "letters.view")) notFound();

  let letter: Awaited<ReturnType<typeof letterService.getLetter>>;
  try {
    letter = await letterService.getLetter(ctx, letterId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  if (letter.roundId !== roundId || letter.round.caseId !== caseId) {
    notFound();
  }

  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: ctx.organizationId },
  });
  const contact = [
    settings?.addressLine1,
    settings?.phone,
    settings?.email,
  ]
    .filter(Boolean)
    .join(" · ");

  const folio = `LTR-${letter.round.roundNumber}-${letter.bureau.slice(0, 3)}`;
  const canManage = can(ctx.role, "letters.manage");

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="mx-auto flex max-w-3xl justify-end">
          <LetterActions
            letterId={letter.id}
            status={letter.status}
            caseId={caseId}
            roundId={roundId}
          />
        </div>
      ) : null}
      <LetterHtmlView
        organizationName={settings?.legalName ?? "J&H Multiservices LLC"}
        organizationContact={contact || null}
        recipient={letter.recipient}
        subject={letter.subjectSnapshot}
        body={letter.contentSnapshot}
        issuedAt={letter.finalizedAt ?? letter.generatedAt}
        timezone={settings?.timezone ?? "America/Chicago"}
        folio={`${folio} · ${CREDIT_BUREAU_LABELS[letter.bureau]}`}
        caseId={caseId}
        roundId={roundId}
        downloadHref={`/api/letters/${letter.id}/pdf`}
        backHref={`/crm/casos/${caseId}/rondas/${roundId}`}
      />
    </div>
  );
}
