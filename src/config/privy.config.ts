import { PrivyClient } from "@privy-io/node";
import env from "../envConfig";

/**
 * Privy Client Configuration
 *
 * This module initializes and exports the Privy client for server-side operations.
 *
 * Authorization Context:
 * - Authorization private key is NOT configured at client level
 * - Instead, it's passed to individual SDK method calls via authorization_context
 * - See AuthorizationContextBuilder for building authorization contexts
 *
 * @see https://docs.privy.io/controls/authorization-keys/using-owners/sign
 */

// Initialize Privy Client for server-side operations
const privyClient = new PrivyClient({
  appId: env.PRIVY_APP_ID,
  appSecret: env.PRIVY_APP_SECRET
});

/**
 * Get the Privy Client instance
 * @returns {PrivyClient} Configured Privy client
 */
export const getPrivyClient = (): PrivyClient => {
  return privyClient;
};

/**
 * Get the authorization private key for signing transactions
 * @returns {string} Authorization private key
 */
export const getAuthorizationPrivateKey = (): string => {
  return env.PRIVY_AUTHORIZATION_PRIVATE_KEY;
};

/**
 * Get the key quorum ID
 * @returns {string} Key quorum ID
 */
export const getKeyQuorumId = (): string => {
  return env.PRIVY_KEY_QUORUM_ID;
};

export default privyClient;
