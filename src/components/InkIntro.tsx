'use client';

import { startInkIntro, type InkWord } from '@/lib/ink-intro';
import { trackEvent } from '@/lib/analytics';
import { ChevronDown } from 'lucide-react';
import { Be_Vietnam_Pro } from 'next/font/google';
import { useEffect, useRef, useState } from 'react';

// Be Vietnam Pro carries the Vietnamese accents in "Xin chào".
const beVietnam = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '600'],
  display: 'swap',
});

const WORDS: InkWord[] = [
  { lines: [{ t: 'Xin chào', s: 1, w: 600 }], color: [1.0, 0.86, 0.72] },
  { lines: [{ t: 'Hello', s: 1, w: 600 }], color: [0.78, 0.88, 1.0] },
  {
    lines: [
      { t: 'I’m Tien.', s: 1, w: 600 },
      { t: 'Software Engineer', s: 0.3, w: 400 },
    ],
    color: [1.0, 0.96, 0.9],
  },
];

// After the final line appears, this long without the visitor doing anything and the page
// scrolls down to the chat on its own (once per visit).
const AUTO_SCROLL_MS = 750;
// Pointer travel (px) that counts as playing with the ink; less is just a resting hand.
const STIR_DISTANCE = 60;

// The dark theme's --background (zinc-950, #09090b), so the canvas blends into the page.
const BACKGROUND: [number, number, number] = [9 / 255, 9 / 255, 11 / 255];

export default function InkIntro({
  onScrollDown,
}: {
  onScrollDown?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const replayRef = useRef<() => void>(() => {});
  const [finalShown, setFinalShown] = useState(false);
  const [noWebGL, setNoWebGL] = useState(false);
  // Auto-scroll happens at most once, and never after a replay.
  const autoScrollUsed = useRef(false);
  const onScrollDownRef = useRef(onScrollDown);
  onScrollDownRef.current = onScrollDown;

  // The final line is up: unless the visitor is already busy (clicking, scrolling, typing, or
  // stirring the ink), take them down to the chat after a beat.
  useEffect(() => {
    if (!finalShown || autoScrollUsed.current) return;
    autoScrollUsed.current = true;
    if (window.scrollY > 40 || window.location.hash === '#chat') return;

    let timer = 0;
    let travelled = 0;
    let last: { x: number; y: number } | null = null;
    const cancel = () => {
      window.clearTimeout(timer);
      removeListeners();
    };
    const onMove = (e: PointerEvent) => {
      if (last) travelled += Math.hypot(e.clientX - last.x, e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
      if (travelled > STIR_DISTANCE) cancel();
    };
    const events = ['pointerdown', 'wheel', 'touchstart', 'keydown'] as const;
    const removeListeners = () => {
      events.forEach((type) => window.removeEventListener(type, cancel));
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll);
    };
    const onScroll = () => {
      if (window.scrollY > 40) cancel();
    };
    events.forEach((type) =>
      window.addEventListener(type, cancel, { passive: true })
    );
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    timer = window.setTimeout(() => {
      removeListeners();
      trackEvent('hero_scroll', { how: 'auto' });
      onScrollDownRef.current?.();
    }, AUTO_SCROLL_MS);
    return cancel;
  }, [finalShown]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ink = startInkIntro(canvas, {
      words: WORDS,
      fontFamily: beVietnam.style.fontFamily,
      background: BACKGROUND,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches,
      onFinalShown: () => setFinalShown(true),
    });

    if (!ink) {
      setNoWebGL(true);
      setFinalShown(true);
      return;
    }

    replayRef.current = () => {
      autoScrollUsed.current = true; // they chose to watch again: don't whisk them away
      setFinalShown(false);
      ink.replay();
    };
    return () => ink.destroy();
  }, []);

  return (
    <section
      className={`${beVietnam.className} bg-background relative h-svh w-full overflow-hidden text-[#f4efe6]`}
    >
      <h1 className="sr-only">Xin chào, I’m Tien, Software Engineer</h1>

      {noWebGL ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          <p className="text-5xl font-semibold md:text-7xl">I’m Tien.</p>
          <p className="mt-3 text-lg font-normal text-[#f4efe6]/60 md:text-2xl">
            Software Engineer
          </p>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 block size-full touch-pan-y"
        />
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 grid grid-cols-3 items-end px-5 pb-20 text-xs font-light tracking-[0.08em]">
        {/* The way down: bigger, brighter text over a large, bold arrow that bounces and glows
            (the old tiny grey hint went unnoticed). No box around it. */}
        <button
          type="button"
          onClick={() => {
            trackEvent('hero_scroll', { how: 'arrow' });
            onScrollDown?.();
          }}
          tabIndex={finalShown ? 0 : -1}
          className={`group absolute bottom-16 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-base font-medium tracking-wide whitespace-nowrap text-[#f4efe6] transition-opacity duration-700 [text-shadow:0_0_18px_rgba(244,239,230,0.45)] md:text-lg ${
            finalShown ? 'pointer-events-auto opacity-100' : 'opacity-0'
          }`}
        >
          Ask me anything
          <ChevronDown
            strokeWidth={2.75}
            className="size-10 drop-shadow-[0_0_10px_rgba(244,239,230,0.7)] transition-transform group-hover:scale-110 motion-safe:animate-[ask-arrow_1.4s_ease-in-out_infinite] md:size-12"
          />
        </button>
        {!noWebGL && (
          <button
            type="button"
            onClick={() => replayRef.current()}
            className="pointer-events-auto col-start-3 justify-self-end py-2 text-[#f4efe6]/40 transition-colors hover:text-[#f4efe6]"
          >
            replay
          </button>
        )}
      </div>
    </section>
  );
}
