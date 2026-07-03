import ClientCounter from "./client-counter";

export default function AppRouterPage() {
  return (
    <main className="flex min-h-screen flex-col items-center gap-8 bg-slate-50 p-8">
      <h1 className="text-3xl font-bold text-slate-900">App Router Home</h1>
      <p className="max-w-prose text-slate-600">This is the app router fixture page.</p>
      <div className="flex items-center gap-4 rounded-lg bg-white p-6 shadow-md">
        <span className="text-slate-700">Static content</span>
      </div>
      <ClientCounter />
    </main>
  );
}
