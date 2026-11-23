// Token launch radar, model version radar-3.0.
//
// One sealed snapshot in, one ranked board out. Every number the board shows
// is computed at runtime from the snapshot itself: the valuation multiple for
// a protocol comes from the market caps and TVLs of the token-bearing
// protocols in its own category (or, when that category is thin, its family
// or the whole market), never from a hard-coded list of names or values.
// A protocol is pre-token when its record carries no token at all: no
// CoinGecko id, no symbol and no market cap.
//
//   multiple     a shrinkage blend (k = 3) of the category and family
//                medians of mcap/TVL over token-bearing peers: with nCat
//                priced peers in the category, (nCat * catMedian +
//                3 * famMedian) / (nCat + 3), source 'category' when
//                nCat >= 3 else 'family'; with no priced peer in the
//                category but nFam in the family, (nFam * famMedian +
//                3 * globalMedian) / (nFam + 3), source 'family'; else
//                the market-wide median, source 'global'. Blending
//                instead of switching means two protocols in the same
//                category no longer share one identical multiple unless
//                their categories genuinely coincide. Every peer's own
//                mcap/TVL is winsorized at 5 first, so one thin-TVL peer
//                (a token trading at hundreds of times its TVL) cannot
//                dominate a category's median or a comparable.
//   growth       clamp(change_7d, -40, 60); growthMult = 1 + growth/100 * 0.5
//                (range 0.8-1.3); unknown change_7d counts as 0, so 1.0.
//   maturity     0.8 + min(max(age_days or 365, 0), 1095) / 1095 * 0.2
//                (range 0.8-1.0); unknown age still counts as 365 days.
//   chain        1 + min(chains - 1, 5) * 0.02
//   implied      max(1, round(tvl * multiple * growthMult * maturityMult * chainMult))
//   confidence   0.5 * min(peers_used / 15, 1)
//                + 0.25 * (age known ? 1 : 0.4)
//                + 0.25 * (change_7d known ? 1 : 0.4)
//                A row's confidence is how much peer, age and momentum
//                evidence backs its implied value, not a second ranking.
//
// The board ranks every watchlist slug plus every pre-token protocol below
// the watchlist floor that passes the house exclusions (no bridge, liquid
// staking/restaking or exchange product, no versioned pool name, no wrapped
// or staked product name, no exchange-branded name). Live-token protocols
// are kept apart and shown with the market's own values, never mixed into
// the ranked board.

/** One protocol entry of the sealed snapshot: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label. */
export const MODEL_VERSION = 'radar-3.0';

/** How many live-token protocols the dashboard's live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The model's constants, all stated in the dashboard's data. */
export const MODEL = {
  growth_weight: 0.5,
  growth_floor: -40,
  growth_cap: 60,
  maturity_floor: 0.8,
  maturity_range: 0.2,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_step: 0.02,
  chain_cap: 5,
  peer_cap: 5,
  shrinkage_k: 3,
  confidence_peer_scale: 15,
  comparables: 5,
} as const;

/** Where a protocol's valuation multiple came from. */
export type MultipleSource = 'category' | 'family' | 'global';

/** Category families: groups of categories whose token-bearing protocols are
 *  close enough substitutes to stand in for each other when a single
 *  category has too few peers to trust on its own. */
export const FAMILIES: Record<string, string[]> = {
  credit: ['Lending', 'CDP', 'Basis Trading', 'Collateral Markets', 'Collateral Management'],
  trading: ['Dexs', 'Derivatives', 'Options', 'Prediction Market', 'Liquidity Manager', 'Leveraged Farming'],
  yield: ['Risk Curators', 'Onchain Capital Allocator', 'Yield', 'Yield Aggregator', 'Restaking', 'Liquid Restaking'],
  'asset-backed': ['RWA', 'CeDeFi', 'Stablecoin Wrapper', 'Dual-Token Stablecoin', 'Token Locker'],
  infra: ['Chain', 'Staking Pool'],
  // services is filled in at runtime: every category the snapshot carries
  // that no family above names. See familiesFor().
};

