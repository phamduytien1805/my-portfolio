'use client';

import type { AppListing } from '@/lib/portfolio';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import Image from 'next/image';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: 'easeOut' as const, delay },
});

const STORE_LABELS = { appStore: 'App Store', googlePlay: 'Google Play' };

/** A store-style page for an app (app stores can't be shown inside other sites). */
export function AppPreview({ app }: { app: AppListing }) {
  const stores = (
    Object.entries(app.stores) as [keyof typeof STORE_LABELS, string][]
  ).filter(([, url]) => url);

  return (
    <div className="no-scrollbar absolute inset-0 overflow-y-auto px-6 py-8 md:px-10">
      <div className="mx-auto max-w-2xl">
        {/* Icon, name, who makes it, and where to get it. */}
        <motion.header {...fadeUp()} className="flex items-center gap-5">
          <Image
            src={app.icon}
            alt=""
            width={96}
            unoptimized // the files preloaded with the chat (already small)
            height={96}
            className="size-20 shrink-0 rounded-[22%] border border-neutral-800 bg-white md:size-24"
          />
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold">{app.name}</h2>
            <p className="text-muted-foreground text-sm">
              {app.developer} · {app.category}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {stores.map(([store, url], i) => (
                <a
                  key={store}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={
                    i === 0
                      ? 'inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-black transition-opacity hover:opacity-90'
                      : 'inline-flex items-center gap-1.5 rounded-full border border-neutral-700 px-3.5 py-1.5 text-sm text-neutral-200 transition-colors hover:border-neutral-500'
                  }
                >
                  {STORE_LABELS[store]}
                  <ArrowUpRight className="size-3.5" />
                </a>
              ))}
            </div>
          </div>
        </motion.header>

        {/* Screenshots, scrolling sideways. */}
        <motion.div
          {...fadeUp(0.1)}
          // Scroll padding keeps the first screenshot in line with the text when snapping.
          className="no-scrollbar -mx-6 mt-8 flex snap-x snap-mandatory scroll-px-6 gap-3 overflow-x-auto px-6 md:-mx-10 md:scroll-px-10 md:px-10"
        >
          {app.screenshots.map((src, i) => (
            <Image
              key={src}
              src={src}
              alt={`${app.name} screenshot ${i + 1}`}
              width={392}
              unoptimized
              height={696}
              className="h-80 w-auto shrink-0 snap-start rounded-2xl border border-neutral-800 md:h-96"
            />
          ))}
        </motion.div>

        <motion.section {...fadeUp(0.2)} className="mt-8">
          <p className="leading-relaxed text-neutral-200">{app.summary}</p>
          <ul className="mt-4 space-y-2 text-sm text-neutral-300">
            {app.features.map((feature) => (
              <li key={feature} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-2 size-1 shrink-0 rounded-full bg-blue-500"
                />
                {feature}
              </li>
            ))}
          </ul>
        </motion.section>
      </div>
    </div>
  );
}
