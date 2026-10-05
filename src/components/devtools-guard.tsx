'use client';

import { useEffect } from 'react';

// On the live site, blocks the usual ways into DevTools: F12, Ctrl/Cmd+Shift+I/J/C,
// Cmd+Option+I/J/C (Mac), view-source (Ctrl/Cmd+U), and right-click (except in text fields, so
// pasting still works). A deterrent only: the browser menu still opens DevTools.
// Off during development.
const DEVTOOLS_KEYS = ['KeyI', 'KeyJ', 'KeyC'];

export function DevtoolsGuard() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const devtools =
        e.key === 'F12' ||
        (mod && (e.shiftKey || e.altKey) && DEVTOOLS_KEYS.includes(e.code));
      const viewSource = mod && e.code === 'KeyU';
      if (devtools || viewSource) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);

  return null;
}
