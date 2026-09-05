import { errorCodes } from './error-codes.js';
import { removedMethods } from './removed-methods.js';
import { sdkV1Package } from './sdk-v1-package.js';
import { statefulHandshake } from './stateful-handshake.js';
import type { Rule } from './types.js';

/** Rules in report order. Each covers one entry of the 2026-07-28 changelog. */
export const RULES: readonly Rule[] = [sdkV1Package, statefulHandshake, removedMethods, errorCodes];

export type { PackageManifest, Rule, RuleMatch } from './types.js';
