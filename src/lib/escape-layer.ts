'use client';

import { useEffect, useRef } from 'react';

// Esc closes only the topmost open layer (side panel, then expanded card, then the chat).
// Layers register while open; the most recently opened one gets the key, and it doesn't
// reach anything underneath.
const layers: { current: () => void }[] = [];

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || layers.length === 0) return;
  e.stopPropagation();
  layers[layers.length - 1].current();
}

export function useEscapeLayer(active: boolean, onEscape: () => void) {
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const layer = { current: () => handler.current() };
    layers.push(layer);
    if (layers.length === 1)
      window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      layers.splice(layers.indexOf(layer), 1);
      if (layers.length === 0)
        window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [active]);
}