/** A peer's own mcap/TVL multiple, for a comparables row. */
export interface Comparable {
  slug: string;
  name: string;
  mcap_usd: number;
  tvl_usd: number;
  multiple: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  /** Top-level copies of the model figures, for the dashboard's detail view. */
  multiple: number;
  multiple_source: MultipleSource;
  peers_used: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  confidence: number;
  model: {
    multiple: number;
    multiple_source: MultipleSource;
    peers_used: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
    confidence: number;
  };
  comparables: Comparable[];
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's
 *  own value for it, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's share of the board: how many rows it holds, their total
 *  implied value, the category median multiple from the peer tables, and
 *  how many priced peers that median rests on. */
export interface CategoryStat {
  category: string;
  rows: number;
  total_implied_usd: number;
  median_multiple: number;
  peers: number;
}

/** Everything the dashboard needs: the board, the live set, and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: 'radar-3.0';
  model: {
    formula: string;
    peer_cap: number;
    shrinkage_k: number;
    confidence_peer_scale: number;
    growth_weight: number;
    growth_floor: number;
    growth_cap: number;
    maturity_floor: number;
    maturity_range: number;
    maturity_days: number;
    unknown_age_days: number;
    chain_step: number;
    chain_cap: number;
    global_multiple: number;
    multiples: Record<string, number>;
    families: Record<string, string[]>;
  };
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  category_stats: CategoryStat[];
  rows: BoardRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a list of numbers; 0 when the list is empty. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when
 *  either date is absent or unparseable. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol's record carries no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null && p.mcap_usd === null;
}

/** Whether a protocol bears a token and has the figures a multiple needs. */
function isPricedPeer(p: SnapshotProtocol): boolean {
  return !isPreToken(p) && (p.mcap_usd ?? 0) > 0 && p.tvl_usd > 0;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool
 *  of another protocol, not a protocol of its own. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A wrapped, staked or staking product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Categories that are a bridge, a liquid staking product or an exchange. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
/** Exchange brands a protocol name must not start with. */
const EXCHANGE_PREFIXES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

/** Whether a pre-token protocol may join the board below the watchlist floor:
 *  the house exclusions, applied to the snapshot's own fields. */
export function isEarlyEligible(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((prefix) => p.name.startsWith(prefix))) return false;
  return true;
}

/** The family a category belongs to, or 'services' for anything unlisted. */
export function familyOf(category: string | null, families: Record<string, string[]>): string {
  if (category === null) return 'services';
  for (const [family, categories] of Object.entries(families)) {
    if (categories.includes(category)) return family;
  }
  return 'services';
}

/** The families for this snapshot: the named families plus 'services' holding
 *  every category the snapshot carries that no named family names, sorted. */
export function familiesFor(snapshot: Snapshot): Record<string, string[]> {
  const named = new Set(Object.values(FAMILIES).flat());
  const services = new Set<string>();
  for (const p of snapshot.protocols) {
    if (p.category !== null && !named.has(p.category)) services.add(p.category);
  }
  const families: Record<string, string[]> = {};
  for (const [family, categories] of Object.entries(FAMILIES)) families[family] = [...categories];
  families['services'] = [...services].sort();
  return families;
}

/** The peer tables a snapshot yields: per-category medians of mcap/TVL over
 *  token-bearing protocols, per-family medians over the same peers pooled
 *  by family, and the market-wide median. */
export interface MultipleTables {
  multiples: Record<string, number>;
  peerCounts: Record<string, number>;
  familyMultiples: Record<string, number>;
  familyPeerCounts: Record<string, number>;
  globalMultiple: number;
  globalPeers: number;
  families: Record<string, string[]>;
}

export function computeMultiples(snapshot: Snapshot): MultipleTables {
  const families = familiesFor(snapshot);
  const peers = snapshot.protocols.filter(isPricedPeer);
  const byCategory = new Map<string, number[]>();
  const byFamily = new Map<string, number[]>();
  for (const p of peers) {
    const ratio = Math.min(p.mcap_usd! / p.tvl_usd, MODEL.peer_cap);
    const cat = p.category ?? 'Unknown';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(ratio);
    const family = familyOf(p.category, families);
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family)!.push(ratio);
  }
  const multiples: Record<string, number> = {};
  const peerCounts: Record<string, number> = {};
  for (const cat of [...byCategory.keys()].sort()) {
    multiples[cat] = round4(median(byCategory.get(cat)!));
    peerCounts[cat] = byCategory.get(cat)!.length;
  }
  const familyMultiples: Record<string, number> = {};
  const familyPeerCounts: Record<string, number> = {};
  for (const family of Object.keys(families).sort()) {
    const list = byFamily.get(family) ?? [];
    familyMultiples[family] = round4(median(list));
    familyPeerCounts[family] = list.length;
  }
  return {
    multiples,
    peerCounts,
    familyMultiples,
    familyPeerCounts,
    globalMultiple: round4(median(peers.map((p) => Math.min(p.mcap_usd! / p.tvl_usd, MODEL.peer_cap)))),
    globalPeers: peers.length,
    families,
  };
}

