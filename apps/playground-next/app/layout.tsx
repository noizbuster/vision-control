import type { ReactNode } from "react";

export const metadata = {
  title: "Playground Next",
  description: "Next.js fixture for dev-only source marker testing",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
