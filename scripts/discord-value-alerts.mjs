import fs from "node:fs/promises";
import path from "node:path";

const LEADERBOARD_API = "https://data-api.polymarket.com/v1/leaderboard";
const TRADES_API = "https://data-api.polymarket.com/trades";
const STATE_DIR = path.join(process.cwd(), ".data");
const STATE_FILE = path.join(STATE_DIR, "discord-value-alerts.json");

function envNumber(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}.`);
  }
  return value;
}

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL?.trim();
const MIN_PRICE = envNumber("ALERT_MIN_PRICE", 0.40, 0, 1);
const MAX_PRICE = envNumber("ALERT_MAX_PRICE", 0.55, 0, 1);
const TOP_TRADERS = Math.floor(envNumber("ALERT_TOP_TRADERS", 10, 1, 50));
const POLL_SECONDS = Math.floor(envNumber("ALERT_POLL_SECONDS", 30, 15, 3600));
const LOOKBACK_MINUTES = Math.floor(
  envNumber("ALERT_LOOKBACK_MINUTES", 30, 1, 1440)
);
const CATEGORY = (process.env.ALERT_CATEGORY || "SPORTS").toUpperCase();
const SEND_EXISTING =
  (process.env.ALERT_SEND_EXISTING_ON_START || "false").toLowerCase() === "true";

if (!WEBHOOK_URL || !/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[^/\s]+$/.test(WEBHOOK_URL)) {
  throw new Error(
    "DISCORD_WEBHOOK_URL is missing or invalid. Copy .env.example to .env.local and paste your Discord webhook URL."
  );
}

if (MIN_PRICE > MAX_PRICE) {
  throw new Error("ALERT_MIN_PRICE cannot be greater than ALERT_MAX_PRICE.");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function traderName(trader) {
  const name = trader.userName?.trim();
  if (name) return name;
  const wallet = trader.proxyWallet || "";
  return wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Unknown trader";
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function cents(value) {
  return `${Math.round((Number(value) || 0) * 100)}¢`;
}

function uniqueTradeId(trade) {
  return [
    trade.transactionHash || "nohash",
    trade.asset || "noasset",
    trade.side || "BUY",
    trade.timestamp || 0,
    trade.price || 0,
    trade.size || 0,
  ].join(":");
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "PolyLeader-Discord-Alerts/1.0",
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`HTTP ${response.status} from ${url.origin}: ${detail.slice(0, 160)}`);
  }

  return response.json();
}

async function loadState() {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      initialized: Boolean(parsed.initialized),
      seen: Array.isArray(parsed.seen) ? parsed.seen : [],
    };
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("Could not read alert state; starting fresh:", error.message);
    }
    return { initialized: false, seen: [] };
  }
}

async function saveState(state) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  // Bound the file so it cannot grow forever.
  const bounded = {
    initialized: true,
    seen: state.seen.slice(-5000),
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(STATE_FILE, JSON.stringify(bounded, null, 2), "utf8");
}

async function getTopTraders() {
  const url = new URL(LEADERBOARD_API);
  url.searchParams.set("category", CATEGORY);
  url.searchParams.set("timePeriod", "ALL");
  url.searchParams.set("orderBy", "PNL");
  url.searchParams.set("limit", String(TOP_TRADERS));
  url.searchParams.set("offset", "0");

  const data = await fetchJson(url);
  if (!Array.isArray(data)) {
    throw new Error("Polymarket returned an unexpected leaderboard response.");
  }
  return data;
}

async function getRecentBuyTrades(wallet, startEpoch) {
  const url = new URL(TRADES_API);
  url.searchParams.set("user", wallet);
  url.searchParams.set("side", "BUY");
  url.searchParams.set("start", String(startEpoch));
  url.searchParams.set("limit", "100");
  url.searchParams.set("offset", "0");
  url.searchParams.set("takerOnly", "false");

  const data = await fetchJson(url);
  return Array.isArray(data) ? data : [];
}

async function sendDiscordAlert(trader, trade) {
  const marketSlug = trade.eventSlug || trade.slug;
  const marketUrl = marketSlug
    ? `https://polymarket.com/event/${marketSlug}`
    : "https://polymarket.com/";
  const tradeValue = (Number(trade.size) || 0) * (Number(trade.price) || 0);
  const timestamp = Number(trade.timestamp) || Math.floor(Date.now() / 1000);

  const payload = {
    username: "PolyLeader Value Alerts",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: "💎 Top Trader Value Buy",
        url: marketUrl,
        description: `A top **${CATEGORY.toLowerCase()}** trader bought an outcome inside your ${cents(MIN_PRICE)}–${cents(MAX_PRICE)} range.`,
        color: 0x3a8cff,
        fields: [
          {
            name: "Trader",
            value: `#${trader.rank} ${traderName(trader)}`,
            inline: true,
          },
          {
            name: "Side / Outcome",
            value: `${trade.side || "BUY"} • ${trade.outcome || "Unknown"}`,
            inline: true,
          },
          {
            name: "Price",
            value: cents(trade.price),
            inline: true,
          },
          {
            name: "Order size",
            value: `${Number(trade.size || 0).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })} shares`,
            inline: true,
          },
          {
            name: "Approx. amount",
            value: money(tradeValue),
            inline: true,
          },
          {
            name: "Executed",
            value: `<t:${timestamp}:R>`,
            inline: true,
          },
          {
            name: "Market",
            value: trade.title || "Open Polymarket market",
            inline: false,
          },
        ],
        thumbnail: trade.icon ? { url: trade.icon } : undefined,
        footer: {
          text: "Public trade alert • Not financial advice • Verify price before acting",
        },
        timestamp: new Date(timestamp * 1000).toISOString(),
      },
    ],
  };

  const response = await fetch(`${WEBHOOK_URL}?wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Discord webhook returned ${response.status}: ${detail.slice(0, 200)}`);
  }
}

