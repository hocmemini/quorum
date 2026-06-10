import type { ReactNode } from 'react';
import { WarmUp } from '@/components/WarmUp';
import './globals.css';

export const metadata = {
  title: 'Quorum',
  description: 'Incident command plane on multi-region Aurora DSQL',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WarmUp />
        {children}
      </body>
    </html>
  );
}
