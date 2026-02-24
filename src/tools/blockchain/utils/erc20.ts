import { Contract, ethers } from "ethers";
import { SUPPORTED_NETWORKS } from "../../../config/networks"
import { erc20abi } from "@orbs-network/twap-sdk";

export const getDecimals = async ({chain, token}:{chain:string, token:string}) => {
    try{
        const tokenAddress = ethers.getAddress(token)
        const chainconfig = SUPPORTED_NETWORKS[chain];
        const provider = new ethers.JsonRpcProvider(chainconfig.rpcUrl)
        const contract = new Contract(tokenAddress,erc20abi,provider);

        const decimals = await contract.decimals()
        return Number(decimals); 
    } catch(e){
        return null
    }
}