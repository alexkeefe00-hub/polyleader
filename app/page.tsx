"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Category =
  | "OVERALL"
  | "SPORTS"
  | "ESPORTS"
  | "CRYPTO"
  | "POLITICS";

type Period = "DAY" | "WEEK" | "MONTH" | "ALL";
type Order = "PNL" | "VOL";

type Trader = {
  rank: string;
  proxyWallet: string;
  userName: string;
  vol: number;
  pnl: number;
  profileImage?: string;
  xUsername?: string;
  verifiedBadge?: boolean;
};

type Position = {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  totalBought: number;
  realizedPnl: number;
  percentRealizedPnl: number;
  curPrice: number;
  title: string;
  slug: string;
  icon?: string;
  eventSlug?: string;
  outcome: string;
  endDate?: string;
};

type QuickBet = {
  conditionId: string;
  title: string;
  slug: string;
  eventSlug?: string;
  icon?: string;
  gameStartTime: string;
  minutesUntilStart: number;
  totalCurrentValue: number;
  totalInitialValue: number;
  traderCount: number;
  positions: Array<{
    trader: string;
    rank: string;
    wallet: string;
    outcome: string;
    avgPrice: number;
    curPrice: number;
    currentValue: number;
    cashPnl: number;
  }>;
};


const categories: Array<{ value: Category; label: string }> = [
  { value: "OVERALL", label: "Overall" },
  { value: "SPORTS", label: "Sports" },
  { value: "ESPORTS", label: "eSports" },
  { value: "CRYPTO", label: "Crypto" },
  { value: "POLITICS", label: "Politics" },
];

const periods: Array<{ value: Period; label: string }> = [
  { value: "DAY", label: "Today" },
  { value: "WEEK", label: "Week" },
  { value: "MONTH", label: "Month" },
  { value: "ALL", label: "All time" },
];

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1_000 ? 0 : 2,
  }).format(value || 0);
}

function cents(value: number) {
  return `${Math.round((value || 0) * 100)}¢`;
}

