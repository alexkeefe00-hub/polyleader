import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PolyLeader",
  description: "Track leading Polymarket traders and their active positions.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
