'use client';

import { useWebview } from '@/components/webview/WebviewPanel';
import {
  career,
  contact,
  life,
  profile,
  skills,
  type Role,
} from '@/lib/portfolio';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Heart,
  PanelRight,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

// Cards for the chat's tools (/experience, /skills, /contact; /me is the Presentation card).
// The AI's reply (`children`) comes first, then the facts the card shows.

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: 'easeOut' as const, delay },
});

function Reply({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <motion.div {...fadeUp()} className="text-foreground mb-6 leading-relaxed">
      {children}
    </motion.div>
  );
}

function Title({ children }: { children: ReactNode }) {
  return (
    <h2 className="from-foreground to-muted-foreground mb-4 bg-gradient-to-r bg-clip-text text-xl font-semibold text-transparent">
      {children}
    </h2>
  );
}

const chip =
  'rounded-full border border-neutral-700 bg-neutral-800/70 px-2.5 py-0.5 text-xs text-neutral-300';

// The product name; with a link, it opens the product's website in the side panel.
function Product({ role }: { role: Role }) {
  const openWebsite = useWebview();
  if (!role.link)
    return <p className="text-muted-foreground text-sm">{role.product}</p>;
  return (
    <button
      type="button"
      onClick={() =>
        openWebsite({ url: role.link!, title: role.product, app: role.app })
      }
      title={`Open ${role.product}`}
      className="text-muted-foreground group/product inline-flex items-center gap-1.5 text-left text-sm underline decoration-neutral-600 decoration-dotted underline-offset-4 transition-colors hover:text-white hover:decoration-neutral-300 focus-visible:outline-2 focus-visible:outline-blue-600"
    >
      {role.product}
      <PanelRight
        aria-hidden="true"
        className="size-3.5 opacity-60 transition-opacity group-hover/product:opacity-100"
        strokeWidth={1.75}
      />
    </button>
  );
}

