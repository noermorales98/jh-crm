"use client";

import { useState } from "react";
import {
  assessAssertion,
  type AssertionAnswer,
} from "@/src/lib/credit/assertions";

const ANSWER_LABEL: Record<AssertionAnswer, string> = {
  CORRECT: "Sí",
  INCORRECT: "No",
  UNKNOWN: "No sé",
};

const STATE_LABEL = {
  DRAFT: "Falta revisión",
  CLIENT_CONFIRMED: "Quedó en palabras del cliente",
  LETTER_READY: "Falta revisión",
  CLOSED_NO_ACTION: "El dato reportado se acepta",
} as const;

export function PortalProgressInterview({ reported }: { reported: string }) {
  const [answer, setAnswer] = useState<AssertionAnswer | null>(null);
  const [claim, setClaim] = useState("");
  const assessment = assessAssertion({
    creditItemId: "portal",
    field: "reported",
    bureau: "",
    reportedValue: reported,
    consumerClaim: claim.trim() === "" ? null : claim.trim(),
    answer,
    evidenceDocumentIds: [],
    documents: [],
    clientId: "portal",
    organizationId: "portal",
    expectedRevision: 1,
    currentRevision: 1,
    clientActorId: "client",
    reviewerId: null,
  });

  return (
    <fieldset className="space-y-2 border-0 p-0">
      <legend className="text-xs font-medium uppercase tracking-wide text-text-secondary">
        Lo reportado
      </legend>
      <p className="text-sm text-ink">{reported}</p>
      <p className="text-sm text-text-secondary">¿El dato reportado es correcto?</p>
      <div className="flex flex-wrap gap-3">
        {(Object.keys(ANSWER_LABEL) as AssertionAnswer[]).map((option) => (
          <label key={option} className="inline-flex items-center gap-1 text-sm text-ink">
            <input
              type="radio"
              name="portal-assertion"
              value={option}
              checked={answer === option}
              onChange={() => setAnswer(option)}
            />
            {ANSWER_LABEL[option]}
          </label>
        ))}
      </div>
      <label className="block text-sm text-text-secondary">
        Palabras del cliente
        <textarea
          value={claim}
          onChange={(event) => setClaim(event.target.value)}
          rows={2}
          className="mt-1 w-full rounded-control bg-surface-app px-3 py-2 text-sm text-ink"
        />
      </label>
      <p className="text-sm text-text-secondary">
        {STATE_LABEL[assessment.state]}. No crea una disputa.
      </p>
    </fieldset>
  );
}
