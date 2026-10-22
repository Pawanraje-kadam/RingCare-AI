import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { Providers } from "@/components/providers/providers";

export const metadata: Metadata = {
  title: {
    default: "RingCare AI — Your front door, understood.",
    template: "%s · RingCare AI",
  },
  description:
    "RingCare AI turns simulated smart-home events into calm, grounded explanations with deterministic rules and optional Groq analysis.",
  applicationName: "RingCare AI",
  keywords: [
    "smart home",
    "doorbell",
    "event intelligence",
    "Groq",
    "Llama 3.3",
    "caregiver",
    "home awareness",
  ],
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F2EC" },
    { media: "(prefers-color-scheme: dark)", color: "#0A1315" },
  ],
};

const themeScript = `(function(){try{var key='ringcare.theme.v1';var stored=localStorage.getItem(key);var theme=(stored==='light'||stored==='dark'||stored==='system')?stored:'system';var dark=theme==='dark'||(theme==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var root=document.documentElement;root.classList.toggle('dark',dark);root.style.colorScheme=dark?'dark':'light';}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
