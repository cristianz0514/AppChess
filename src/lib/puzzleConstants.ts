// Shared between the server page (practica-mate/page.tsx) and the client
// seeder components (PracticeSeeder.tsx). MUST live in a plain module (no
// "use client") — a Server Component importing a non-component value from a
// "use client" file gets `undefined`, not the real value, since RSC only
// passes CLIENT COMPONENT references across that boundary, not plain exports.
export const FAST_TARGET = 6;
export const FULL_TARGET: Record<1 | 2, number> = { 1: 20, 2: 15 };
