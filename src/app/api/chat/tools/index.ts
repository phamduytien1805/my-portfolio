import {
  age,
  career,
  contactLinks,
  life,
  profile,
  skills,
} from '@/lib/portfolio';
import { tool } from 'ai';
import { z } from 'zod';

// The chat's tools, one per slash command (/me, /experience, /skills, /contact). Calling one
// shows its card in the chat, and the reply is written inside that card; each returns the
// facts to write it from. A slash command runs its tool directly (see ../route.ts).

const data = {
  me: () => ({
    name: profile.name,
    age: age(),
    location: profile.location,
    tags: profile.tags,
    shownOnCard: 'photo, name, age, location and tags',
  }),
  experience: () => ({ career }),
  skills: () => ({ skills }),
  else: () => ({
    activities: life.activities.map(({ title, kicker, text }) => ({
      title,
      kicker,
      text,
    })),
    skyPhotos: life.sky.caption,
  }),
  contact: () => {
    const links = contactLinks();
    return links.length
      ? { links, shownOnCard: 'every link above, as buttons' }
      : { links, note: 'No contact details are listed yet.' };
  },
};

export type PortfolioTool = keyof typeof data;
export const PORTFOLIO_TOOLS = Object.keys(data) as PortfolioTool[];
export const runPortfolioTool = (name: PortfolioTool) => data[name]();

const noArgs = z.object({});

export const tools = {
  me: tool({
    description:
      'Shows the "about me" card (photo, name, age, location, tags). Use it for "who are you?", "tell me about yourself" or similar. Then write a short personal intro; don\'t repeat what the card shows.',
    parameters: noArgs,
    execute: async () => data.me(),
  }),
  experience: tool({
    description:
      "Shows Tien's work experience as a timeline (companies, roles, products, tech). Use it for questions about experience, jobs, career or where Tien has worked. The timeline is the whole answer: don't write anything after it.",
    parameters: noArgs,
    execute: async () => data.experience(),
  }),
  skills: tool({
    description:
      "Shows Tien's skills grouped by area. Use it for questions about skills or tech stack. The list is the whole answer: don't write anything after it.",
    parameters: noArgs,
    execute: async () => data.skills(),
  }),
  else: tool({
    description:
      "Shows Tien's life outside work: weekly football, running, and his sky photos. Use it for questions about hobbies, free time or what he does for fun. The card is the whole answer: don't write anything after it.",
    parameters: noArgs,
    execute: async () => data.else(),
  }),
  contact: tool({
    description:
      "Shows how to reach Tien (email, links, location and local time). Use it when someone wants to get in touch, hire or contact Tien. The card is the whole answer: don't write anything after it.",
    parameters: noArgs,
    execute: async () => data.contact(),
  }),
};
