import { NextRequest, NextResponse } from "next/server";

const API = "https://data-api.polymarket.com/positions";
const walletPattern = /^0x[a-fA-F0-9]{40}$/;

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet") || "";

  if (!walletPattern.test(wallet)) {
    return NextResponse.json(
      { error: "A valid 0x wallet address is required." },
      { status: 400 }
    );
  }

  const url = new URL(API);
  url.searchParams.set("user", wallet);
  url.searchParams.set("sizeThreshold", "1");
  url.searchParams.set("limit", "500");
  url.searchParams.set("offset", "0");
  url.searchParams.set("sortBy", "CURRENT");
  url.searchParams.set("sortDirection", "DESC");

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Polymarket positions error:", response.status, detail);
      return NextResponse.json(
        { error: `Polymarket returned status ${response.status}.` },
        { status: 502 }
      );
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return NextResponse.json(
        { error: "Polymarket returned an unexpected positions response." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { data },
      {
        headers: {
          "Cache-Control": "public, s-maxage=20, stale-while-revalidate=20",
        },
      }
    );
  } catch (error) {
    console.error("Positions request failed:", error);
    return NextResponse.json(
      { error: "The server could not reach Polymarket." },
      { status: 502 }
    );
  }
}
