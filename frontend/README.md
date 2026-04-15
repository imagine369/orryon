# Orryon — Frontend

Next.js 16 app powering the Orryon web client.

## Setup

```bash
cp .env.example .env.local   # configure API URL + Stripe keys
npm install
npm run dev                   # http://localhost:3000
```

## Build

```bash
npm run build
npm start
```

## Deployment

Deployed to **Vercel** — linked via `.vercel/project.json`. Push to `main` to trigger a production deploy.
