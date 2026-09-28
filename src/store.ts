import { redraw } from 'mithril';
import { FINALIZABLE_CHECK_ID } from './types';
import type { ProofCheck, ProofDiff, ProofDocument, ProofStep, ProofVersion } from './types';

const STORAGE_KEY = 'sologsb-1014-proof-workspace-v1';
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const clone = <T>(value: T): T => structuredClone(value);

export const RULES = ['前提', '定义展开', '代入', '等式变形', '分配律', '同类项合并', '数学归纳', '反证法', '构造法', '结论'];

function sampleSteps(): ProofStep[] {
  return [
    { id: 's1', type: 'premise', statement: '$a,b$ 是实数', rule: '前提', references: [], note: '采用实数域中的交换律与分配律。', counterexample: '', alternative: '' },
    { id: 's2', type: 'derivation', statement: '$(a+b)^2=(a+b)(a+b)$', rule: '定义展开', references: ['s1'], note: '把平方写成两个相同因式之积。', counterexample: '', alternative: '' },
    { id: 's3', type: 'derivation', statement: '$(a+b)(a+b)=a^2+ab+ba+b^2$', rule: '分配律', references: ['s2'], note: '', counterexample: '', alternative: '也可先展开后半部分。' },
    { id: 's4', type: 'derivation', statement: '$a^2+ab+ba+b^2=a^2+2ab+b^2$', rule: '同类项合并', references: ['s3'], note: '由实数的交换律，$ab=ba$。', counterexample: '', alternative: '' },
    { id: 's5', type: 'goal', statement: '$(a+b)^2=a^2+2ab+b^2$', rule: '结论', references: ['s4'], note: '目标已由步骤 1 至 4 逐项推出。', counterexample: '', alternative: '' },
  ];
}

function issueSteps(): ProofStep[] {
  return [
    { id: 'i1', type: 'premise', statement: '$n$ 是正整数', rule: '前提', references: [], note: '', counterexample: '', alternative: '' },
    { id: 'i2', type: 'derivation', statement: '$P(1)$ 成立', rule: '前提', references: ['i1'], note: '归纳基例。', counterexample: '', alternative: '' },
    { id: 'i3', type: 'derivation', statement: '若 $P(k)$ 成立，则 $P(k+1)$ 也成立', rule: '数学归纳', references: ['missing-step'], note: '这里故意保留一个失效引用，用于演示检查。', counterexample: '', alternative: '' },
    { id: 'i4', type: 'goal', statement: '$P(n)$ 对所有正整数 $n$ 成立', rule: '结论', references: ['i3'], note: '尚未补齐归纳假设。', counterexample: '', alternative: '' },
  ];
}

function initialDocuments(): ProofDocument[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'doc-algebra',
      title: '完全平方公式证明',
      author: '数学组',
      goal: '$(a+b)^2=a^2+2ab+b^2$',
      symbols: { a: '实数', b: '实数', P: '关于正整数的命题', n: '正整数', k: '正整数' },
      steps: sampleSteps(),
      versions: [],
      updatedAt: now,
    },
    {
      id: 'doc-induction',
      title: '数学归纳法待核对稿',
      author: '学生工作区',
      goal: '$P(n)$ 对所有正整数 $n$ 成立',
      symbols: { P: '关于正整数的命题', n: '正整数', k: '正整数' },
      steps: issueSteps(),
      versions: [],
      updatedAt: now,
    },
  ];
}

function loadDocuments(): ProofDocument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialDocuments();
    const parsed = JSON.parse(raw) as ProofDocument[];
    if (Array.isArray(parsed) && parsed.length) {
      // 兼容旧版快照：早期版本没有保存符号表，补齐后仍可正常打开与比较。
      parsed.forEach((document) => {
        document.versions?.forEach((version) => {
          if (!version.symbols) version.symbols = {};
        });
      });
      return parsed;
    }
    return initialDocuments();
  } catch {
    return initialDocuments();
  }
}

export class ProofStore {
  documents = loadDocuments();
  activeId = this.documents[0]?.id ?? '';
  selectedStepId = this.documents[0]?.steps[0]?.id ?? '';
  compareVersionId = '';
  dragStepId = '';
  lastInput: HTMLTextAreaElement | HTMLInputElement | null = null;
  undoStack: ProofDocument[][] = [];
  redoStack: ProofDocument[][] = [];
  toast = '';

  get current(): ProofDocument {
    return this.documents.find((item) => item.id === this.activeId) ?? this.documents[0];
  }

  get selectedStep(): ProofStep | undefined {
    return this.current?.steps.find((step) => step.id === this.selectedStepId);
  }

