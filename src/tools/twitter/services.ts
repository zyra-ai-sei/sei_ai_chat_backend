import axios from "axios";
import env from "../../envConfig";

export async function getLatestTwitterTweets(topic: string) {
  const res = await axios.get(
    `https://api.twitterapi.io/twitter/tweet/advanced_search?queryType=Latest&query=${topic}`,
    {
      headers: { "X-API-Key": env.TWITTER_API_KEY },
    }
  );

  return {
    type: "TWEETS",
    tweets: res.data?.tweets,
  };
}

export async function getTopTwitterTweets(topic: string) {
  const res = await axios.get(
    `https://api.twitterapi.io/twitter/tweet/advanced_search?queryType=Top&query=${topic}`,
    {
      headers: { "X-API-Key": env.TWITTER_API_KEY },
    }
  );
  return {
    type: "TWEETS",
    tweets: res.data?.tweets,
  };
}
