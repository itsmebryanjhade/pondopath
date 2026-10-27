# SoloForge — Cash-Flow Action Planner

A one-business Philippine B2B hackathon MVP connecting collections, a 30-day cash forecast, and reviewed follow-up actions. Implementation follows the [PRD](docs/superpowers/specs/SoloForge_Cash-Flow_Action_Planner_PRD_v1.0.md) and [implementation plan](docs/superpowers/plans/2026-10-27-cash-flow-action-planner.md). Product screens and integrations are still being implemented.

Use Node.js **24.x** and npm. Verify `node --version` before installing dependencies; `.nvmrc` and `package.json` declare the required major version. Run `npm ci` for a reproducible installation.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Project checks and configuration

```sh
npm run test:unit
npm run typecheck
npm run lint
npm run build
```

Money uses safe integer centavos. Dates are validated calendar dates in Asia/Manila. Payment promises remain distinct from actual cash.

Copy `.env.example` to `.env.local` only if a local file does not already exist. Keep real keys in the ignored local file. Only the Supabase URL and publishable key may use `NEXT_PUBLIC_`; server keys and automation tokens remain private. Use the dedicated nonproduction database; schema and authentication are introduced by their plan tasks, rather than creating ad hoc tables manually.

The scaffold's production build downloads Google Fonts and needs network access. Node-RED will run separately from the Next.js/Vercel application. Read [AGENTS.md](AGENTS.md) before implementation.

## Next.js references

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
