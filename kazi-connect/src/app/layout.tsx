import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KaziMashinani Jobs | Find work. Build income.",
  description: "Discover opportunities, complete legitimate tasks and manage your earnings transparently with KaziMashinani Jobs."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}