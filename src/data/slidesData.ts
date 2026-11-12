/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { rawMockData } from './mockDataLoader';
import { SlideItem } from '../types/cortex';

export type { SlideItem };

// If mock-data.json is deleted, SIXTEEN_SLIDES will be an empty array []
export const SIXTEEN_SLIDES: SlideItem[] = Array.isArray(rawMockData?.slides)
  ? rawMockData.slides
  : [];
