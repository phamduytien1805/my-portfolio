// Tien's portfolio facts, in one place. The chat's tools hand these to the AI (so its answers
// stay grounded) and the chat's cards show them. Keep it in step with the system prompt.

export const profile = {
  name: 'Pham Duy Tien',
  birthYear: 2001,
  location: 'HCMC, Vietnam',
  photo: '/profile-tien.jpg', // portrait (3:4), standing by the lake
  tags: ['Developer', 'Enthusiastic', 'Solver', 'Enthusiast'],
};

export const age = () => new Date().getFullYear() - profile.birthYear;

/** A mobile app, shown as a store-style preview (app stores can't be embedded). */
export type AppListing = {
  name: string;
  developer: string;
  category: string;
  icon: string;
  summary: string;
  features: string[];
  screenshots: string[];
  stores: { appStore?: string; googlePlay?: string };
};

export type Role = {
  company: string;
  title: string;
  product: string;
  /** The product's website: the timeline opens it in the side panel. */
  link?: string;
  /** For an app: shown in the side panel as a preview instead of the website. */
  app?: AppListing;
  tech: string[];
  highlights: string[];
};

// Most recent first.
export const career: Role[] = [
  {
    company: 'SAP',
    title: 'Software Engineer',
    product: 'Sustainability Control Tower',
    link: 'https://www.sap.com/products/financial-management/sustainability-control-tower.html',
    tech: ['Java', 'Spring Boot', 'NodeJS', 'SAPUI5', 'Fiori'],
    highlights: [
      'Backend services for ESG metrics and sustainability reporting',
      'Multi-source data replication',
      'Better sync between sustainability applications',
      'Enterprise-scale software with global cross-functional teams',
    ],
  },
  {
    company: 'Freelance',
    title: 'Software Engineer',
    product: 'Workflow Automation Platform',
    tech: [
      'Golang',
      'AWS',
      'Helm',
      'Kubernetes',
      'RabbitMQ',
      'PostgreSQL',
      'Vault',
    ],
    highlights: [
      'Restructured the platform architecture (SOLID and DDD where useful)',
      'Simplified a complicated microservice landscape',
      'Reusable workflow nodes, third-party integrations, credential management',
      'Workflow orchestration with workers and queues, cloud deployment',
    ],
  },
  {
    company: 'Zalo',
    title: 'Software Engineer',
    product: 'Fiza',
    link: 'https://fiza.ai/home?lang=en',
    tech: ['Java', 'Spring Boot', 'MySQL', 'React', 'Jotai', 'Recoil'],
    highlights: [
      'Lead generation forms and eKYC workflows',
      'Banking / financial-service integrations',
      'Frontend performance and Core Web Vitals',
    ],
  },
  {
    company: 'Codestringers',
    title: 'FullStack Engineer',
    product: 'Ella LMS, a personalized learning platform',
    link: 'https://apps.apple.com/br/app/ella-learning/id6447742074',
    // From the store listings (images saved in public/apps/ella).
    app: {
      name: 'Ella Learning',
      developer: 'FileString Inc.',
      category: 'Education',
      icon: '/apps/ella/icon.png',
      summary:
        'A smarter Learning Management System (LMS) that makes it easier for students to learn and for teachers to teach, so that every student succeeds.',
      features: [
        'An AI to-do list, prioritised by due date, grade weighting and estimated time',
        'All your schoolwork in one place, grouped by how urgent it is',
        'Do tasks and hand in work from Google Drive or your media library',
        'Track what you have done and what you missed',
      ],
      screenshots: [1, 2, 3, 4, 5].map((n) => `/apps/ella/screen-${n}.jpg`),
      stores: {
        appStore: 'https://apps.apple.com/br/app/ella-learning/id6447742074',
        googlePlay:
          'https://play.google.com/store/apps/details?id=com.codestringers.ella&hl=vi',
      },
    },
    tech: [
      'NodeJS',
      'RabbitMQ',
      'Redis',
      'PostgreSQL',
      'ReactJS',
      'gRPC',
      'AWS',
    ],
    highlights: [
      'Notifications, communication features and RBAC',
      'Scheduled jobs and Google Drive integration',
      'Interactive charts and drag-and-drop data tables',
      'Cloud deployment architecture',
    ],
  },
];

