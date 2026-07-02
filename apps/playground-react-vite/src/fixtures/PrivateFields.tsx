import type { ReactElement } from "react";
import { useEffect } from "react";

export function PrivateFields(): ReactElement {
  useEffect(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: fixture intentionally seeds secrets for adversarial tests.
    document.cookie = "session=VC_SECRET_COOKIE";
    localStorage.setItem("api_key", "sk_test_VC_SECRET");
  }, []);

  return (
    <form className="space-y-4 p-6">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Password</span>
        <input
          type="password"
          value="VC_SECRET_SHOULD_NOT_EXPORT"
          readOnly
          className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
        />
      </label>
      <input type="hidden" name="api_key" value="sk_test_VC_SECRET_KEY" />
      <button
        type="submit"
        className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
      >
        Submit
      </button>
    </form>
  );
}
