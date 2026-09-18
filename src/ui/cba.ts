// CBA reference numbers, 2026-27 projections. UI-only constants (not engine truth).
export const SALARY_SEASONS = ['2026-27', '2027-28', '2028-29', '2029-30', '2030-31'] as const;

export const CAP = 165_000_000;
export const TAX = 200_000_000;
export const APRON1 = 209_000_000;
export const APRON2 = 222_000_000;

export const CAP_LINES = [
  { label: 'Cap', value: CAP },
  { label: 'Tax', value: TAX },
  { label: 'Apron 1', value: APRON1 },
  { label: 'Apron 2', value: APRON2 }
] as const;
