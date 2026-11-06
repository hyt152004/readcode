import { z } from "zod";

///////////
// Taxonomy
///////////
export const LabelId = z.string();                // e.g. "backend.concurrency.race_conditions"
export type LabelId = z.infer<typeof LabelId>;

export const Taxonomy = z.object({
  version: z.string(),
  createdAt: z.string(),
  labels: z.array(LabelId),
});
export type Taxonomy = z.infer<typeof Taxonomy>;

///////////
// Classification
///////////
export type WeightVector = number[];              // dense, in taxonomy.labels order
export type LabelWeights = Record<LabelId, number>; // robust to version changes in taxonomy

export interface Classification {
  taxonomyVersion: string;
  weights: WeightVector;
}

///////////
// Job Posting
///////////
export interface JobPosting {
  link: string;
  company: string;
  title: string;
  description: string;
  date: Date;
}

///////////
// Example
///////////
export const MultipleChoice = z.object({
  prompt: z.string(),
  choices: z.array(z.string()).min(2),
});
export type MultipleChoice = z.infer<typeof MultipleChoice>;

export const ExamplePublic = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  durationMinutes: z.number().int().positive(),
  language: z.string(),
  questions: z.array(MultipleChoice).length(4),
  taxonomyVersion: z.string(),        // taxonomy the concept labels come from
  concepts: z.array(LabelId),         // taxonomy labels covered, for bank counts
});
export type ExamplePublic = z.infer<typeof ExamplePublic>;

// answers[i] corresponds to ExamplePublic.questions[i]
export const ExampleKey = z.object({
  answers: z.array(z.number().int().nonnegative()).length(4),   // correct choice index per question
});
export type ExampleKey = z.infer<typeof ExampleKey>;

export interface Example {
  public: ExamplePublic;
  key: ExampleKey;
  files: { path: string; content: string }[];
}