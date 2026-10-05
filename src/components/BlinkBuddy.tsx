'use client';

import { startBlinkBuddy, type BlinkBuddyHandle } from '@/lib/blink-buddy';
import { cn } from '@/lib/utils';
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';

export interface BlinkBuddyRef {
  /** Make the avatar say a line (the mouth moves with it; `voice` also reads it aloud). */
  say: (text: string, voice?: boolean) => void;
  /** Stop talking right away. */
  stop: () => void;
  /** Get angry for a few seconds. */
  angry: () => void;
}

/**
 * The 3D avatar: follows the cursor, blinks, reacts to clicks, and can talk.
 * `compact` is for small spots (like the chat header photo): no speech bubble or Z's.
 */
export default function BlinkBuddy({
  className,
  compact = false,
  ref,
}: {
  className?: string;
  compact?: boolean;
  ref?: Ref<BlinkBuddyRef>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const zzzRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<BlinkBuddyHandle | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const bubble = bubbleRef.current;
    const zzz = zzzRef.current;
    if (!container || !canvas || !bubble || !zzz) return;

    const handle = startBlinkBuddy(
      { container, canvas, bubble, zzz },
      {
        onReady: () => setStatus('ready'),
        onError: () => setStatus('error'),
      }
    );
    if (!handle) setStatus('error');
    handleRef.current = handle;
    return () => {
      handle?.destroy();
      handleRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    say: (text, voice) => handleRef.current?.say(text, voice),
    stop: () => handleRef.current?.stop(),
    angry: () => handleRef.current?.angry(),
  }));

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Soft glow behind the head, so it stands out from the dark page. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_48%,color-mix(in_oklab,var(--foreground)_14%,transparent)_0%,color-mix(in_oklab,var(--foreground)_6%,transparent)_38%,transparent_68%)]"
      />
      <canvas
        ref={canvasRef}
        aria-label="3D avatar of Tien that follows your cursor. Click the face or the nose."
        className={cn(
          'absolute inset-0 block size-full cursor-pointer transition-opacity duration-500',
          status === 'ready' ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* Speech bubble, positioned by the engine next to the head. */}
      <div
        ref={bubbleRef}
        role="status"
        aria-live="polite"
        data-show="false"
        className={cn(
          'bg-foreground text-background pointer-events-none absolute z-20 max-w-48 translate-y-1.5 scale-90 rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm leading-snug font-medium opacity-0 transition duration-200 data-[show=true]:translate-y-0 data-[show=true]:scale-100 data-[show=true]:opacity-100 motion-reduce:transition-none',
          compact && 'invisible'
        )}
      />

      {/* "z z Z" while napping. */}
      <div
        ref={zzzRef}
        hidden
        aria-hidden="true"
        className={cn(
          'text-muted-foreground pointer-events-none absolute z-20 font-semibold',
          compact && 'invisible'
        )}
      >
        <span className="absolute bottom-0 left-0 animate-[buddy-zz_2.4s_linear_infinite] text-lg opacity-0">
          z
        </span>
        <span className="absolute bottom-0 left-0 animate-[buddy-zz_2.4s_linear_0.8s_infinite] text-2xl opacity-0">
          z
        </span>
        <span className="absolute bottom-0 left-0 animate-[buddy-zz_2.4s_linear_1.6s_infinite] text-3xl opacity-0">
          Z
        </span>
      </div>

      {status === 'error' && (
        <p className="text-muted-foreground absolute inset-0 grid place-items-center text-center text-sm">
          The 3D avatar needs WebGL to show.
        </p>
      )}
    </div>
  );
}