function shortWallet(wallet: string) {
  if (!wallet) return "Unknown wallet";
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

function traderName(trader: Trader) {
  return trader.userName?.trim() || shortWallet(trader.proxyWallet);
}

export default function Home() {
  const [category, setCategory] = useState<Category>("OVERALL");
  const [period, setPeriod] = useState<Period>("ALL");
  const [order, setOrder] = useState<Order>("PNL");
  const [limit, setLimit] = useState(10);
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const [selected, setSelected] = useState<Trader | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionsError, setPositionsError] = useState("");
  const [positionSearch, setPositionSearch] = useState("");

  const [quickBets, setQuickBets] = useState<QuickBet[]>([]);
  const [quickLoading, setQuickLoading] = useState(true);
  const [quickRefreshing, setQuickRefreshing] = useState(false);
  const [quickError, setQuickError] = useState("");
  const [quickUpdatedAt, setQuickUpdatedAt] = useState<Date | null>(null);

  const loadQuickBets = useCallback(async (quiet = false) => {
    quiet ? setQuickRefreshing(true) : setQuickLoading(true);
    setQuickError("");

    try {
      const response = await fetch("/api/quick-bets", { cache: "no-store" });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Could not load quick bets.");
      }

      setQuickBets(body.data);
      setQuickUpdatedAt(new Date(body.generatedAt || Date.now()));
    } catch (err) {
      setQuickError(err instanceof Error ? err.message : "Unknown quick-bet error");
    } finally {
      setQuickLoading(false);
      setQuickRefreshing(false);
    }
  }, []);

  const loadLeaderboard = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setError("");

    try {
      const query = new URLSearchParams({
        category,
        period,
        order,
        limit: String(limit),
      });
      const response = await fetch(`/api/leaderboard?${query}`, {
        cache: "no-store",
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Could not load the leaderboard.");
      }

      setTraders(body.data);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, period, order, limit]);

  useEffect(() => {
    loadLeaderboard();
    const timer = window.setInterval(() => loadLeaderboard(true), 60_000);
    return () => window.clearInterval(timer);
  }, [loadLeaderboard]);

  useEffect(() => {
    loadQuickBets();
    const timer = window.setInterval(() => loadQuickBets(true), 60_000);
    return () => window.clearInterval(timer);
  }, [loadQuickBets]);

  async function openTrader(trader: Trader) {
    setSelected(trader);
    setPositions([]);
    setPositionsError("");
    setPositionSearch("");
    setPositionsLoading(true);

    try {
      const response = await fetch(
        `/api/positions?wallet=${encodeURIComponent(trader.proxyWallet)}`,
        { cache: "no-store" }
      );
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Could not load active positions.");
      }
      setPositions(body.data);
    } catch (err) {
      setPositionsError(
        err instanceof Error ? err.message : "Unknown position error"
      );
    } finally {
      setPositionsLoading(false);
    }
  }

  const filteredPositions = useMemo(() => {
    const q = positionSearch.trim().toLowerCase();
    if (!q) return positions;
    return positions.filter((position) =>
      `${position.title} ${position.outcome}`.toLowerCase().includes(q)
    );
  }, [positions, positionSearch]);

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="logo">P</div>
          <div>
            <div className="brandName">PolyLeader</div>
            <div className="brandSub">Public Polymarket intelligence</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}><a className="refreshButton" href="/strategy">Strategy Lab</a><button
          className="refreshButton"
          onClick={() => loadLeaderboard(true)}
          disabled={refreshing}
        >
          <span className={refreshing ? "spin" : ""}>↻</span>
          {refreshing ? "Refreshing" : "Refresh"}
        </button></div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">LIVE PUBLIC DATA</div>
          <h1>Track the traders at the top.</h1>
          <p>
            View Polymarket leaderboard rankings, open positions, entry prices,
            current values, and unrealized profit or loss.
          </p>
        </div>
        <div className="heroStat">
          <div className="pulseDot" />
          <div>
            <strong>Auto-refreshing</strong>
            <span>Every 60 seconds</span>
          </div>
        </div>
      </section>

      <section className="quickSection">
        <div className="sectionHead quickHead">
          <div>
            <div className="eyebrow">STARTING WITHIN 60 MINUTES</div>
            <h2>⚡ Quick Bets</h2>
            <p>
              Upcoming sports markets where one or more top-10 Sports traders
              currently hold an open position.
            </p>
          </div>
          <div className="quickActions">
            <span>
              {quickUpdatedAt
                ? `Updated ${quickUpdatedAt.toLocaleTimeString()}`
                : "Loading"}
            </span>
            <button
              className="refreshButton"
              onClick={() => loadQuickBets(true)}
              disabled={quickRefreshing}
            >
              <span className={quickRefreshing ? "spin" : ""}>↻</span>
              Refresh
            </button>
          </div>
        </div>

        {quickError ? (
          <div className="errorBox">
            <strong>Quick Bets could not be loaded.</strong>
            <span>{quickError}</span>
            <button onClick={() => loadQuickBets()}>Try again</button>
          </div>
        ) : quickLoading ? (
          <div className="quickGrid">
            {Array.from({ length: 3 }).map((_, index) => (
              <div className="quickCard quickSkeleton" key={index}>
                <div className="skeleton wideSkeleton" />
                <div className="skeleton valueSkeleton" />
              </div>
            ))}
          </div>
        ) : quickBets.length === 0 ? (
          <div className="quickEmpty card">
            <strong>No qualifying games right now.</strong>
            <span>
              This section only appears when a market starts within the next
              hour and a current top-10 Sports trader holds an open position.
            </span>
          </div>
        ) : (
          <div className="quickGrid">
            {quickBets.map((bet) => (
              <article className="quickCard" key={bet.conditionId}>
                <div className="quickCardTop">
                  {bet.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={bet.icon} alt="" />
                  ) : (
                    <div className="marketIcon">⚡</div>
                  )}
                  <div>
                    <div className="countdown">
                      Starts in {bet.minutesUntilStart} min
                    </div>
                    <h3>{bet.title}</h3>
                    <span>
                      {new Date(bet.gameStartTime).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                <div className="quickSummary">
                  <div>
                    <span>Top traders</span>
                    <strong>{bet.traderCount}</strong>
                  </div>
                  <div>
                    <span>Combined value</span>
                    <strong>{money(bet.totalCurrentValue)}</strong>
                  </div>
                </div>

                <div className="quickPositions">
                  {bet.positions.slice(0, 4).map((position) => (
                    <div
                      className="quickPosition"
                      key={`${position.wallet}-${position.outcome}`}
                    >
                      <div>
                        <strong>#{position.rank} {position.trader}</strong>
                        <span>{position.outcome}</span>
                      </div>
                      <div>
                        <strong>{cents(position.curPrice)}</strong>
                        <span>{money(position.currentValue)}</span>
                      </div>
                    </div>
                  ))}
                  {bet.positions.length > 4 && (
                    <div className="morePositions">
                      +{bet.positions.length - 4} more position
                      {bet.positions.length - 4 === 1 ? "" : "s"}
                    </div>
                  )}
                </div>

                <a
                  className="marketButton"
                  href={`https://polymarket.com/event/${bet.eventSlug || bet.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open market ↗
                </a>
              </article>
            ))}
          </div>
        )}

        <p className="quickDisclaimer">
          “Quick Bet” is a discovery tool only. Start times can change, public
          data may be delayed, and another trader&apos;s position is not a
          recommendation.
        </p>
      </section>

      <section className="controls card">
        <div className="controlBlock grow">
          <label>Category</label>
          <div className="segmented scrollable">
            {categories.map((item) => (
              <button
                key={item.value}
                className={category === item.value ? "active" : ""}
                onClick={() => setCategory(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="controlBlock">
          <label>Time range</label>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as Period)}
          >
            {periods.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="controlBlock">
          <label>Rank by</label>
          <select
            value={order}
            onChange={(event) => setOrder(event.target.value as Order)}
          >
            <option value="PNL">Profit</option>
            <option value="VOL">Volume</option>
          </select>
        </div>

        <div className="controlBlock">
          <label>Traders</label>
          <select
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          >
            <option value={10}>Top 10</option>
            <option value={25}>Top 25</option>
            <option value={50}>Top 50</option>
          </select>
        </div>
      </section>

      <section className="sectionHead">
        <div>
          <h2>Leaderboard</h2>
          <p>
            {category === "OVERALL" ? "All categories" : category} ·{" "}
            {periods.find((item) => item.value === period)?.label}
          </p>
        </div>
        <div className="lastUpdated">
          {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : "Loading"}
        </div>
      </section>

      {error && (
        <div className="errorBox">
          <strong>Data could not be loaded.</strong>
          <span>{error}</span>
          <button onClick={() => loadLeaderboard()}>Try again</button>
        </div>
      )}

      <section className="leaderboard card">
        <div className="tableHeader">
          <span>Rank / Trader</span>
          <span>Profit</span>
          <span>Volume</span>
          <span />
        </div>

        {loading ? (
          <div className="skeletonList">
            {Array.from({ length: 8 }).map((_, index) => (
              <div className="skeletonRow" key={index}>
                <div className="skeleton avatarSkeleton" />
                <div className="skeleton wideSkeleton" />
                <div className="skeleton valueSkeleton" />
              </div>
            ))}
          </div>
        ) : traders.length === 0 && !error ? (
          <div className="emptyState">
            No traders were returned for these filters.
          </div>
        ) : (
          <div className="rows">
            {traders.map((trader) => (
              <button
                className="traderRow"
                key={trader.proxyWallet}
                onClick={() => openTrader(trader)}
              >
                <div className="traderIdentity">
                  <div className={`rank rank${trader.rank}`}>
                    {trader.rank}
                  </div>
                  {trader.profileImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="avatar"
                      src={trader.profileImage}
                      alt=""
                    />
                  ) : (
                    <div className="avatar avatarFallback">
                      {traderName(trader).slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="nameGroup">
                    <div className="nameLine">
                      <strong>{traderName(trader)}</strong>
                      {trader.verifiedBadge && (
                        <span className="verified" title="Verified">
                          ✓
                        </span>
                      )}
                    </div>
                    <span>{shortWallet(trader.proxyWallet)}</span>
                  </div>
                </div>
                <div
                  className={`number pnl ${
                    trader.pnl >= 0 ? "positive" : "negative"
                  }`}
                >
                  {money(trader.pnl)}
                </div>
                <div className="number volume">{money(trader.vol)}</div>
                <div className="viewAction">View positions →</div>
              </button>
            ))}
          </div>
        )}
      </section>

      <footer>
        Uses public Polymarket data. Not affiliated with Polymarket. Information
        may be delayed and is not financial advice.
      </footer>

      {selected && (
        <div
          className="modalBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <section className="drawer" role="dialog" aria-modal="true">
            <div className="drawerHeader">
              <div className="selectedTrader">
                {selected.profileImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="avatar large" src={selected.profileImage} alt="" />
                ) : (
                  <div className="avatar large avatarFallback">
                    {traderName(selected).slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="eyebrow">RANK #{selected.rank}</div>
                  <h2>{traderName(selected)}</h2>
                  <span>{shortWallet(selected.proxyWallet)}</span>
                </div>
              </div>
              <button
                className="closeButton"
                aria-label="Close"
                onClick={() => setSelected(null)}
              >
                ×
              </button>
            </div>

            <div className="profileStats">
              <div>
                <span>Leaderboard P&amp;L</span>
                <strong className={selected.pnl >= 0 ? "positive" : "negative"}>
                  {money(selected.pnl)}
                </strong>
              </div>
              <div>
                <span>Leaderboard volume</span>
                <strong>{money(selected.vol)}</strong>
              </div>
              <div>
                <span>Open positions</span>
                <strong>{positionsLoading ? "…" : positions.length}</strong>
              </div>
            </div>

            <div className="drawerToolbar">
              <div>
                <h3>Active positions</h3>
                <p>Positions above the API&apos;s $1 default size threshold.</p>
              </div>
              <input
                value={positionSearch}
                onChange={(event) => setPositionSearch(event.target.value)}
                placeholder="Search positions"
              />
            </div>

            {positionsLoading ? (
              <div className="loadingPositions">Loading active positions…</div>
            ) : positionsError ? (
              <div className="errorBox compact">
                <strong>Positions could not be loaded.</strong>
                <span>{positionsError}</span>
              </div>
            ) : filteredPositions.length === 0 ? (
              <div className="emptyState">
                {positions.length === 0
                  ? "This trader has no active positions above the size threshold."
                  : "No positions match your search."}
              </div>
            ) : (
              <div className="positionGrid">
                {filteredPositions.map((position) => (
                  <a
                    className="positionCard"
                    href={`https://polymarket.com/event/${position.eventSlug || position.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    key={`${position.conditionId}-${position.asset}`}
                  >
                    <div className="positionTop">
                      {position.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={position.icon} alt="" />
                      ) : (
                        <div className="marketIcon">P</div>
                      )}
                      <div>
                        <h4>{position.title}</h4>
                        <span className="outcomePill">{position.outcome}</span>
                      </div>
                    </div>

                    <div className="positionNumbers">
                      <div>
                        <span>Entry</span>
                        <strong>{cents(position.avgPrice)}</strong>
                      </div>
                      <div>
                        <span>Current</span>
                        <strong>{cents(position.curPrice)}</strong>
                      </div>
                      <div>
                        <span>Value</span>
                        <strong>{money(position.currentValue)}</strong>
                      </div>
                      <div>
                        <span>P&amp;L</span>
                        <strong
                          className={
                            position.cashPnl >= 0 ? "positive" : "negative"
                          }
                        >
                          {money(position.cashPnl)}
                        </strong>
                      </div>
                    </div>

                    <div className="positionBottom">
                      <span>
                        {position.endDate
                          ? `Ends ${new Date(position.endDate).toLocaleDateString()}`
                          : "End date unavailable"}
                      </span>
                      <strong>
                        {position.percentPnl >= 0 ? "+" : ""}
                        {position.percentPnl.toFixed(1)}%
                      </strong>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
