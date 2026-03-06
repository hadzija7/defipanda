import {
  CronCapability,
  EVMClient,
  HTTPClient,
  handler,
  ok,
  getNetwork,
  encodeCallMsg,
  bytesToHex,
  LAST_FINALIZED_BLOCK_NUMBER,
  consensusIdenticalAggregation,
  type Runtime,
  type NodeRuntime,
  Runner,
} from "@chainlink/cre-sdk";
import {
  type Address,
  encodeFunctionData,
  decodeFunctionResult,
  parseAbi,
  zeroAddress,
} from "viem";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const configSchema = z.object({
  schedule: z.string(),
  priceFeedAddress: z.string(),
  priceFeedChainSelectorName: z.string(),
  maxSlippageBps: z.number(),
  minPriceFeedFreshnessSeconds: z.number(),
});

type Config = z.infer<typeof configSchema>;

// ---------------------------------------------------------------------------
// ABIs
// ---------------------------------------------------------------------------

const priceFeedAbi = parseAbi([
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PostResponse = {
  statusCode: number;
};

type PriceData = {
  roundId: string;
  price: string;
  updatedAt: number;
};

// ---------------------------------------------------------------------------
// Workflow handler
// ---------------------------------------------------------------------------

const onCronTrigger = (runtime: Runtime<Config>): string => {
  // --- 1. Read ETH/USD price from Chainlink price feed with DON consensus ---

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.priceFeedChainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    runtime.log(
      `Network not found: ${runtime.config.priceFeedChainSelectorName}`
    );
    return "Error: network not found";
  }

  const evmClient = new EVMClient(network.chainSelector.selector);

  const callData = encodeFunctionData({
    abi: priceFeedAbi,
    functionName: "latestRoundData",
    args: [],
  });

  const contractCall = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: runtime.config.priceFeedAddress as Address,
        data: callData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();

  const [roundId, answer, , updatedAt] = decodeFunctionResult({
    abi: priceFeedAbi,
    functionName: "latestRoundData",
    data: bytesToHex(contractCall.data),
  });

  const priceData: PriceData = {
    roundId: roundId.toString(),
    price: answer.toString(),
    updatedAt: Number(updatedAt),
  };

  runtime.log(
    `Price feed: roundId=${priceData.roundId} price=${priceData.price} updatedAt=${priceData.updatedAt}`
  );

  // --- 2. Check price feed freshness ---

  const nowSeconds = Math.floor(Date.now() / 1000);
  const ageSeconds = nowSeconds - priceData.updatedAt;

  if (ageSeconds > runtime.config.minPriceFeedFreshnessSeconds) {
    runtime.log(
      `Price feed stale (${ageSeconds}s old, limit ${runtime.config.minPriceFeedFreshnessSeconds}s). Skipping execution.`
    );
    return "Skipped: stale price feed";
  }

  // --- 3. Retrieve secrets at DON level (getSecret is only on Runtime, not NodeRuntime) ---

  const authToken = runtime.getSecret({ id: "BACKEND_AUTH_TOKEN" }).result();
  const backendUrl = runtime.getSecret({ id: "BACKEND_URL" }).result();

  // --- 4. POST execution request to backend ---

  const postToBackend = (
    nodeRuntime: NodeRuntime<Config>,
    pd: PriceData,
    triggerTimestamp: number,
    authTokenValue: string,
    backendUrlValue: string
  ): PostResponse => {
    const httpClient = new HTTPClient();

    const payload = {
      consensusPrice: pd.price,
      maxSlippageBps: nodeRuntime.config.maxSlippageBps,
      executionTimestamp: pd.updatedAt,
      triggerTimestamp,
      roundId: pd.roundId,
    };

    const bodyBytes = new TextEncoder().encode(JSON.stringify(payload));
    const body = Buffer.from(bodyBytes).toString("base64");

    const req = {
      url: `${backendUrlValue}/api/dca/trigger`,
      method: "POST" as const,
      body,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authTokenValue}`,
      },
      timeout: "10s",
      cacheSettings: {
        store: true,
        maxAge: "10s",
      },
    };

    const resp = httpClient.sendRequest(nodeRuntime, req).result();

    if (!ok(resp)) {
      nodeRuntime.log(`Backend returned status ${resp.statusCode}`);
    }

    return { statusCode: resp.statusCode };
  };

  const result = runtime
    .runInNodeMode(
      postToBackend,
      consensusIdenticalAggregation<PostResponse>()
    )(priceData, nowSeconds, authToken.value, backendUrl.value)
    .result();

  runtime.log(
    `DCA execution complete. Backend status: ${result.statusCode}, price: ${priceData.price}`
  );
  return "Success";
};

// ---------------------------------------------------------------------------
// Workflow init & main
// ---------------------------------------------------------------------------

const initWorkflow = (config: Config) => {
  return [
    handler(
      new CronCapability().trigger({
        schedule: config.schedule,
      }),
      onCronTrigger
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({
    configSchema,
  });
  await runner.run(initWorkflow);
}
