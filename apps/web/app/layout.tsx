import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { WarmUp } from '@/components/WarmUp';
import './globals.css';

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata = {
  title: 'Quorum · Incident command plane',
  description: 'Incident command plane on multi-region Aurora DSQL',
};

export const viewport = {
  themeColor: '#0b0e14',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} bg-bg`}>
      <body>
        <WarmUp />
        {children}
      </body>
    </html>
  );
}
