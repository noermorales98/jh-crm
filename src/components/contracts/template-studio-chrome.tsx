"use client";

import { X } from "lucide-react";

/**
 * Barra de documento al estilo Apple (Pages / Preview):
 * cerrar a la izquierda, título al centro, acciones a la derecha.
 */
export function TemplateStudioChrome({
  title,
  name,
  version,
  active,
  pending,
  error,
  nameId,
  versionId,
  onClose,
  onNameChange,
  onVersionChange,
  onActiveChange,
}: {
  title: string;
  name: string;
  version: string;
  active: boolean;
  pending: boolean;
  error: string | null;
  nameId: string;
  versionId: string;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onVersionChange: (value: string) => void;
  onActiveChange: (value: boolean) => void;
}) {
  return (
    <header className="jh-doc-titlebar">
      <div className="jh-doc-titlebar-side justify-start">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="jh-doc-icon-btn"
        >
          <X className="size-4" strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      <div className="jh-doc-titlebar-center">
        <input
          id={nameId}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Sin título"
          aria-label="Nombre de la plantilla"
          required
          className="jh-doc-title-input"
        />
        <label className="jh-doc-version">
          <span className="sr-only">Versión</span>
          <span aria-hidden>v</span>
          <input
            id={versionId}
            value={version}
            onChange={(e) => onVersionChange(e.target.value)}
            placeholder="1.0"
            aria-label="Versión"
            className="jh-doc-version-input"
          />
        </label>
        <span className="sr-only">{title}</span>
      </div>

      <div className="jh-doc-titlebar-side justify-end">
        <div className="jh-doc-switch">
          <span id={`${nameId}-active`}>Activa</span>
          <button
            type="button"
            role="switch"
            aria-checked={active}
            aria-labelledby={`${nameId}-active`}
            onClick={() => onActiveChange(!active)}
            className="jh-doc-switch-track"
          >
            <span className="jh-doc-switch-thumb" />
          </button>
        </div>
        <button type="submit" disabled={pending} className="jh-doc-save">
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="jh-doc-chrome-error">
          {error}
        </p>
      ) : null}
    </header>
  );
}
