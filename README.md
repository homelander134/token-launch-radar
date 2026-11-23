# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/homelander134/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/homelander134/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar ranks 178 pre-token protocols by the implied value of the token they may one day issue, from a sealed DefiLlama snapshot, and shows how to farm each one. Multiples come from the snapshot's own token-bearing peers; the dashboard is a static page that renders offline.

## Run it

```sh
# snapshot.json is the sealed DefiLlama snapshot from the bounty kit (input/snapshot.json)
mkdir -p out && node main.ts --input snapshot.json --output out
```

## How the model works

Model version **radar-3.0** (`lib/model.ts`). One sealed snapshot in, one ranked board out. Every number on the board is computed at runtime from the snapshot itself — no hard-coded protocol names or values. A protocol is **pre-token** when its record carries no token at all: no CoinGecko id, no symbol, and no market cap.

The implied value of a protocol is:

```
implied = max(1, round(TVL × multiple × growth × maturity × chain))
```

**Multiple — the valuation multiple.** The core of the model. For each category, take the token-bearing (priced) protocols in that category and compute the median of their market-cap/TVL ratios. Each peer's own ratio is **winsorized at 5×** first, so one thin-TVL peer trading at hundreds of times its TVL cannot dominate a median. The multiple is then a **shrinkage blend** with k = 3, which pulls a thin category toward its family instead of either trusting a one-peer median or jumping straight to the family median:

- Category with at least 1 priced peer: `multiple = (nCat × category median + 3 × family median) / (nCat + 3)`. Source is `category` when nCat ≥ 3, otherwise `family`.
- Category with no priced peer, but a family with at least 1: `multiple = (nFam × family median + 3 × global median) / (nFam + 3)`, source `family`.
- Otherwise the market-wide median over all priced peers, source `global`.

Categories are grouped into families of close substitutes (credit, trading, yield, asset-backed, infra, and services for everything else). Because the blend depends on how many peers a category has, two categories that used to collapse onto the same family median now get different multiples — the top of the board is no longer nearly TVL order. `peers_used` is the count of distinct priced peers behind the multiple (the family pool already contains the category's peers).

**Growth — recent momentum.** `growth = 1 + clamp(change_7d, -40, +60) / 100 × 0.5`, so it ranges from 0.8 to 1.3. The clamp is deliberately tight: one week's TVL swing can be extreme (the snapshot's largest is +4448%), and a single week should move a valuation, not decide it. Unknown 7-day change counts as 0, so growth is 1.0.

**Maturity — how long it has run.** `maturity = 0.8 + min(max(age_days or 365, 0), 1095) / 1095 × 0.2`, ranging from 0.8 to 1.0. Age is days from `listed_at` to the snapshot date; a protocol with no listing date counts as 365 days old. The range is compressed on purpose: longevity is weak evidence about a future token, so it nudges the ranking instead of driving it.

**Chain — breadth.** `chain = 1 + min(chains − 1, 5) × 0.02`, ranging from 1.0 (single-chain) to 1.1 (six or more chains). Running on more chains means more users to reach, worth a small premium and no more.

**Confidence — how much evidence backs the row.** Each row carries a `confidence` score (top-level and under `model.confidence`, same value):

```
confidence = 0.5 × min(peers_used / 15, 1)
           + 0.25 × (age known ? 1 : 0.4)
           + 0.25 × (change_7d known ? 1 : 0.4)
```

Half the score comes from peer depth (15 or more priced peers behind the multiple earns the full half), a quarter from knowing the protocol's age, and a quarter from knowing its 7-day change. Confidence is a measure of evidence, not a second ranking: a high-implied-value row with low confidence is a thinly supported guess, and the board shows both numbers side by side.

**Comparables and farm plans.** Each row lists its top 5 same-category priced peers by market cap, so the multiple can be checked against real tokens. Each row also gets a 7-step farm plan derived from its own record (category, primary chain, TVL tier, age): a fresh wallet, the category's core action, a weekly habit, a holding period, a check-before-you-claim warning, a farm log — plus a seventh step that differs by row. Watchlist protocols get a "use the main app at least weekly" step; early-radar protocols get a "start with the smallest amount the protocol's own minimum allows and confirm the deposit lands before adding more" step. No step ever promises an airdrop, and no step ever asks anyone to pay to claim one.