/** A protocol's valuation multiple, from the peer tables: a shrinkage
 *  blend with k = 3, so a thin category is pulled toward its family
 *  instead of either taking the category median on one peer or jumping
 *  straight to the family median.
 *
 *  Category with at least 1 priced peer: (nCat * catMedian +
 *  3 * famMedian) / (nCat + 3), source 'category' when nCat >= 3 else
 *  'family'. Category with 0 peers but a family with at least 1:
 *  (nFam * famMedian + 3 * globalMedian) / (nFam + 3), source 'family'.
 *  Otherwise the market-wide median, source 'global'.
 *
 *  peersUsed is the count of distinct priced peers that informed the
 *  multiple: the family pool already contains the category's peers, so
 *  in the category branch it is the family peer count; in the family
 *  branch the same; in the global branch the market-wide peer count. */
export function resolveMultiple(
  category: string | null,
  tables: MultipleTables,
): { multiple: number; source: MultipleSource; peersUsed: number } {
  const cat = category ?? 'Unknown';
  const catPeers = tables.peerCounts[cat] ?? 0;
  const catMedian = tables.multiples[cat];
  const family = familyOf(category, tables.families);
  const famPeers = tables.familyPeerCounts[family] ?? 0;
  const famMedian = tables.familyMultiples[family] ?? 0;
  if (catPeers >= 1 && catMedian !== undefined && famPeers >= 1) {
    const blended = (catPeers * catMedian + MODEL.shrinkage_k * famMedian) / (catPeers + MODEL.shrinkage_k);
    return { multiple: round4(blended), source: catPeers >= 3 ? 'category' : 'family', peersUsed: famPeers };
  }
  if (famPeers >= 1) {
    const blended = (famPeers * famMedian + MODEL.shrinkage_k * tables.globalMultiple) / (famPeers + MODEL.shrinkage_k);
    return { multiple: round4(blended), source: 'family', peersUsed: famPeers };
  }
  return { multiple: tables.globalMultiple, source: 'global', peersUsed: tables.globalPeers };
}

/** The multipliers and the implied value one protocol gets at a multiple:
 *  growth from its 7-day TVL change, maturity from how long it has run,
 *  chain breadth from how many chains it runs on. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiple: number,
): {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  chainMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  // Unknown 7-day change counts as no change: growth 1.0.
  const growthPct =
    protocol.change_7d === null
      ? 0
      : Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, finite(protocol.change_7d, 0)));
  const growthMult = round4(1 + (growthPct / 100) * MODEL.growth_weight);
  const ageForModel = age ?? MODEL.unknown_age_days;
  const maturityMult = round4(
    MODEL.maturity_floor +
      (Math.min(Math.max(ageForModel, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range,
  );
  const chainMult = round4(1 + Math.min(Math.max(protocol.chains.length - 1, 0), MODEL.chain_cap) * MODEL.chain_step);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult * chainMult));
  return { implied, growthPct, growthMult, maturityMult, chainMult, age };
}

/** How much evidence backs one row's implied value: half from how many
 *  priced peers informed its multiple (capped at 15 peers), a quarter
 *  from whether its age is known (0.4 when the listing date is missing),
 *  and a quarter from whether its 7-day change is known (0.4 when it is
 *  missing). A confidence score, not a second ranking. */
