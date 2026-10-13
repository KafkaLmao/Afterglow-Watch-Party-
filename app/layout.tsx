import type { Metadata } from 'next';
import 'lenis/dist/lenis.css';
import './globals.css';
import { AppearanceProvider } from './appearance';
import { SmoothScroll } from '../components/smooth-scroll';
export const metadata: Metadata = {
  title: 'Afterglow · Good movies. Better company.',
  description:
    'Find a film, gather your people, and press play together. A shared movie night with synchronized playback, chat, reactions, and group votes.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppearanceProvider>
          <SmoothScroll>{children}</SmoothScroll>
        </AppearanceProvider>
      </body>
    </html>
  );
}
