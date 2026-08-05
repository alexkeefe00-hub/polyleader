const url = process.env.DISCORD_WEBHOOK_URL?.trim();

if (!url) {
  throw new Error("DISCORD_WEBHOOK_URL is missing from .env.local.");
}

const response = await fetch(`${url}?wait=true`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: "PolyLeader Value Alerts",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: "✅ PolyLeader alerts connected",
        description:
          "Your Discord webhook is working. New matching top-trader BUY trades will appear here when the alert watcher is running.",
        color: 0x38d996,
        fields: [
          { name: "Price range", value: `${process.env.ALERT_MIN_PRICE || "0.40"}–${process.env.ALERT_MAX_PRICE || "0.55"}`, inline: true },
          { name: "Category", value: process.env.ALERT_CATEGORY || "SPORTS", inline: true },
        ],
        footer: { text: "Test message only • No order was placed" },
        timestamp: new Date().toISOString(),
      },
    ],
  }),
});

if (!response.ok) {
  throw new Error(`Discord returned ${response.status}: ${await response.text()}`);
}

console.log("Test message sent successfully. Check your Discord channel.");
