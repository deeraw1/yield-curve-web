import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FGN Bond Yield Curve Modeller",
  description: "Nelson-Siegel model fitted to FGN bond data — live yield curve, inversion flags, carry trade opportunities",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
