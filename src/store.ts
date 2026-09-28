import { redraw } from 'mithril';
import type { ProofCheck, ProofDiff, ProofDocument, ProofStep, ProofVersion, VersionComparison } from './types';

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
    return Array.isArray(parsed) && parsed.length ? parsed : initialDocuments();
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
    this.notify('已保存当前证明快照（目标、符号表与步骤）');
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

function stripLatexCommands(text: string): string {
  return text.replace(/\\[A-Za-z]+/g, ' ').replace(/[{}_^]/g, ' ');
}

// 去除 $ 包裹与空白，用于“结论式子与证明目标相同”的比较。
export function normalizeFormula(text: string): string {
  return text.replace(/\$/g, '').replace(/\s+/g, '');
}

// 提取公式中出现的标识符 token（LaTeX 命令已先被剔除）。
function formulaTokens(text: string): string[] {
  return stripLatexCommands(text).match(/[A-Za-z][A-Za-z0-9']*|\d+/g) ?? [];
}

// 多字母并列（如 ab、ba）按每个字母拆分使用；纯数字不作为符号。
function usedSymbols(text: string): Set<string> {
  const used = new Set<string>();
  formulaTokens(text)
    .filter((token) => !/^\d+$/.test(token))
    .forEach((token) => {
      [...token].forEach((letter) => used.add(letter));
    });
  return used;
}

export function validate(document: ProofDocument): ProofCheck[] {
  const checks: ProofCheck[] = [];
  const ids = new Set(document.steps.map((step) => step.id));
  const symbolKeys = new Set(Object.keys(document.symbols));
  const stepLabel = (id: string): string => {
    const index = document.steps.findIndex((step) => step.id === id);
    return index >= 0 ? `步骤 ${index + 1}` : id;
  };

  // 1. 符号表中含义为空的符号——“有符号但没说明”。
  Object.entries(document.symbols).forEach(([symbol, meaning]) => {
    if (!meaning.trim()) {
      checks.push({ id: `symbol-empty-${symbol}`, severity: 'error', title: '符号缺少说明', detail: `符号「${symbol}」在符号表中没有填写含义。` });
    }
  });

  const reportUnknownSymbols = (text: string, stepId?: string, index?: number): void => {
    const unknown = [...usedSymbols(text)].filter((token) => !symbolKeys.has(token));
    if (unknown.length) {
      const where = index === undefined ? '证明目标' : `步骤 ${index + 1}`;
      checks.push({
        id: `symbol-unknown-${stepId ?? 'goal'}-${unknown.join('-')}`,
        severity: 'error',
        title: '发现未定义符号',
        detail: `${where} 使用了未在符号表中说明的符号：${unknown.join('、')}。`,
        stepId,
      });
    }
  };

  // 2. 证明目标与每一步的式子，其符号都必须在符号表中有说明。
  if (!document.goal.trim()) {
    checks.push({ id: 'goal-empty', severity: 'error', title: '证明目标为空', detail: '请先填写证明目标，才能判定结论是否与目标一致。' });
  } else {
    reportUnknownSymbols(document.goal);
  }

  document.steps.forEach((step, index) => {
    reportUnknownSymbols(step.statement, step.id, index);
    step.references.forEach((reference) => {
      if (!ids.has(reference)) {
        checks.push({ id: `missing-${step.id}-${reference}`, severity: 'error', title: '引用步骤不存在', detail: `步骤 ${index + 1} 引用了已删除的步骤 ${reference}`, stepId: step.id });
      }
    });
  });

  // 有效引用构成的图（失效引用不参与）。
  const graph = new Map(document.steps.map((step) => [step.id, step.references.filter((id) => ids.has(id))]));

  // 3. 循环引用检测。
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
    const labels = [...cycleStep].map(stepLabel).join('、');
    checks.push({ id: 'cycle', severity: 'error', title: '检测到循环引用', detail: `引用链在 ${labels} 之间形成闭环，请调整步骤关系。`, stepId: [...cycleStep][0] });
  }

  // 4. 每条非前提步骤必须能沿引用链回到某个前提。
  const reachesPremiseCache = new Map<string, boolean>();
  const reachesPremise = (id: string, seen: Set<string>): boolean => {
    const cached = reachesPremiseCache.get(id);
    if (cached !== undefined) return cached;
    const step = document.steps.find((item) => item.id === id);
    if (!step) return false;
    if (step.type === 'premise') {
      reachesPremiseCache.set(id, true);
      return true;
    }
    if (seen.has(id)) return false; // 引用成环，不能当作回到前提的路径
    seen.add(id);
    const grounded = (graph.get(id) ?? []).some((reference) => reachesPremise(reference, seen));
    reachesPremiseCache.set(id, grounded);
    return grounded;
  };

  document.steps.forEach((step, index) => {
    if (step.type === 'premise') return;
    const validRefs = graph.get(step.id) ?? [];
    if (!validRefs.length) {
      checks.push({
        id: `ungrounded-${step.id}`,
        severity: 'error',
        title: '推导缺少前提支撑',
        detail: `步骤 ${index + 1} 没有引用任何前置步骤，无法沿引用链回到前提。`,
        stepId: step.id,
      });
    } else if (!reachesPremise(step.id, new Set())) {
      checks.push({
        id: `ungrounded-${step.id}`,
        severity: 'error',
        title: '推导无法回到前提',
        detail: `步骤 ${index + 1} 的引用链（${validRefs.map(stepLabel).join('、')}）最终没有连接到任何前提。`,
        stepId: step.id,
      });
    }
  });

  // 5. 结论步骤必须存在，且结论式子与证明目标逐字相同。
  const goalStep = document.steps.find((step) => step.type === 'goal' && step.rule === '结论');
  if (!goalStep) {
    checks.push({ id: 'goal-missing', severity: 'error', title: '目标未被证明', detail: '请添加“结论”类型的最终步骤。' });
  } else {
    const goalIndex = document.steps.indexOf(goalStep);
    if (normalizeFormula(goalStep.statement) !== normalizeFormula(document.goal)) {
      checks.push({
        id: 'goal-mismatch',
        severity: 'error',
        title: '结论式子与证明目标不一致',
        detail: `步骤 ${goalIndex + 1} 的结论式与证明目标不同：目标为 ${document.goal || '（空）'}，结论为 ${goalStep.statement || '（空）'}。`,
        stepId: goalStep.id,
      });
    }
  }

  // 6. 严格定稿判定：目标一致、符号齐全、引用可回溯，三者同时满足才可定稿。
  const blocking = checks.filter((check) => check.severity === 'error');
  if (!blocking.length) {
    checks.push({
      id: 'proof-finalizable',
      severity: 'info',
      title: '可定稿',
      detail: '结论式子与证明目标相同，公式符号均有说明，且每条推导都能沿引用回到前提。',
      stepId: goalStep?.id,
    });
  } else {
    const gapKinds: string[] = [];
    const has = (id: string) => blocking.some((check) => check.id.startsWith(id));
    if (has('goal-missing') || has('goal-mismatch') || has('goal-empty')) gapKinds.push('结论未与证明目标对齐');
    if (has('symbol-')) gapKinds.push('存在缺少说明的符号');
    if (has('missing-') || has('cycle') || has('ungrounded-')) gapKinds.push('引用链存在缺失或无法回到前提');
    const named = blocking.map((check) => check.detail).join('；');
    checks.push({
      id: 'proof-not-final',
      severity: 'warning',
      title: '暂不可定稿',
      detail: `缺口：${gapKinds.join('；') || '存在未解决的检查项'}。${named}`,
    });
  }
  return checks;
}

function diffKind(before: string, after: string): ProofDiff['kind'] {
  return !before ? 'added' : !after ? 'removed' : before === after ? 'same' : 'changed';
}

// 按步骤 id 配对对齐：同 id 视为同一步（拖拽排序不会产生伪差异），
// 新增步骤按当前稿位置插入，被删除的旧步骤附在末尾标注“旧步骤”。
function diffSteps(beforeSteps: ProofStep[], afterSteps: ProofStep[]): ProofDiff[] {
  const rows: ProofDiff[] = [];
  const beforeById = new Map(beforeSteps.map((step) => [step.id, step]));
  const matchedBefore = new Set<string>();

  afterSteps.forEach((step, index) => {
    const before = beforeById.get(step.id);
    if (!before) {
      rows.push({ section: 'steps', kind: 'added', label: `步骤 ${index + 1}`, before: '', after: step.statement });
      return;
    }
    matchedBefore.add(step.id);
    rows.push({
      section: 'steps',
      kind: diffKind(before.statement, step.statement),
      label: `步骤 ${index + 1}`,
      before: before.statement,
      after: step.statement,
    });
  });

  beforeSteps.forEach((step, index) => {
    if (!matchedBefore.has(step.id)) {
      rows.push({ section: 'steps', kind: 'removed', label: `旧步骤 ${index + 1}`, before: step.statement, after: '' });
    }
  });
  return rows;
}

export function compareVersion(document: ProofDocument, version: ProofVersion): VersionComparison {
  const rows: ProofDiff[] = [];

  // 目标：单独一行参与增删改比较。
  rows.push({
    section: 'goal',
    kind: diffKind(version.goal, document.goal),
    label: '证明目标',
    before: version.goal,
    after: document.goal,
  });

  // 符号表：旧快照没有符号表时，符号统一显示为“新增”，旧稿一列照原稿留空。
  const hasSymbols = version.symbols !== undefined;
  const beforeSymbols = version.symbols ?? {};
  const symbolKeys = [...new Set([...Object.keys(beforeSymbols), ...Object.keys(document.symbols)])].sort();
  symbolKeys.forEach((symbol) => {
    const before = hasSymbols && symbol in beforeSymbols ? beforeSymbols[symbol] : '';
    const after = symbol in document.symbols ? document.symbols[symbol] : '';
    rows.push({
      section: 'symbols',
      kind: diffKind(before, after),
      label: `符号 ${symbol}`,
      before,
      after,
    });
  });

  rows.push(...diffSteps(version.steps, document.steps));
  return { rows, hasSymbols };
}

export function createId(prefix: string): string {
  return uid(prefix);
}
