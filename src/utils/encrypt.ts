import crypto from 'crypto';

// The encryption algorithm and key size
const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // This must be a 32-byte key!

// Function to encrypt the API key
export function encrypt(data:string) {
  const iv = crypto.randomBytes(16); // Generate a random IV
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Return the IV along with the encrypted text, separated by a colon
  return iv.toString('hex') + ':' + encrypted;
}

// Function to decrypt the API key
export function decrypt(data:string) {
  const [ivHex, encryptedText] = data.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}