const LBS_TO_KG = 0.45359237;

/** Convert pounds to kilograms, rounded to 2 decimal places. */
export function lbsToKg(lbs: number): number {
  return Math.round(lbs * LBS_TO_KG * 100) / 100;
}

/** Convert kilograms to pounds, rounded to 2 decimal places. */
export function kgToLbs(kg: number): number {
  return Math.round((kg / LBS_TO_KG) * 100) / 100;
}
