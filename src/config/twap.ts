export interface TwapConfig {
  chainName: string;
  chainId: number;
  twapVersion: number;
  twapAddress: string;
  lensAddress: string;
  takers: string[];
  bidDelaySeconds: number;
  minChunkSizeUsd: number;
  name: string;
  partner: string;
  exchangeAddress: string;
  exchangeType: string;
  pathfinderKey: string;
}


export const TWAP_CONFIGS: Record<string, TwapConfig> = {
  sei: {
    chainName: "sei",
    chainId: 1329,
    twapVersion: 4,
    twapAddress: "0xde737dB24548F8d41A4a3Ca2Bac8aaaDc4DBA099",
    lensAddress: "0xa1376f2Bb80D3cF6c2D8ebEf34b3d122e9af4020",
    takers: [
      "0xA05405b6340A7F43dC5835351BFC4f5b1F028359",
      "0xE3Efef1563a5960ACc731F9e4d6f4cBf5bd87dcA",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 50,
    name: "DragonSwap",
    partner: "Orbs:TWAP:DragonSwap",
    exchangeAddress: "0xf2F933FafbDB97062CfA3c447ff373e76A90Efd6",
    exchangeType: "ExchangeV2",
    pathfinderKey: "",
  },
  polygon: {
    chainName: "poly",
    chainId: 137,
    twapVersion: 4,
    twapAddress: "0x688C027B0f7FaCeFcBa73e472900d28c12C5bDF4",
    lensAddress: "0xe0D4E736fc76af7C256ae7652c8c1e850bfb7849",
    takers: [
      "0xA05405b6340A7F43dC5835351BFC4f5b1F028359",
      "0xE3Efef1563a5960ACc731F9e4d6f4cBf5bd87dcA",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 10,
    name: "QuickSwap",
    partner: "Orbs:TWAP:QuickSwap",
    exchangeAddress: "0x8FCc245209bE85C49D738D0CE5613F74E5d91E86",
    exchangeType: "ParaswapExchange",
    pathfinderKey: "QuickSwap,QuickSwapV3",
  },
  base: {
    chainName: "base",
    chainId: 8453,
    twapVersion: 4,
    twapAddress: "0xc918bdC47264687796Cd54FE362FaC4f8b99Eb55",
    lensAddress: "0x6313188c1909b161074D62E43105faC9B756A23e",
    takers: [
      "0xA05405b6340A7F43dC5835351BFC4f5b1F028359",
      "0xE3Efef1563a5960ACc731F9e4d6f4cBf5bd87dcA",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 50,
    name: "PancakeSwap",
    partner: "Orbs:TWAP:PancakeSwap",
    exchangeAddress: "0xb37cB9A058c03081Ae6EF934313588cD53d408e7",
    exchangeType: "P2Exchange",
    pathfinderKey: "",
  },
  arbitrum: {
    chainName: "arb",
    chainId: 42161,
    twapVersion: 4,
    twapAddress: "0x0B94dcC0EA2d1ee33Ab064DaC252de980a941eF3",
    lensAddress: "0x549e1fc9a47FCc0C5C2EbdfF31254cc49fF7164e",
    takers: [
      "0xA05405b6340A7F43dC5835351BFC4f5b1F028359",
      "0xE3Efef1563a5960ACc731F9e4d6f4cBf5bd87dcA",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 50,
    name: "PancakeSwap",
    partner: "Orbs:TWAP:PancakeSwap",
    exchangeAddress: "0xb37cB9A058c03081Ae6EF934313588cD53d408e7",
    exchangeType: "P2Exchange",
    pathfinderKey: "",
  },
  ethereum: {
    chainName: "eth",
    chainId: 1,
    twapVersion: 4,
    twapAddress: "0xb1ed8BCAD1EaC8a1DF0764700472391800D12946",
    lensAddress: "0x0967f448c4d4dbd14c355E635AE9CbF68cc44A60",
    takers: [
      "0xA05405b6340A7F43dC5835351BFC4f5b1F028359",
      "0xE3Efef1563a5960ACc731F9e4d6f4cBf5bd87dcA",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 200,
    name: "SushiEth",
    partner: "Orbs:TWAP:Sushi",
    exchangeAddress: "0x04eB53119079FA779492720D1EfeAEBF0aF2e5ad",
    exchangeType: "ExchangeV2",
    pathfinderKey: "",
  },
};