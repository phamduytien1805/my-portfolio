'use client';

import { motion, type Variants } from 'framer-motion';
import { age, profile } from '@/lib/portfolio';
import Image from 'next/image';
import React, { type ReactNode } from 'react';

// `children` is the text beside the photo (the chat's /me reply streams the AI's own words in
// here, in a wrap-around layout); without it the card shows the profile and tags only.
export function Presentation({ children }: { children?: ReactNode } = {}) {
  // From the shared portfolio data (src/lib/portfolio.ts).
  const ageLabel = `${age()} years old`;

  // Animation variants for text elements
  const textVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: 'easeOut' },
    },
  };

  // Animation for the entire paragraph rather than word-by-word
  const paragraphAnimation: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: 'easeOut',
        delay: 0.2,
      },
    },
  };

  const photo = (
    <div className="relative h-full w-full overflow-hidden rounded-2xl">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
        className="h-full w-full"
      >
        <Image
          src={profile.photo}
          alt={profile.name}
          width={566}
          height={754}
          // Where a square crop sits: low enough to keep the person (standing in the lower
          // middle of the photo) in frame.
          className="h-full w-full object-cover object-[center_80%]"
        />
      </motion.div>
    </div>
  );

  const heading = (
    <motion.div initial="hidden" animate="visible" variants={textVariants}>
      <h1 className="from-foreground to-muted-foreground bg-gradient-to-r bg-clip-text text-xl font-semibold text-transparent md:text-3xl">
        {profile.name}
      </h1>
      <div className="mt-1 flex flex-col gap-1 md:flex-row md:items-center md:gap-4">
        <p className="text-muted-foreground">{ageLabel}</p>
        <div className="bg-border hidden h-1.5 w-1.5 rounded-full md:block" />
        <p className="text-muted-foreground">{profile.location}</p>
      </div>
    </motion.div>
  );

  const tags = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.6, duration: 0.5 }}
      className="mt-4 flex flex-wrap gap-2"
    >
      {profile.tags.map((tag) => (
        <span
          key={tag}
          className="bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-sm"
        >
          {tag}
        </span>
      ))}
    </motion.div>
  );

  // The chat's /me reply: the photo sits top-left and the text wraps beside it, then carries
  // on full width underneath (so a long reply doesn't leave an empty column under the photo).
  if (children !== undefined)
    return (
      <div className="mx-auto w-full max-w-5xl py-6 font-sans">
        <div className="flow-root">
          {/* Shown whole, in its own portrait shape. */}
          <div className="relative mx-auto mb-6 aspect-[3/4] w-full max-w-xs md:float-left md:mr-6 md:mb-3 md:w-[42%]">
            {photo}
          </div>
          {heading}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={paragraphAnimation}
            className="text-foreground mt-6 leading-relaxed"
          >
            {children}
          </motion.div>
        </div>
        {tags}
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-5xl py-6 font-sans">
      <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2">
        <div className="relative mx-auto aspect-square w-full max-w-sm">
          {photo}
        </div>
        <div className="space-y flex flex-col">
          {heading}
          {tags}
        </div>
      </div>
    </div>
  );
}

export default Presentation;
