'use client';

import { useEscapeLayer } from '@/lib/escape-layer';
import { AnimatePresence, motion } from 'framer-motion';
import { Flashlight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// The flashlight easter egg: the page stays as it is, the cursor becomes a flashlight, and
// numbers hidden around the site (some in the chat, some on the homepage) only show inside its
// circle of light. Shine the light's centre on one to collect it. The sum of the ones found becomes the visitor's new
// message allowance. The game carries on while moving between the chat and the homepage.

const LIGHT_RADIUS = 120; // px: where hidden numbers show up
const CATCH_RADIUS = 45; // px: a number this close to the light's centre is found

// In the chat: a spot in the window (percent). On the homepage: a spot on the page (x percent
// of the width, y in px from the top of the page), so finding it takes some scrolling.
type Spot = { where: 'chat' | 'home'; x: number; y: number };

// Random spots, at least 3 in each place, spread out so no two numbers sit on top of each other.
function placeNumbers(count: number): Spot[] {
  const pageHeight = document.documentElement.scrollHeight;
  const homeCount = 3 + Math.floor(Math.random() * (count - 5));
  const places = Array.from({ length: count }, (_, i) =>
    i < homeCount ? ('home' as const) : ('chat' as const)
  ).sort(() => Math.random() - 0.5);

  const spots: Spot[] = [];
  for (const where of places) {
    for (let tries = 0; tries < 300; tries++) {
      const spot: Spot =
        where === 'chat'
          ? { where, x: 6 + Math.random() * 88, y: 10 + Math.random() * 78 }
          : {
              where,
              x: 6 + Math.random() * 88,
              y: 80 + Math.random() * Math.max(0, pageHeight - 200),
            };
      const close = (s: Spot) =>
        where === 'chat'
          ? Math.hypot(s.x - spot.x, (s.y - spot.y) * 0.7) < 11
          : Math.abs(s.x - spot.x) < 10 && Math.abs(s.y - spot.y) < 120;
      if (spots.every((s) => s.where !== where || !close(s)) || tries === 299) {
        spots.push(spot);
        break;
      }
    }
  }
  return spots;
}

export function FlashlightGame({
  values,
  chatOpen,
  onFinish,
}: {
  values: number[];
  /** Which numbers are on show: the chat's, or the homepage's. */
  chatOpen: boolean;
  /** Called once, with the indexes of the numbers found. */
  onFinish: (found: number[]) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const torchRef = useRef<HTMLDivElement>(null);
  const [spots] = useState(() => placeNumbers(values.length));
  const [found, setFound] = useState<number[]>([]);
  const finished = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const total = found.reduce((sum, i) => sum + values[i], 0);

  const finish = (indexes: number[]) => {
    if (finished.current) return;
    finished.current = true;
    onFinishRef.current(indexes);
  };
  useEscapeLayer(true, () => finish(found));

  // The light follows the pointer (mouse, or a finger dragging on touch screens). Updated
  // straight on the elements, not through React, so it stays smooth.
  useEffect(() => {
    let light = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    // Any number right under the light's centre is found (no click needed).
    const catchNumbers = () => {
      rootRef.current
        ?.querySelectorAll<HTMLElement>('[data-number]:not([data-caught])')
        .forEach((el) => {
          const r = el.getBoundingClientRect();
          const near = Math.hypot(
            r.left + r.width / 2 - light.x,
            r.top + r.height / 2 - light.y
          );
          if (near > CATCH_RADIUS) return;
          el.dataset.caught = '';
          const i = Number(el.dataset.number);
          setFound((f) => (f.includes(i) ? f : [...f, i]));
        });
    };
    const move = (e: PointerEvent) => {
      light = { x: e.clientX, y: e.clientY };
      rootRef.current?.style.setProperty('--fx', `${e.clientX}px`);
      rootRef.current?.style.setProperty('--fy', `${e.clientY}px`);
      if (torchRef.current)
        torchRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      catchNumbers();
    };
    // Homepage numbers move with the page as it scrolls (and may slide under the light).
    const scroll = () => {
      rootRef.current?.style.setProperty('--sy', `${window.scrollY}px`);
      catchNumbers();
    };
    scroll();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', move);
    window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', move);
      window.removeEventListener('scroll', scroll);
    };
  }, []);

  // All found: a moment to enjoy it, then done.
  useEffect(() => {
    if (found.length !== values.length) return;
    const timer = window.setTimeout(() => {
      if (finished.current) return;
      finished.current = true;
      onFinishRef.current(found);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [found, values.length]);

  return createPortal(
    <div
      ref={rootRef}
      className="pointer-events-none fixed inset-0 z-[95]"
      style={
        {
          '--fx': '50vw',
          '--fy': '50vh',
          '--sy': '0px',
        } as React.CSSProperties
      }
    >
      {/* The cursor is the flashlight while playing. */}
      <style>{`* { cursor: none !important; }`}</style>

      {/* The light itself: a warm glow brightening the dark page around the pointer. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 mix-blend-screen"
        style={{
          background: `radial-gradient(circle ${LIGHT_RADIUS * 1.6}px at var(--fx) var(--fy), rgba(255, 233, 180, 0.2), rgba(255, 233, 180, 0.07) 45%, transparent 72%)`,
        }}
      />

      {/* The hidden numbers: only visible inside the light. */}
      <div
        className="absolute inset-0"
        style={{
          maskImage: `radial-gradient(circle ${LIGHT_RADIUS}px at var(--fx) var(--fy), black 45%, transparent 100%)`,
          WebkitMaskImage: `radial-gradient(circle ${LIGHT_RADIUS}px at var(--fx) var(--fy), black 45%, transparent 100%)`,
        }}
      >
        {values.map((value, i) => (
          <AnimatePresence key={i}>
            {!found.includes(i) && (spots[i].where === 'chat') === chatOpen && (
              <motion.span
                data-number={i}
                aria-label={`Hidden number ${value}`}
                exit={{ scale: 2.2, opacity: 0, transition: { duration: 0.4 } }}
                className="absolute -translate-x-1/2 -translate-y-1/2 p-2 font-mono text-3xl font-black text-amber-100 [text-shadow:0_0_14px_rgba(255,214,140,0.9)]"
                style={{
                  left: `${spots[i].x}%`,
                  top:
                    spots[i].where === 'chat'
                      ? `${spots[i].y}%`
                      : `calc(${spots[i].y}px - var(--sy))`,
                }}
              >
                {value}
              </motion.span>
            )}
          </AnimatePresence>
        ))}
      </div>

      {/* The flashlight cursor. */}
      <div
        ref={torchRef}
        aria-hidden="true"
        className="absolute top-0 left-0 -mt-1 -ml-1 [@media(hover:none)]:hidden"
        style={{ transform: 'translate(50vw, 50vh)' }}
      >
        <Flashlight
          className="size-6 -rotate-45 text-amber-200 drop-shadow-[0_0_6px_rgba(255,214,140,0.8)]"
          strokeWidth={1.75}
        />
      </div>

      {/* Score and a way out: top-right, or just under the chat header on phones. */}
      <div className="pointer-events-auto absolute top-[calc(env(safe-area-inset-top)+7rem)] right-1/2 flex translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-neutral-900/70 py-1.5 pr-1.5 pl-4 text-sm backdrop-blur-xl sm:top-[max(env(safe-area-inset-top),1rem)] sm:right-3 sm:translate-x-0">
        <span className="whitespace-nowrap tabular-nums">
          🔦 {found.length}/{values.length} found ·{' '}
          <span className={total < 0 ? 'text-red-400' : 'text-amber-200'}>
            {total >= 0 ? '+' : ''}
            {total} messages
          </span>
        </span>
        <button
          type="button"
          onClick={() => finish(found)}
          className="rounded-full bg-white px-3 py-1 text-sm font-medium text-black"
        >
          Done
        </button>
      </div>
    </div>,
    document.body
  );
}