export const skills: { group: string; items: string[] }[] = [
  {
    group: 'Backend / Systems',
    items: [
      'Golang',
      'Java',
      'Spring Boot',
      'NodeJS',
      'PostgreSQL',
      'MySQL',
      'Redis',
      'RabbitMQ',
      'gRPC',
      'WebSocket',
    ],
  },
  {
    group: 'Frontend',
    items: [
      'TypeScript',
      'React',
      'Next.js',
      'SAPUI5',
      'Fiori',
      'Tailwind CSS',
      'Material UI',
      'Redux',
      'Jotai',
      'Recoil',
    ],
  },
  {
    group: 'Cloud / Infrastructure',
    items: [
      'AWS',
      'DigitalOcean',
      'Docker',
      'Kubernetes',
      'Helm',
      'CI/CD',
      'HashiCorp Vault',
    ],
  },
  {
    group: 'AI',
    items: ['LLM applications', 'MCP', 'AI agents', 'AI developer tools'],
  },
];

// Empty ones are left out of the contact card and the AI's answer.
export const contact = {
  email: 'phamduytien1805@gmail.com',
  location: 'HCMC, Vietnam',
  timeZone: 'Asia/Ho_Chi_Minh', // for the "local time" on the contact card
  links: [
    { label: 'GitHub', url: 'https://github.com/phamduytien1805' },
    {
      label: 'LinkedIn',
      url: 'https://www.linkedin.com/in/tien-pham-duy-5ab1081b5',
    },
  ] as { label: string; url: string }[],
};

/** Everything to reach Tien by, for the AI's contact tool. */
export const contactLinks = () => [
  ...(contact.email
    ? [
        {
          label: 'Email',
          value: contact.email,
          href: `mailto:${contact.email}`,
        },
      ]
    : []),
  ...contact.links
    .filter((link) => link.url)
    .map((link) => ({
      label: link.label,
      value: link.url.replace(/^https?:\/\/(www\.)?/, ''),
      href: link.url,
    })),
];

/** Every website the chat may show in its side panel (the embed check only accepts these). */
export const viewableLinks = () =>
  career.map((role) => role.link).filter((link): link is string => !!link);

// /else: life outside work. Photos in public/else.
export const life = {
  activities: [
    {
      title: 'Football',
      kicker: 'Every week, no excuses',
      text: 'Football is my weekly reset. Same pitch, same crew, and a lot of running for absolutely no reason. I just enjoy the game, the competition, and the chaos that comes with it. ⚽️',
      image: '/else/football.jpg',
      alt: 'Illustration of Tien and friends in football kits on a pitch',
    },
    {
      title: 'Running',
      kicker: 'My reset button',
      text: 'When my brain gets a little too crowded, I go for a run. A few kilometres, some fresh air, and suddenly the problem doesn’t seem so complicated anymore. Funny how that works. 🏃‍♂️',
      image: '/else/running-night.jpg',
      alt: 'Illustration of Tien and friends after an evening run in the city',
    },
  ],
  sky: {
    caption:
      "I can't walk past a good sky without taking a photo. Sunsets on the road, rainbows over the bridge, window seats. Swipe through a few 🌅",
    photos: [
      {
        src: '/else/sky-1.jpg',
        alt: 'Pink and orange sunset over a lit-up street',
      },
      {
        src: '/else/sky-2.jpg',
        alt: 'A rainbow over a cable-stayed bridge at dusk',
      },
      {
        src: '/else/sky-3.jpg',
        alt: 'Sunset over the sea through a car window',
      },
      {
        src: '/else/sky-4.jpg',
        alt: 'Sunrise over the runway from a plane window',
      },
    ],
  },
};
