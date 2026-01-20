import dotenv from "dotenv";
import { cleanEnv, num, str } from "envalid";

dotenv.config();

const env = cleanEnv(process.env, {
  PORT: num(),
  REDIS_PORT: num(),
  REDIS_HOST: str(),
  AUTH_MESSAGE_TIMEOUT: num({ default: 60 * 1000 }),
  SECRET_KEY: str({ default: "IAMSHREYANSH" }),
  GEMINI_API_KEY: str(),
  LLAMA_API_KEY: str(),
  MONGO_URI: str(),
  RPC_URL: str(),
  WSS_URL: str(),
  MORALIS_API: str(),
  OPENAI_API_KEY: str(),
  COINGECKO_API_KEY: str(),
  ALCHEMY_API_KEY: str(),
  PRIVY_APP_SECRET: str(),
  PRIVY_APP_ID: str(),
  PRIVY_VERIFICATION_KEY: str(),
  TWITTER_API_KEY: str(),
});

export default env;
