import { ethers } from 'ethers';

/**
 * Returns the checksummed address using ethers.getAddress().
 * If the input is not a valid address and ethers.getAddress() throws,
 * it returns the original input string.
 * 
 * @param address - The address string to format
 * @returns The checksummed address or the original string if invalid
 */
export function getSafeAddress(address: string): string {
    try {
        return ethers.getAddress(address);
    } catch (error) {
        return address;
    }
}
