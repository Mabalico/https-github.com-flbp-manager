import {
  FANTA_SAVE_MAX_ATTEMPTS,
  getFantaSaveRetryDelayMs,
  runFantaSaveRequestWithRetry,
} from '../../services/fantabeerpong/fantaSaveRetry';

const assertEqual = (actual: unknown, expected: unknown, message: string) => {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
};

const assertArrayEqual = (actual: unknown[], expected: unknown[], message: string) => {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), message);
};

const response = (status: number, headers?: HeadersInit) =>
  new Response(null, { status, headers });

type TestCase = { name: string; run: () => void | Promise<void> };

const cases: TestCase[] = [
  {
    name: 'returns an immediate successful response without sleeping',
    run: async () => {
      let requests = 0;
      const delays: number[] = [];
      const result = await runFantaSaveRequestWithRetry(
        async () => {
          requests += 1;
          return response(200);
        },
        { sleep: async (delay) => { delays.push(delay); } },
      );

      assertEqual(result.status, 200, 'response status');
      assertEqual(requests, 1, 'request count');
      assertArrayEqual(delays, [], 'retry delays');
    },
  },
  {
    name: 'retries 429 and 503 responses before succeeding',
    run: async () => {
      const statuses = [429, 503, 200];
      const delays: number[] = [];
      let requests = 0;
      const result = await runFantaSaveRequestWithRetry(
        async () => response(statuses[requests++]),
        {
          random: () => 0,
          sleep: async (delay) => { delays.push(delay); },
        },
      );

      assertEqual(result.status, 200, 'response status');
      assertEqual(requests, 3, 'request count');
      assertArrayEqual(delays, [180, 360], 'exponential retry delays');
    },
  },
  {
    name: 'does not retry a non-transient 400 response',
    run: async () => {
      let requests = 0;
      const delays: number[] = [];
      const result = await runFantaSaveRequestWithRetry(
        async () => {
          requests += 1;
          return response(400);
        },
        { sleep: async (delay) => { delays.push(delay); } },
      );

      assertEqual(result.status, 400, 'response status');
      assertEqual(requests, 1, 'request count');
      assertArrayEqual(delays, [], 'retry delays');
    },
  },
  {
    name: 'retries a network exception and returns the later success',
    run: async () => {
      const delays: number[] = [];
      let requests = 0;
      const result = await runFantaSaveRequestWithRetry(
        async () => {
          requests += 1;
          if (requests === 1) throw new TypeError('network unavailable');
          return response(204);
        },
        {
          random: () => 0,
          sleep: async (delay) => { delays.push(delay); },
        },
      );

      assertEqual(result.status, 204, 'response status');
      assertEqual(requests, 2, 'request count');
      assertArrayEqual(delays, [180], 'retry delay');
    },
  },
  {
    name: 'stops after the configured maximum number of attempts',
    run: async () => {
      const delays: number[] = [];
      let responseRequests = 0;
      const finalResponse = await runFantaSaveRequestWithRetry(
        async () => {
          responseRequests += 1;
          return response(503);
        },
        {
          random: () => 0,
          sleep: async (delay) => { delays.push(delay); },
        },
      );

      assertEqual(finalResponse.status, 503, 'final transient response');
      assertEqual(responseRequests, FANTA_SAVE_MAX_ATTEMPTS, 'transient response attempts');
      assertArrayEqual(delays, [180, 360], 'delays before final response');

      const terminalError = new TypeError('still offline');
      let errorRequests = 0;
      let thrown: unknown = null;
      try {
        await runFantaSaveRequestWithRetry(
          async () => {
            errorRequests += 1;
            throw terminalError;
          },
          { random: () => 0, sleep: async () => {} },
        );
      } catch (error) {
        thrown = error;
      }

      assertEqual(thrown, terminalError, 'last network error');
      assertEqual(errorRequests, FANTA_SAVE_MAX_ATTEMPTS, 'network error attempts');
    },
  },
  {
    name: 'honors Retry-After while limiting the delay to two seconds',
    run: async () => {
      const delays: number[] = [];
      let requests = 0;
      const result = await runFantaSaveRequestWithRetry(
        async () => {
          requests += 1;
          return requests === 1
            ? response(429, { 'retry-after': '120' })
            : response(200);
        },
        {
          now: () => Date.parse('2026-09-05T12:00:00.000Z'),
          random: () => 0,
          sleep: async (delay) => { delays.push(delay); },
        },
      );

      assertEqual(result.status, 200, 'response status');
      assertArrayEqual(delays, [2_000], 'limited Retry-After delay');
      assertEqual(
        getFantaSaveRetryDelayMs(
          0,
          'Sat, 05 Sep 2026 12:00:10 GMT',
          () => 0,
          Date.parse('2026-09-05T12:00:00.000Z'),
        ),
        2_000,
        'limited HTTP-date Retry-After delay',
      );
    },
  },
];

let failed = 0;
for (const entry of cases) {
  try {
    await entry.run();
    console.log(`PASS ${entry.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${entry.name}`);
    console.error(error);
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`All Fanta save retry tests passed (${cases.length}).`);
}