export function confidenceFor(peersUsed: number, age: number | null, changeKnown: boolean): number {
  return round4(
    0.5 * Math.min(peersUsed / MODEL.confidence_peer_scale, 1) +
      0.25 * (age !== null ? 1 : 0.4) +
      0.25 * (changeKnown ? 1 : 0.4),
  );
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer
 *  qualifying window. Unknown age counts as a year old. */
function holdDaysFor(age: number | null): number {
  const a = age ?? MODEL.unknown_age_days;
  if (a < 180) return 60;
  if (a < 365) return 45;
  return 30;
}

/** The gas a transaction on a chain usually costs, in the words a farmer
 *  can budget with. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return 'about $5 to $15 in gas';
  if (chain === 'Base' || chain === 'Arbitrum' || chain === 'Optimism') return 'about $0.10 to $0.50 in gas';
  if (chain === 'Solana') return 'about $0.01 to $0.05 in gas';
  if (chain === 'Binance') return 'about $0.20 to $1 in gas';
  return 'about $0.10 to $1 in gas';
}

/** The category's one action, in the words a farmer can follow. The action
 *  names the protocol, its chain and the capital, so no two categories read
 *  the same. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = p.category ?? '';
  const name = p.name;
  switch (c) {
    case 'Risk Curators':
      return `Deposit $${capital} into a ${name} curator vault on ${chain} and keep the vault shares so the position is counted as curator activity`;
    case 'RWA':
      return `Mint $${capital} of the tokenised real-world asset ${name} offers on ${chain} and hold it in your wallet`;
    case 'Onchain Capital Allocator':
      return `Allocate $${capital} into a ${name} allocator vault on ${chain} and keep the vault shares`;
    case 'Basis Trading':
      return `Deposit $${capital} of USDC into ${name}'s basis-trading vault on ${chain} and keep the position open`;
    case 'Lending':
      return `Supply $${capital} of USDC to ${name} on ${chain} as a lender and keep the supply position open`;
    case 'CDP':
      return `Lock $${capital} of collateral in ${name} on ${chain} and mint a small amount of its stable asset against it`;
    case 'Dexs':
      return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open`;
    case 'Yield':
      return `Deposit $${capital} into ${name}'s highest-TVL yield vault on ${chain} and keep the deposit in place`;
    case 'Yield Aggregator':
      return `Deposit $${capital} into ${name}'s highest-TVL aggregated vault on ${chain} and keep the deposit in place`;
    case 'Restaking':
      return `Restake $${capital} of liquid staking tokens through ${name} on ${chain} and keep the receipt token`;
    case 'Insurance':
      return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active`;
    case 'Payments':
      return `Route $${capital} of payments through ${name} on ${chain} and keep the payment history in the wallet`;
    case 'Governance Incentives':
      return `Lock $${capital} of assets in ${name}'s governance-incentives program on ${chain} and vote in its next proposal`;
    case 'Stablecoin Wrapper':
      return `Wrap $${capital} of stablecoins through ${name} on ${chain} and hold the wrapped stable asset`;
    case 'Collateral Markets':
      return `Supply $${capital} of collateral to ${name}'s collateral market on ${chain} and keep the position open`;
    case 'Chain':
      return `Bridge $${capital} to the ${name} chain and use it in an app built on ${name} so the wallet is active on the chain itself`;
    case 'CeDeFi':
      return `Deposit $${capital} into ${name}'s CeDeFi vault on ${chain} and keep the deposit in place`;
    case 'Derivatives':
      return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position`;
    case 'Cross Chain Bridge':
      return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app`;
    case 'Options':
      return `Deposit $${capital} of USDC as collateral on ${name} on ${chain} and open one small options position`;
    case 'Prediction Market':
      return `Fund $${capital} on ${name} on ${chain} and place one position in an active prediction market`;
    case 'Liquidity Manager':
      return `Deposit $${capital} into a ${name} managed liquidity position on ${chain} and keep it in range`;
    case 'Leveraged Farming':
      return `Open a $${capital} leveraged farming position on ${name} on ${chain} at low leverage and keep it open`;
    case 'Staking Pool':
      return `Stake $${capital} of the chain's staking asset through ${name}'s pool on ${chain} and keep the receipt`;
    case 'Token Locker':
      return `Lock $${capital} of tokens in ${name} on ${chain} for the protocol's vesting schedule`;
    case 'Dual-Token Stablecoin':
      return `Mint $${capital} of the stable asset through ${name}'s dual-token system on ${chain} and hold it`;
    case 'Indexes':
      return `Buy $${capital} of the ${name} index token on ${chain} and hold it`;
    case 'Farm':
      return `Deposit $${capital} into ${name}'s main farm on ${chain} and keep the position staked`;
    case 'Interest Rate Derivatives':
      return `Deposit $${capital} of USDC into ${name}'s interest-rate market on ${chain} and open one small position`;
    case 'Uncollateralized Lending':
      return `Supply $${capital} of USDC to ${name}'s uncollateralized lending pool on ${chain} and keep the position open`;
    case 'Anchor BTC':
    case 'Decentralized BTC':
      return `Deposit $${capital} of BTC through ${name} on ${chain} and hold the receipt token`;
    case 'Crypto Card Issuer':
      return `Load $${capital} onto a ${name} card on ${chain} and spend a small amount through it`;
    default:
      return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open`;
  }
}

/** The category's weekly habit: one small qualifying action a week, so the
 *  wallet stays active rather than looking like a single deposit. */
function weeklyFor(p: SnapshotProtocol, chain: string): string {
  const c = p.category ?? '';
  if (c === 'Dexs' || c === 'Liquidity Manager') return `Swap a small amount on ${name(p)} on ${chain} each week and add a little liquidity when the pool moves`;
  if (c === 'Lending' || c === 'CDP' || c === 'Collateral Markets') return `Adjust the position on ${name(p)} each week, such as supplying or borrowing a small amount on ${chain}`;
  if (c === 'Derivatives' || c === 'Options' || c === 'Basis Trading') return `Place one small trade on ${name(p)} on ${chain} each week and close it the same day`;
  if (c === 'Governance Incentives') return `Vote in every proposal ${name(p)} opens each week on ${chain} and keep the voting record`;
  if (c === 'Prediction Market') return `Place one small position in a new market on ${name(p)} on ${chain} each week`;
  if (c === 'Chain') return `Use one app built on ${name(p)} each week so the wallet stays active on the chain`;
  return `Make one qualifying action each week on ${name(p)}, such as a deposit, a swap, a vote or a claim on ${chain}`;
}

function name(p: SnapshotProtocol): string {
  return p.name;
}

/** One step as a single string: its action, then its cost and time. Kept
 *  inside the gate's 20 to 600 characters. */
function stepText(action: string, cost: string, time: string): string {
  const clean = action.replace(/\s+$/, '').replace(/\.$/, '');
  let s = `${clean} Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) s = `${s.slice(0, 597)}...`;
  return s;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, primary
 * chain, TVL tier, age), never from a hand-written list of names. It
 * positions the reader for a possible future token; it never promises an
 * airdrop, and it never asks anyone to pay to claim one. The seventh step
 * differs by row: watchlist protocols get a steady weekly-use step, while
 * early-radar protocols get a start-small-and-confirm step, since an
 * early protocol's deposit path is the least proven part of the plan.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, isWatchlist: boolean): string[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const seventh = isWatchlist
    ? stepText(
        `Use ${p.name}'s main app on ${chain} at least once a week, even for a small action, so the wallet shows steady use over time rather than one burst of activity`,
        gas + ' a week',
        '10 minutes a week',
      )
    : stepText(
        `Start with the smallest amount ${p.name}'s own minimum allows on ${chain} and confirm the deposit lands in the app before adding more capital`,
        `the smallest amount ${p.name} allows, plus ${gas}`,
        '15 minutes to check',
      );
  return [
    stepText(
      `Open a fresh wallet used only for ${p.name}, keep its seed phrase offline on paper and never share it, then fund it with $${capital} plus gas on ${chain}`,
      gas,
      '10 minutes to set up',
    ),
    stepText(
      actionFor(p, capital, chain),
      `$${capital} of capital and ${gas}`,
      '15 minutes to set up',
    ),
    stepText(
      weeklyFor(p, chain),
      gas + ' a week',
      '10 minutes a week',
    ),
    stepText(
      `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot and the position is not seen as a one-off`,
      `the $${capital} stays in the position`,
      `${hold} days`,
    ),
    stepText(
      `Before claiming anything, check the protocol's own page for ${p.name} from its official site or app and claim only from the link it publishes there, never pay to claim and never trust a link sent to you`,
      'no fee to check, and never pay to claim',
      '10 minutes to check',
    ),
    stepText(
      `Write the wallet address, the dates and every transaction hash for ${p.name} in a farm log, and check the position weekly so you can unwind it if the protocol's terms change`,
      'nothing but the log',
      '5 minutes a week',
    ),
    seventh,
  ];
}

