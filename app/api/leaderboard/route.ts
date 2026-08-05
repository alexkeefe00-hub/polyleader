import { NextRequest, NextResponse } from "next/server";

const API = "https://data-api.polymarket.com/v1/leaderboard";
const categories = new Set([
  "OVERALL",
  "POLITICS",
  "SPORTS",
  "ESPORTS",
  "CRYPTO",
  "CULTURE",
  "MENTIONS",
  "WEATHER",
  "ECONOMICS",
  "TECH",
  "FINANCE",
]);
const periods = new Set(["DAY", "WEEK", "MONTH", "ALL"]);
const orders = new Set(["PNL", "VOL"]);

export async function GET(request: NextRequest) {
  const incoming = request.nextUrl.searchParams;
  const category = (incoming.get("category") || "OVERALL").toUpperCase();
  const timePeriod = (incoming.get("period") || "ALL").toUpperCase();
  const orderBy = (incoming.get("order") || "PNL").toUpperCase();
  const requestedLimit = Number(incoming.get("limit") || 10);
  const limit = Math.min(50, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 10));

  if (!categories.has(category) || !periods.has(timePeriod) || !orders.has(orderBy)) {
    return NextResponse.json(
      { error: "One or more leaderboard filters are invalid." },
      { status: 400 }
    );
  }

  const url = new URL(API);
  url.searchParams.set("category", category);
  url.searchParams.set("timePeriod", timePeriod);
  url.searchParams.set("orderBy", orderBy);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", "0");

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Polymarket leaderboard error:", response.status, detail);
      return NextResponse.json(
        { error: `Polymarket returned status ${response.status}.` },
        { status: 502 }
      );
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return NextResponse.json(
        { error: "Polymarket returned an unexpected leaderboard response." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { data },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30",
        },
      }
    );
  } catch (error) {
    console.error("Leaderboard request failed:", error);
    return NextResponse.json(
      { error: "The server could not reach Polymarket." },
      { status: 502 }
    );
  }
}
