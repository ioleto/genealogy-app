import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { updateMyTheme } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export const DEFAULT_PRIMARY = "#2f5d50";
export const DEFAULT_SECONDARY = "#b08d57";

interface ThemeContextValue {
  primary: string;
  secondary: string;
  setColors: (primary: string, secondary: string) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyColors(primary: string, secondary: string) {
  const root = document.documentElement;
  root.style.setProperty("--color-primary", primary);
  root.style.setProperty("--color-primary-soft", hexToRgba(primary, 0.12));
  root.style.setProperty("--color-secondary", secondary);
  root.style.setProperty("--color-secondary-soft", hexToRgba(secondary, 0.14));
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, refreshUser } = useAuth();
  const [primary, setPrimary] = useState(DEFAULT_PRIMARY);
  const [secondary, setSecondary] = useState(DEFAULT_SECONDARY);

  useEffect(() => {
    const p = user?.theme_primary_color || DEFAULT_PRIMARY;
    const s = user?.theme_secondary_color || DEFAULT_SECONDARY;
    setPrimary(p);
    setSecondary(s);
    applyColors(p, s);
  }, [user]);

  async function setColors(newPrimary: string, newSecondary: string) {
    setPrimary(newPrimary);
    setSecondary(newSecondary);
    applyColors(newPrimary, newSecondary);
    await updateMyTheme({ theme_primary_color: newPrimary, theme_secondary_color: newSecondary });
    await refreshUser();
  }

  const value = useMemo(() => ({ primary, secondary, setColors }), [primary, secondary]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme doit être utilisé dans un ThemeProvider");
  return ctx;
}
