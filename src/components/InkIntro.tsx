'use client';

import { startInkIntro, type InkWord } from '@/lib/ink-intro';
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
  { lines: [{ t: 'Bonjour', s: 1, w: 600 }], color: [0.94, 0.8, 0.96] },
  {
    lines: [
      { t: 'I’m Tien.', s: 1, w: 600 },
      { t: 'Software Engineer', s: 0.3, w: 400 },
    ],
    color: [1.0, 0.96, 0.9],
  },
];

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

      <div className="pointer-events-none absolute inset-x-0 bottom-0 grid grid-cols-3 items-end px-5 pb-6 text-xs font-light tracking-[0.08em]">
        <button
          type="button"
          onClick={onScrollDown}
          tabIndex={finalShown ? 0 : -1}
          className={`col-start-2 flex flex-col items-center gap-1 justify-self-center text-[#f4efe6]/50 transition-opacity duration-700 hover:text-[#f4efe6] ${
            finalShown ? 'pointer-events-auto opacity-100' : 'opacity-0'
          }`}
        >
          <span>ask me anything</span>
          <ChevronDown className="size-4 motion-safe:animate-bounce" />
        </button>
        {!noWebGL && (
          <button
            type="button"
            onClick={() => replayRef.current()}
            className="pointer-events-auto justify-self-end py-2 text-[#f4efe6]/40 transition-colors hover:text-[#f4efe6]"
          >
            replay
          </button>
        )}
      </div>
    </section>
  );
}
