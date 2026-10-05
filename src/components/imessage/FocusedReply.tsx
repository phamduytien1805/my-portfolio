'use client';

import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useReducedMotion,
  useScroll,
  useTransform,
  type Transition,
} from 'framer-motion';
import { Maximize2, Minimize2 } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useEscapeLayer } from '@/lib/escape-layer';

const CARD_RADIUS = 24; // rounded-3xl, set inline so framer keeps it round while morphing
const ZOOM: Transition = { type: 'spring', stiffness: 320, damping: 34 };

// Small and quiet: a faint glass circle (still readable over a photo), brighter on hover.
const iconButton =
  'absolute top-3 right-3 z-10 grid size-7 place-items-center rounded-full bg-neutral-900/40 text-neutral-400 backdrop-blur-sm transition duration-200 hover:bg-neutral-800/80 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';
// In the chat it only shows on hover (or keyboard focus); touch screens have no hover, so
// there it stays faintly visible.
const revealOnHover =
  '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100';

/**
 * A reply to a focused slash command, part of the normal chat scroll.
 *
 * While it's the latest message (`live`) it gets the whole view to itself (`fillHeight`), and
 * it's tied to the scroll: as you scroll up into the chat history it slides down and away,
 * fading and blurring out; scrolling back down brings it back sharp. Because it reserves the
 * whole view, the end of the chat is exactly the reply at the top: no snapping needed.
 *
 * Its expand button zooms the card into a large panel over a blurred chat.
 */
export function FocusedReply({
  live,
  fillHeight,
  scrollRef,
  children,
}: {
  live: boolean;
  /** Height of the chat's visible area: the live reply reserves it so nothing else shows. */
  fillHeight: number;
  scrollRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const layoutId = useId();
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  // While expanded, the card's spot in the chat keeps its height so nothing moves.
  const [placeholderHeight, setPlaceholderHeight] = useState(0);

  // 0 = its top is at the bottom of the view (scrolled away), 1 = at the top (in focus).
  const { scrollYProgress } = useScroll({
    container: scrollRef,
    target: ref,
    offset: ['start end', 'start start'],
  });
  const opacity = useTransform(scrollYProgress, [0.3, 0.85], [0, 1]);
  const blur = useTransform(scrollYProgress, [0.3, 0.85], [12, 0]);
  const filter = useMotionTemplate`blur(${blur}px)`;
  const scrollLinked = live && !reduceMotion;
  const zoom = reduceMotion ? { duration: 0 } : ZOOM;

  const expand = () => {
    setPlaceholderHeight(cardRef.current?.offsetHeight ?? 0);
    setExpanded(true);
  };
  const collapse = () => setExpanded(false);
  // Back in the chat, keyboard focus returns to the expand button (once it's there again).
  const wasExpanded = useRef(false);
  useEffect(() => {
    if (expanded) wasExpanded.current = true;
    else if (wasExpanded.current) {
      wasExpanded.current = false;
      expandButtonRef.current?.focus({ preventScroll: true });
    }
  }, [expanded]);

  return (
    <motion.div
      ref={ref}
      data-live-focus={live || undefined}
      className={live ? 'scroll-mt-3' : undefined}
      style={{
        minHeight: live ? fillHeight : undefined,
        ...(scrollLinked ? { opacity, filter } : {}),
      }}
    >
      {expanded ? (
        <div aria-hidden="true" style={{ height: placeholderHeight }} />
      ) : (
        <motion.div
          ref={cardRef}
          layoutId={layoutId}
          transition={zoom}
          style={{ borderRadius: CARD_RADIUS }}
          className="bg-card group relative overflow-hidden border border-neutral-700 px-5"
        >
          <button
            ref={expandButtonRef}
            type="button"
            onClick={expand}
            aria-label="Expand"
            title="Expand"
            className={`${iconButton} ${revealOnHover}`}
          >
            <Maximize2 className="size-3.5" strokeWidth={1.75} />
          </button>
          <motion.div layout="position" transition={zoom}>
            {children}
          </motion.div>
        </motion.div>
      )}

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {expanded && (
              <ExpandedCard
                key="expanded"
                layoutId={layoutId}
                transition={zoom}
                onClose={collapse}
              >
                {children}
              </ExpandedCard>
            )}
          </AnimatePresence>,
          document.body
        )}
    </motion.div>
  );
}

/** The zoomed-in card: centred, as large as the window allows, over a blurred backdrop. */
function ExpandedCard({
  layoutId,
  transition,
  onClose,
  children,
}: {
  layoutId: string;
  transition: Transition;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Esc closes this panel only (not the chat underneath, which also listens for Esc).
  useEscapeLayer(true, onClose);
  useEffect(() => closeRef.current?.focus({ preventScroll: true }), []);

  return (
    <>
      {/* Dims and blurs everything behind, so only the card is in focus. */}
      <motion.div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      />
      <div className="pointer-events-none fixed inset-0 z-[81] flex items-center justify-center p-4 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)] sm:p-8">
        <motion.div
          layoutId={layoutId}
          transition={transition}
          role="dialog"
          aria-modal="true"
          aria-label="Expanded reply"
          style={{ borderRadius: CARD_RADIUS }}
          className="bg-card pointer-events-auto relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden border border-neutral-700 shadow-2xl"
        >
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Collapse"
            title="Collapse (Esc)"
            className={iconButton}
          >
            <Minimize2 className="size-3.5" strokeWidth={1.75} />
          </button>
          <motion.div
            layout="position"
            layoutScroll
            transition={transition}
            className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 md:px-10"
          >
            {children}
          </motion.div>
        </motion.div>
      </div>
    </>
  );
}
