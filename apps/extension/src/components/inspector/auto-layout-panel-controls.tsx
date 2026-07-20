import { suggestTokens, type TokenSuggestionProvider } from "@vision-control/layout-engine";
import type { ReactElement } from "react";

export function AutoLayoutField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): ReactElement {
  return (
    <div className="auto-layout__field">
      <span className="auto-layout__label">{label}</span>
      <div className="auto-layout__control">{children}</div>
    </div>
  );
}

export function AutoLayoutTokenHint({
  providers,
  property,
  value,
}: {
  providers: readonly TokenSuggestionProvider[];
  property: string;
  value: string;
}): ReactElement | null {
  const suggestions = suggestTokens(providers, property, value);
  if (suggestions.length === 0) return null;
  const best = suggestions[0];
  return (
    <span className="auto-layout__token-hint" title={best?.rawValue ?? ""}>
      {" "}
      ≈ {best?.utility}
    </span>
  );
}

export function AutoLayoutSelectControl<T extends string>({
  value,
  options,
  onChange,
  testId,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  testId: string;
}): ReactElement {
  return (
    <select data-testid={testId} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
