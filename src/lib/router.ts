import { useEffect, useState } from 'react';

// Hash routing works from file:// without a server.
export function parseHash(hash: string): string[] {
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

export function useRoute(): string[] {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function go(path: string) {
  location.hash = '#/' + path.replace(/^\//, '');
}

export function bigScreenUrl(): string {
  return location.href.split('#')[0] + '#/big';
}