/** The top 5 same-category token-bearing peers by market cap, for one row. */
export function comparablesFor(p: SnapshotProtocol, snapshot: Snapshot): Comparable[] {
  return snapshot.protocols
    .filter((q) => q.category === p.category && isPricedPeer(q))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, MODEL.comparables)
    .map((q) => ({
      slug: q.slug,
      name: q.name,
      mcap_usd: q.mcap_usd!,
      tvl_usd: q.tvl_usd,
      multiple: round4(Math.min(q.mcap_usd! / q.tvl_usd, MODEL.peer_cap)),
    }));
}

/** The live-token protocols, by market cap, for the dashboard's live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The protocols the board ranks, strongest first, with ranks 1..n:
 *  every watchlist slug, plus every early-eligible protocol below the
 *  watchlist floor. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const tables = computeMultiples(snapshot);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && p.tvl_usd < snapshot.floor_usd && isEarlyEligible(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const resolved = resolveMultiple(p.category, tables);
    const valued = impliedValue(p, snapshot.as_of, resolved.multiple);
    const confidence = confidenceFor(resolved.peersUsed, valued.age, p.change_7d !== null);
    return { p, resolved, valued, confidence, isWatchlist: snapshot.watchlist.includes(p.slug) };
  });
  scored.sort(
    (a, b) =>
      b.valued.implied - a.valued.implied ||
      b.p.tvl_usd - a.p.tvl_usd ||
      (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.valued.age,
    implied_value_usd: s.valued.implied,
    multiple: s.resolved.multiple,
    multiple_source: s.resolved.source,
    peers_used: s.resolved.peersUsed,
    growth_multiplier: s.valued.growthMult,
    maturity_multiplier: s.valued.maturityMult,
    chain_multiplier: s.valued.chainMult,
    confidence: s.confidence,
    model: {
      multiple: s.resolved.multiple,
      multiple_source: s.resolved.source,
      peers_used: s.resolved.peersUsed,
      growth_pct: s.valued.growthPct,
      growth_multiplier: s.valued.growthMult,
      maturity_multiplier: s.valued.maturityMult,
      chain_multiplier: s.valued.chainMult,
      age_days: s.valued.age,
      confidence: s.confidence,
    },
    comparables: comparablesFor(s.p, snapshot),
    farm_steps: farmSteps(s.p, s.valued.age, s.isWatchlist),
  }));
}

/** One category's share of the board, richest first: rows grouped by
 *  category, with the category median multiple and priced-peer count
 *  from the peer tables (0 when the category has no priced peer). */
