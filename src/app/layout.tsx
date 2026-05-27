import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Fraunces({ variable: "--font-display", subsets: ["latin"], weight: ["400", "600", "700"] });

export const metadata: Metadata = {
  title: "Sankofa Studio — Learn. Build. Solve Africa.",
  description:
    "The AI-driven learning + venture studio that takes tertiary students from classroom to creator. Master STEM, code, entrepreneurship — and ship ventures that solve real problems across Africa and the developing world.",
  metadataBase: new URL("https://sankofa.studio"),
  openGraph: {
    title: "Sankofa Studio",
    description: "From classroom to creator — AI-powered learning + venture studio for African problem-solvers.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
