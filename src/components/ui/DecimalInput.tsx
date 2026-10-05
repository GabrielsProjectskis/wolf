import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

/**
 * A text input for numbers that people type in their own format.
 *
 * A controlled number input that re-parses on every keystroke destroys
 * partial input: typing "7,5" goes "7" -> "7," (parsed back to 7, comma
 * gone) -> "75". This keeps the raw text while the field has focus,
 * reports the parsed value as you type, and only rewrites the text on
 * blur.
 */
export const DecimalInput = ({
  value,
  onValue,
  parse,
  format,
  ...rest
}: {
  value: number;
  onValue: (next: number) => void;
  /** Returns null for text that isn't a number yet. */
  parse: (text: string) => number | null;
  format: (value: number) => string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) => {
  const [raw, setRaw] = useState(() => format(value));
  const focused = useRef(false);
  // Clicking into the field selects its contents so typing replaces it.
  // The mouseup that ends the click would normally collapse that
  // selection back to a caret, so the first mouseup is cancelled.
  const keepSelection = useRef(false);

  useEffect(() => {
    if (!focused.current) setRaw(format(value));
  }, [value, format]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={raw}
      onFocus={(e) => {
        focused.current = true;
        keepSelection.current = true;
        e.target.select();
        rest.onFocus?.(e);
      }}
      onMouseUp={(e) => {
        if (keepSelection.current) e.preventDefault();
        keepSelection.current = false;
        rest.onMouseUp?.(e);
      }}
      onKeyDown={(e) => {
        keepSelection.current = false;
        rest.onKeyDown?.(e);
      }}
      onChange={(e) => {
        setRaw(e.target.value);
        const parsed = parse(e.target.value);
        if (parsed !== null) onValue(parsed);
        else if (e.target.value.trim() === "") onValue(0);
      }}
      onBlur={(e) => {
        focused.current = false;
        setRaw(format(parse(raw) ?? value));
        rest.onBlur?.(e);
      }}
    />
  );
};
