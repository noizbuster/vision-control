import type { ReactElement } from "react";

export function ResizeFlex(): ReactElement {
  return (
    <div className="flex h-64 w-full flex-row gap-2 p-6">
      <div className="flex-[1] rounded bg-emerald-500 p-4 text-white">flex-1</div>
      <div className="flex-[2] rounded bg-emerald-600 p-4 text-white">flex-2</div>
      <div className="flex-[3] rounded bg-emerald-700 p-4 text-white">flex-3</div>
    </div>
  );
}
