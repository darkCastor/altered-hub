import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import AppLayout from '@/components/layout/AppLayout';

const APP_NAME = "AlterDeck";
const APP_DEFAULT_TITLE = "AlterDeck";
const APP_TITLE_TEMPLATE = "%s - AlterDeck";
const APP_DESCRIPTION = "Play, create decks, and look cards online and offline for Altered TCG.";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_DEFAULT_TITLE,
    template: APP_TITLE_TEMPLATE,
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_DEFAULT_TITLE,
    // startUpImage: [], // You can add startup images here
  },
  formatDetection: {
    telephone: false,
  },
  // openGraph, // Add openGraph metadata if needed
  // twitter, // Add twitter metadata if needed
};

export const viewport: Viewport = {
  themeColor: "#9F5AFF", // Matches theme_color in manifest.json
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1, // Consider allowing zoom if accessibility is a concern
  // userScalable: false, // Can set to true if you want to allow zoom
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <AppLayout>
          {children}
        </AppLayout>
        <Toaster />
      </body>
    </html>
  );
}
