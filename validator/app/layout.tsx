import type { ReactNode } from "react";

export const metadata = {
  title: "EduSSO v1 Validator",
  description: "Conformance validator for EduSSO v1 tutors.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          margin: 0,
          background: "#0b1220",
          color: "#e6edf3",
          minHeight: "100vh",
        }}
      >
        {children}
      </body>
    </html>
  );
}
