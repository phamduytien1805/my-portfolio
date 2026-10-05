'use client';

import {
  ContactCard,
  ElseCard,
  ExperienceCard,
  SkillsCard,
} from '@/components/portfolio-cards';
import { Presentation } from '@/components/presentation';
import {
  SPLIT_TRANSITION,
  WebviewProvider,
  type Page,
} from '@/components/webview/WebviewPanel';
import { career } from '@/lib/portfolio';

// The product pages from the experience timeline: loaded in the background once the chat is
// open, so clicking one shows it straight away.
const PRODUCT_PAGES: Page[] = career
  .filter((role) => role.link)
  .map((role) => ({ url: role.link!, title: role.product, app: role.app }));
import { FlashlightGame } from './FlashlightGame';
import { FocusedReply } from './FocusedReply';
import { cn } from '@/lib/utils';
import { useChat } from '@ai-sdk/react';
import { generateId, type Message } from 'ai';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
} from 'framer-motion';
import { ArrowLeft, ArrowRight, Flashlight } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

// Shared-element id: the home page's question box morphs into the chat's input bar. (The
// avatar flies separately, see useAvatarFlight.)
export const IMESSAGE_LAYOUT = {
  input: 'chat-input',
} as const;

// Smooth ease-out for the open/close transition.
const EASE = [0.32, 0.72, 0, 1] as const;
export const sharedTransition: Transition = {
  type: 'tween',
  ease: EASE,
  duration: 0.5,
};

// The question pill: the same look on the home page and in the chat, so it doesn't change
// while it travels between them.
export const PILL_CLASS =
  'flex items-center border border-neutral-700 bg-neutral-800 py-2.5 pr-2 pl-6 transition-colors hover:border-neutral-600 focus-within:border-neutral-500';
export const PILL_INPUT_CLASS =
  'min-w-0 flex-1 border-none bg-transparent text-base text-neutral-200 placeholder:text-neutral-500 focus:outline-none';
export const PILL_BUTTON_CLASS =
  'flex shrink-0 items-center justify-center rounded-full bg-blue-600 p-2.5 text-white transition-opacity';

const GREETING =
  'Hey, I’m Tien 👋\nI build things, break things, learn from them, and keep figuring out what’s next.\n\nWant to know what I’ve worked on, what I’m good at, or how I got here? Ask away — or pick a quick action below and explore.';
const GREETING_MESSAGES: Message[] = [
  {
    id: 'greeting',
    role: 'assistant',
    content: GREETING,
    parts: [{ type: 'text', text: GREETING }],
  },
];

// Slash commands above the input, one per AI tool (same names, see api/chat/tools): a tap asks
// the question behind it and runs that tool. Typing "/" filters them.
const QUICK_ACTIONS = [
  { command: '/me', prompt: 'Tell me about yourself.' },
  {
    command: '/experience',
    prompt: 'Walk me through your work experience.',
  },
  { command: '/skills', prompt: "What's your tech stack and skills?" },
  { command: '/contact', prompt: 'How can I get in touch with you?' },
  { command: '/else', prompt: 'What do you do outside of work?' },
] as const;

const QUICK_ACTIONS_KEY = 'tien-chat-quick-actions';
const QUICK_ACTIONS_SHOWN = { opacity: 1, y: 0, filter: 'blur(0px)' };
const QUICK_ACTIONS_HIDDEN = { opacity: 0, y: 8, filter: 'blur(8px)' };

type Command = (typeof QUICK_ACTIONS)[number]['command'] extends `/${infer C}`
  ? C
  : never;

// A command's message id carries the command ("cmd:me:…"), so its reply can be recognised,
// also after a refresh.
const commandId = (command: Command) => `cmd:${command}:${generateId()}`;
const commandOf = (m: Message) =>
  m.id.startsWith('cmd:') ? (m.id.split(':')[1] as Command) : undefined;

// Common ways of asking for one of the tools (English and Vietnamese, typos like "your self"
// included). They're sent just like the slash command, so the card always shows: leaving it
// to the AI to call the tool works most of the time, not every time.
const INTENTS: [Command, RegExp][] = [
  [
    'me',
    /\b(tell me (a bit |more |a little )?about (your ?self|you)|who are you|introduce (your ?self|you)|about your ?self)\b|giới thiệu (về )?(bản thân|bạn)|bạn là ai/i,
  ],
  [
    'experience',
    /\b(work(ing)? experience|where (have|did|do) you work(ed)?|your (career|jobs?|work history)|walk me through your (career|experience))\b|\byour experience\s*[?.!]*$|kinh nghiệm làm việc|làm (việc )?ở đâu/i,
  ],
  [
    'skills',
    /\b(your (tech )?(skills|stack)|tech stack|what are you good at|what technologies do you)\b|kỹ năng|bạn giỏi (gì|cái gì)/i,
  ],
  [
    'contact',
    /\b(contact you|get in touch|reach you|how (can|do) i (contact|reach|hire)|your (email|linkedin|github))\b|liên hệ|liên lạc/i,
  ],
  [
    'else',
    /\b(outside (of )?work|for fun|your hobb(y|ies)|free time|spare time|what do you (do|like) (when|after|outside))\b|sở thích|thời gian rảnh/i,
  ],
];
const intentOf = (text: string) =>
  INTENTS.find(([, pattern]) => pattern.test(text))?.[0];

