import type { ReactElement } from "react";

export function RepeatedList(): ReactElement {
  return (
    <ul className="space-y-2 p-6">
      {Array.from({ length: 5 }).map((_, index) => (
        <li key={index} className="rounded bg-slate-100 p-3 text-slate-800">
          Repeated item {index + 1}
        </li>
      ))}
    </ul>
  );
}
