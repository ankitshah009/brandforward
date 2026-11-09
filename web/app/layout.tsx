import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument", display: "swap" });

export const metadata: Metadata = {
  title: { default: "BrandForward · Verify unreleased video without uploading it", template: "%s · BrandForward" },
  description:
    "Raw footage stays on the workstation. A 2 KB proxy gets an edit plan from a model. Every claim is checked against decoded frames and signed.",
  openGraph: {
    title: "BrandForward · Verify unreleased video without uploading it",
    description: "Local-first pre-publishability verification. HOLD or CLEAR, with frame evidence and an Ed25519 receipt.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${instrument.variable}`}>
      <body>{children}</body>
    </html>
  );
}
