import {
  buildTvProjectionUrl,
  readTvProjectionFromUrl,
  TV_PROJECTION_QUERY_PARAM,
} from '../../services/tvProjectionRoute';

const assertEqual = (actual: unknown, expected: unknown, message: string) => {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
};

const cases: Array<{ name: string; run: () => void }> = [
  {
    name: 'reads every supported projection from an explicit URL',
    run: () => {
      for (const mode of ['groups', 'groups_bracket', 'bracket', 'scorers', 'bracket_scorers'] as const) {
        assertEqual(
          readTvProjectionFromUrl(`http://127.0.0.1:8787/app/?${TV_PROJECTION_QUERY_PARAM}=${mode}`),
          mode,
          `route ${mode}`,
        );
      }
    },
  },
  {
    name: 'rejects missing, invalid and malformed projection URLs',
    run: () => {
      assertEqual(readTvProjectionFromUrl('http://127.0.0.1:8787/app/'), null, 'missing route');
      assertEqual(readTvProjectionFromUrl('http://127.0.0.1:8787/app/?flbp_tv=admin'), null, 'invalid route');
      assertEqual(readTvProjectionFromUrl('not a URL'), null, 'malformed URL');
    },
  },
  {
    name: 'builds a same-page projection URL and preserves unrelated query parameters',
    run: () => {
      const result = new URL(buildTvProjectionUrl('http://127.0.0.1:8787/app/?source=native#secret', 'bracket'));
      assertEqual(result.origin, 'http://127.0.0.1:8787', 'origin');
      assertEqual(result.pathname, '/app/', 'pathname');
      assertEqual(result.searchParams.get('source'), 'native', 'existing query');
      assertEqual(result.searchParams.get(TV_PROJECTION_QUERY_PARAM), 'bracket', 'projection query');
      assertEqual(result.hash, '', 'session fragment removed');
    },
  },
  {
    name: 'replaces an existing projection selection',
    run: () => {
      const result = buildTvProjectionUrl('http://127.0.0.1:8787/app/?flbp_tv=groups', 'scorers');
      assertEqual(readTvProjectionFromUrl(result), 'scorers', 'replacement route');
    },
  },
];

let failed = 0;
for (const entry of cases) {
  try {
    entry.run();
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
  console.log(`All TV projection route tests passed (${cases.length}).`);
}
