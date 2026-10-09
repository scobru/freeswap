import type { Address } from "viem";

// Uniswap V3 contracts from docs.uniswap.org (deployments pages) and tokens from Uniswap's default token list.
// main.ts still checks the contracts and token decimals onchain through the wallet before enabling a swap.
export type Token = { symbol: string; address: Address; decimals: number; native?: true };
export type Chain = { id: string; name: string; explorer: string; factory: Address; quoter: Address; router: Address; weth: Address; tokens: Token[] };

const ETH = (weth: Address): Token => ({ symbol: "ETH", address: weth, decimals: 18, native: true });

export const CHAINS: Chain[] = [
  {
    id: "0x2105", // 8453
    name: "Base",
    explorer: "https://basescan.org/tx/",
    factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
    router: "0x2626664c2603336E57B271c5C0b26F421741e481",
    weth: "0x4200000000000000000000000000000000000006",
    tokens: [
      ETH("0x4200000000000000000000000000000000000006"),
      { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
      { symbol: "DAI", address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
      { symbol: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8 },
      { symbol: "cbETH", address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", decimals: 18 },
    ],
  },
  {
    id: "0x1",
    name: "Ethereum",
    explorer: "https://etherscan.io/tx/",
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    tokens: [
      ETH("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
      { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
      { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
      { symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
      { symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
      { symbol: "LINK", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
      { symbol: "UNI", address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },
      { symbol: "AAVE", address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", decimals: 18 },
      { symbol: "PEPE", address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", decimals: 18 },
    ],
  },
];
export const FEES = [100, 500, 3000, 10000];
export const SLIPPAGE_BPS = 50n;
export const DEADLINE_SECS = 600;
// Where bridge.html is published (GitHub Pages, see README). It must be a normal https origin, not Freenet.
export const BRIDGE_URL = "https://scobru.github.io/freeswap/bridge.html";
