import { NextResponse } from "next/server";

const LEADERBOARD_API = "https://data-api.polymarket.com/v1/leaderboard";
const POSITIONS_API = "https://data-api.polymarket.com/positions";
const MARKETS_API = "https://gamma-api.polymarket.com/markets";

type Trader = {
  rank: string;
  proxyWallet: string;
  userName: string;
};

type Position = {
  proxyWallet: string;
  conditionId: string;
  asset: string;
  title: string;
  slug: string;
  eventSlug?: string;
  icon?: string;
  outcome: string;
  avgPrice: number;
  curPrice: number;
  currentValue: number;
  initialValue: number;
  cashPnl: number;
};

type Market = {
  conditionId: string;
  gameStartTime?: string | null;
  active?: boolean | null;
  closed?: boolean | null;
  acceptingOrders?: boolean | null;
  slug?: string | null;
  question?: string | null;
  icon?: string | null;
  events?: Array<{ slug?: string | null; title?: string | null }>;
};

function displayName(trader: Trader) {
  const name = trader.userName?.trim();
  if (name) return name;
  const wallet = trader.proxyWallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

async function getJson(url: URL | string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Polymarket quick-bet upstream error:", response.status, detail);
    throw new Error(`An upstream Polymarket endpoint returned ${response.status}.`);
  }

  return response.json();
}

export async function GET() {
  try {
    const leaderboardUrl = new URL(LEADERBOARD_API);
    leaderboardUrl.searchParams.set("category", "SPORTS");
    leaderboardUrl.searchParams.set("timePeriod", "ALL");
    leaderboardUrl.searchParams.set("orderBy", "PNL");
    leaderboardUrl.searchParams.set("limit", "10");
    leaderboardUrl.searchParams.set("offset", "0");

    const traders = (await getJson(leaderboardUrl)) as Trader[];
    if (!Array.isArray(traders)) {
      throw new Error("Unexpected leaderboard response.");
    }

    const positionsByTrader = await Promise.all(
      traders.map(async (trader) => {
        const url = new URL(POSITIONS_API);
        url.searchParams.set("user", trader.proxyWallet);
        url.searchParams.set("sizeThreshold", "1");
        url.searchParams.set("limit", "500");
        url.searchParams.set("offset", "0");
        url.searchParams.set("sortBy", "CURRENT");
        url.searchParams.set("sortDirection", "DESC");

        const positions = (await getJson(url)) as Position[];
        return {
          trader,
          positions: Array.isArray(positions) ? positions : [],
        };
      })
    );

    const allPositions = positionsByTrader.flatMap(({ trader, positions }) =>
      positions.map((position) => ({ trader, position }))
    );

    const conditionIds = [
      ...new Set(
        allPositions
          .map(({ position }) => position.conditionId)
          .filter(Boolean)
      ),
    ];

    const markets: Market[] = [];
    const batchSize = 25;

    for (let index = 0; index < conditionIds.length; index += batchSize) {
      const batch = conditionIds.slice(index, index + batchSize);
      const url = new URL(MARKETS_API);
      url.searchParams.set("limit", String(batch.length));
      url.searchParams.set("closed", "false");
      for (const conditionId of batch) {
        url.searchParams.append("condition_ids", conditionId);
      }

      const data = await getJson(url);
      if (Array.isArray(data)) markets.push(...data);
    }

    const now = Date.now();
    const oneHourFromNow = now + 60 * 60 * 1000;
    const qualifyingMarkets = new Map(
      markets
        .filter((market) => {
          if (!market.gameStartTime) return false;
          const start = new Date(market.gameStartTime).getTime();
          return (
            Number.isFinite(start) &&
            start > now &&
            start <= oneHourFromNow &&
            market.closed !== true &&
            market.active !== false
          );
        })
        .map((market) => [market.conditionId.toLowerCase(), market])
    );

    const grouped = new Map<
      string,
      {
        market: Market;
        positions: Array<{
          trader: string;
          rank: string;
          wallet: string;
          outcome: string;
          avgPrice: number;
          curPrice: number;
          currentValue: number;
          initialValue: number;
          cashPnl: number;
        }>;
        fallback: Position;
      }
    >();

    for (const { trader, position } of allPositions) {
      const market = qualifyingMarkets.get(position.conditionId.toLowerCase());
      if (!market) continue;

      const key = position.conditionId.toLowerCase();
      const existing = grouped.get(key) || {
        market,
        positions: [],
        fallback: position,
      };

      existing.positions.push({
        trader: displayName(trader),
        rank: trader.rank,
        wallet: trader.proxyWallet,
        outcome: position.outcome,
        avgPrice: Number(position.avgPrice) || 0,
        curPrice: Number(position.curPrice) || 0,
        currentValue: Number(position.currentValue) || 0,
        initialValue: Number(position.initialValue) || 0,
        cashPnl: Number(position.cashPnl) || 0,
      });
      grouped.set(key, existing);
    }

    const data = [...grouped.entries()]
      .map(([conditionId, group]) => {
        const start = new Date(group.market.gameStartTime as string).getTime();
        const uniqueTraders = new Set(
          group.positions.map((position) => position.wallet.toLowerCase())
        );

        return {
          conditionId,
          title:
            group.market.question ||
            group.market.events?.[0]?.title ||
            group.fallback.title,
          slug: group.market.slug || group.fallback.slug,
          eventSlug:
            group.market.events?.[0]?.slug || group.fallback.eventSlug,
          icon: group.market.icon || group.fallback.icon,
          gameStartTime: group.market.gameStartTime,
          minutesUntilStart: Math.max(1, Math.ceil((start - now) / 60000)),
          totalCurrentValue: group.positions.reduce(
            (sum, position) => sum + position.currentValue,
            0
          ),
          totalInitialValue: group.positions.reduce(
            (sum, position) => sum + position.initialValue,
            0
          ),
          traderCount: uniqueTraders.size,
          positions: group.positions.sort(
            (a, b) => b.currentValue - a.currentValue
          ),
        };
      })
      .sort((a, b) => {
        const aStart = a.gameStartTime ? new Date(a.gameStartTime).getTime() : Number.MAX_SAFE_INTEGER;
        const bStart = b.gameStartTime ? new Date(b.gameStartTime).getTime() : Number.MAX_SAFE_INTEGER;
        if (aStart !== bStart) return aStart - bStart;
        return b.totalCurrentValue - a.totalCurrentValue;
      });

    return NextResponse.json(
      { data, generatedAt: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30",
        },
      }
    );
  } catch (error) {
    console.error("Quick Bets request failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The server could not build the Quick Bets feed.",
      },
      { status: 502 }
    );
  }
}
