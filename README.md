# Tien Portfolio

An interactive portfolio for **Pham Duy Tien**, software engineer in Ho Chi Minh City.

- **Ink greeting** that reacts to your cursor
- **3D Memoji** that follows you, blinks and gets grumpy when booped too much
- **Chat** with an AI that knows my work, with quick commands: `/me`, `/experience`, `/skills`, `/contact`, `/else`
- **Product previews** opened side by side with the chat
- **A hidden flashlight game** when you run out of messages 🔦

## Run it locally

```bash
yarn install
cp .env.example .env   # then add your OPENAI_API_KEY
yarn dev
```

Built with Next.js, React, Tailwind CSS, Framer Motion, Three.js and the Vercel AI SDK. Started from the
open-source [toukoum/portfolio](https://github.com/toukoum/portfolio) template.
