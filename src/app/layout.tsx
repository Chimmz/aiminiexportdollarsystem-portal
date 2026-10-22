import type { Metadata } from 'next';
import { Jost, League_Spartan, SUSE } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

const jost = Jost({
  variable: '--font-jost',
  subsets: ['latin'],
});

// Candidate paragraph font, loaded alongside Jost for side-by-side testing.
// Variable weight (100-900), so no explicit weight needed.
const leagueSpartan = League_Spartan({
  variable: '--font-league-spartan',
  subsets: ['latin'],
});

const suse = SUSE({
  variable: '--font-suse',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'AI Export Mentor',
  description: 'Your AI Export Mentor portal.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={cn(
        'h-full antialiased',
        jost.variable,
        leagueSpartan.variable,
        suse.variable
      )}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
