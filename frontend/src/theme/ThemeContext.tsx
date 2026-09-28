import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { updateMyTheme } from "../api/client";
import type { Person } from "../api/types";
import { useAuth } from "../auth/AuthContext";

export const DEFAULT_PRIMARY = "#2f5d50";
export const DEFAULT_SECONDARY = "#b08d57";

interface ThemeContextValue {
  primary: string;
  secondary: string;
  nameDisplay: "last_name" | "birth_last_name";
  setColors: (primary: string, secondary: string) => Promise<void>;
  setNameDisplay: (nameDisplay: "last_name" | "birth_last_name") => Promise<void>;
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
  const [nameDisplay, setNameDisplayState] = useState<"last_name" | "birth_last_name">("last_name");

  useEffect(() => {
    const p = user?.theme_primary_color || DEFAULT_PRIMARY;
    const s = user?.theme_secondary_color || DEFAULT_SECONDARY;
    setPrimary(p);
    setSecondary(s);
    setNameDisplayState(user?.name_display === "birth_last_name" ? "birth_last_name" : "last_name");
    applyColors(p, s);
  }, [user]);

  async function setColors(newPrimary: string, newSecondary: string) {
    setPrimary(newPrimary);
    setSecondary(newSecondary);
    applyColors(newPrimary, newSecondary);
    await updateMyTheme({ theme_primary_color: newPrimary, theme_secondary_color: newSecondary });
    await refreshUser();
  }

  async function setNameDisplay(newNameDisplay: "last_name" | "birth_last_name") {
    setNameDisplayState(newNameDisplay);
    await updateMyTheme({ name_display: newNameDisplay });
    await refreshUser();
  }

  const value = useMemo(
    () => ({ primary, secondary, nameDisplay, setColors, setNameDisplay }),
    [primary, secondary, nameDisplay]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function formatPersonName(
  person: Pick<Person, "first_name" | "last_name" | "birth_last_name">,
  nameDisplay: "last_name" | "birth_last_name"
): string {
  const lastName = nameDisplay === "birth_last_name" ? person.birth_last_name || person.last_name : person.last_name;
  return `${person.first_name} ${lastName}`.trim();
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme doit être utilisé dans un ThemeProvider");
  return ctx;
}