  get checks(): ProofCheck[] {
    if (!this.current) return [];
    return validate(this.current);
  }

  save(): void {
    this.current.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.documents));
  }

  update(mutator: (document: ProofDocument) => void): void {
    this.undoStack.push(clone(this.documents));
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
    mutator(this.current);
    this.save();
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(clone(this.documents));
    this.documents = previous;
    this.ensureSelection();
    this.save();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(clone(this.documents));
    this.documents = next;
    this.ensureSelection();
    this.save();
  }

  selectDocument(id: string): void {
    this.activeId = id;
    this.compareVersionId = '';
    this.selectedStepId = this.current?.steps[0]?.id ?? '';
  }

  selectStep(id: string): void {
    this.selectedStepId = id;
  }

  ensureSelection(): void {
    if (!this.documents.some((item) => item.id === this.activeId)) this.activeId = this.documents[0]?.id ?? '';
    if (!this.current?.steps.some((step) => step.id === this.selectedStepId)) {
      this.selectedStepId = this.current?.steps[0]?.id ?? '';
    }
  }

  addDocument(): void {
    const id = uid('doc');
    const document: ProofDocument = {
      id,
      title: '未命名证明',
      author: '本地用户',
      goal: '$A=B$',
      symbols: { A: '待定义对象', B: '待定义对象' },
      steps: [{ id: uid('step'), type: 'premise', statement: '在这里输入前提', rule: '前提', references: [], note: '', counterexample: '', alternative: '' }],
      versions: [],
      updatedAt: new Date().toISOString(),
    };
    this.undoStack.push(clone(this.documents));
    this.documents.unshift(document);
    this.activeId = id;
    this.selectedStepId = document.steps[0].id;
    this.save();
  }

  removeDocument(id: string): void {
    if (this.documents.length <= 1) {
      this.notify('至少保留一个证明文档');
      return;
    }
    this.undoStack.push(clone(this.documents));
    this.documents = this.documents.filter((item) => item.id !== id);
    this.ensureSelection();
    this.save();
  }

  addStep(type: ProofStep['type'] = 'derivation'): void {
    const step: ProofStep = {
      id: uid('step'),
      type,
      statement: type === 'goal' ? '$A=B$' : '输入新的推导式',
      rule: type === 'goal' ? '结论' : '等式变形',
      references: this.selectedStepId ? [this.selectedStepId] : [],
      note: '',
      counterexample: '',
      alternative: '',
    };
    this.update((document) => {
      const selectedIndex = document.steps.findIndex((item) => item.id === this.selectedStepId);
      document.steps.splice(type === 'goal' ? document.steps.length : selectedIndex + 1, 0, step);
    });
    this.selectedStepId = step.id;
  }

  removeStep(id: string): void {
    this.update((document) => {
      document.steps = document.steps.filter((step) => step.id !== id);
      document.steps.forEach((step) => {
        step.references = step.references.filter((reference) => reference !== id);
      });
    });
    this.ensureSelection();
  }

  moveStep(sourceId: string, targetId: string): void {
    if (sourceId === targetId) return;
    this.update((document) => {
      const from = document.steps.findIndex((step) => step.id === sourceId);
      const to = document.steps.findIndex((step) => step.id === targetId);
      if (from < 0 || to < 0) return;
      const [moved] = document.steps.splice(from, 1);
      document.steps.splice(to, 0, moved);
    });
  }

  updateStep(patch: Partial<ProofStep>): void {
    const id = this.selectedStepId;
    this.update((document) => {
      const step = document.steps.find((item) => item.id === id);
      if (step) Object.assign(step, patch);
    });
  }

  createVersion(): void {
    this.update((document) => {
      const version: ProofVersion = {
        id: uid('version'),
        name: `版本 ${document.versions.length + 1}`,
        createdAt: new Date().toISOString(),
        steps: clone(document.steps),
        goal: document.goal,
        symbols: clone(document.symbols),
      };
      document.versions.unshift(version);
      this.compareVersionId = version.id;
    });
    this.notify('已保存当前证明快照');
  }

  notify(message: string): void {
    this.toast = message;
    window.setTimeout(() => {
      if (this.toast === message) {
        this.toast = '';
        redraw();
      }
    }, 2200);
  }
}

const STEPTYPE_SHORT: Record<ProofStep['type'], string> = { premise: '前提', derivation: '推导', goal: '结论' };

