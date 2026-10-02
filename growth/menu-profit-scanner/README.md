# Menu Profit Scanner

A single-file web tool that shows an Indian café or QSR owner how much money
their menu leaks every month, and the exact price and portion moves that
recover it. It exists to open the CaféOS sales conversation with a number
instead of a feature list.

Live (private artifact, owner-only until shared):
https://claude.ai/artifact/E7bivJFcS1GEC3dy6J7LPm

## Why this and not another app

Café owners do not wake up wanting a POS. They wake up wanting margin. This
tool takes two minutes of their own numbers and hands back a figure like
"₹1,12,000 a month, ₹13.5 lakh a year" with a ranked list of decisions behind
it. Every one of those decisions needs item-level cost and sales data to
sustain — which is what CaféOS already stores. The tool creates the want; the
platform answers it.

## What it computes

Inputs per item: menu price, plate cost (raw material only), monthly units.
Global inputs: fixed costs, wastage %, target food cost %, and whether menu
prices include the 5% restaurant GST.

| Output | Formula |
|---|---|
| Net price | `price ÷ 1.05` when prices are GST-inclusive |
| Effective plate cost | `plate cost × (1 + wastage%)` |
| Food cost % | `effective cost ÷ net price` |
| Contribution margin | `net price − effective cost` |
| Quadrant | Kasavana–Smith: popularity cut at 70% of an even share of covers, margin cut at the weighted average margin |
| Break-even | `fixed costs ÷ average margin ÷ 30` plates a day |

Four levers generate the recoverable figure. Plowhorses are repriced in ₹5
steps toward the menu average margin, capped at +15%, with 6% volume loss
assumed — or their plate cost is trimmed to the target, whichever pays more
(never both). Puzzles get a 25% volume-lift assumption from card placement
and staff upsell. Dogs are delisted with 30% of covers moving to the
highest-margin Star. Wastage is brought to 3%.

The assumptions are printed on the page. The 25% Puzzle lift is the softest
one and is labelled as a test rather than a forecast.

## Monetisation

Three paths, in the order they pay off.

**1. Lead wedge for CaféOS (highest value).** Run the scan in front of the
owner, on their numbers. Save it to the pipeline, send the WhatsApp summary.
The close is: "These four moves need item-level cost and sales tracking every
day. That is what CaféOS does." A café staring at ₹13 lakh a year does not
argue about a ₹3,000/month subscription.

**2. Paid audit.** ₹4,999 for a sit-down scan plus a recipe-costing sheet and
a reprinted menu card with the quadrant-driven layout. Cash in week one, no
product dependency, and it ends with the same CaféOS close.

**3. Self-serve tier.** Free scan up to 10 items; paid above that, with saved
history and month-on-month tracking. Only worth building once paths 1 and 2
prove the pitch converts.

## Pipeline

Every scan can be saved — café name, contact, recoverable figure, food cost %,
and the full summary text — into the artifact's shared database under the
`scans` collection. Signed-in viewers see the panel; it stays hidden for
everyone else. Read the pipeline back with the `ArtifactData` tool, or ask
Claude for it.

## Honest limits

- Output quality is bounded by plate-cost accuracy. Owners who guess their
  plate costs get a guessed answer. Weigh the top ten items first.
- The volume-response assumptions are rules of thumb from menu-engineering
  practice, not measurements of this café. They are a basis for a priced
  decision, not an audited projection.
- Nothing here is a guarantee of revenue. It is a well-grounded estimate with
  its method printed on the page, which is the most an owner should accept
  from any tool.

## Running it

`growth/menu-profit-scanner/index.html` is a standalone file — open it in a
browser, no build step and no dependencies. The pipeline panel only appears
when it runs as a published Claude artifact; everything else works offline.
