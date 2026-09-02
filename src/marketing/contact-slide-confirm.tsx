"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const KNOB = 64;
const DONE_AT = 0.86;

type Props = {
  open: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ContactSlideConfirm({ open, busy, onConfirm, onCancel }: Props) {
  const titleId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const confirmed = useRef(false);
  const [host, setHost] = useState<Element | null>(null);
  const [offset, setOffset] = useState(0);
  const [max, setMax] = useState(180);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setHost(document.querySelector(".jh-landing"));
  }, []);

  useEffect(() => {
    if (!open || !host) return;
    confirmed.current = false;
    setOffset(0);
    const frame = window.requestAnimationFrame(() => {
      const track = trackRef.current;
      if (!track) return;
      const measure = () => {
        setMax(Math.max(80, track.clientWidth - KNOB - 12));
      };
      measure();
      observerRef.current?.disconnect();
      const observer = new ResizeObserver(measure);
      observer.observe(track);
      observerRef.current = observer;
    });
    return () => {
      window.cancelAnimationFrame(frame);
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [open, host]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, busy, onCancel]);

  function finish() {
    if (confirmed.current || busy) return;
    confirmed.current = true;
    setOffset(max);
    onConfirm();
  }

  function moveTo(clientX: number) {
    const track = trackRef.current;
    if (!track || busy || confirmed.current) return;
    const rect = track.getBoundingClientRect();
    const next = Math.min(max, Math.max(0, clientX - rect.left - 6 - KNOB / 2));
    setOffset(next);
    if (next >= max * DONE_AT) finish();
  }

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (busy || confirmed.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    moveTo(event.clientX);
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!dragging) return;
    moveTo(event.clientX);
  }

  function onPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (!dragging) return;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!confirmed.current) setOffset(0);
  }

  if (!open || !host) return null;

  const progress = max > 0 ? offset / max : 0;

  return createPortal(
    <div className="jh-confirm" role="presentation" onClick={() => !busy && onCancel()}>
      <div
        className="jh-confirm-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id={titleId}>Un desliz para enviar</h3>
        <p>
          Arrastre el círculo azul hacia la derecha. Es un solo movimiento,
          sin prisas.
        </p>

        <div
          ref={trackRef}
          className={`jh-slide${progress >= DONE_AT || busy ? " is-done" : ""}${dragging ? " is-dragging" : ""}`}
        >
          <i className="jh-slide-fill" style={{ width: `${Math.max(KNOB, offset + KNOB)}px` }} />
          <span className="jh-slide-label">
            {busy ? "Enviando…" : "Deslice para enviar"}
          </span>
          <button
            type="button"
            className="jh-slide-knob"
            aria-label="Deslizar para enviar la consulta"
            disabled={busy}
            style={{ transform: `translateX(${offset}px)` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "Enter") {
                event.preventDefault();
                finish();
              }
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 12h14M13 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <button
          type="button"
          className="jh-confirm-alt"
          disabled={busy}
          onClick={finish}
        >
          No puedo deslizar: pulsar para enviar
        </button>
        <button
          type="button"
          className="jh-confirm-cancel"
          disabled={busy}
          onClick={onCancel}
        >
          Cancelar
        </button>
      </div>
    </div>,
    host,
  );
}