// The card for each tool, with the AI's reply inside. A reply gets its card when the AI called
// that tool, or when it answers that slash command.
const reply = (text: string) => (text ? <BubbleMarkdown text={text} /> : null);
const FOCUSED_REPLIES: Record<
  Command,
  (props: { text: string }) => React.ReactNode
> = {
  me: ({ text }) => <Presentation>{reply(text)}</Presentation>,
  // Static: the timeline is the whole answer (no AI reply, see STATIC_COMMANDS).
  experience: () => <ExperienceCard />,
  skills: () => <SkillsCard />, // static, see STATIC_COMMANDS
  contact: () => <ContactCard />, // static, see STATIC_COMMANDS
  else: () => <ElseCard />, // static, see STATIC_COMMANDS
};
const isCommand = (name: string): name is Command => name in FOCUSED_REPLIES;

// Commands answered right away with their card alone: no AI call. The reply keeps a short
// note as its text, so the AI knows (in later turns) what was shown.
const STATIC_COMMANDS: Partial<Record<Command, string>> = {
  experience: '[Showed my work experience timeline.]',
  skills: '[Showed my skills.]',
  contact: '[Showed how to get in touch.]',
  else: '[Showed my life outside work: football, running and sky photos.]',
};

// The tool an assistant message called (once its result is in), if it's one of ours.
const toolOf = (m: Message) =>
  (m.parts ?? [])
    .map((p) =>
      p.type === 'tool-invocation' && p.toolInvocation.state === 'result'
        ? p.toolInvocation.toolName
        : undefined
    )
    .find((name): name is Command => !!name && isCommand(name));

// Sent instead of a real answer while the AI is unavailable (no API key, provider down).
// One is picked at random per tab, then reused for every auto-reply (and kept across
// refreshes), so Tien's excuse doesn't change mid-conversation.
const AUTO_REPLIES = [
  "Hey, I'm offline for a bit — probably out grabbing a few beers 🍻\n\nBack soon, no cap 🧢",
  "I'm away for a bit — currently busy doing some very important research at the nearest bar 🍻\n\nBack soon",
];
const AUTO_REPLY_KEY = 'tien-chat-auto-reply';
function pickAutoReply(): string {
  try {
    const saved =
      AUTO_REPLIES[Number(sessionStorage.getItem(AUTO_REPLY_KEY) ?? -1)];
    if (saved) return saved;
  } catch {
    // No storage: just pick for this visit.
  }
  const index = Math.floor(Math.random() * AUTO_REPLIES.length);
  try {
    sessionStorage.setItem(AUTO_REPLY_KEY, String(index));
  } catch {
    // Fine: the same reply is still reused until the page reloads.
  }
  return AUTO_REPLIES[index];
}
const AUTO_REPLY_TYPING_MS = 900;

// Out of AI messages: every later message gets this.
const LIMIT_REPLY =
  "Okay, I'm cooked. 🫠\n\nYou've hit the prompt limit. Go grab a coffee and come back later.";

// The message limit lives in this browser: 5 AI messages every 5 hours. Out of messages, the
// flashlight game can be played once per window; the sum of the numbers found becomes the new
// allowance. (Clear it with: localStorage.removeItem('tien-chat-usage').)
const PROMPT_LIMIT = 5;
const LIMIT_WINDOW_MS = 5 * 60 * 60 * 1000;
const USAGE_KEY = 'tien-chat-usage';
const GAME_VALUES = [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5]; // each once, shuffled per game
type Usage = {
  count: number;
  allowance: number;
  since: number;
  game?: { values: number[]; finished: boolean };
};
const freshUsage = (): Usage => ({
  count: 0,
  allowance: PROMPT_LIMIT,
  since: Date.now(),
});
function loadUsage(): Usage {
  try {
    const saved: Usage | null = JSON.parse(
      localStorage.getItem(USAGE_KEY) ?? 'null'
    );
    if (saved && Date.now() - saved.since < LIMIT_WINDOW_MS) return saved;
  } catch {
    // Nothing usable stored.
  }
  return freshUsage();
}
function saveUsage(usage: Usage) {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  } catch {
    // Not remembered past this visit: fine.
  }
}
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// The flashlight easter egg, offered once when out of messages (see FlashlightGame).
const GAME_INVITE_PREFIX = 'auto-game-invite-';
const GAME_INVITE =
  'Buuut… I have a small game for you 🔦 Grab this mini flashlight and find the 10 numbers hidden around the site: some in this chat, some on the homepage. Whatever they add up to = that many new messages. Careful, some are negative 👀';
