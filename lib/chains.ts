import { base, arbitrum } from "viem/chains";

export const supportedChains = [base, arbitrum] as const;
export type SupportedChain = (typeof supportedChains)[number];
