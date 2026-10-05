import { DevtoolsGuard } from '@/components/devtools-guard';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// Load Inter font for non-Apple devices
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const description =
  'Interactive portfolio of Pham Duy Tien, software engineer in Ho Chi Minh City. Chat with my 3D Memoji to explore my work, skills and life outside code.';

// The tab icon is src/app/icon.png (my memoji); iPhones use src/app/apple-icon.png.
export const metadata: Metadata = {
  title: 'Tien Portfolio',
  description,
  keywords: [
    'Pham Duy Tien',
    'Portfolio',
    'Software Engineer',
    'Backend',
    'AI',
    'Interactive',
    'Memoji',
    'Next.js',
    'Ho Chi Minh City',
  ],
  authors: [
    { name: 'Pham Duy Tien', url: 'https://github.com/phamduytien1805' },
  ],
  creator: 'Pham Duy Tien',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    title: 'Tien Portfolio',
    description,
    siteName: 'Tien Portfolio',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tien Portfolio',
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="dark"
      style={{ colorScheme: 'dark' }}
      suppressHydrationWarning
    >
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
        {/* Refreshing inside the chat (#chat): cover the home page until the chat is restored,
            so it doesn't flash before the app starts. The home page removes this flag. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if(location.hash==='#chat')document.documentElement.dataset.chatRestore=''`,
          }}
        />
      </head>
      <body
        className={cn(
          'bg-background min-h-screen font-sans antialiased',
          inter.variable
        )}
      >
        <main className="flex min-h-screen flex-col">{children}</main>
        <Toaster theme="dark" />
        <DevtoolsGuard />
      </body>
    </html>
  );
}