let shuttingDown = false;
let running = false;

async function poll() {
  if (running || shuttingDown) return;
  running = true;

  try {
    const state = await loadState();
    const seen = new Set(state.seen);
    const nowEpoch = Math.floor(Date.now() / 1000);
    const startEpoch = nowEpoch - LOOKBACK_MINUTES * 60;
    const traders = await getTopTraders();

    const results = await Promise.allSettled(
      traders.map(async (trader) => ({
        trader,
        trades: await getRecentBuyTrades(trader.proxyWallet, startEpoch),
      }))
    );

    const matches = [];
    for (const result of results) {
      if (result.status === "rejected") {
        console.warn("A trader request failed:", result.reason?.message || result.reason);
        continue;
      }

      const { trader, trades } = result.value;
      for (const trade of trades) {
        const price = Number(trade.price);
        if (
          trade.side === "BUY" &&
          Number.isFinite(price) &&
          price >= MIN_PRICE &&
          price <= MAX_PRICE
        ) {
          matches.push({ trader, trade, id: uniqueTradeId(trade) });
        }
      }
    }

    matches.sort((a, b) => Number(a.trade.timestamp) - Number(b.trade.timestamp));

    const firstRun = !state.initialized;
    let sent = 0;

    for (const match of matches) {
      if (seen.has(match.id)) continue;

      if (!firstRun || SEND_EXISTING) {
        await sendDiscordAlert(match.trader, match.trade);
        sent += 1;
        // Be gentle with Discord if several trades appear at once.
        await sleep(600);
      }
      seen.add(match.id);
    }

    // Also mark every recent trade, not only matches, to make future criteria
    // changes less likely to create a flood of old alerts.
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const trade of result.value.trades) {
        seen.add(uniqueTradeId(trade));
      }
    }

    await saveState({ initialized: true, seen: [...seen] });

    const time = new Date().toLocaleTimeString();
    if (firstRun && !SEND_EXISTING) {
      console.log(
        `[${time}] Alert watcher initialized. Existing recent trades were recorded; only new matching buys will be sent.`
      );
    } else {
      console.log(
        `[${time}] Checked ${traders.length} top traders; ${matches.length} recent matches; ${sent} new Discord alert(s).`
      );
    }
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Alert check failed:`, error.message);
  } finally {
    running = false;
  }
}

process.on("SIGINT", () => {
  shuttingDown = true;
  console.log("\nStopping Discord value alerts…");
  process.exit(0);
});

process.on("SIGTERM", () => {
  shuttingDown = true;
  process.exit(0);
});

console.log(
  `Watching top ${TOP_TRADERS} ${CATEGORY} traders for BUY trades from ${cents(
    MIN_PRICE
  )} to ${cents(MAX_PRICE)} every ${POLL_SECONDS} seconds.`
);
console.log("Keep this terminal running to receive alerts.");
await poll();

while (!shuttingDown) {
  await sleep(POLL_SECONDS * 1000);
  await poll();
}
