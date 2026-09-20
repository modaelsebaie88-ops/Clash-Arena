import type { MetadataRoute } from 'next';

/** Installable arena: full-screen, dark, portrait-first. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Clash Arena',
    short_name: 'Arena',
    description: 'Live competitive tournaments. Answer fast, climb the rankings.',
    start_url: '/dashboard',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#08090A',
    theme_color: '#08090A',
    categories: ['games', 'education'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
