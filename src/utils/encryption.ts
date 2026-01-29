import crypto from 'crypto';

/**
 * Utility class for encrypting and decrypting sensitive data like JWTs
 * Uses AES-256-GCM encryption for security
 */
export class EncryptionUtil {
    private static readonly ALGORITHM = 'aes-256-gcm';
    private static readonly IV_LENGTH = 16;
    private static readonly AUTH_TAG_LENGTH = 16;
    private static readonly SALT_LENGTH = 64;

    /**
     * Derives a 32-byte key from the encryption key using PBKDF2
     */
    private static deriveKey(encryptionKey: string, salt: Buffer): Buffer {
        return crypto.pbkdf2Sync(encryptionKey, salt, 100000, 32, 'sha256');
    }

    /**
     * Encrypts a string using AES-256-GCM
     * @param plaintext - The text to encrypt
     * @param encryptionKey - The encryption key from environment
     * @returns Encrypted string in format: salt:iv:authTag:encrypted
     */
    public static encrypt(plaintext: string, encryptionKey: string): string {
        if (!plaintext) {
            throw new Error('Plaintext is required for encryption');
        }
        if (!encryptionKey) {
            throw new Error('Encryption key is required');
        }

        // Generate random salt and IV
        const salt = crypto.randomBytes(this.SALT_LENGTH);
        const iv = crypto.randomBytes(this.IV_LENGTH);

        // Derive key from encryption key
        const key = this.deriveKey(encryptionKey, salt);

        // Create cipher and encrypt
        const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        // Get authentication tag
        const authTag = cipher.getAuthTag();

        // Return format: salt:iv:authTag:encrypted
        return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    }

    /**
     * Decrypts an encrypted string
     * @param encryptedData - The encrypted data in format: salt:iv:authTag:encrypted
     * @param encryptionKey - The encryption key from environment
     * @returns Decrypted plaintext string
     */
    public static decrypt(encryptedData: string, encryptionKey: string): string {
        if (!encryptedData) {
            throw new Error('Encrypted data is required for decryption');
        }
        if (!encryptionKey) {
            throw new Error('Encryption key is required');
        }

        try {
            // Parse the encrypted data
            const parts = encryptedData.split(':');
            if (parts.length !== 4) {
                throw new Error('Invalid encrypted data format');
            }

            const salt = Buffer.from(parts[0], 'hex');
            const iv = Buffer.from(parts[1], 'hex');
            const authTag = Buffer.from(parts[2], 'hex');
            const encrypted = parts[3];

            // Derive key
            const key = this.deriveKey(encryptionKey, salt);

            // Create decipher and decrypt
            const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Validates if the encryption key is properly configured
     */
    public static validateEncryptionKey(encryptionKey: string): boolean {
        if (!encryptionKey || encryptionKey.length < 32) {
            return false;
        }
        return true;
    }
}
