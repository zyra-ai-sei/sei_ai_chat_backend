// Quick test script for Crypto Market API endpoint
async function testCryptoMarketAPI() {
  const baseUrl = "http://localhost:3000/v1/crypto/market-data";

  const testCases = [
    { coinId: "bitcoin", timeframe: "7d" },
    { coinId: "ethereum", timeframe: "24h" },
    { coinId: "bitcoin", timeframe: "1m" },
  ];

  for (const testCase of testCases) {
    try {
      const url = `${baseUrl}?coinId=${testCase.coinId}&timeframe=${testCase.timeframe}`;
      console.log(`\n🧪 Testing: ${url}`);

      const response = await fetch(url);
      const data = await response.json();

      if (response.ok && data.success) {
        console.log(`✅ Success!`);
        console.log(`   Coin: ${data.data.coinId}`);
        console.log(`   Timeframe: ${data.data.timeframe}`);
        console.log(`   Data Points: ${data.data.dataPoints}`);
        console.log(`   Sample (first point):`, data.data.chartData[0]);
        console.log(`   Format: [timestamp, price, marketCap]`);
      } else {
        console.log(`❌ Failed:`, data.message || response.statusText);
      }
    } catch (error) {
      console.log(`❌ Error:`, error.message);
      console.log(`   Make sure the server is running on port 3000`);
    }
  }

  // Test invalid parameters
  console.log(`\n🧪 Testing invalid timeframe...`);
  try {
    const url = `${baseUrl}?coinId=bitcoin&timeframe=invalid`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.log(`✅ Correctly rejected invalid timeframe`);
      console.log(`   Message:`, data.message);
    }
  } catch (error) {
    console.log(`❌ Error:`, error.message);
  }
}

console.log("🚀 Testing Crypto Market API Endpoint");
console.log("======================================");
testCryptoMarketAPI();
