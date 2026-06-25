// Static test fixtures — deterministic data for tests

/** A valid UUID v4 for testing */
export const SAMPLE_UUID = '550e8400-e29b-41d4-a716-446655440000';

/** Invalid UUID strings for validation testing */
export const INVALID_UUIDS = [
  '',
  'not-a-uuid',
  '550e8400-e29b-41d4-a716',
  '550e8400-e29b-41d4-a716-4466554400000', // too long
  '12345678-1234-1234-1234-123456789abc', // wrong variant
];

/** Common semver strings for comparison testing */
export const SEMVER_PAIRS: Array<[string, string]> = [
  ['1.0.0', '2.0.0'],
  ['2.0.0', '1.0.0'],
  ['1.0.0', '1.0.0'],
  ['1.0.0', '1.0.0-alpha'],
  ['1.0.0-alpha', '1.0.0'],
  ['2.1.0', '2.0.0'],
  ['10.0.0', '2.0.0'],
];

/** Sample XML strings for escaping tests */
export const XML_SAMPLES = [
  { input: '<hello>', escaped: '&lt;hello&gt;' },
  { input: 'a & b', escaped: 'a &amp; b' },
  { input: '">', escaped: '&quot;&gt;' },
];