const gameResultText = (found: number, sum: number, granted: number) =>
  granted > 0
    ? `You found ${found}/10 numbers, they add up to **${sum}** → **${granted} new message${granted === 1 ? '' : 's'}** unlocked. Go wild 😎`
    : `You found ${found}/10 numbers and they add up to **${sum}**… that's 0 messages 💀 The negative ones got you. Come back in a few hours!`;

// Online: the AI answers. Offline: the auto-reply does. Checking: not known yet (sends normally).
type Presence = 'checking' | 'online' | 'offline';

// The conversation is kept for this tab, so a refresh comes back to it. (A new tab starts
// fresh.) Storage can be unavailable (private mode, blocked site data), so every access is
// guarded and the chat simply starts over.
const STORAGE_KEY = 'tien-chat-messages';
function loadMessages(): Message[] {
  if (typeof window === 'undefined') return GREETING_MESSAGES;
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
    return Array.isArray(saved) && saved.length ? saved : GREETING_MESSAGES;
  } catch {
    return GREETING_MESSAGES;
  }
}
function saveMessages(messages: Message[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // Not saved; the chat still works, it just won't survive a refresh.
  }
}

type Item =
  | {
      kind: 'bubble';
      key: string;
      role: 'user' | 'assistant';
      text: string;
      tail: boolean;
      /** The flashlight game's invite: shows the flashlight button. */
      game?: boolean;
    }
  | { kind: 'focus'; key: string; command: Command; text: string }
  | { kind: 'typing'; key: string };

const hasVisibleReply = (m: Message) =>
  (m.parts ?? []).some(
    (p) =>
      (p.type === 'text' && p.text.trim()) ||
      (p.type === 'tool-invocation' && p.toolInvocation.state === 'result')
  );

// Flatten the conversation into what's on screen: text bubbles, tool cards, and a typing bubble.
function buildItems(messages: Message[], waiting: boolean): Item[] {
  const items: Item[] = [];
  let askedWith: Command | undefined; // the command behind the latest question, if any
  for (const m of messages) {
    // A reply that called one of our tools, or answers a slash command (not the offline
    // auto-reply), becomes that tool's card. With the tool's result in, the card shows right
    // away and the text streams into it; a command reply waits for its first words.
    const tool = m.role === 'assistant' ? toolOf(m) : undefined;
    const command =
      tool ??
      (m.role === 'assistant' && !m.id.startsWith('auto-')
        ? askedWith
        : undefined);
    if (command) {
      const text = (m.parts ?? [])
        .map((p) => (p.type === 'text' ? p.text : ''))
        .join('')
        .trim();
      if (text || tool || STATIC_COMMANDS[command])
        items.push({ kind: 'focus', key: m.id, command, text });
      continue;
    }
    if (m.role === 'user') {
      askedWith = commandOf(m);
      items.push({
        kind: 'bubble',
        key: m.id,
        role: 'user',
        text: m.content,
        tail: false,
      });
    } else if (m.role === 'assistant') {
      const parts = m.parts?.length
        ? m.parts
        : [{ type: 'text' as const, text: m.content }];
      parts.forEach((p, i) => {
        if (p.type === 'text' && p.text.trim()) {
          items.push({
            kind: 'bubble',
            key: `${m.id}-${i}`,
            role: 'assistant',
            text: p.text,
            tail: false,
            game: m.id.startsWith(GAME_INVITE_PREFIX),
          });
        }
      });
    }
  }
  if (waiting) items.push({ kind: 'typing', key: 'typing' });
  // Only the last bubble in a run from the same person gets the pointed corner.
  items.forEach((it, i) => {
    if (it.kind !== 'bubble') return;
    const next = items[i + 1];
    const sameRunContinues =
      (next?.kind === 'bubble' && next.role === it.role) ||
      (next?.kind === 'typing' && it.role === 'assistant');
    it.tail = !sameRunContinues;
  });
  return items;
}

