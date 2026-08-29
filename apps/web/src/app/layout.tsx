import type { Metadata } from "next";
import { Doto, Inter, Inter_Tight, Roboto_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"] });
const robotoMono = Roboto_Mono({ variable: "--font-roboto-mono", subsets: ["latin"] });
const doto = Doto({ variable: "--font-doto", subsets: ["latin"], weight: ["700", "900"] });

export const metadata: Metadata = {
  title: "Perps | Trade Perpetual Futures",
  description: "Trade BTC, ETH, and SOL perpetual futures with up to 50× leverage.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${interTight.variable} ${robotoMono.variable} ${doto.variable} h-full antialiased`}
    >
      <body className="flex h-screen flex-col bg-bg text-fg">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
