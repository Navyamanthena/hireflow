/**
 * Pipeline stages a candidate moves through.
 * NEEDS_REVIEW exists so a low AI score never auto-rejects anyone:
 * a human always makes the rejection call.
 */
export enum Stage {
  APPLIED = 'APPLIED',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  SCREENED = 'SCREENED',
  PHONE_SCREEN = 'PHONE_SCREEN',
  INTERVIEW = 'INTERVIEW',
  OFFER = 'OFFER',
  HIRED = 'HIRED',
  REJECTED = 'REJECTED',
}

export enum ScoringStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SCORED = 'SCORED',
  FAILED = 'FAILED',
}

export const STAGE_ORDER: Stage[] = [
  Stage.APPLIED,
  Stage.NEEDS_REVIEW,
  Stage.SCREENED,
  Stage.PHONE_SCREEN,
  Stage.INTERVIEW,
  Stage.OFFER,
  Stage.HIRED,
  Stage.REJECTED,
];