**Category stats.** The output also carries `category_stats`: per category, the number of board rows, their total implied value, the category median multiple, and the priced-peer count — sorted by total implied value, so the categories dominating the board are visible at a glance.

## Worked example — rank #1

Steakhouse Financial (Risk Curators), from the sealed snapshot dated 2026-11-14:

| Input | Value |
| --- | --- |
| TVL | $2,753,981,495 |
| Category median mcap/TVL (Risk Curators) | 2.9747, from 1 priced peer |
| Family median mcap/TVL (yield family) | 0.1448, from 20 priced peers |
| Multiple | (1 × 2.9747 + 3 × 0.1448) / (1 + 3) = **0.8523**, source `family` |
| 7-day TVL change | −2.1935% → growth = 1 + (−2.1935 / 100) × 0.5 = **0.989** |
| Age | 543 days (listed 2025-05-20) → maturity = 0.8 + 543 / 1095 × 0.2 = **0.8992** |
| Chains | 11 → chain = 1 + min(10, 5) × 0.02 = **1.1** |
| Confidence | peers_used 20 (≥ 15), age known, change known → **1.0** |

```
implied = 2,753,981,495 × 0.8523 × 0.989 × 0.8992 × 1.1
        = 2,296,142,204.08
        → $2,296,142,204
```

Note how the shrinkage works here: Risk Curators has only one priced peer, whose ratio (2.9747) would be a shaky multiple on its own. Blending it with the yield family's 0.1448 pulls the multiple down to 0.8523 — the category's evidence is heard, but it does not get to set the price alone.

## How to read the board

- **Rank and implied value** are the ranking itself: rank 1 is the largest implied token value in the snapshot, rank 178 the smallest. All 178 implied values are distinct and positive.
- **Multiple and its source** say where the valuation came from. `category` means the category had at least 3 priced peers; `family` means the multiple leans on the family (thin category, or no priced peer in the category at all); `global` means neither category nor family had a priced peer. A `family` multiple on a thin category is a weaker claim than a `category` multiple — check the comparables.
- **Peers used** is how many priced peers back the multiple. Rows with 3 or fewer peers deserve extra scepticism; only 7 of the 178 rows are that thin.
- **Confidence** is the evidence score (see above). Most rows score 0.9 or above; the lowest scores belong to rows missing an age, a 7-day change, or peer depth. Read a low-confidence row's implied value as a rough guess.
- **Growth, maturity, chain** are the three small multipliers. Growth moves a row by −20% to +30%, maturity by −20% to 0%, chain by 0% to +10% — none of them can rescue or ruin a row on its own; the multiple and the TVL do the heavy lifting.
- **Comparables** are the top 5 same-category tokens by market cap. If their multiples cluster far from the row's multiple, the row's multiple is being pulled by its family, not its category.
- **Farm steps** are a plan for positioning for a possible future token: what to do, what it costs, and how long it takes. They are generic DeFi hygiene plus the protocol's own core action — not a promise of a reward.
- **Live view** is separate: protocols that already have a token are shown with the market's own market cap, never mixed into the ranked board.
- **Watchlist vs early.** The 40 watchlist protocols are always on the board; the other 138 rows are pre-token protocols below the $50,000,000 watchlist floor that passed the house exclusions (no bridge, liquid staking/restaking or exchange product, no versioned pool name, no wrapped or staked product name, no exchange-branded name).

## Limitations

- **The snapshot is sealed.** Everything is computed from one DefiLlama snapshot dated 2026-11-14. Protocols launched, listed, or repriced after that date are not in the board, and nothing here updates with the live market.
- **Implied values are this entry's own claims, not market prices.** An implied value is TVL times a peer-derived multiple times three small adjustments. It is a model output, not a prediction of what a token would trade at — no token here is predicted to launch, and no launch date or price is claimed.
- **Multiples come from thin peer sets.** Some categories have one priced peer or none, so their multiples lean heavily on family or global medians. The confidence score and `peers_used` flag exactly those rows; treat them as the roughest estimates on the board.
- **TVL and 7-day change are point-in-time figures.** TVL can be inflated by incentives or a single large depositor, and a one-week change can be noise. The tight growth clamp and the compressed maturity range limit how far either can move a row, but they cannot remove the noise.
- **Farm steps position for a possibility, not a payout.** Doing the steps does not guarantee a token, an airdrop, or any reward. Never pay to claim anything, and only ever claim from a link the protocol itself publishes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=sadffcr3&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
