import { useMemo } from "react";
import { useStore } from "../store/store";
import type { UILanguage } from "../types";
import { en, nl, type StringKey } from "./strings";

export type { StringKey } from "./strings";

/**
 * Flat key -> string per language. Deliberately not a framework:
 * adding German means adding one object typed like `nl`.
 */
const strings: Record<UILanguage, Record<StringKey, string>> = { en, nl };

export type Params = Record<string, string | number>;
export type Translator = (key: StringKey, params?: Params) => string;

export const translate = (language: UILanguage, key: StringKey, params?: Params): string => {
  const template = strings[language]?.[key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
};

export const makeTranslator =
  (language: UILanguage): Translator =>
  (key, params) =>
    translate(language, key, params);

/** Locale for number, money and date formatting. */
export const localeFor = (language: UILanguage): string => (language === "nl" ? "nl-NL" : "en-IE");

/** Translator bound to the current interface language. */
export const useT = (): Translator => {
  const language = useStore().data.preferences.language;
  return useMemo(() => makeTranslator(language), [language]);
};
