'use client';

import BlinkBuddy, { type BlinkBuddyRef } from '@/components/BlinkBuddy';
import ImessageChat, {
  IMESSAGE_LAYOUT,
  PILL_BUTTON_CLASS,
  PILL_CLASS,
  PILL_INPUT_CLASS,
  sharedTransition,
} from '@/components/imessage/ImessageChat';
import { useAvatarFlight } from '@/components/imessage/useAvatarFlight';
import InkIntro from '@/components/InkIntro';
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from 'framer-motion';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { trackEvent } from '@/lib/analytics';

/* ---------- scroll-reveal animations ---------- */
const revealContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const revealItem: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: 'easeOut' } },
};

// While the chat is open the URL ends in #chat, so a refresh reopens it and the browser's
// Back button closes it.
const CHAT_HASH = '#chat';

/* ---------- component ---------- */
export default function Home() {
  const [chatOpen, setChatOpen] = useState(false);
  // True while restoring the chat after a refresh: everything appears in place, no animation.
  const [restoring, setRestoring] = useState(false);
  const buddyRef = useRef<BlinkBuddyRef>(null);
  const avatarHomeRef = useRef<HTMLDivElement>(null);
  const avatarHeaderRef = useRef<HTMLDivElement>(null);
  const askRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  // The one live avatar: it sits in the home slot and flies into the chat header and back.
  const avatarHost = useAvatarFlight(
    chatOpen,
    avatarHomeRef,
    avatarHeaderRef,
    !!reduceMotion || restoring
  );

  // Scroll transition: the hero sinks back (drifts down, shrinks, fades)
  // while the chat section rises over it.
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 0.9]);
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);

  // Refreshed while in the chat: reopen it before the first paint, with the page scrolled to
  // the chat section underneath so closing it lands in the right place.
  useLayoutEffect(() => {
    // The pre-render cover from layout.tsx comes off in the same frame the chat appears.
    delete document.documentElement.dataset.chatRestore;
    if (window.location.hash !== CHAT_HASH) return;
    askRef.current?.scrollIntoView({ block: 'start' });
    setRestoring(true);
    setChatOpen(true);
    // Animations come back once it's on screen, so closing still flies home.
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setRestoring(false))
    );
    return () => cancelAnimationFrame(id);
  }, []);

  // Browser Back/Forward opens or closes the chat to match the URL.
  useEffect(() => {
    const onPop = () => setChatOpen(window.location.hash === CHAT_HASH);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openChat = () => {
    trackEvent('chat_opened');
    setChatOpen(true);
    if (window.location.hash !== CHAT_HASH)
      window.history.pushState({ chat: true }, '', CHAT_HASH);
  };
  const closeChat = useCallback(() => {
    setChatOpen(false);
    if (window.location.hash !== CHAT_HASH) return;
    // Opened from this page: step back, so Forward can reopen it. Arrived on #chat directly
    // (a link, or a fresh tab): just drop the hash.
    if (window.history.state?.chat) window.history.back();
    else
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search
      );
  }, []);
  // The avatar only talks in the chat: leaving it (back arrow, Esc or browser Back) cuts the
  // current line, and a reply that finishes after leaving isn't spoken on the landing page.
  const chatOpenRef = useRef(chatOpen);
  useEffect(() => {
    chatOpenRef.current = chatOpen;
    if (!chatOpen) buddyRef.current?.stop();
  }, [chatOpen]);
  const sayReply = useCallback((text: string) => {
    if (chatOpenRef.current) buddyRef.current?.say(text);
  }, []);
  // Out of AI messages: the avatar gets angry.
  const getAngry = useCallback(() => {
    if (chatOpenRef.current) buddyRef.current?.angry();
  }, []);

  const scrollToAsk = () =>
    askRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="relative flex w-full flex-col">
      {/* hero: ink greeting */}
      <div ref={heroRef}>
        <motion.div
          style={
            reduceMotion
              ? undefined
              : { opacity: heroOpacity, scale: heroScale, y: heroY }
          }
          className="will-change-transform"
        >
          <InkIntro onScrollDown={scrollToAsk} />
        </motion.div>
      </div>

      {/* chat entry, slides up over the hero */}
      <section
        ref={askRef}
        id="ask"
        className="bg-background relative z-10 flex min-h-svh flex-col items-center justify-center px-4 py-20"
      >
        <div
          aria-hidden
          // Blends into the hero; kept short so it doesn't dim the hero's "Ask me anything" pill.
          className="to-background pointer-events-none absolute inset-x-0 -top-16 h-16 bg-linear-to-b from-transparent"
        />
        <motion.div
          variants={revealContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="flex w-full flex-col items-center"
        >
          <motion.h2
            variants={revealItem}
            className="text-center text-3xl font-bold sm:text-4xl md:text-5xl"
          >
            Ask me anything
          </motion.h2>
          <motion.p
            variants={revealItem}
            className="text-muted-foreground mt-3 text-center text-base md:text-lg"
          >
            A little about who I am, what I’ve built, what I’ve learned, and
            where I’m headed.
          </motion.p>

          {/* 3D avatar: follows the cursor, blinks, reacts to clicks. The avatar itself is
              portaled into a host that moves between this slot and the chat header. */}
          <motion.div variants={revealItem} className="my-2 size-72 sm:size-80">
            <div ref={avatarHomeRef} className="size-full" />
          </motion.div>

          {/* Question box: focusing it opens the iMessage chat, and the box slides down to
              become the chat's input bar (focus moves straight to it, so typing never waits). */}
          <motion.div
            variants={revealItem}
            className="h-[62px] w-full max-w-lg"
          >
            {!chatOpen && (
              <motion.div
                layoutId={IMESSAGE_LAYOUT.input}
                transition={sharedTransition}
                className={PILL_CLASS}
                style={{ borderRadius: 9999 }}
              >
                <input
                  type="text"
                  onFocus={openChat}
                  placeholder="Ask me anything…"
                  aria-label="Ask me anything (opens the chat)"
                  className={`${PILL_INPUT_CLASS} cursor-text`}
                />
                <span aria-hidden="true" className={PILL_BUTTON_CLASS}>
                  <ArrowRight className="h-5 w-5" />
                </span>
              </motion.div>
            )}
          </motion.div>

          {/* Privacy, in one quiet line. Accurate on purpose: the chat lives in this tab's
              sessionStorage and the server keeps nothing (messages only pass through to the AI). */}
          <motion.p
            variants={revealItem}
            className="text-muted-foreground/80 mt-4 flex items-center gap-1.5 text-center text-xs"
          >
            <LockKeyhole
              className="size-3 shrink-0"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Your chat stays in this tab. Nothing is saved on my side.
          </motion.p>
        </motion.div>
      </section>

      <ImessageChat
        open={chatOpen}
        onClose={closeChat}
        onReply={sayReply}
        onLimit={getAngry}
        avatarSlotRef={avatarHeaderRef}
        instant={restoring}
      />
      {avatarHost &&
        createPortal(
          <BlinkBuddy
            ref={buddyRef}
            compact={chatOpen}
            className="size-full"
          />,
          avatarHost
        )}
    </div>
  );
}
