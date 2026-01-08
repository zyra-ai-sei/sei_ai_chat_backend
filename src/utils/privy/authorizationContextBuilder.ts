import { AuthorizationContext } from '@privy-io/node';
import env from '../../envConfig';
import {
  TransactionSigningMode,
  TransactionAuthContext
} from '../../types/transaction.types';

/**
 * Authorization Context Builder
 *
 * Builds appropriate authorization contexts for different transaction signing modes
 */
export class AuthorizationContextBuilder {
  /**
   * Build authorization context based on transaction signing mode
   *
   * @param authContext - Transaction authorization context with mode and credentials
   * @returns Privy AuthorizationContext for SDK methods
   */
  static buildContext(authContext: TransactionAuthContext): AuthorizationContext {
    switch (authContext.mode) {
      case TransactionSigningMode.USER_INITIATED:
        return this.buildUserInitiatedContext(authContext.userJwt!);

      case TransactionSigningMode.DELEGATED_EXECUTION:
        return this.buildDelegatedExecutionContext(authContext.userJwt);

      case TransactionSigningMode.SERVER_ONLY:
        return this.buildServerOnlyContext();

      default:
        throw new Error(`Unknown transaction signing mode: ${authContext.mode}`);
    }
  }

  /**
   * USER_INITIATED: User signs in real-time (2-of-2 quorum: user + server)
   *
   * Use case: Immediate transactions when user is online (swaps, transfers)
   * Security: Requires both user and server signatures
   */
  private static buildUserInitiatedContext(userJwt: string): AuthorizationContext {
    if (!userJwt) {
      throw new Error('User JWT is required for user-initiated transactions');
    }

    return {
      user_jwts: [userJwt],
      authorization_private_keys: [env.PRIVY_AUTHORIZATION_PRIVATE_KEY]
    };
  }

  /**
   * DELEGATED_EXECUTION: User pre-authorized, server executes
   *
   * Use case: Limit orders, stop losses - user authorizes upfront, server executes later
   * Security: User's prior authorization JWT used with server key
   *
   * Flow:
   * 1. User online: Signs order creation with their JWT (stored securely)
   * 2. User offline: Server executes using stored JWT + server key
   */
  private static buildDelegatedExecutionContext(
    userJwt?: string
  ): AuthorizationContext {
    if (!userJwt) {
      // If no user JWT, fall back to server-only signing
      // This assumes the wallet policy allows server-only execution
      return this.buildServerOnlyContext();
    }

    // Use stored user JWT from order creation + server key
    return {
      user_jwts: [userJwt],
      authorization_private_keys: [env.PRIVY_AUTHORIZATION_PRIVATE_KEY]
    };
  }

  /**
   * SERVER_ONLY: Server signs alone
   *
   * Use case: Fully automated operations where user has delegated full authority
   * Security: Only server signature (requires wallet policy allowing this)
   *
   * NOTE: Wallet must be configured in Privy with a policy allowing server-only signing
   */
  private static buildServerOnlyContext(): AuthorizationContext {
    return {
      authorization_private_keys: [env.PRIVY_AUTHORIZATION_PRIVATE_KEY]
    };
  }

  /**
   * Validate that required credentials are present for the signing mode
   */
  static validateAuthContext(authContext: TransactionAuthContext): void {
    if (
      authContext.mode === TransactionSigningMode.USER_INITIATED &&
      !authContext.userJwt
    ) {
      throw new Error('User JWT is required for user-initiated transactions');
    }

    if (!authContext.authorizationPrivateKey) {
      throw new Error('Authorization private key is required');
    }
  }
}