// Markdown without the page's prose spacing, sized for a chat bubble.
function BubbleMarkdown({ text }: { text: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="break-words whitespace-pre-wrap [&+*]:mt-2">
            {children}
          </p>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {children}
          </a>
        ),
        ul: ({ children }) => (
          <ul className="my-1 list-disc pl-5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-1 list-decimal pl-5">{children}</ol>
        ),
        li: ({ children }) => <li className="my-0.5">{children}</li>,
        pre: ({ children }) => (
          <pre className="my-1.5 overflow-x-auto rounded-lg bg-black/40 p-2 text-[13px]">
            {children}
          </pre>
        ),
        code: ({ children }) => (
          <code className="rounded bg-black/30 px-1 text-[13px]">
            {children}
          </code>
        ),
      }}
    >
      {text}
    </Markdown>
  );
}

function Bubble({
  role,
  text,
  tail,
}: {
  role: 'user' | 'assistant';
  text: string;
  tail: boolean;
}) {
  const sent = role === 'user';
  return (
    <div className={cn('flex', sent ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[78%] rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed',
          sent
            ? 'bg-blue-600 text-white'
            : 'border border-neutral-700 bg-neutral-800 text-neutral-100',
          tail && (sent ? 'rounded-br-md' : 'rounded-bl-md')
        )}
      >
        {sent ? (
          <p className="break-words whitespace-pre-wrap">{text}</p>
        ) : (
          <BubbleMarkdown text={text} />
        )}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start" aria-label="Tien is typing">
      <div className="rounded-3xl rounded-bl-md border border-neutral-700 bg-neutral-800 px-4 py-3.5">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-2 animate-[imsg-typing_1.2s_ease-in-out_infinite] rounded-full bg-neutral-400 motion-reduce:animate-none"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Plain text for the avatar's mouth to "say" (no markdown symbols).
const toPlain = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Full-screen chat, laid out like a messaging app. Stays mounted so the conversation survives closing it. */
export default function ImessageChat({
  open,
  onClose,
  onReply,
  onLimit,
  avatarSlotRef,
  instant = false,
}: {
  open: boolean;
  onClose: () => void;
  /** Show the chat already in place, with no opening animation (restoring after a refresh). */
  instant?: boolean;
  /** Called with each finished reply (plain text), so the avatar can mouth it. */
  onReply?: (text: string) => void;
  /** Called when a message hits the prompt limit (the avatar gets angry). */
  onLimit?: () => void;
  /** Empty spot in the header where the page's live avatar lands. */
  avatarSlotRef?: RefObject<HTMLDivElement | null>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // How much room a website open beside the chat takes on the right (0 = none).
  const [splitWidth, setSplitWidth] = useState(0);
  const reduceMotion = useReducedMotion();
  // Whether the chat follows new text down. Scrolling up stops it, reaching the bottom again
  // (or sending a message) turns it back on.
  const followRef = useRef(true);
  const [openedAt, setOpenedAt] = useState('');
  const [initialMessages] = useState(loadMessages);
  const [presence, setPresence] = useState<Presence>('checking');
  const [autoTyping, setAutoTyping] = useState(false);
  const autoTimer = useRef<number | undefined>(undefined);
  const [usage, setUsageState] = useState<Usage>(freshUsage);
  // Read once mounted (storage isn't there during the server render).
  useEffect(() => setUsageState(loadUsage()), []);
  const setUsage = (next: Usage) => {
    setUsageState(next);
    saveUsage(next);
  };
  const limited = usage.count >= usage.allowance;
  const addAssistant = (id: string, text: string) =>
    setMessages((prev) => [
      ...prev,
      { id, role: 'assistant', content: text, parts: [{ type: 'text', text }] },
    ]);

  // The flashlight game: started from the invite's button.
  const [game, setGame] = useState<{ values: number[] } | null>(null);
  const gamePlayed = !!usage.game?.finished;
  const startGame = () => {
    const current = loadUsage();
    if (current.game?.finished) {
      toast("No flashlight right now, you've already played this round 🔦");
      return;
    }
    const values = current.game?.values ?? shuffled(GAME_VALUES);
    setUsage({ ...current, game: { values, finished: false } });
    setGame({ values });
  };
  const messagesRef = useRef<Message[]>([]);
  const hasInvite = () =>
    messagesRef.current.some((m) => m.id.startsWith(GAME_INVITE_PREFIX));
  // Sent right along with the "cooked" reply.
  const offerGame = () =>
    addAssistant(`${GAME_INVITE_PREFIX}${generateId()}`, GAME_INVITE);
  const openRef = useRef(open);
  openRef.current = open;
  const finishGame = (found: number[]) => {
    const played = game;
    setGame(null);
    if (!played) return;
    const sum = found.reduce((total, i) => total + (played.values[i] ?? 0), 0);
    const granted = Math.max(0, sum);
    const current = loadUsage();
    setUsage({
      ...current,
      allowance: current.count + granted,
      game: { values: played.values, finished: true },
    });
    const text = gameResultText(found.length, sum, granted);
    addAssistant(`auto-game-result-${generateId()}`, text);
    onReply?.(toPlain(text));
    // Finished on the homepage: say it there too (the chat has the full message).
    if (!openRef.current) toast(toPlain(text));
  };

  const {
    messages,
    setMessages,
    input,
    setInput,
    handleInputChange,
    status,
    append,
  } = useChat({
    initialMessages,
    // When a reply lands, the little avatar in the header mouths it.
    onFinish: (message) => {
      const plain = toPlain(message.content);
      if (plain) onReply?.(plain.slice(0, 140));
    },
    onError: () => {
      // The visitor's own connection dropped: that's on their side, say so.
      if (!navigator.onLine) {
        toast.error(
          "Message didn't send. Check your connection and try again."
        );
        return;
      }
      // Otherwise the AI failed (bad key, quota, provider down): go offline and auto-reply.
      setPresence('offline');
      sendAutoReply();
    },
  });

  // "Typing…" for a moment, then the auto-reply, which the avatar also mouths.
  const autoReply = useRef<string | null>(null);
  // `fixedText`: send that instead of the offline excuse; `before` runs as it lands.
  const sendAutoReply = (fixedText?: string, before?: () => void) => {
    autoReply.current ??= pickAutoReply();
    const text = fixedText ?? autoReply.current;
    window.clearTimeout(autoTimer.current);
    setAutoTyping(true);
    autoTimer.current = window.setTimeout(() => {
      setAutoTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `auto-${generateId()}`,
          role: 'assistant',
          content: text,
          parts: [{ type: 'text', text }],
        },
      ]);
      before?.();
      onReply?.(toPlain(text));
    }, AUTO_REPLY_TYPING_MS);
  };
  useEffect(() => () => window.clearTimeout(autoTimer.current), []);

  // Send a message: to the AI when it's reachable, otherwise answer with the auto-reply.
  // `command` is set when it came from a slash command, or the question clearly asks for one
  // (tagged so its reply is shown in that tool's card).
  const sendText = (raw: string, slashCommand?: Command) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput('');
    followRef.current = true; // your own message: back to the bottom
    const command = slashCommand ?? intentOf(text);
    const id = command ? commandId(command) : generateId();
    const staticReply = command && STATIC_COMMANDS[command];
    if (staticReply) {
      // Answered on the spot with the card (works offline too).
      setMessages((prev) => [
        ...prev,
        { id, role: 'user', content: text, parts: [{ type: 'text', text }] },
        {
          id: `static-${generateId()}`,
          role: 'assistant',
          content: staticReply,
          parts: [{ type: 'text', text: staticReply }],
        },
      ]);
      return;
    }
    // Out of AI messages: the cooked reply (and, once, the flashlight game) instead of the AI.
    const current = loadUsage();
    if (current.count >= current.allowance) {
      setUsage(current);
      setMessages((prev) => [
        ...prev,
        { id, role: 'user', content: text, parts: [{ type: 'text', text }] },
      ]);
      sendAutoReply(LIMIT_REPLY, () => {
        onLimit?.();
        if (!current.game?.finished && !hasInvite()) offerGame();
      });
      return;
    }
    if (presence !== 'offline') {
      setUsage({ ...current, count: current.count + 1 });
      append(
        { id, role: 'user', content: text },
        command ? { body: { command } } : undefined
      );
      return;
    }
    setMessages((prev) => [
      ...prev,
      {
        id,
        role: 'user',
        content: text,
        parts: [{ type: 'text', text }],
      },
    ]);
    sendAutoReply();
  };

  // The quick actions can be tucked away behind their toggle (remembered in this browser).
  // Typing "/" still shows the matching ones, so the shortcuts always work.
  const [actionsOpen, setActionsOpen] = useState(() => {
    try {
      return localStorage.getItem(QUICK_ACTIONS_KEY) !== 'closed';
    } catch {
      return true;
    }
  });
  const toggleActions = () =>
    setActionsOpen((wasOpen) => {
      try {
        localStorage.setItem(QUICK_ACTIONS_KEY, wasOpen ? 'closed' : 'open');
      } catch {
        // Not remembered: fine.
      }
      return !wasOpen;
    });

  // While typing "/…", only the matching commands show; Enter on a command runs it.
  const slash = input.trim().toLowerCase();
  const showActions = actionsOpen || slash.startsWith('/');
  const visibleActions = slash.startsWith('/')
    ? QUICK_ACTIONS.filter((a) => a.command.startsWith(slash))
    : QUICK_ACTIONS;

  // Ask the server whether the AI is reachable each time the chat opens (cached there).
  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch('/api/chat/health', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { online: false }))
      .then((data: { online?: boolean }) => {
        if (live) setPresence(data.online ? 'online' : 'offline');
      })
      .catch(() => live && setPresence('offline'));
    return () => {
      live = false;
    };
  }, [open]);

  const busy = status === 'submitted' || status === 'streaming' || autoTyping;
  messagesRef.current = messages;

  // Save once a reply has finished (not on every streamed token).
  useEffect(() => {
    if (!busy) saveMessages(messages);
  }, [messages, busy]);
  const last = messages[messages.length - 1];
  const waiting =
    autoTyping ||
    status === 'submitted' ||
    (status === 'streaming' &&
      (!last || last.role !== 'assistant' || !hasVisibleReply(last)));
  const items = useMemo(
    () => buildItems(messages, waiting),
    [messages, waiting]
  );

  // The latest reply to a focused command gets the chat's whole visible area: it's scrolled
  // to the top when it arrives and reserves the area's height, so nothing else shows.
  const lastItem = items.at(-1);
  const liveFocusKey = lastItem?.kind === 'focus' ? lastItem.key : undefined;
  const [listHeight, setListHeight] = useState(0);
  useEffect(() => {
    const el = listRef.current;
    if (!open || !el) return;
    // The list's padding (top 12 + bottom 8) and the reply's top margin stay outside it.
    const measure = () => setListHeight(Math.max(0, el.clientHeight - 20));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  // Opening: focus the input right away (same tick as the tap, so typing works mid-transition
  // and phones keep the keyboard up), lock page scroll, note the time for
  // the header stamp. Esc closes.
  useLayoutEffect(() => {
    if (!open) return;
    inputRef.current?.focus({ preventScroll: true });
    setOpenedAt(
      new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    );
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      root.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // Notice the visitor scrolling up (wheel, swipe, keys): stop following new text then.
  useEffect(() => {
    const el = listRef.current;
    if (!open || !el) return;
    followRef.current = true;
    const atBottom = () =>
      el.scrollHeight - el.clientHeight - el.scrollTop < 40;
    const onScroll = () => {
      if (atBottom()) followRef.current = true;
    };
    const stopFollowing = () => {
      followRef.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) stopFollowing();
    };
    let touchY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0].clientY > touchY + 4) stopFollowing();
    };
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowUp', 'PageUp', 'Home'].includes(e.key)) stopFollowing();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Keep the newest message in view while following, gliding: each frame closes part of the
  // gap to the bottom. Snapping there instead would jerk the whole chat up a line at a time
  // while a reply streams in. A focused reply is brought to the top once instead (it then
  // grows downward).
  const glideRef = useRef({ liveFocusKey, reduceMotion });
  glideRef.current = { liveFocusKey, reduceMotion };
  useEffect(() => {
    const el = listRef.current;
    if (!open || !el) return;
    let raf = 0;
    const glide = () => {
      const { liveFocusKey, reduceMotion } = glideRef.current;
      const gap = el.scrollHeight - el.clientHeight - el.scrollTop;
      if (followRef.current && !liveFocusKey && gap > 0.5)
        el.scrollTop += reduceMotion ? gap : Math.max(1, gap * 0.18);
      raf = requestAnimationFrame(glide);
    };
    raf = requestAnimationFrame(glide);
    return () => cancelAnimationFrame(raf);
  }, [open]);
  useEffect(() => {
    if (!open || !liveFocusKey) return;
    listRef.current?.querySelector('[data-live-focus]')?.scrollIntoView({
      block: 'start',
      behavior: instant ? 'auto' : 'smooth',
    });
  }, [open, liveFocusKey]); // eslint-disable-line react-hooks/exhaustive-deps -- once per reply

  return (
    // Product links in the cards open their website in a pane on the right (split view).
    <WebviewProvider
      enabled={open}
      preload={PRODUCT_PAGES}
      onSplitChange={setSplitWidth}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            key="imessage"
            role="dialog"
            aria-modal="true"
            aria-label="Chat with Tien"
            className="text-foreground fixed inset-0 z-[60] flex h-[100dvh] flex-col"
          >
            {/* The page's own background fades in over the home section. */}
            <motion.div
              aria-hidden="true"
              className="bg-background absolute inset-0 -z-10"
              initial={instant ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
            />
            {/* The chat itself; it makes room on the left when a website opens beside it. */}
            <motion.div
              className="relative flex min-h-0 flex-1 flex-col"
              animate={{ marginRight: splitWidth }}
              transition={reduceMotion ? { duration: 0 } : SPLIT_TRANSITION}
            >
              {/* Header: back button, the 3D avatar and name. */}
              <motion.header className="relative z-10 grid grid-cols-[4rem_1fr_4rem] items-center px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2">
                <motion.button
                  type="button"
                  onClick={onClose}
                  aria-label="Back"
                  className="grid size-10 place-items-center justify-self-start rounded-full border border-neutral-700 bg-neutral-800 text-neutral-200 transition-colors hover:border-neutral-600 focus-visible:outline-2 focus-visible:outline-blue-600"
                  initial={instant ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  <ArrowLeft className="size-5" />
                </motion.button>
                <div className="flex flex-col items-center">
                  {/* The page's live avatar flies in and sits on top of this spot. */}
                  <div ref={avatarSlotRef} className="size-16" />
                  <motion.div
                    className="flex flex-col items-center"
                    // Wait for the avatar to land before the name shows; hide it first on close.
                    initial={instant ? false : { opacity: 0, y: -4 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      transition: { delay: 0.35, duration: 0.3, ease: EASE },
                    }}
                    exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
                  >
                    <span className="text-sm font-semibold">Tien</span>
                    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <span
                        data-presence={presence}
                        data-limited={limited || undefined}
                        title={
                          limited
                            ? 'Out of messages'
                            : presence === 'offline'
                              ? 'Offline'
                              : undefined
                        }
                        className={cn(
                          'size-1.5 rounded-full transition-colors duration-300',
                          // Out of AI messages: red, whatever the AI's status.
                          limited && 'bg-red-500',
                          !limited && presence === 'online' && 'bg-emerald-500',
                          !limited &&
                            presence === 'offline' &&
                            'bg-neutral-500',
                          !limited &&
                            presence === 'checking' &&
                            'animate-pulse bg-neutral-500 motion-reduce:animate-none'
                        )}
                      />
                      <span className="sr-only">
                        {limited
                          ? 'Out of messages. '
                          : presence === 'offline'
                            ? 'Offline. '
                            : ''}
                      </span>
                      {busy ? 'typing…' : 'Software Engineer'}
                    </span>
                  </motion.div>
                </div>
                <span />
                {/* Messages fade out as they scroll under the header. */}
                <div
                  aria-hidden="true"
                  className="to-background pointer-events-none absolute inset-x-0 -bottom-6 h-6 bg-linear-to-t from-transparent"
                />
              </motion.header>

              {/* Conversation. */}
              <motion.div
                ref={listRef}
                // Positioned, so the focused reply measures its scroll position against this list.
                className={cn(
                  'no-scrollbar relative flex-1 overflow-y-auto px-3 pt-3',
                  // Room to scroll the last message clear of the floating quick actions.
                  showActions ? 'pb-16' : 'pb-2'
                )}
                initial={instant ? false : { opacity: 0 }}
                animate={{
                  opacity: 1,
                  transition: { delay: 0.15, duration: 0.3 },
                }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
              >
                <div className="mx-auto flex w-full max-w-xl flex-col">
                  <p className="text-muted-foreground mb-4 text-center text-xs">
                    Today {openedAt}
                  </p>
                  {items.map((it, i) => {
                    const prev = items[i - 1];
                    const sameRun =
                      prev &&
                      ((prev.kind === 'bubble' &&
                        it.kind === 'bubble' &&
                        prev.role === it.role) ||
                        (prev.kind === 'bubble' &&
                          prev.role === 'assistant' &&
                          it.kind === 'typing'));
                    return (
                      <motion.div
                        key={it.key}
                        className={sameRun ? 'mt-1' : 'mt-3'}
                        // Your messages pop in; replies only fade in (a reply replaces the
                        // typing dots, and sliding it in too would jolt the chat).
                        initial={
                          instant
                            ? false
                            : it.kind === 'bubble' && it.role === 'user'
                              ? { opacity: 0, y: 8, scale: 0.98 }
                              : { opacity: 0 }
                        }
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                      >
                        {it.kind === 'bubble' && (
                          <Bubble
                            role={it.role}
                            text={it.text}
                            tail={it.tail}
                          />
                        )}
                        {it.kind === 'bubble' && it.game && (
                          <button
                            type="button"
                            onClick={startGame}
                            disabled={gamePlayed || !!game}
                            className="group/torch mt-2 inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-amber-200/10 px-4 py-2 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-200/20 disabled:pointer-events-none disabled:opacity-40"
                          >
                            <Flashlight
                              className="size-4 -rotate-45 transition-transform group-hover/torch:rotate-0"
                              strokeWidth={1.75}
                            />
                            {gamePlayed
                              ? 'Flashlight used'
                              : 'Grab the flashlight'}
                          </button>
                        )}
                        {it.kind === 'typing' && <TypingBubble />}
                        {it.kind === 'focus' && (
                          <FocusedReply
                            live={it.key === liveFocusKey}
                            fillHeight={listHeight}
                            scrollRef={listRef}
                          >
                            {FOCUSED_REPLIES[it.command]({ text: it.text })}
                          </FocusedReply>
                        )}
                      </motion.div>
                    );
                  })}
                  <div ref={endRef} className="h-1" />
                </div>
              </motion.div>

              {/* Input bar: the home page's question box lands here. */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  // A typed command (or the only one matching what's typed) asks its question.
                  const typedCommand =
                    slash.startsWith('/') && visibleActions.length === 1
                      ? visibleActions[0]
                      : undefined;
                  if (typedCommand)
                    sendText(
                      typedCommand.prompt,
                      typedCommand.command.slice(1) as Command
                    );
                  else sendText(input);
                }}
                className="relative px-4 pt-2 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
              >
                {/* Quick actions: one glass bar floating just above the input, over the end of
                    the conversation (messages scroll under it, blurred). It takes no room of its
                    own; hidden, it fades out through a blur. Its toggle is the "/" in the input. */}
                <div
                  id="quick-actions"
                  inert={!showActions}
                  className="pointer-events-none absolute inset-x-0 bottom-full z-10 mb-2.5 px-4"
                >
                  <motion.div
                    // The bar itself animates (not a wrapper): a filter on a parent would stop
                    // the bar's own backdrop blur from seeing what's behind it.
                    initial={instant ? false : QUICK_ACTIONS_HIDDEN}
                    animate={
                      showActions
                        ? {
                            ...QUICK_ACTIONS_SHOWN,
                            transitionEnd: { filter: 'none' },
                          }
                        : QUICK_ACTIONS_HIDDEN
                    }
                    // Leaving the chat: gone at once, before the input flies back home.
                    exit={{
                      ...QUICK_ACTIONS_HIDDEN,
                      transition: { duration: 0.12, ease: 'easeOut' },
                    }}
                    transition={{ duration: 0.35, ease: EASE }}
                    className={cn(
                      'mx-auto w-max max-w-full rounded-full border border-white/10 bg-neutral-900/55 p-1 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl',
                      showActions && 'pointer-events-auto'
                    )}
                  >
                    <nav
                      aria-label="Quick actions"
                      className="no-scrollbar overflow-x-auto rounded-full"
                    >
                      <div className="flex w-max gap-0.5 sm:gap-1">
                        {visibleActions.map((action) => (
                          <button
                            key={action.command}
                            type="button"
                            title={action.prompt}
                            disabled={busy}
                            // Keep focus (and the phone keyboard) in the input.
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() =>
                              sendText(
                                action.prompt,
                                action.command.slice(1) as Command
                              )
                            }
                            className="h-8 shrink-0 rounded-full px-2 font-mono text-[11.5px] text-neutral-300 transition-colors hover:bg-white/[0.09] hover:text-white focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50 sm:px-3.5 sm:text-[13px]"
                          >
                            <span className="text-blue-500">/</span>
                            {action.command.slice(1)}
                          </button>
                        ))}
                      </div>
                    </nav>
                  </motion.div>
                </div>
                <motion.div
                  // Always shares its id with the home box (an id added after mount isn't picked
                  // up, which left both boxes showing on close). Restoring just snaps into place.
                  layoutId={IMESSAGE_LAYOUT.input}
                  transition={instant ? { duration: 0 } : sharedTransition}
                  className={cn(PILL_CLASS, 'mx-auto w-full max-w-lg pl-2')}
                  style={{ borderRadius: 9999 }}
                >
                  {/* Shows or hides the quick actions above (highlighted while they're shown). */}
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={toggleActions}
                    aria-expanded={showActions}
                    aria-controls="quick-actions"
                    aria-label={
                      showActions ? 'Hide quick actions' : 'Show quick actions'
                    }
                    title={
                      showActions ? 'Hide quick actions' : 'Show quick actions'
                    }
                    className={cn(
                      'mr-2 grid size-9 shrink-0 place-items-center rounded-full font-mono text-base text-blue-500 transition-colors duration-300 hover:bg-white/[0.12] focus-visible:outline-2 focus-visible:outline-blue-600',
                      showActions && 'bg-white/[0.08]'
                    )}
                  >
                    /
                  </button>
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={handleInputChange}
                    placeholder="Ask me anything…"
                    aria-label="Message"
                    autoComplete="off"
                    className={PILL_INPUT_CLASS}
                  />
                  <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    aria-label="Send"
                    className={cn(PILL_BUTTON_CLASS, 'disabled:cursor-default')}
                  >
                    <ArrowRight className="h-5 w-5" />
                  </button>
                </motion.div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Carries on across the homepage too (some numbers hide there). */}
      {game && (
        <FlashlightGame
          values={game.values}
          chatOpen={open}
          onFinish={finishGame}
        />
      )}
    </WebviewProvider>
  );
}
