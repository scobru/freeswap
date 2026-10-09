// Base mainnet, Uniswap V3. UNVERIFIED candidates: main.ts checks them onchain through the wallet
// before enabling a swap, but confirm each one on Basescan / the Uniswap docs before real use.
export const CHAIN_ID_HEX = "0x2105"; // 8453
export const ADDR = {
  factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
  quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
  router: "0x2626664c2603336E57B271c5C0b26F421741e481",
  weth: "0x4200000000000000000000000000000000000006",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
} as const;
// shortcut: one pool (WETH/USDC 0.05%), no routing; try other fee tiers and pick the best quote to upgrade.
export const FEE = 500;
export const SLIPPAGE_BPS = 50n;
export const DEADLINE_SECS = 600;
