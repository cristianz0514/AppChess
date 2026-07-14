// Shared between the server page (practica-mate/page.tsx) and the client
// seeder components (PracticeSeeder.tsx). MUST live in a plain module (no
// "use client") — a Server Component importing a non-component value from a
// "use client" file gets `undefined`, not the real value, since RSC only
// passes CLIENT COMPONENT references across that boundary, not plain exports.
export type MateIn = 1 | 2 | 3 | 4;
export const MATE_LEVELS: MateIn[] = [1, 2, 3, 4];
export const FAST_TARGET = 6;
export const FULL_TARGET: Record<MateIn, number> = { 1: 50, 2: 50, 3: 50, 4: 50 };
