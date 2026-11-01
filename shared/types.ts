export type LabelId = string;                     // e.g. "backend.concurrency.race_conditions"

export interface Taxonomy {
  version: string;
  createdAt: string;
  labels: LabelId[];
}

export type WeightVector = number[];              // dense, in taxonomy.labels order
export type LabelWeights = Record<LabelId, number>; // robust to version changes in taxonomy

export interface Classification {
  taxonomyVersion: string;
  weights: WeightVector;
}

export interface JobPosting {
  link: string;
  company: string;
  title: string;
  description: string;
  date: Date;
}
