// @ts-nocheck
import { type Address, type Hash, type Hex, formatUnits, getContract } from 'viem';
import { getPublicClient } from './clients';
import { DEFAULT_NETWORK } from '../chains';
import {
	getTokenAddress,
	getTokenSymbol,
	getTokenInfo,
	getTokenInfoByAddress
} from '../../../config/networks';

// Standard ERC20 ABI (minimal for reading)
const erc20Abi = [
	{
		inputs: [],
		name: 'name',
		outputs: [{ type: 'string' }],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [],
		name: 'symbol',
		outputs: [{ type: 'string' }],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [],
		name: 'decimals',
		outputs: [{ type: 'uint8' }],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [],
		name: 'totalSupply',
		outputs: [{ type: 'uint256' }],
		stateMutability: 'view',
		type: 'function'
	}
] as const;

// Standard ERC721 ABI (minimal for reading)
const erc721Abi = [
	{
		inputs: [],
		name: 'name',
		outputs: [{ type: 'string' }],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [],
		name: 'symbol',
		outputs: [{ type: 'string' }],
		stateMutability: 'view',
		type: 'function'
	},
	{
		inputs: [{ type: 'uint256', name: 'tokenId' }],
		name: 'tokenURI',
		outputs: [{ type: 'string' }],
		stateMutability: 'view',
		type: 'function'
	}
] as const;

// Standard ERC1155 ABI (minimal for reading)
const erc1155Abi = [
	{
		inputs: [{ type: 'uint256', name: 'id' }],
		name: 'uri',
		outputs: [{ type: 'string' }],
		stateMutability: 'view',
		type: 'function'
	}
] as const;

/**
 * Get ERC20 token information
 */
export async function getERC20TokenInfo(
	tokenAddress: Address,
	network = 'sei'
): Promise<{
	name: string;
	symbol: string;
	decimals: number;
	totalSupply: bigint;
	formattedTotalSupply: string;
}> {
	const publicClient = getPublicClient(network);

	const contract = getContract({
		address: tokenAddress,
		abi: erc20Abi,
		client: publicClient
	});

	const [name, symbol, decimals, totalSupply] = await Promise.all([
		contract.read.name(),
		contract.read.symbol(),
		contract.read.decimals(),
		contract.read.totalSupply()
	]);

	return {
		name,
		symbol,
		decimals,
		totalSupply,
		formattedTotalSupply: formatUnits(totalSupply, decimals)
	};
}

/**
 * Get ERC721 token metadata
 */
export async function getERC721TokenMetadata(
	tokenAddress: Address,
	tokenId: bigint,
	network = 'sei'
): Promise<{
	name: string;
	symbol: string;
	tokenURI: string;
}> {
	const publicClient = getPublicClient(network);

	const contract = getContract({
		address: tokenAddress,
		abi: erc721Abi,
		client: publicClient
	});

	const [name, symbol, tokenURI] = await Promise.all([contract.read.name(), contract.read.symbol(), contract.read.tokenURI([tokenId])]);

	return {
		name,
		symbol,
		tokenURI
	};
}

/**
 * Get ERC1155 token URI
 */
export async function getERC1155TokenURI(tokenAddress: Address, tokenId: bigint, network = 'sei'): Promise<string> {
	const publicClient = getPublicClient(network);

	const contract = getContract({
		address: tokenAddress,
		abi: erc1155Abi,
		client: publicClient
	});

	return contract.read.uri([tokenId]);
}

/**
 * Get token address or symbol using centralized config
 * @param tokenInfo - Token symbol or address
 * @param network - Network name (defaults to DEFAULT_NETWORK)
 * @returns Token address if symbol provided, or symbol if address provided
 */
export async function resolveToken(tokenInfo: string, network: string = DEFAULT_NETWORK): Promise<string | undefined> {
	const upperTokenInfo = tokenInfo.toUpperCase();

	// Check if it's a symbol (get address)
	const address = getTokenAddress(upperTokenInfo, network);
	if (address) return address;

	// Check if it's an address (get symbol)
	const symbol = getTokenSymbol(tokenInfo, network);
	if (symbol) return symbol;

	return undefined;
}
