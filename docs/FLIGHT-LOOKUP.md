# Connecting live flight status

The **Check** button on a movement is not connected. This is what it would take.

## Why it cannot work in the page

Checking a flight means reading Flightradar24 or eia.krd. Neither offers a free
public API, and a browser cannot fetch them cross-origin anyway. So the lookup
has to be done by something that can search the web on the page's behalf.

Two routes were tried and neither works:

| Approach | Why not |
|---|---|
| `fetch("https://api.anthropic.com/v1/messages")` from the page | Carries no API key, no `anthropic-version` header and no `anthropic-dangerous-direct-browser-access` header. It fails on every request. Adding a key would publish that key to every user who opens the page. |
| The host's `sample` capability | It is the supported way for a page to ask Claude, and the ticket scanner now uses it. But it **cannot browse** — no web search, no fetching. It can only reason about what the page hands it. |

Asking the model for a flight time without a web search would produce an
invented answer. For a driver dispatch time that is worse than no answer, so
the button reports "not connected" instead.

## What connecting it needs

One small server-side endpoint that holds the API key and runs the web search
tool. Anything that can run a function works — an Azure Function alongside a
SharePoint deployment, a Cloudflare Worker, a route on any server you already
have.

The key never leaves the server. The page calls your endpoint, not Anthropic.

```ts
// POST /api/flight-status  { flightNo, date, kind, airport, today }
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

export async function flightStatus(req: {
  flightNo: string; date: string; kind: "ARR" | "DEP";
  airport: string; today: string;
}) {
  const where = req.kind === "ARR"
    ? `arriving at ${req.airport || "Erbil (EIA)"}`
    : `departing from ${req.airport || "Erbil (EIA)"}`;

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    tools: [{ type: "web_search_20260209", name: "web_search" }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["found", "status", "scheduled", "actual", "deltaMinutes", "note", "source"],
          properties: {
            found: { type: "boolean" },
            status: {
              type: "string",
              enum: ["On schedule", "Delayed", "Earlier", "Cancelled",
                     "Diverted", "Landed", "Departed", "Unknown"],
            },
            scheduled: { type: "string" },
            actual: { type: "string" },
            deltaMinutes: { type: "number" },
            note: { type: "string" },
            source: { type: "string" },
          },
        },
      },
    },
    messages: [{
      role: "user",
      content: `Today is ${req.today}. Find the status of flight ${req.flightNo} ${where} on ${req.date}.

Check Flightradar24 (flightradar24.com) and Erbil International Airport (eia.krd) first, then the operating airline's own flight-status page.

Rules:
- Use 24-hour local time at the airport. Leave "scheduled" or "actual" as "" if you cannot find them.
- "deltaMinutes": positive if later than scheduled, negative if earlier, 0 if unchanged.
- Live status only exists roughly 3 days ahead. If ${req.date} is further out, set "found" to false and "status" to "Unknown", and say in "note" that only the published timetable is available so far.
- If you cannot confirm the flight at all, set "found" to false and "status" to "Unknown". Never guess.`,
    }],
  });

  const block = response.content.find((b) => b.type === "text");
  return JSON.parse(block.text);
}
```

Two differences from the code this replaces, both deliberate:

- **`output_config.format`** with a JSON schema, instead of asking for JSON in
  the prompt and then hunting for `{`…`}` in the reply. The response is
  guaranteed to match the schema.
- **`web_search_20260209`**, the current web search tool. The old code used
  `web_search_20250305`, the basic variant kept for older models.

## Wiring the page back up

`lookupFlight()` in the tracker currently returns `found: false` with a note.
Replace its body with a call to your endpoint; the result shape it returns is
already what the rest of the app expects, so nothing else changes:

```js
async function lookupFlight({ flightNo, date, kind, airport, today }) {
  const res = await fetch("/api/flight-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flightNo, date, kind, airport, today }),
  });
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
  return res.json();
}
```

Everything the lookup returns stays a **suggestion**: a person presses Apply
before any time on a record changes. Keep that — an automated flight time
written straight into a record is how a driver ends up at the airport at the
wrong hour with nobody having checked.

## Cost

One lookup is a single request with a web search. At Opus 5 rates
($5/MTok in, $25/MTok out) a check costs well under a cent. Checking every
open flight once a day for a 60-person rotation is a few cents a day.
