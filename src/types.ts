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

export interface ProofVersion {
  id: string;
  name: string;
  createdAt: string;
  steps: ProofStep[];
  goal: string;
  // 旧版本快照可能没有符号表，保留可选以便旧稿仍可打开比较。
  symbols?: Record<string, string>;
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
  section: 'goal' | 'symbols' | 'steps';
  kind: 'same' | 'added' | 'removed' | 'changed';
  label: string;
  before: string;
  after: string;
}

export interface VersionComparison {
  rows: ProofDiff[];
  // 旧快照没有符号表时为 false，界面照原稿显示并提示缺失。
  hasSymbols: boolean;
}
