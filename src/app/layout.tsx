import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Travel Logistics",
    template: "%s · Travel Logistics",
  },
  description:
    "Movement tracking, persons-on-board reporting and airport transfer coordination.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
