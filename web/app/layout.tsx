import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family Call",
  description: "A private calling space for Ma, Juyel, and Mim.",
  applicationName: "Family Call",
};

export const viewport: Viewport = {
  themeColor: "#f4f7f6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
