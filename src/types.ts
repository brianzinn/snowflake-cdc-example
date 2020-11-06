/**
 * This file contains basic conversions.  Many database fields are stored as strings, while
 * we need to interpret them numerically.  That is main purpose of this file is for those conversions.
 */

export type Nullable<T> = T | null;