import type { Metadata, Viewport } from "next";
import { Anek_Devanagari, Anek_Latin, Anek_Telugu, Hind } from "next/font/google";
import "./globals.css";

// Fonts are self-hosted at build time by next/font: no third-party requests at runtime.
// Anek is one design across Latin, Telugu and Devanagari, so headings and the patient's
// plan keep the same voice in every language. Hind carries Latin and Hindi body text.
const anekLatin = Anek_Latin({ subsets: ["latin"], axes: ["wdth"], variable: "--f-head", display: "swap" });
const anekTelugu = Anek_Telugu({ subsets: ["telugu"], axes: ["wdth"], variable: "--f-telugu", display: "swap" });
const anekDeva = Anek_Devanagari({ subsets: ["devanagari"], axes: ["wdth"], variable: "--f-deva", display: "swap" });
const hind = Hind({ subsets: ["latin", "devanagari"], weight: ["400", "500", "600"], variable: "--f-body", display: "swap" });

export const metadata: Metadata = {
  title: "Setu: consultation to everyday care",
  description:
    "An AI copilot for rural health centres: multilingual intake, a verified doctor brief, and a take-home plan patients can follow. Built on open-weight models served by Groq.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#13263f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anekLatin.variable} ${anekTelugu.variable} ${anekDeva.variable} ${hind.variable}`}>
      <body>{children}</body>
    </html>
  );
}
