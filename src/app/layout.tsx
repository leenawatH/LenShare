import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LenShare — เล่นแชร์",
  description: "แอปคำนวณและบันทึกวงแชร์แบบไทย",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