export function categoryStats(board: BoardRow[], tables: MultipleTables): CategoryStat[] {
  const byCategory = new Map<string, { rows: number; total: number }>();
  for (const r of board) {
    const cat = r.category ?? 'Unknown';
    const entry = byCategory.get(cat) ?? { rows: 0, total: 0 };
    entry.rows += 1;
    entry.total += r.implied_value_usd;
    byCategory.set(cat, entry);
  }
  return [...byCategory.entries()]
    .map(([category, entry]) => ({
      category,
      rows: entry.rows,
      total_implied_usd: entry.total,
      median_multiple: tables.multiples[category] ?? 0,
      peers: tables.peerCounts[category] ?? 0,
    }))
    .sort((a, b) => b.total_implied_usd - a.total_implied_usd || (a.category < b.category ? -1 : 1));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const tables = computeMultiples(snapshot);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const category_stats = categoryStats(board, tables);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model: {
      formula:
        'implied = max(1, round(tvl_usd * multiple * growth * maturity * chain)); multiple is a shrinkage blend with k=3: when the category has at least 1 priced peer, (nCat * category median mcap/TVL + 3 * family median mcap/TVL) / (nCat + 3), source category when nCat >= 3 else family; when the category has no priced peer but the family has at least 1, (nFam * family median + 3 * global median) / (nFam + 3), source family; else the market-wide median, source global; each peer mcap/TVL is winsorized at 5 first, so one thin-TVL peer cannot dominate a median; growth = 1 + clamp(change_7d, -40, 60) / 100 * 0.5, 1.0 when change_7d is unknown; maturity = 0.8 + min(max(age_days or 365, 0), 1095) / 1095 * 0.2; chain = 1 + min(chains - 1, 5) * 0.02; confidence = 0.5 * min(peers_used / 15, 1) + 0.25 * (age known ? 1 : 0.4) + 0.25 * (change_7d known ? 1 : 0.4)',
      peer_cap: MODEL.peer_cap,
      shrinkage_k: MODEL.shrinkage_k,
      confidence_peer_scale: MODEL.confidence_peer_scale,
      growth_weight: MODEL.growth_weight,
      growth_floor: MODEL.growth_floor,
      growth_cap: MODEL.growth_cap,
      maturity_floor: MODEL.maturity_floor,
      maturity_range: MODEL.maturity_range,
      maturity_days: MODEL.maturity_days,
      unknown_age_days: MODEL.unknown_age_days,
      chain_step: MODEL.chain_step,
      chain_cap: MODEL.chain_cap,
      global_multiple: tables.globalMultiple,
      multiples: tables.multiples,
      families: tables.families,
    },
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    category_stats,
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks,
 *  order, one shared implied value, farm steps and positive implied values. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board repeats a slug';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    const steps = r.farm_steps;
    if (!Array.isArray(steps) || steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      if (typeof s !== 'string' || s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${typeof s === 'string' ? s.trim().length : 0} characters`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
