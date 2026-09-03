"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Languages } from "lucide-react";
import { Button } from "@/src/components/ui";
import { translateMail } from "@/src/actions/mails";
import { playActionResult } from "@/src/lib/cuelume";

type Translation = { subject: string; body: string };

type MailViewState = {
  pending: boolean;
  error: string | null;
  translated: Translation | null;
  showEs: boolean;
  runTranslate: () => void;
  toggleView: () => void;
};

const MailViewContext = createContext<MailViewState | null>(null);

export function MailViewProvider({
  mailId,
  translationSubject,
  translationBody,
  children,
}: {
  mailId: string;
  translationSubject: string | null;
  translationBody: string | null;
  children: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [translated, setTranslated] = useState<Translation | null>(
    translationBody
      ? { subject: translationSubject || "", body: translationBody }
      : null,
  );
  const [showEs, setShowEs] = useState(Boolean(translationBody));

  const value = useMemo<MailViewState>(
    () => ({
      pending,
      error,
      translated,
      showEs,
      runTranslate: () => {
        setError(null);
        startTransition(async () => {
          const result = await translateMail(mailId);
          playActionResult(result.ok);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setTranslated(result.data);
          setShowEs(true);
        });
      },
      toggleView: () => setShowEs((current) => !current),
    }),
    [error, mailId, pending, showEs, translated],
  );

  return (
    <MailViewContext.Provider value={value}>{children}</MailViewContext.Provider>
  );
}

export function MailTranslateButton() {
  const view = useContext(MailViewContext);
  if (!view) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {view.translated ? (
        <Button variant="secondary" size="sm" onClick={view.toggleView}>
          <Languages className="size-4" aria-hidden />
          {view.showEs ? "Ver original" : "Ver traducción"}
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          disabled={view.pending}
          onClick={view.runTranslate}
        >
          <Languages className="size-4" aria-hidden />
          {view.pending ? "Traduciendo…" : "Traducir"}
        </Button>
      )}
      {view.error ? (
        <span className="text-xs text-danger-ink" role="alert">
          {view.error}
        </span>
      ) : null}
    </span>
  );
}

export function MailBody({
  srcDoc,
  text,
}: {
  srcDoc: string | null;
  text: string;
}) {
  const view = useContext(MailViewContext);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1);

  const showTranslation = Boolean(view?.showEs && view.translated);

  useLayoutEffect(() => {
    if (showTranslation || !srcDoc) return;
    const frame = frameRef.current;
    if (!frame) return;
    const iframe = frame;

    let observer: ResizeObserver | null = null;
    const images: HTMLImageElement[] = [];

    function resize() {
      const doc = iframe.contentDocument;
      if (!doc?.documentElement) return;
      const html = doc.documentElement;
      const body = doc.body;
      if (body) {
        body.style.height = "auto";
        body.style.overflow = "visible";
      }
      html.style.height = "auto";
      html.style.overflow = "visible";
      const next = Math.ceil(
        Math.max(
          html.scrollHeight,
          body?.scrollHeight ?? 0,
          html.offsetHeight,
          body?.offsetHeight ?? 0,
        ),
      );
      setHeight(Math.max(1, next));
    }

    function detach() {
      observer?.disconnect();
      observer = null;
      for (const img of images) img.removeEventListener("load", resize);
      images.length = 0;
    }

    function attach() {
      detach();
      const doc = iframe.contentDocument;
      if (!doc?.body) return;
      resize();
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(resize);
        observer.observe(doc.body);
        observer.observe(doc.documentElement);
      }
      for (const img of Array.from(doc.images)) {
        images.push(img);
        img.addEventListener("load", resize);
      }
    }

    iframe.addEventListener("load", attach);
    attach();
    return () => {
      iframe.removeEventListener("load", attach);
      detach();
    };
  }, [showTranslation, srcDoc]);

  if (showTranslation && view?.translated) {
    return (
      <div className="space-y-3">
        {view.translated.subject ? (
          <p className="text-sm font-semibold text-ink">
            <span className="font-medium text-text-secondary">Asunto: </span>
            {view.translated.subject}
          </p>
        ) : null}
        <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-ink">
          {view.translated.body}
        </pre>
      </div>
    );
  }

  if (!srcDoc) {
    return (
      <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-ink">
        {text}
      </pre>
    );
  }

  return (
    <iframe
      ref={frameRef}
      title="Contenido del correo"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      scrolling="no"
      style={{ height, overflow: "hidden" }}
      className="block w-full border-0 bg-white"
    />
  );
}
