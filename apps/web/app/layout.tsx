import type { Metadata } from 'next';
import { Public_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppFrame } from '@/components/shell/app-frame';
import './globals.css';

const publicSans = Public_Sans({ subsets: ['latin'], weight: ['300', '400', '500', '700'], variable: '--font-public-sans', display: 'swap' });

export const metadata: Metadata = {
  title: 'Orchestration Studio',
  description: 'Plataforma multiagente para mejorar historias de usuario y tareas técnicas en Jira.',
};

// Aplica el tema guardado antes de pintar (evita parpadeo). Claro es el tema de trabajo por defecto.
const themeScript = `(function(){try{var t=localStorage.getItem('mao-theme');if(t!=='light'&&t!=='dark'){t='light'}document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','light')}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR" data-theme="light" className={publicSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
