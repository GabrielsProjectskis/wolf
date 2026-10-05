import { useRef } from "react";
import { COUNTRY_BY_CODE, CURRENCIES, EU_COUNTRIES } from "../data/eu";
import { useT } from "../i18n";
import { formatIban, isValidBic, isValidEmail, isValidIban, vatLooksValid } from "../lib/validators";
import type { Business, UILanguage } from "../types";
import { Field, FieldGrid, Section, Toggle } from "./ui/Field";
import { useToast } from "./ui/Toast";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const LOGO_WIDTH = 600;

/**
 * Reads an image file and returns a PNG data URL no wider than 600px.
 * Logos are embedded in data.json as base64, so an untouched 4MB phone
 * photo would bloat every save.
 */
export const downscaleLogo = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (file.size > MAX_LOGO_BYTES) return reject(new Error("tooLarge"));
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error("wrongType"));
    // Read as a data: URL rather than a blob: URL, so the strict
    // Content-Security-Policy (img-src 'self' data:) still allows it.
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("unreadable"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, LOGO_WIDTH / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("unreadable"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("unreadable"));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

/**
 * The single definition of the business form. Setup and Settings both
 * render it, so the two can't drift apart.
 */
export const BusinessForm = ({
  value,
  onChange,
  showErrors = false,
}: {
  value: Business;
  onChange: (patch: Partial<Business>) => void;
  /** Mark required fields that are still empty. */
  showErrors?: boolean;
}) => {
  const t = useT();
  const notify = useToast();
  const logoInput = useRef<HTMLInputElement>(null);

  const setAddress = (key: keyof Business["address"], next: string) =>
    onChange({ address: { ...value.address, [key]: next } });

  /** Picking a country pre-fills currency and the VAT-number prefix. */
  const onCountry = (code: string) => {
    const previous = COUNTRY_BY_CODE.get(value.address.country);
    const country = COUNTRY_BY_CODE.get(code);
    const vatIsJustPrefix = !value.vatNumber || value.vatNumber === previous?.vatPrefix;
    onChange({
      address: { ...value.address, country: code },
      currency: country?.currency ?? value.currency,
      vatNumber: vatIsJustPrefix ? (country?.vatPrefix ?? "") : value.vatNumber,
    });
  };

  const onLogo = async (file: File) => {
    try {
      onChange({ logo: await downscaleLogo(file) });
    } catch (e) {
      const reason = e instanceof Error ? e.message : "unreadable";
      notify(
        t(
          reason === "tooLarge"
            ? "logo.tooLarge"
            : reason === "wrongType"
              ? "logo.wrongType"
              : "logo.unreadable",
        ),
        "error",
      );
    }
  };

  const required = (v: string) => (showErrors && !v.trim() ? t("field.required") : null);
  const vatPrefixOnly = value.vatNumber === COUNTRY_BY_CODE.get(value.address.country)?.vatPrefix;
  const vatWarning =
    value.vatNumber && !vatPrefixOnly && !vatLooksValid(value.vatNumber, value.address.country)
      ? t("field.vatInvalid")
      : null;
  const ibanWarning = value.iban && !isValidIban(value.iban) ? t("field.ibanInvalid") : null;
  const bicWarning = value.bic && !isValidBic(value.bic) ? t("field.bicInvalid") : null;
  const emailWarning = value.email && !isValidEmail(value.email) ? t("field.emailInvalid") : null;

  return (
    <>
      <Section title={t("setup.section.identity")}>
        <FieldGrid>
          <Field label={`${t("field.businessName")} *`} span={2} error={required(value.name)}>
            <input
              className="input"
              required
              maxLength={200}
              autoComplete="organization"
              value={value.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </Field>
          <Field label={t("field.email")} error={emailWarning}>
            <input
              className="input"
              type="email"
              maxLength={200}
              autoComplete="email"
              value={value.email}
              onChange={(e) => onChange({ email: e.target.value.trim() })}
            />
          </Field>
          <Field label={t("field.phone")}>
            <input
              className="input"
              type="tel"
              maxLength={40}
              autoComplete="tel"
              value={value.phone}
              onChange={(e) => onChange({ phone: e.target.value })}
            />
          </Field>
          <Field label={t("field.website")} span={2}>
            <input
              className="input"
              maxLength={200}
              autoComplete="url"
              value={value.website}
              onChange={(e) => onChange({ website: e.target.value.trim() })}
            />
          </Field>

          <Field label={t("field.logo")} span={2} hint={t("field.logoHint")}>
            <div className="row-2" style={{ alignItems: "center" }}>
              {value.logo && <img src={value.logo} alt={t("field.logoPreview")} className="logo-preview" />}
              <button type="button" className="btn" onClick={() => logoInput.current?.click()}>
                {value.logo ? t("field.logoReplace") : t("field.logoChoose")}
              </button>
              {value.logo && (
                <button type="button" className="btn btn--ghost" onClick={() => onChange({ logo: null })}>
                  {t("action.remove")}
                </button>
              )}
              <input
                ref={logoInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                aria-hidden
                tabIndex={-1}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onLogo(file);
                  e.target.value = "";
                }}
              />
            </div>
          </Field>
        </FieldGrid>
      </Section>

      <Section title={t("setup.section.address")}>
        <FieldGrid>
          <Field label={`${t("field.line1")} *`} span={2} error={required(value.address.line1)}>
            <input
              className="input"
              required
              maxLength={200}
              autoComplete="address-line1"
              value={value.address.line1}
              onChange={(e) => setAddress("line1", e.target.value)}
            />
          </Field>
          <Field label={t("field.line2")} span={2}>
            <input
              className="input"
              maxLength={200}
              autoComplete="address-line2"
              value={value.address.line2}
              onChange={(e) => setAddress("line2", e.target.value)}
            />
          </Field>
          <Field label={t("field.postcode")}>
            <input
              className="input input--mono"
              maxLength={20}
              autoComplete="postal-code"
              value={value.address.postcode}
              onChange={(e) => setAddress("postcode", e.target.value)}
            />
          </Field>
          <Field label={`${t("field.city")} *`} error={required(value.address.city)}>
            <input
              className="input"
              required
              maxLength={100}
              autoComplete="address-level2"
              value={value.address.city}
              onChange={(e) => setAddress("city", e.target.value)}
            />
          </Field>
          <Field label={t("field.country")} span={2}>
            <select
              className="select"
              value={value.address.country}
              onChange={(e) => onCountry(e.target.value)}
            >
              {EU_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </FieldGrid>
      </Section>

      <Section title={t("setup.section.tax")}>
        <FieldGrid>
          <Field label={t("field.vatNumber")} error={vatWarning} hint={t("field.vatHint")}>
            <input
              className="input input--mono"
              maxLength={20}
              value={value.vatNumber}
              onChange={(e) => onChange({ vatNumber: e.target.value.toUpperCase().replace(/\s/g, "") })}
            />
          </Field>
          <Field label={t("field.regNumber")} hint={t("field.regHint")}>
            <input
              className="input input--mono"
              maxLength={40}
              value={value.regNumber}
              onChange={(e) => onChange({ regNumber: e.target.value })}
            />
          </Field>
          <div style={{ gridColumn: "span 2", marginTop: 4 }}>
            <Toggle
              checked={value.vatExempt}
              onChange={(v) => onChange({ vatExempt: v })}
              label={t("field.vatExempt")}
            />
          </div>
          {value.vatExempt && (
            <Field
              label={t("field.vatExemptNote")}
              span={2}
              hint={t("field.vatExemptNoteHint")}
              error={showErrors && !value.vatExemptNote.trim() ? t("field.required") : null}
            >
              <input
                className="input"
                maxLength={300}
                value={value.vatExemptNote}
                onChange={(e) => onChange({ vatExemptNote: e.target.value })}
                placeholder={t("field.vatExemptNotePlaceholder")}
              />
            </Field>
          )}
        </FieldGrid>
      </Section>

      <Section title={t("setup.section.payment")}>
        <FieldGrid>
          <Field label={t("field.iban")} error={ibanWarning}>
            <input
              className="input input--mono"
              maxLength={42}
              value={value.iban}
              onChange={(e) => onChange({ iban: e.target.value.toUpperCase() })}
              onBlur={() => value.iban && onChange({ iban: formatIban(value.iban) })}
            />
          </Field>
          <Field label={t("field.bic")} error={bicWarning}>
            <input
              className="input input--mono"
              maxLength={11}
              value={value.bic}
              onChange={(e) => onChange({ bic: e.target.value.toUpperCase().replace(/\s/g, "") })}
            />
          </Field>
          <Field label={t("field.currency")}>
            <select
              className="select"
              value={value.currency}
              onChange={(e) => onChange({ currency: e.target.value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.symbol})
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("field.paymentTerm")}>
            <input
              className="input input--mono"
              type="number"
              min={0}
              max={365}
              value={value.paymentTermDays}
              onChange={(e) =>
                onChange({
                  paymentTermDays: Math.min(365, Math.max(0, Math.trunc(Number(e.target.value) || 0))),
                })
              }
            />
          </Field>
          <Field label={t("field.documentLanguage")}>
            <select
              className="select"
              value={value.documentLanguage}
              onChange={(e) => onChange({ documentLanguage: e.target.value as UILanguage })}
            >
              <option value="en">English</option>
              <option value="nl">Nederlands</option>
            </select>
          </Field>
          <Field label={t("field.defaultNotes")} span={2} hint={t("field.defaultNotesHint")}>
            <textarea
              className="textarea"
              maxLength={2000}
              value={value.defaultNotes}
              onChange={(e) => onChange({ defaultNotes: e.target.value })}
            />
          </Field>
        </FieldGrid>
      </Section>
    </>
  );
};
