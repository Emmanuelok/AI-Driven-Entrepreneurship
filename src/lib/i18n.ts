"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// Lightweight i18n. Single-string keys, hardcoded dictionaries.
// Goals: ship the scaffold so we can add languages incrementally without
// refactoring callsites later. The actual translations come in a
// follow-up — most strings still fall through to English.

export type Lang = "en" | "fr" | "sw" | "tw" | "pcm" | "ha" | "yo" | "zu" | "am";

export const LANGS: { code: Lang; label: string; native: string; flag: string }[] = [
  { code: "en", label: "English", native: "English", flag: "🇬🇧" },
  { code: "fr", label: "French", native: "Français", flag: "🇫🇷" },
  { code: "sw", label: "Swahili", native: "Kiswahili", flag: "🇰🇪" },
  { code: "tw", label: "Twi", native: "Twi", flag: "🇬🇭" },
  { code: "pcm", label: "Pidgin", native: "Naija Pidgin", flag: "🇳🇬" },
  { code: "ha", label: "Hausa", native: "Hausa", flag: "🇳🇬" },
  { code: "yo", label: "Yoruba", native: "Yorùbá", flag: "🇳🇬" },
  { code: "zu", label: "Zulu", native: "isiZulu", flag: "🇿🇦" },
  { code: "am", label: "Amharic", native: "አማርኛ", flag: "🇪🇹" },
];

// Dictionary. Add only keys we've wired into the UI; English is the
// fallback for anything missing. Translations are seeded for the
// highest-traffic chrome (nav, CTAs) and expanded over time.
type Dict = Record<string, string>;
const DICTS: Record<Lang, Dict> = {
  en: {},
  fr: {
    "nav.dashboard": "Tableau de bord",
    "nav.learn": "Cours",
    "nav.brainstorm": "Brainstorm",
    "nav.build": "Studio AI",
    "nav.venture": "Studio Venture",
    "nav.tutor": "Demande à Sage",
    "cta.save": "Enregistrer",
    "cta.cancel": "Annuler",
    "cta.create": "Créer",
    "cta.continue": "Continuer",
    "cta.delete": "Supprimer",
    "cta.share": "Partager",
    "cta.export": "Exporter",
    "search.placeholder": "Rechercher, naviguer, exécuter…",
  },
  sw: {
    "nav.dashboard": "Dashibodi",
    "nav.learn": "Masomo",
    "nav.brainstorm": "Brainstorm",
    "nav.build": "Studio ya AI",
    "nav.venture": "Studio ya Venture",
    "nav.tutor": "Muulize Sage",
    "cta.save": "Hifadhi",
    "cta.cancel": "Ghairi",
    "cta.create": "Unda",
    "cta.continue": "Endelea",
    "cta.delete": "Futa",
    "cta.share": "Shiriki",
    "cta.export": "Hamisha",
    "search.placeholder": "Tafuta, ruka, fanya kazi…",
  },
  tw: {
    "nav.dashboard": "Dashboard",
    "nav.learn": "Adesua",
    "nav.brainstorm": "Adwene",
    "nav.build": "AI Studio",
    "nav.venture": "Venture Studio",
    "nav.tutor": "Bisa Sage",
    "cta.save": "Sɔ ho",
    "cta.cancel": "Twa mu",
    "cta.create": "Yɛ",
    "cta.continue": "Kɔ so",
    "cta.delete": "Yi fi",
    "cta.share": "Kyɛ",
    "cta.export": "Yi adi",
  },
  pcm: {
    "nav.dashboard": "Dashboard",
    "nav.learn": "Learning",
    "nav.brainstorm": "Brainstorm",
    "nav.build": "AI Studio",
    "nav.venture": "Venture Studio",
    "nav.tutor": "Ask Sage",
    "cta.save": "Save am",
    "cta.cancel": "Cancel",
    "cta.create": "Make am",
    "cta.continue": "Continue",
    "cta.delete": "Delete am",
    "cta.share": "Share am",
    "cta.export": "Export am",
  },
  ha: {},
  yo: {},
  zu: {},
  am: {},
};

type State = {
  lang: Lang;
  setLang: (l: Lang) => void;
  hydrated: boolean;
  _hydrate: () => void;
};

const dummy = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

export const useLang = create<State>()(
  persist(
    (set) => ({
      lang: "en" as Lang,
      hydrated: false,
      setLang: (lang) => set({ lang }),
      _hydrate: () => set({ hydrated: true }),
    }),
    {
      name: "sankofa-lang-v1",
      storage: createJSONStorage(() => (typeof window === "undefined" ? dummy : localStorage)),
      onRehydrateStorage: () => (state) => state?._hydrate(),
    },
  ),
);

// Translate a key. Falls back to English (the fallback string passed in)
// when the key isn't in the active language's dictionary yet.
export function t(key: string, fallback: string): string {
  const lang = useLang.getState().lang;
  return DICTS[lang]?.[key] ?? fallback;
}

// Hook variant so React re-renders when the user switches language.
export function useT() {
  const lang = useLang((s) => s.lang);
  return (key: string, fallback: string) => DICTS[lang]?.[key] ?? fallback;
}
