"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { bind, setEnabled } from "cuelume";

const STORAGE_KEY = "cuelume-muted";

const CuelumeMuteContext = createContext<{
  muted: boolean;
  setMuted: (muted: boolean) => void;
}>({ muted: false, setMuted: () => {} });

export function CuelumeProvider({ children }: { children: ReactNode }) {
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    bind();
    const isMuted = window.localStorage.getItem(STORAGE_KEY) === "1";
    setMutedState(isMuted);
    setEnabled(!isMuted);
  }, []);

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    setEnabled(!next);
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  }, []);

  return (
    <CuelumeMuteContext.Provider value={{ muted, setMuted }}>
      {children}
    </CuelumeMuteContext.Provider>
  );
}

export function useCuelumeMute() {
  return useContext(CuelumeMuteContext);
}
