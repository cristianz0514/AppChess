import type { Metadata, Viewport } from "next";
import { Inter, Fraunces, Geist_Mono, Big_Shoulders } from "next/font/google";
import "./globals.css";

// Body / UI — clean, highly legible grotesk for a text-dense product.
const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Display / headings — refined variable serif for a premium, reflective feel.
const heading = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Deco display face — condensed geometric skyscraper-signage type, used only
// for the "coach tool" pages' own headings (dashboard, blunders, insights,
// openings) via the .font-deco class. Narrative pages (Nacimiento de un
// Campeón, Practica el Mate) keep Fraunces/.font-display — that's a
// deliberate, separate voice, not an oversight.
const decoHeading = Big_Shoulders({
  variable: "--font-deco-heading",
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#FBFBFD",
};

export const metadata: Metadata = {
  title: {
    default: "AnaliChess IA — Tu entrenador de ajedrez con IA",
    template: "%s · AnaliChess IA",
  },
  description:
    "Conecta tu cuenta de Chess.com y descubre dónde se te escapan las partidas: análisis de Stockfish jugada a jugada y un coach IA que te explica qué debiste jugar.",
  manifest: "/manifest.json",
  applicationName: "AnaliChess IA",
  appleWebApp: {
    capable: true,
    title: "AnaliChess IA",
    statusBarStyle: "default",
  },
  // iOS ignores the manifest's icons entirely for "Add to Home Screen" — it
  // needs its own apple-touch-icon link, which was missing (the app had icon
  // files but no <link rel="apple-touch-icon">, so iOS fell back to a page
  // screenshot instead of the real icon).
  icons: {
    apple: "/icons/icon-152x152.png",
  },
  openGraph: {
    title: "AnaliChess IA — Tu entrenador de ajedrez con IA",
    description:
      "Análisis de Stockfish jugada a jugada y un coach IA que te explica dónde y por qué se te escapan las partidas.",
    type: "website",
    locale: "es",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${sans.variable} ${heading.variable} ${geistMono.variable} ${decoHeading.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        {children}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(regs) {
              regs.forEach(function(r) { r.unregister(); });
            });
          }
        `}} />
      </body>
    </html>
  );
}
