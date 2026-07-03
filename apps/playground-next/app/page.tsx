import ClientCounter from "./client-counter";

export default function AppRouterPage() {
  return (
    <main>
      <h1>App Router Home</h1>
      <p>This is the app router fixture page.</p>
      <div className="card">
        <span>Static content</span>
      </div>
      <ClientCounter />
    </main>
  );
}
