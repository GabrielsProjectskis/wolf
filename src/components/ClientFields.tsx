import { EU_COUNTRIES, OUTSIDE_EU } from "../data/eu";
import { useT } from "../i18n";
import type { ClientInput } from "../lib/actions";
import type { Address } from "../types";
import { Field, FieldGrid } from "./ui/Field";

export type ClientDraft = ClientInput;

export const emptyClientDraft = (country: string): ClientDraft => ({
  name: "",
  address: { line1: "", line2: "", postcode: "", city: "", country },
  vatNumber: "",
  email: "",
  reference: "",
});

export const ClientFields = ({
  value,
  onChange,
}: {
  value: ClientDraft;
  onChange: (patch: Partial<ClientDraft>) => void;
}) => {
  const t = useT();
  const setAddress = (key: keyof Address, next: string) =>
    onChange({ address: { ...value.address, [key]: next } });

  return (
    <FieldGrid>
      <Field label={t("client.name")} span={2}>
        <input
          className="input"
          required
          maxLength={200}
          autoComplete="organization"
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </Field>
      <Field label={t("field.line1")} span={2}>
        <input
          className="input"
          maxLength={200}
          value={value.address.line1}
          onChange={(e) => setAddress("line1", e.target.value)}
        />
      </Field>
      <Field label={t("field.line2")} span={2}>
        <input
          className="input"
          maxLength={200}
          value={value.address.line2}
          onChange={(e) => setAddress("line2", e.target.value)}
        />
      </Field>
      <Field label={t("field.postcode")}>
        <input
          className="input input--mono"
          maxLength={20}
          value={value.address.postcode}
          onChange={(e) => setAddress("postcode", e.target.value)}
        />
      </Field>
      <Field label={t("field.city")}>
        <input
          className="input"
          maxLength={100}
          value={value.address.city}
          onChange={(e) => setAddress("city", e.target.value)}
        />
      </Field>
      <Field label={t("field.country")}>
        <select
          className="select"
          value={value.address.country}
          onChange={(e) => setAddress("country", e.target.value)}
        >
          {EU_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
          <option value={OUTSIDE_EU}>{t("client.outsideEu")}</option>
        </select>
      </Field>
      <Field label={t("field.vatNumber")} hint={t("client.vatHint")}>
        <input
          className="input input--mono"
          maxLength={20}
          value={value.vatNumber}
          onChange={(e) => onChange({ vatNumber: e.target.value.toUpperCase().replace(/\s/g, "") })}
        />
      </Field>
      <Field label={t("field.email")}>
        <input
          className="input"
          type="email"
          maxLength={200}
          value={value.email}
          onChange={(e) => onChange({ email: e.target.value })}
        />
      </Field>
      <Field label={t("client.reference")} hint={t("client.referenceHint")}>
        <input
          className="input"
          maxLength={100}
          value={value.reference}
          onChange={(e) => onChange({ reference: e.target.value })}
        />
      </Field>
    </FieldGrid>
  );
};
