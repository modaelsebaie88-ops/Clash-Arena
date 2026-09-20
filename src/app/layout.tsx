import type { Metadata, Viewport } from 'next';
import { Anton, Archivo, Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

/**
 * Three families, one job each (see DESIGN.md § Typography):
 *   Anton   - monumental condensed uppercase lockups
 *   Archivo - every number, kicker and action label (tabular figures)
 *   Inter   - body copy and form help
 */
const display = Anton({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'swap',
});

const data = Archivo({
  subsets: ['latin'],
  variable: '--font-data',
  display: 'swap',
});

const ui = Inter({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Clash Arena',
    template: '%s · Clash Arena',
  },
  description:
    'Live competitive tournaments. Answer fast, climb the rankings, win the arena.',
  applicationName: 'Clash Arena',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Clash Arena',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.png',
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#08090A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  // The arena uses fixed bottom chrome; it must sit under the home indicator.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${data.variable} ${ui.variable}`}
      suppressHydrationWarning
    >
      <body>
        {children}
        <Toaster
          theme="dark"
          position="top-center"
          // Clears the sticky status strip and the round pips on the arena
          // floor, so a toast never covers the clock or the question.
          offset="88px"
          duration={3200}
          toastOptions={{
            className:
              'font-data uppercase tracking-wide text-[13px] font-semibold rounded-md border border-rail bg-deck text-chalk',
          }}
        />
      </body>
    </html>
  );
}
