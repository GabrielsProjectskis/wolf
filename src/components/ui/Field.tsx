import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

interface FieldProps {
  label: string;
  /** A single control (input, select, textarea) or any content. */
  children: ReactNode;
  hint?: ReactNode;
  /** Shown instead of the hint, styled as a problem, and announced. */
  error?: string | null;
  span?: number;
}

type ControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

/**
 * Uppercase mono micro-label above the control (the house style).
 *
 * The label is a real <label> tied to the control by id, so screen
 * readers announce it and clicking it focuses the input. Previously it
 * was a <span>, and every form in the app was a list of unnamed boxes
 * to assistive technology.
 */
export const Field = ({ label, children, hint, error, span = 1 }: FieldProps) => {
  const id = useId();
  const hintId = `${id}-hint`;
  const describedBy = hint || error ? hintId : undefined;

  const control =
    isValidElement(children) && typeof children.type === "string"
      ? cloneElement(children as ReactElement<ControlProps>, {
          id: (children.props as ControlProps).id ?? id,
          "aria-describedby": describedBy,
          "aria-invalid": error ? true : undefined,
        })
      : children;
  const controlId =
    isValidElement(children) && typeof children.type === "string"
      ? ((children.props as ControlProps).id ?? id)
      : undefined;

  return (
    <div className="field" style={{ gridColumn: `span ${span}` }}>
      {controlId ? (
        <label className="label" htmlFor={controlId}>
          {label}
        </label>
      ) : (
        <span className="label">{label}</span>
      )}
      {control}
      {error ? (
        <span id={hintId} className="field__error">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className="field__hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
};

export const FieldGrid = ({ children, columns = 2 }: { children: ReactNode; columns?: number }) => (
  <div className="field-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
    {children}
  </div>
);

export const Section = ({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) => {
  const id = useId();
  return (
    <section className="section" aria-labelledby={id}>
      <div className="section__head">
        <h2 id={id} className="label section__title">
          {title}
        </h2>
        <hr className="divider" style={{ flex: 1 }} />
        {aside}
      </div>
      {children}
    </section>
  );
};

export const Toggle = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) => (
  <label className="toggle">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="toggle__track"
      data-on={checked || undefined}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__thumb" />
    </button>
    <span>{label}</span>
  </label>
);
