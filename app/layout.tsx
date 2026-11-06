import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roofer Agent",
  description: "Draft work orders from roof-repair request emails",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