export function ExperienceCard({ children }: { children?: ReactNode }) {
  return (
    <div className="py-6">
      <Reply>{children}</Reply>
      <Title>Experience</Title>
      <ol className="relative border-l border-neutral-700 pl-5">
        {career.map((role, i) => (
          <motion.li
            key={role.company}
            {...fadeUp(0.1 + i * 0.08)}
            className="relative pb-6 last:pb-0"
          >
            <span
              aria-hidden="true"
              className="bg-background absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-blue-500"
            />
            <p className="font-semibold">
              {role.company}
              <span className="text-muted-foreground font-normal">
                {' · '}
                {role.title}
              </span>
            </p>
            <Product role={role} />
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-sm text-neutral-300">
              {role.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {role.tech.map((t) => (
                <span key={t} className={chip}>
                  {t}
                </span>
              ))}
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

const canHover = () => window.matchMedia('(hover: hover)').matches;

const pill =
  'shrink-0 whitespace-nowrap rounded-full border border-neutral-800 bg-neutral-900/70 px-3 py-1 text-sm text-neutral-200';

// One row per area. The skills drift sideways in a loop (rows alternate direction); hovering
// the card (or tapping it on touch screens) stops them and opens every row up in full.
export function SkillsCard({ children }: { children?: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const [opened, setOpened] = useState(false);
  const showAll = opened || !!reduceMotion;

  return (
    <div
      className="py-6"
      // Hover only with a real mouse on a device that hovers (phones fire mouse-like
      // events around a tap).
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse' && canHover()) setOpened(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse' && canHover()) setOpened(false);
      }}
      onFocus={() => setOpened(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpened(false);
      }}
      // Touch screens have no hover: a tap opens and closes it.
      onPointerUp={(e) => {
        if (e.pointerType !== 'mouse') setOpened((o) => !o);
      }}
    >
      <Reply>{children}</Reply>
      {/* The hint sits by the title (the card's top-right corner has the expand button). */}
      <div className="flex items-baseline gap-3">
        <Title>Skills</Title>
        {!reduceMotion && (
          <span className="text-muted-foreground text-xs">
            <span className="hidden [@media(hover:hover)]:inline">
              {showAll ? 'all of it' : 'hover to see all'}
            </span>
            <span className="[@media(hover:hover)]:hidden">
              {showAll ? 'tap to close' : 'tap to see all'}
            </span>
          </span>
        )}
      </div>
      <dl
        tabIndex={0}
        aria-label="Skills"
        className="divide-y divide-neutral-800 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
      >
        {skills.map((group, i) => (
          <motion.div
            key={group.group}
            {...fadeUp(0.05 + i * 0.06)}
            className="grid gap-2 py-3.5 first:pt-0 last:pb-0 sm:grid-cols-[9rem_1fr] sm:gap-6"
          >
            <dt className="text-muted-foreground text-sm sm:pt-1.5">
              {group.group}
            </dt>
            <dd className="relative min-w-0">
              {/* Drifting: two copies back to back, shifted by one copy's width (a seamless
                  loop). Fades out, holding still, when the full list opens. */}
              <div
                aria-hidden="true"
                className={cn(
                  'absolute inset-x-0 top-0 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] transition-opacity duration-300',
                  showAll ? 'pointer-events-none opacity-0' : 'opacity-100'
                )}
              >
                <div
                  className="flex w-max animate-[skills-drift_linear_infinite] gap-2 pr-2"
                  style={{
                    animationDuration: `${group.items.length * 3.5}s`,
                    animationDirection: i % 2 ? 'reverse' : 'normal',
                    animationPlayState: showAll ? 'paused' : 'running',
                  }}
                >
                  {[...group.items, ...group.items].map((skill, j) => (
                    <span key={j} className={pill}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
              {/* The full list: grows from one line to its full height (grid rows 0fr → 1fr
                  animates an "auto" height), skills fading in one after another. */}
              <div
                className={cn(
                  'grid min-h-[30px] transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  showAll ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="flex flex-wrap gap-2">
                    {group.items.map((skill, j) => (
                      <span
                        key={skill}
                        className={cn(
                          pill,
                          'transition duration-300',
                          showAll
                            ? 'translate-y-0 opacity-100'
                            : 'translate-y-1 opacity-0'
                        )}
                        style={{
                          transitionDelay: showAll ? `${80 + j * 25}ms` : '0ms',
                        }}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </dd>
          </motion.div>
        ))}
      </dl>
    </div>
  );
}

// Tien's local time, ticking every second while the card is open.
const clockTime = (timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone,
  }).format(new Date());
function useLocalTime(timeZone: string) {
  const [time, setTime] = useState(() => clockTime(timeZone));
  useEffect(() => {
    // Tick right as each real second starts, so it never lags or skips a second.
    let timer = 0;
    const tick = () => {
      setTime(clockTime(timeZone));
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [timeZone]);
  return time;
}

function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // No clipboard access: the address is right there to select.
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : 'Copy email address'}
      title={copied ? 'Copied' : 'Copy'}
      className="grid size-10 shrink-0 place-items-center rounded-lg border border-neutral-700 text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-600"
    >
      {copied ? (
        <Check className="size-4" strokeWidth={1.75} />
      ) : (
        <Copy className="size-4" strokeWidth={1.75} />
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Email address copied' : ''}
      </span>
    </button>
  );
}

// "Let's talk": a headline, the email (with copy), and where/when Tien is plus the links.
export function ContactCard({ children }: { children?: ReactNode }) {
  const time = useLocalTime(contact.timeZone);
  const links = contact.links.filter((link) => link.url);
  return (
    // Extra room on top: the card's corner has the expand button.
    <div className="pt-12 pb-8">
      <Reply>{children}</Reply>
      <div className="grid gap-10 sm:grid-cols-[1fr_auto] sm:gap-8">
        <motion.div {...fadeUp()}>
          <p className="text-muted-foreground text-xs">Get in touch</p>
          <h2 className="mt-4 text-[2.1rem] leading-[1.05] font-semibold tracking-tight md:text-[2.5rem]">
            {/* Two lines, each kept whole: the grey half never splits mid-phrase. */}
            Got an idea?{' '}
            <span className="block text-neutral-500">Let&apos;s build it.</span>
          </h2>
          <p className="text-muted-foreground mt-5 max-w-sm text-sm leading-relaxed">
            Drop me a message. Let’s build the simple solution, not another
            complicated one.
          </p>
          {contact.email && (
            <div className="mt-6 flex items-center gap-3">
              <a
                href={`mailto:${contact.email}`}
                className="group/email flex min-w-0 items-center gap-6 border-b border-neutral-600 pb-2 transition-colors hover:border-neutral-300"
              >
                <span className="truncate text-lg">{contact.email}</span>
                <ArrowUpRight
                  className="size-4 shrink-0 transition-transform group-hover/email:translate-x-0.5 group-hover/email:-translate-y-0.5"
                  strokeWidth={1.75}
                />
              </a>
              <CopyEmail email={contact.email} />
            </div>
          )}
        </motion.div>

        <motion.div
          {...fadeUp(0.12)}
          className="flex flex-col justify-between gap-8 sm:min-w-44"
        >
          <p className="text-muted-foreground font-mono text-xs leading-6">
            {contact.location}
            <br />
            <span className="tabular-nums">{time}</span> local time
          </p>
          {links.length > 0 && (
            <ul className="space-y-2.5 text-sm">
              {links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group/link flex items-center justify-between gap-8 text-neutral-200 transition-colors hover:text-white"
                  >
                    {link.label}
                    <ArrowUpRight
                      className="text-muted-foreground size-3.5 transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
                      strokeWidth={1.75}
                    />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      </div>
    </div>
  );
}

// Sky photos as an Instagram-style carousel: swipe or use the arrows, dots underneath.
function SkyCarousel() {
  const { photos, caption } = life.sky;
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState(false);

  const go = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.max(0, Math.min(photos.length - 1, i));
    track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
  };
  const onScroll = () => {
    const track = trackRef.current;
    if (track) setIndex(Math.round(track.scrollLeft / track.clientWidth));
  };

  return (
    <article className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-neutral-800 bg-black">
      {/* Post header */}
      <header className="flex items-center gap-3 px-3 py-2.5">
        <span className="rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[2px]">
          <Image
            src={profile.photo}
            alt=""
            width={32}
            height={32}
            className="size-8 rounded-full border-2 border-black object-cover object-[center_30%]"
          />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold">tien.sky</p>
          <p className="text-muted-foreground text-xs">{profile.location}</p>
        </div>
      </header>

      {/* Photos */}
      <div className="group/carousel relative">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="no-scrollbar flex aspect-[4/5] snap-x snap-mandatory overflow-x-auto"
          aria-roledescription="carousel"
          aria-label="Sky photos"
        >
          {photos.map((photo, i) => (
            <Image
              key={photo.src}
              src={photo.src}
              alt={photo.alt}
              width={1080}
              height={1350}
              loading={i === 0 ? 'eager' : 'lazy'}
              onDoubleClick={() => setLiked(true)}
              className="h-full w-full shrink-0 snap-center object-cover"
            />
          ))}
        </div>
        <span className="absolute top-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-xs tabular-nums backdrop-blur">
          {index + 1}/{photos.length}
        </span>
        {index > 0 && (
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => go(index - 1)}
            className="absolute top-1/2 left-2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black opacity-0 shadow transition-opacity group-hover/carousel:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:hidden"
          >
            <ChevronLeft className="size-4" />
          </button>
        )}
        {index < photos.length - 1 && (
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => go(index + 1)}
            className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black opacity-0 shadow transition-opacity group-hover/carousel:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:hidden"
          >
            <ChevronRight className="size-4" />
          </button>
        )}
      </div>

      {/* Actions, dots, caption */}
      <div className="px-3 pt-2.5 pb-3">
        <div className="relative flex items-center">
          <button
            type="button"
            aria-label={liked ? 'Unlike' : 'Like'}
            onClick={() => setLiked((l) => !l)}
            className="transition-transform active:scale-90"
          >
            <Heart
              className={
                liked ? 'size-6 fill-red-500 text-red-500' : 'size-6 text-white'
              }
              strokeWidth={1.75}
            />
          </button>
          <div className="absolute left-1/2 flex -translate-x-1/2 gap-1">
            {photos.map((photo, i) => (
              <button
                key={photo.src}
                type="button"
                aria-label={`Photo ${i + 1}`}
                onClick={() => go(i)}
                className={`size-1.5 rounded-full transition-colors ${i === index ? 'bg-blue-500' : 'bg-neutral-600'}`}
              />
            ))}
          </div>
        </div>
        <p className="mt-2 text-sm leading-relaxed">
          <span className="mr-1.5 font-semibold">tien.sky</span>
          {caption}
        </p>
      </div>
    </article>
  );
}

// "/else": life outside work. Activities with their picture beside the text (alternating
// sides), then the sky photos as a carousel.
export function ElseCard({ children }: { children?: ReactNode }) {
  return (
    <div className="py-8">
      <Reply>{children}</Reply>
      <p className="text-muted-foreground text-xs">Off the clock</p>
      <h2 className="mt-3 text-[1.9rem] leading-[1.05] font-semibold tracking-tight md:text-[2.2rem]">
        When I&apos;m not coding
        <span className="block text-neutral-500">
          you&apos;ll find me here.
        </span>
      </h2>

      <div className="mt-8 space-y-8">
        {life.activities.map((activity, i) => (
          <motion.section
            key={activity.title}
            {...fadeUp(0.08 + i * 0.08)}
            className={`flex flex-col gap-5 sm:items-center sm:gap-6 ${i % 2 ? 'sm:flex-row-reverse' : 'sm:flex-row'}`}
          >
            <Image
              src={activity.image}
              alt={activity.alt}
              width={600}
              height={450}
              className="aspect-[4/3] w-full rounded-2xl border border-neutral-800 object-cover sm:w-[46%]"
            />
            <div className="sm:flex-1">
              <p className="text-muted-foreground text-xs">{activity.kicker}</p>
              <h3 className="mt-1 text-xl font-semibold">{activity.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-neutral-300">
                {activity.text}
              </p>
            </div>
          </motion.section>
        ))}

        <motion.section {...fadeUp(0.24)}>
          <p className="text-muted-foreground text-xs">
            Can&apos;t stop looking up
          </p>
          <h3 className="mt-1 mb-4 text-xl font-semibold">Sky photos</h3>
          <SkyCarousel />
        </motion.section>
      </div>
    </div>
  );
}
