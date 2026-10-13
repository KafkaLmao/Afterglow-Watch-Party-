'use client';
import { useSyncExternalStore } from 'react';
import { ThemeProvider, useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
export function AppearanceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      storageKey="afterglow-theme"
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
const subscribeToHydration = () => () => {};

export default function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const dark = mounted && resolvedTheme === 'dark';
  return (
    <button
      type="button"
      className="theme-switch"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <Moon size={17} /> : <Sun size={17} />}
      <span>{dark ? 'Dark' : 'Light'}</span>
    </button>
  );
}
