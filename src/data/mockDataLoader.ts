/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RawMockDataset } from '../types/cortex';

// Safely probe for mock-data.json via Vite glob.
// If mock-data.json is deleted from the project directory,
// import.meta.glob matches 0 files, returns {} without error,
// and rawMockData will be null, completely clearing dummy data.
interface GlobJsonModule {
  default?: RawMockDataset;
}

const globModules = import.meta.glob<GlobJsonModule>('/mock-data.json', { eager: true });
const matchedKey = Object.keys(globModules)[0];
const loadedModule = matchedKey ? globModules[matchedKey] : null;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const resolvedData: unknown = loadedModule
  ? (loadedModule.default ?? loadedModule)
  : null;

export const rawMockData: RawMockDataset | null = isPlainRecord(resolvedData)
  ? (resolvedData as RawMockDataset)
  : null;

export const hasMockDataFile: boolean = Boolean(
  rawMockData && Object.keys(rawMockData).length > 0
);

export default rawMockData;
