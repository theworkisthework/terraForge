export const ROT_STEPS = [1, 5, 15, 30, 45] as const;

export type RotStep = (typeof ROT_STEPS)[number];

export const ROT_PRESETS = [0, 45, 90, 135, 180, 225, 270, 315] as const;
