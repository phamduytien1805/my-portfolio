'use client';

import { useEscapeLayer } from '@/lib/escape-layer';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
} from 'framer-motion';
import { ArrowUpRight, Globe, Maximize2, Minimize2, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { AppListing } from '@/lib/portfolio';
import { AppPreview } from './AppPreview';

// `app`: shown as a store-style preview instead of the website (app stores can't be embedded).
export type Page = { url: string; title: string; app?: AppListing };

// How long the chat is open before pages start loading in the background.
const WARM_UP_DELAY_MS = 1500;

// Background pages wait here, invisible but loading, at the pane's usual size. They're never
// moved in the DOM (that would reload them): the pane positions the open one over itself.
const PARKED: React.CSSProperties = {
  position: 'fixed',
  left: 0,
  top: 0,
  width: 760,
  height: 720,
  border: 0,
  borderRadius: 12,
  background: '#fff',
  visibility: 'hidden',
  pointerEvents: 'none',
  zIndex: -1,
};

async function checkEmbeddable(url: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/embeddable?url=${encodeURIComponent(url)}`);
    // If the check itself fails, try showing the page anyway: only a site that explicitly
    // forbids it gets the "can't be shown" message.
    if (!res.ok) return true;
    const data: { embeddable?: boolean } = await res.json();
    return data.embeddable !== false;
  } catch {
    return true;
  }
}

function preloadImages(app: AppListing) {
  for (const src of [app.icon, ...app.screenshots]) new Image().src = src;
}

// Data saver on: don't load pages nobody asked for.
const saveData = () =>
  !!(navigator as Navigator & { connection?: { saveData?: boolean } })
    .connection?.saveData;

/** The split-view motion: the pane sliding in and the chat making room move together. */
export const SPLIT_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 34,
};

// Below this width there's no room for a split: the page covers the screen instead.
const SPLIT_MIN_VIEWPORT = 768;
const paneWidthFor = (viewport: number) =>
  Math.round(Math.min(860, Math.max(420, viewport * 0.52)));

// Opens a website next to the chat. Outside a WebviewProvider it falls back to a new tab.
const WebviewContext = createContext<(page: Page) => void>(({ url }) =>
  window.open(url, '_blank', 'noopener,noreferrer')
);
export const useWebview = () => useContext(WebviewContext);

function useViewportWidth() {
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth
  );
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

/**
 * Lets its children open websites in a pane on the right, like ChatGPT's canvas: the chat
 * makes room on the left (`onSplitChange` reports how much, to animate with
 * SPLIT_TRANSITION). On phones, or maximized, the page covers the whole window instead.
 * Closes when `enabled` turns false (the chat closing).
 */
export function WebviewProvider({
  enabled = true,
  preload = [],
  onSplitChange,
  children,
}: {
  enabled?: boolean;
  /** Pages to load in the background shortly after opening, so they show instantly. */
  preload?: Page[];
  onSplitChange?: (width: number) => void;
  children: ReactNode;
}) {
  const [opened, setPage] = useState<Page | null>(null);
  const [maximized, setMaximized] = useState(false);
  const page = enabled ? opened : null;
  const viewport = useViewportWidth();
  const split = viewport >= SPLIT_MIN_VIEWPORT && !maximized;
  const paneWidth = split ? paneWidthFor(viewport) : viewport;
  const squeeze = page && split ? paneWidth : 0;

  // Whether each site may be shown here (from /api/embeddable), and which have loaded.
  const [embeddable, setEmbeddable] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const checking = useRef(new Set<string>());
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const [warm, setWarm] = useState(false);

  const check = useCallback((url: string) => {
    if (checking.current.has(url)) return;
    checking.current.add(url);
    checkEmbeddable(url).then((ok) =>
      setEmbeddable((all) => ({ ...all, [url]: ok }))
    );
  }, []);

  // A moment after the chat opens, start loading the pages in the background.
  useEffect(() => {
    if (!enabled || warm || saveData()) return;
    const timer = window.setTimeout(() => setWarm(true), WARM_UP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, warm]);
  useEffect(() => {
    if (!warm) return;
    for (const p of preload) {
      if (p.app) preloadImages(p.app);
      else check(p.url);
    }
  }, [warm, preload, check]);
  // Opened before it was preloaded: start now.
  useEffect(() => {
    if (page && !page.app) check(page.url);
  }, [page, check]);

  // Pages kept loaded while the chat is open: the preloaded ones, plus whatever is open.
  const pooled = enabled
    ? [
        ...new Set([
          ...(warm ? preload.filter((p) => !p.app).map((p) => p.url) : []),
          ...(page && !page.app ? [page.url] : []),
        ]),
      ].filter((url) => embeddable[url])
    : [];

  // Puts a background page over the pane's frame area (`rect`), or parks it again (null).
  // Called every frame by the open pane, so the page follows it as it slides and resizes.
  const placeFrame = useCallback((url: string, rect: DOMRect | null) => {
    const frame = frames.current.get(url);
    if (!frame) return;
    const show = rect && loadedRef.current[url];
    Object.assign(
      frame.style,
      show
        ? {
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            visibility: 'visible',
            pointerEvents: 'auto',
            zIndex: '91',
          }
        : { visibility: 'hidden', pointerEvents: 'none', zIndex: '-1' }
    );
    frame.tabIndex = show ? 0 : -1;
  }, []);

  const open = useCallback((next: Page) => {
    setMaximized(false);
    setPage(next);
  }, []);
  useEffect(() => {
    if (!enabled) setPage(null);
  }, [enabled]);
  useEffect(() => {
    onSplitChange?.(squeeze);
  }, [squeeze, onSplitChange]);

  return (
    <WebviewContext.Provider value={open}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <>
            {pooled.map((url) => (
              <iframe
                key={url}
                ref={(el) => {
                  if (el) frames.current.set(url, el);
                  else frames.current.delete(url);
                }}
                src={url}
                title={preload.find((p) => p.url === url)?.title ?? url}
                tabIndex={-1}
                onLoad={() => setLoaded((all) => ({ ...all, [url]: true }))}
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                referrerPolicy="strict-origin-when-cross-origin"
                style={PARKED}
              />
            ))}
            <AnimatePresence>
              {page && (
                <WebviewPane
                  key={page.url}
                  page={page}
                  embeddable={page.app ? true : embeddable[page.url]}
                  loaded={!!loaded[page.url]}
                  placeFrame={placeFrame}
                  width={paneWidth}
                  maximized={maximized}
                  canMaximize={viewport >= SPLIT_MIN_VIEWPORT}
                  onToggleMaximize={() => setMaximized((m) => !m)}
                  onClose={() => setPage(null)}
                />
              )}
            </AnimatePresence>
          </>,
          document.body
        )}
    </WebviewContext.Provider>
  );
}

const iconButton =
  'grid size-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-600';

function WebviewPane({
  page,
  embeddable,
  loaded,
  placeFrame,
  width,
  maximized,
  canMaximize,
  onToggleMaximize,
  onClose,
}: {
  page: Page;
  /** undefined while still checking. */
  embeddable: boolean | undefined;
  loaded: boolean;
  placeFrame: (url: string, rect: DOMRect | null) => void;
  width: number;
  maximized: boolean;
  canMaximize: boolean;
  onToggleMaximize: () => void;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const frameAreaRef = useRef<HTMLDivElement>(null);
  const host = new URL(page.url).hostname.replace(/^www\./, '');
  const transition = reduceMotion ? { duration: 0 } : SPLIT_TRANSITION;

  useEscapeLayer(true, onClose);
  useEffect(() => closeRef.current?.focus({ preventScroll: true }), []);

  // Keep the (background-loaded) page over the frame area, every frame: it follows the pane
  // sliding in and out and any resize. Parked again when the pane goes.
  useEffect(() => {
    if (page.app) return;
    let raf = 0;
    const follow = () => {
      const area = frameAreaRef.current;
      placeFrame(page.url, area ? area.getBoundingClientRect() : null);
      raf = requestAnimationFrame(follow);
    };
    follow();
    return () => {
      cancelAnimationFrame(raf);
      placeFrame(page.url, null);
    };
  }, [page.url, page.app, placeFrame]);

  return (
    <motion.aside
      role="dialog"
      aria-label={`${page.title} (website preview)`}
      className="fixed inset-y-0 right-0 z-[90] flex flex-col border-l border-neutral-800 bg-[#0d0d0f]"
      initial={{ x: '100%', width }}
      animate={{ x: 0, width }}
      exit={{ x: '100%' }}
      transition={transition}
    >
      {/* Top bar: what's open on the left, actions on the right. */}
      <header className="flex items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2">
        <div
          className="flex min-w-0 items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 py-1.5 pr-3.5 pl-3"
          title={page.url}
        >
          <Globe className="text-muted-foreground size-3.5 shrink-0" />
          <span className="truncate text-sm">{page.title}</span>
          <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
            · {host}
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open in a new tab"
            title="Open in a new tab"
            className={iconButton}
          >
            <ArrowUpRight className="size-4" strokeWidth={1.75} />
          </a>
          {canMaximize && (
            <button
              type="button"
              onClick={onToggleMaximize}
              aria-label={maximized ? 'Back to split view' : 'Full window'}
              title={maximized ? 'Back to split view' : 'Full window'}
              className={iconButton}
            >
              {maximized ? (
                <Minimize2 className="size-4" strokeWidth={1.75} />
              ) : (
                <Maximize2 className="size-4" strokeWidth={1.75} />
              )}
            </button>
          )}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
            className={iconButton}
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {/* The page, in a rounded frame on the darker canvas. */}
      {/* The website itself is a background-loaded frame placed over this area. */}
      <div
        ref={frameAreaRef}
        className="relative mx-3 mb-3 min-h-0 flex-1 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900"
      >
        {page.app && <AppPreview app={page.app} />}

        {/* Loading: until the check answers and the page has loaded. */}
        <AnimatePresence>
          {!page.app && embeddable !== false && !loaded && (
            <motion.div
              className="absolute inset-0 grid place-items-center bg-neutral-900"
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
            >
              <p className="text-muted-foreground animate-pulse text-sm motion-reduce:animate-none">
                Loading {host}…
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {!page.app && embeddable === false && (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div className="max-w-xs">
              <p className="font-medium">{host} can&apos;t be shown here</p>
              <p className="text-muted-foreground mt-1 text-sm">
                The site doesn&apos;t allow being displayed inside other pages.
              </p>
              <a
                href={page.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white"
              >
                Open {host}
                <ArrowUpRight className="size-4" />
              </a>
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
