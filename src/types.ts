export type StepType = 'premise' | 'derivation' | 'goal';
export type CheckSeverity = 'error' | 'warning' | 'info';

export interface ProofStep {
  id: string;
  type: StepType;
  statement: string;
  rule: string;
  references: string[];
  note: string;
  counterexample: string;
  alternative: string;
}

export type DiffSection = 'goal' | 'symbol' | 'step';

export interface ProofVersion {
  id: string;
  name: string;
  createdAt: string;
  steps: ProofStep[];
  goal: string;
  symbols: Record<string, string>;
}

export interface ProofDocument {
  id: string;
  title: string;
  author: string;
  goal: string;
  symbols: Record<string, string>;
  steps: ProofStep[];
  versions: ProofVersion[];
  updatedAt: string;
}

export interface ProofCheck {
  id: string;
  severity: CheckSeverity;
  title: string;
  detail: string;
  stepId?: string;
}

export interface ProofDiff {
  section: DiffSection;
  kind: 'same' | 'added' | 'removed' | 'changed';
  label: string;
  before: string;
  after: string;
}

export const FINALIZABLE_CHECK_ID = 'proof-finalizable';
