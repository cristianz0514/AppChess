import type { Metadata, Viewport } from "next";
import { Inter, Fraunces, Geist_Mono } from "next/font/google";
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
      className={`${sans.variable} ${heading.variable} ${geistMono.variable} h-full antialiased`}
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
