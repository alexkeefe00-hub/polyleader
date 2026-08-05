# PolyLeader

A mobile-friendly dashboard for viewing Polymarket's public trader leaderboard, open positions, and upcoming Quick Bets.

## Run locally

```powershell
npm install
npm run dev
```

Open http://localhost:3000

## Data

This app uses public Polymarket Data API endpoints through local Next.js API routes:

- `/v1/leaderboard`
- `/positions`

No wallet connection, private key, or API key is required.

## Deploy

Push this folder to GitHub, import the repository into Vercel, and deploy with the default Next.js settings.

## Important

This project is an information dashboard, not financial advice. Public APIs can change, be delayed, or become temporarily unavailable.

## Quick Bets

The Quick Bets feed checks the all-time top 10 Sports traders, finds their open positions, and shows qualifying sports markets with an official `gameStartTime` within the next 60 minutes.


## Discord value alerts

This version includes a local alert watcher for newly executed BUY trades made by the all-time top Sports traders.

1. In Discord, create a webhook for the channel that should receive alerts.
2. Copy `.env.example` to `.env.local`.
3. Put the complete webhook URL in `.env.local`.
4. Test it with `npm run alerts:test`.
5. Start monitoring with `npm run alerts`.

Default criteria:

- Category: Sports
- Traders: all-time top 10 by P&L
- Side: BUY
- Executed trade price: 40¢ through 55¢ inclusive
- Polling: every 30 seconds

The first run records recent trades without sending them, preventing an old-alert flood. Keep the terminal open. This sends notifications only; it never connects a wallet or places an order.

## Strategy Lab setup
1. Supabase SQL Editor: run `supabase/strategy_schema.sql`.
2. Put Supabase, Odds API and Discord values in `.env.local`.
3. Test once: `npm run strategy:once`.
4. Run continuously: `npm run strategy`.
5. Open `/strategy`.

This version is MLB-first and paper-trades $10 only. No real order is placed.