/** 取出公式中出现的“字母段”：已剔除 LaTeX 命令、数字与其他符号；希腊字母命令随反斜杠一并剔除。 */
function formulaRuns(text: string): string[] {
  return (text
    .replace(/\\[A-Za-z]+/g, ' ')
    .replace(/[0-9]+/g, ' ')
    .replace(/[^A-Za-zΑ-Ωα-ω']/g, ' ')
    .match(/[A-Za-zΑ-Ωα-ω']+/g) ?? [])
    .map((run) => run.replace(/'+/g, ''))
    .filter((run) => /[A-Za-zΑ-Ωα-ω]/.test(run));
}

/** 找出公式里未在符号表登记的符号：并置字母（如 ab）按单字母逐一核对。 */
function unknownSymbols(text: string, symbolKeys: Set<string>): string[] {
  const unknown: string[] = [];
  formulaRuns(text).forEach((run) => {
    if (symbolKeys.has(run)) return;
    const letters = run.match(/[A-Za-zΑ-Ωα-ω]/g) ?? [];
    if (run.length === 1) unknown.push(run);
    else letters.forEach((letter) => { if (!symbolKeys.has(letter)) unknown.push(letter); });
  });
  return [...new Set(unknown)];
}

/** 比较两条公式是否同一个式子：忽略 $、空白、花括号、间距与左右定界符等排版差异。 */
function normalizeFormula(text: string): string {
  return text
    .replace(/\\(left|right|displaystyle|big|Big|bigg|Bigg|!|,|;| )/g, '')
    .replace(/\$+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, '');
}

/** 非前提步骤必须能沿引用链回到前提；返回做不到的步骤。 */
function findUngroundedSteps(steps: ProofStep[], ids: Set<string>): ProofStep[] {
  const refsById = new Map(steps.map((step) => [step.id, step.references.filter((id) => ids.has(id))]));
  const grounded = new Set<string>();
  const ungrounded = new Set<string>();
  const visiting = new Set<string>();
  const reachesPremise = (id: string): boolean => {
    const step = steps.find((item) => item.id === id);
    if (!step || step.type === 'premise') return !!step && step.type === 'premise';
    if (grounded.has(id)) return true;
    if (ungrounded.has(id)) return false;
    if (visiting.has(id)) return false; // 引用链成环，无法回到前提
    visiting.add(id);
    const refs = refsById.get(id) ?? [];
    const ok = refs.length > 0 && refs.every(reachesPremise);
    visiting.delete(id);
    (ok ? grounded : ungrounded).add(id);
    return ok;
  };
  steps.forEach((step) => reachesPremise(step.id));
  return steps.filter((step) => step.type !== 'premise' && ungrounded.has(step.id));
}

export function validate(document: ProofDocument): ProofCheck[] {
  const checks: ProofCheck[] = [];
  const ids = new Set(document.steps.map((step) => step.id));
  const symbolKeys = new Set(Object.keys(document.symbols));
  const stepNumber = (id: string) => document.steps.findIndex((step) => step.id === id) + 1;
  const shortRef = (id: string) => id.replace(/^step-/, '').slice(-4).toUpperCase();

  // 1. 公式符号都要有说明（步骤式子与证明目标都要查）。
  document.steps.forEach((step, index) => {
    const unknown = unknownSymbols(step.statement, symbolKeys);
    if (unknown.length) {
      checks.push({
        id: `symbol-${step.id}`,
        severity: 'warning',
        title: '公式符号缺少说明',
        detail: `步骤 ${index + 1}（${STEPTYPE_SHORT[step.type]}）使用的 ${unknown.join('、')} 未在符号表中说明。`,
        stepId: step.id,
      });
    }
  });
  const unknownGoalSymbols = unknownSymbols(document.goal, symbolKeys);
  if (unknownGoalSymbols.length) {
    checks.push({
      id: 'symbol-goal',
      severity: 'warning',
      title: '目标符号缺少说明',
      detail: `证明目标中的 ${unknownGoalSymbols.join('、')} 未在符号表中说明。`,
    });
  }

  // 2. 引用的步骤必须存在。
  document.steps.forEach((step, index) => {
    step.references.forEach((reference) => {
      if (!ids.has(reference)) {
        checks.push({
          id: `missing-${step.id}-${reference}`,
          severity: 'error',
          title: '引用步骤不存在',
          detail: `步骤 ${index + 1} 引用的步骤 ${shortRef(reference)} 已不存在，请重新选择依据。`,
          stepId: step.id,
        });
      }
    });
  });

  // 3. 引用链不能成环。
  const graph = new Map(document.steps.map((step) => [step.id, step.references.filter((id) => ids.has(id))]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleStep = new Set<string>();
  const visit = (id: string, path: string[]): boolean => {
    if (visiting.has(id)) {
      path.slice(path.indexOf(id)).forEach((item) => cycleStep.add(item));
      return true;
    }
    if (visited.has(id)) return false;
    visiting.add(id);
    const hasCycle = (graph.get(id) ?? []).some((next) => visit(next, [...path, id]));
    visiting.delete(id);
    visited.add(id);
    return hasCycle;
  };
  [...graph.keys()].forEach((id) => visit(id, []));
  if (cycleStep.size) {
    checks.push({
      id: 'cycle',
      severity: 'error',
      title: '检测到循环引用',
      detail: `步骤 ${[...cycleStep].map(stepNumber).filter(Boolean).join('、')} 的引用链形成闭环，请调整步骤关系。`,
      stepId: [...cycleStep][0],
    });
  }

  // 4. 结论式子必须与证明目标相同。
  const conclusion = [...document.steps].reverse().find((step) => step.type === 'goal' && step.rule === '结论');
  if (!conclusion) {
    checks.push({ id: 'goal-missing', severity: 'error', title: '目标未被证明', detail: '缺少类型为“目标 / 结论”、推理规则为“结论”的最终步骤，不能定稿。' });
  } else if (normalizeFormula(conclusion.statement) !== normalizeFormula(document.goal)) {
    checks.push({
      id: 'goal-mismatch',
      severity: 'error',
      title: '结论式子与证明目标不一致',
      detail: `步骤 ${stepNumber(conclusion.id)} 的结论“${conclusion.statement.replace(/\$/g, '')}”与目标“${document.goal.replace(/\$/g, '')}”不相同，不能定稿。`,
      stepId: conclusion.id,
    });
  }

  // 5. 每条推导都要能沿引用回到前提。
  findUngroundedSteps(document.steps, ids).forEach((step) => {
    if (step.references.some((reference) => !ids.has(reference))) return; // 已由“引用步骤不存在”点名
    const number = stepNumber(step.id);
    const isGoal = step.type === 'goal';
    const detail = step.references.length === 0
      ? `步骤 ${number}（${STEPTYPE_SHORT[step.type]}）没有引用任何依据，无法回溯到前提。`
      : `步骤 ${number}（${STEPTYPE_SHORT[step.type]}）的引用链无法回到前提，请在第 ${number} 步之前补齐断链的推导。`;
    checks.push({
      id: `ungrounded-${step.id}`,
      severity: 'error',
      title: isGoal ? '结论无法回溯到前提' : '推导无法沿引用回到前提',
      detail,
      stepId: step.id,
    });
  });

  // 6. 三项条件同时满足才标成可定稿；结构没报错但有缺口时不出现本项。
  if (checks.length === 0 && conclusion) {
    checks.push({
      id: FINALIZABLE_CHECK_ID,
      severity: 'info',
      title: '可定稿',
      detail: '结论式子与证明目标一致，公式符号均有说明，且每条推导都能沿引用回到前提。',
    });
  }
  return checks;
}

export function compareVersion(document: ProofDocument, version: ProofVersion): ProofDiff[] {
  const result: ProofDiff[] = [];

  // 证明目标
  const goalBefore = version.goal ?? '';
  const goalAfter = document.goal ?? '';
  result.push({
    section: 'goal',
    kind: !goalBefore ? 'added' : !goalAfter ? 'removed' : goalBefore === goalAfter ? 'same' : 'changed',
    label: '证明目标',
    before: goalBefore || '—',
    after: goalAfter || '—',
  });

  // 符号表：旧快照没有符号表（早期版本）时，按原稿空缺显示，当前符号记为新增。
  const beforeSymbols = version.symbols ?? {};
  const afterSymbols = document.symbols ?? {};
  [...new Set([...Object.keys(beforeSymbols), ...Object.keys(afterSymbols)])].sort().forEach((name) => {
    const before = beforeSymbols[name];
    const after = afterSymbols[name];
    result.push({
      section: 'symbol',
      kind: before === undefined ? 'added' : after === undefined ? 'removed' : before === after ? 'same' : 'changed',
      label: `符号 ${name}`,
      before: before ?? '—',
      after: after ?? '—',
    });
  });

  // 证明步骤（按位置逐条比对式子）
  const size = Math.max(document.steps.length, version.steps.length);
  for (let index = 0; index < size; index += 1) {
    const before = version.steps[index]?.statement ?? '';
    const after = document.steps[index]?.statement ?? '';
    result.push({
      section: 'step',
      kind: !before ? 'added' : !after ? 'removed' : before === after ? 'same' : 'changed',
      label: `步骤 ${index + 1}`,
      before: before || '—',
      after: after || '—',
    });
  }
  return result;
}

export function createId(prefix: string): string {
  return uid(prefix);
}
