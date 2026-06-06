import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { PYTHON, REGEX_PATTERNS, TS_JS } from "./patterns.js";
import type { Confidence, Evidence, FileReport, PatternSpec, ScanOptions, ScanReport } from "./types.js";

const IGNORED_DIRECTORIES: Record<string, true> = {
  ".git": true,
  ".hg": true,
  ".svn": true,
  ".cache": true,
  ".mypy_cache": true,
  ".pytest_cache": true,
  ".ruff_cache": true,
  ".tox": true,
  ".venv": true,
  ".next": true,
  ".nuxt": true,
  ".turbo": true,
  "__pycache__": true,
  build: true,
  coverage: true,
  dist: true,
  "dist-test": true,
  node_modules: true,
  out: true,
  target: true,
  vendor: true,
  venv: true
};

const BINARY_EXTENSIONS: Record<string, true> = {
  ".7z": true,
  ".avif": true,
  ".bmp": true,
  ".class": true,
  ".dll": true,
  ".dylib": true,
  ".exe": true,
  ".gif": true,
  ".gz": true,
  ".ico": true,
  ".jpeg": true,
  ".jpg": true,
  ".lockb": true,
  ".mov": true,
  ".mp4": true,
  ".pdf": true,
  ".png": true,
  ".pyc": true,
  ".so": true,
  ".tar": true,
  ".webp": true,
  ".zip": true
};

const CODE_EXTENSIONS: Record<string, true> = {
  ".c": true,
  ".cc": true,
  ".cpp": true,
  ".cs": true,
  ".cts": true,
  ".cxx": true,
  ".go": true,
  ".h": true,
  ".hpp": true,
  ".java": true,
  ".js": true,
  ".jsx": true,
  ".kt": true,
  ".mjs": true,
  ".mts": true,
  ".php": true,
  ".py": true,
  ".pyi": true,
  ".rb": true,
  ".rs": true,
  ".scala": true,
  ".sh": true,
  ".swift": true,
  ".ts": true,
  ".tsx": true
};

const NODE_BUILTINS: Record<string, true> = {
  assert: true,
  buffer: true,
  child_process: true,
  cluster: true,
  console: true,
  crypto: true,
  dns: true,
  events: true,
  fs: true,
  http: true,
  http2: true,
  https: true,
  module: true,
  net: true,
  os: true,
  path: true,
  perf_hooks: true,
  process: true,
  querystring: true,
  readline: true,
  stream: true,
  string_decoder: true,
  timers: true,
  tls: true,
  tty: true,
  url: true,
  util: true,
  vm: true,
  worker_threads: true,
  zlib: true
};

const PYTHON_STDLIB: Record<string, true> = {
  __future__: true,
  abc: true,
  argparse: true,
  array: true,
  ast: true,
  asyncio: true,
  base64: true,
  collections: true,
  contextlib: true,
  csv: true,
  dataclasses: true,
  datetime: true,
  decimal: true,
  enum: true,
  functools: true,
  hashlib: true,
  heapq: true,
  hmac: true,
  html: true,
  http: true,
  importlib: true,
  inspect: true,
  io: true,
  itertools: true,
  json: true,
  logging: true,
  math: true,
  multiprocessing: true,
  os: true,
  pathlib: true,
  pickle: true,
  platform: true,
  queue: true,
  random: true,
  re: true,
  secrets: true,
  shutil: true,
  signal: true,
  socket: true,
  sqlite3: true,
  ssl: true,
  statistics: true,
  string: true,
  subprocess: true,
  sys: true,
  tempfile: true,
  threading: true,
  time: true,
  tomllib: true,
  traceback: true,
  typing: true,
  typing_extensions: true,
  unittest: true,
  urllib: true,
  uuid: true,
  xml: true,
  zipfile: true
};

const DEFAULT_OPTIONS: ScanOptions = {
  maxFileBytes: 2 * 1024 * 1024,
  includeHidden: false,
  maxEvidencePerPattern: 4,
  includeUnknownImports: true,
  includeGitSignals: true
};

const OBVIOUS_COMMENT_RE = /^\s*(?:\/\/|#)\s*(?:Loop through|Iterate over|Initialize|Create|Get|Set|Check if|Validate|Return|Print|Calculate|Convert|Parse|Open|Close|Read|Write|Fetch|Map|Filter|Handle|Update|Ensure)\b/i;
const VERBOSE_IDENTIFIER_RE = /\b(?:process|handle|validate|generate|create|format|parse|transform|calculate|build|prepare)(?:User|Data|Response|Request|Config|Options|Result|Input|Output|Message|Content|Information|Details)\w*\b/g;
const IDENTIFIER_RE = /\b[A-Za-z_$][\w$]*\b/g;
const GENERIC_IDENTIFIER_RE = /^(?:data|result|results|temp|tmp|helper|helpers|util|utils|item|obj|arr|value|values|response|request|error|config|options|manager|processor|handler|payload|input|output)$/i;
const PY_FUNCTION_RE = /^\s*(?:async\s+)?def\s+(\w+)\s*\([^)]*\)\s*(?:->\s*[^:]+)?\s*:/gm;
const JS_FUNCTION_RE = /\b(?:function\s+(\w+)\s*\([^)]*\)\s*\{|const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\()/g;
const JS_IMPORT_RE = /(?:^\s*import\s+['"]([^'"]+)['"]|\bfrom\s+['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"])/gm;
const PY_IMPORT_RE = /^\s*(?:from\s+([A-Za-z_][\w.]*)\s+import|import\s+([A-Za-z_][\w.]*))/gm;
const NULL_GUARD_RE = /\b(?:if\s*\([^)]*(?:===?\s*(?:null|undefined)|!={1,2}\s*(?:null|undefined))|if\s+\w+\s+is\s+None|if\s+not\s+isinstance\s*\(|if\s+\w+\s*(?:<=|<|>=|>)\s*0\s*:)/g;
const MOCK_RE = /\b(?:dummy|dummies|stub|mock|spy|spies|fake|monkeypatch|monkey_patch|MagicMock|jest\.mock|vi\.mock|sinon|patch\s*\()/gi;
const JSDOC_RE = /\/\*\*[\s\S]*?\*\//g;

interface ProjectContext {
  root: string;
  dependencies: Set<string>;
  localModules: Set<string>;
  aliases: string[];
}

interface ReadResult {
  path: string;
  text: string;
  size: number;
}

interface ScanState {
  evidence: Evidence[];
  categoryScores: Record<string, number>;
}

export function scanPath(inputPath: string, overrides: Partial<ScanOptions> = {}): ScanReport {
  const options: ScanOptions = { ...DEFAULT_OPTIONS, ...overrides };
  const root = resolve(inputPath || ".");
  const rootStats = statSync(root);
  const contextRoot = rootStats.isDirectory() ? root : dirname(root);
  const context = buildProjectContext(contextRoot);
  const errors: string[] = [];
  const files: FileReport[] = [];
  let filesScanned = 0;
  let filesSkipped = 0;
  let bytesScanned = 0;

  for (const candidate of iterCodeFiles(root, options)) {
    let readResult: ReadResult | undefined;
    try {
      readResult = readCodeFile(candidate, options);
    } catch (error) {
      filesSkipped += 1;
      errors.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (!readResult) {
      filesSkipped += 1;
      continue;
    }

    filesScanned += 1;
    bytesScanned += readResult.size;
    const report = scanTextFile(readResult.path, readResult.text, context, options);
    if (report.evidence.length > 0) {
      files.push(report);
    }
  }

  files.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
  const score = repositoryScore(files);
  const evidenceCount = files.reduce((total, file) => total + file.evidence.length, 0);
  return {
    root,
    score: round(score),
    confidence: confidenceForScore(score),
    filesScanned,
    filesSkipped,
    bytesScanned,
    evidenceCount,
    files,
    errors
  };
}

export function scanTextFile(path: string, text: string, context: ProjectContext, options: ScanOptions = DEFAULT_OPTIONS): FileReport {
  const state: ScanState = { evidence: [], categoryScores: {} };
  const suffix = extname(path).toLowerCase();

  for (const spec of REGEX_PATTERNS) {
    if (!spec.extensions || suffix in spec.extensions) {
      applyRegexPattern(spec, text, state, options);
    }
  }

  const metrics = basicMetrics(text);
  applyRedundantCommentMetric(text, state, options);
  applyVerboseIdentifierMetric(text, state, options);
  applyGenericIdentifierDensityMetric(text, state, options);
  applyDuplicateLineMetric(text, state, options);
  applyLineLengthUniformityMetric(text, state, options);
  applyNullGuardMetric(text, state, options);
  applyManySmallHelpersMetric(path, text, state, options);
  applyLowCouplingMetric(path, text, state, context, options);
  if (suffix in PYTHON) {
    applyPythonVerboseDocstringMetric(text, state, options);
    applyPythonValidationMetric(text, state, options);
  }
  if (suffix in TS_JS) {
    applyJSDocCoverageMetric(text, state, options);
  }
  if (isTestPath(path)) {
    applyMockDensityMetric(text, state, options);
  }
  if (options.includeUnknownImports) {
    applyUnknownImportMetric(path, text, context, state, options);
  }

  const rawScore = Object.values(state.categoryScores).reduce((total, value) => total + value, 0);
  const score = Math.min(100, rawScore);
  metrics.evidenceCount = state.evidence.length;
  return {
    path: safeRelative(path, context.root),
    score: round(score),
    confidence: confidenceForScore(score),
    categoryScores: roundRecord(state.categoryScores),
    metrics,
    evidence: state.evidence
  };
}

function* iterCodeFiles(root: string, options: ScanOptions): Iterable<string> {
  const stats = statSync(root);
  if (stats.isFile()) {
    if (isCodeCandidate(root, options)) {
      yield root;
    }
    return;
  }

  const stack = [root];
  while (stack.length > 0) {
    const directory = stack.pop();
    if (!directory) {
      continue;
    }
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name, options)) {
          stack.push(entryPath);
        }
        continue;
      }
      if (entry.isFile() && isCodeCandidate(entryPath, options)) {
        yield entryPath;
      }
    }
  }
}

function shouldSkipDirectory(name: string, options: ScanOptions): boolean {
  if (name in IGNORED_DIRECTORIES) {
    return true;
  }
  return !options.includeHidden && name.startsWith(".");
}

function isCodeCandidate(path: string, options: ScanOptions): boolean {
  const name = basename(path);
  if (!options.includeHidden && name.startsWith(".")) {
    return false;
  }
  const suffix = extname(path).toLowerCase();
  if (suffix in BINARY_EXTENSIONS) {
    return false;
  }
  return suffix in CODE_EXTENSIONS;
}

function readCodeFile(path: string, options: ScanOptions): ReadResult | undefined {
  const stats = statSync(path);
  if (!stats.isFile() || stats.size > options.maxFileBytes) {
    return undefined;
  }
  const raw = readFileSync(path);
  if (raw.subarray(0, 4096).includes(0)) {
    return undefined;
  }
  return { path, text: raw.toString("utf8"), size: stats.size };
}

function applyRegexPattern(spec: PatternSpec, text: string, state: ScanState, options: ScanOptions): void {
  spec.regex.lastIndex = 0;
  const matches = [...text.matchAll(spec.regex)];
  if (matches.length === 0) {
    return;
  }
  const visibleCount = Math.min(matches.length, options.maxEvidencePerPattern);
  const score = Math.min(spec.weight * matches.length, spec.maxScore);
  const perEvidenceWeight = score / visibleCount;
  for (const match of matches.slice(0, visibleCount)) {
    const index = match.index ?? 0;
    addEvidence(state, {
      patternId: spec.id,
      title: spec.title,
      category: spec.category,
      weight: perEvidenceWeight,
      line: lineForOffset(text, index),
      excerpt: excerptForOffset(text, index),
      reason: spec.reason,
      falsePositiveRisk: spec.falsePositiveRisk,
      source: spec.source
    });
  }
}


function basicMetrics(text: string): Record<string, number> {
  const lines = text.split(/\r?\n/);
  let sloc = 0;
  let commentLines = 0;
  let blankLines = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      blankLines += 1;
      continue;
    }
    if (isCommentLine(trimmed)) {
      commentLines += 1;
    } else {
      sloc += 1;
    }
  }
  const tokenMatches = text.match(/[A-Za-z_$][\w$]*|\d+|==={0,1}|!==?|<=|>=|=>|[{}()[\].,;:+\-*/%]/g) ?? [];
  const uniqueTokens = new Set(tokenMatches);
  return {
    lines: lines.length,
    sloc,
    commentLines,
    blankLines,
    commentRatio: round(commentLines / Math.max(1, sloc)),
    blankRatio: round(blankLines / Math.max(1, lines.length)),
    tokenCount: tokenMatches.length,
    uniqueTokenRatio: round(uniqueTokens.size / Math.max(1, tokenMatches.length))
  };
}

function applyRedundantCommentMetric(text: string, state: ScanState, options: ScanOptions): void {
  const hits = text
    .split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter((item) => OBVIOUS_COMMENT_RE.test(item.text))
    .map((item): [number, string] => [item.line, item.text]);
  if (hits.length < 3) {
    return;
  }
  addMetricHits(state, hits, Math.min(18, 4 + hits.length * 2), options, {
    patternId: "redundant_obvious_comments",
    title: "Dense comments narrating obvious operations",
    category: "comment_style",
    reason: "AI-generated code often explains what each nearby statement does instead of why it matters.",
    falsePositiveRisk: "Tutorials and beginner-oriented code can use the same style.",
    source: "https://diatomenterprises.com/blog/how-to-tell-if-code-is-ai-generated/"
  });
}

function applyVerboseIdentifierMetric(text: string, state: ScanState, options: ScanOptions): void {
  VERBOSE_IDENTIFIER_RE.lastIndex = 0;
  const matches = [...text.matchAll(VERBOSE_IDENTIFIER_RE)];
  const unique = new Set(matches.map((match) => match[0]));
  if (unique.size < 4) {
    return;
  }
  addMetricHits(
    state,
    matches.map((match): [number, string] => [lineForOffset(text, match.index ?? 0), match[0]]),
    Math.min(14, 2 * unique.size),
    options,
    {
      patternId: "verbose_generic_identifiers",
      title: "Verbose generic identifier cluster",
      category: "naming_style",
      reason: "Studies and heuristic detectors report LLM code often uses semantically rich but generic names such as processUserData/handleResponse.",
      falsePositiveRisk: "Enterprise codebases can intentionally use verbose naming conventions.",
      source: "https://arxiv.org/pdf/2306.14397"
    }
  );
}

function applyGenericIdentifierDensityMetric(text: string, state: ScanState, options: ScanOptions): void {
  const identifiers = [...text.matchAll(IDENTIFIER_RE)].map((match) => match[0]);
  if (identifiers.length < 25) {
    return;
  }
  const generic = identifiers.filter((name) => GENERIC_IDENTIFIER_RE.test(name));
  const ratio = generic.length / identifiers.length;
  if (generic.length < 8 || ratio < 0.14) {
    return;
  }
  const examples = [...new Set(generic)].slice(0, options.maxEvidencePerPattern).join(", ");
  addEvidence(state, {
    patternId: "generic_identifier_density",
    title: "High density of generic identifiers",
    category: "naming_style",
    weight: Math.min(14, 4 + ratio * 50),
    line: 1,
    excerpt: `generic identifiers: ${examples}`,
    reason: "Multiple detectors flag dense use of data/result/temp/helper-style names as generated boilerplate evidence.",
    falsePositiveRisk: "Glue code and framework handlers naturally use generic names; use as aggregate evidence only.",
    source: "https://github.com/BenjaminSRussell/Ai_code_detector"
  });
}

function applyDuplicateLineMetric(text: string, state: ScanState, _options: ScanOptions): void {
  const counts: Record<string, number> = {};
  for (const line of text.split(/\r?\n/)) {
    const normalized = line.trim();
    if (normalized.length < 16 || isCommentLine(normalized)) {
      continue;
    }
    counts[normalized] = (counts[normalized] ?? 0) + 1;
  }
  const duplicates = Object.entries(counts).filter(([, count]) => count >= 3);
  if (duplicates.length === 0) {
    return;
  }
  const repeatedCount = duplicates.reduce((total, [, count]) => total + count, 0);
  addEvidence(state, {
    patternId: "duplicate_line_clusters",
    title: "Repeated line clusters",
    category: "structure",
    weight: Math.min(12, 4 + repeatedCount),
    line: 1,
    excerpt: duplicates.slice(0, 2).map(([line, count]) => `${count}x ${line}`).join(" | ").slice(0, 220),
    reason: "Heuristic detectors use repeated boilerplate lines as weak evidence of generated or copy-pasted code.",
    falsePositiveRisk: "Switch tables, generated clients, and repetitive config can legitimately repeat lines.",
    source: "https://github.com/Gabriel-Dalton/AI-Code-Detector"
  });
}

function applyLineLengthUniformityMetric(text: string, state: ScanState, _options: ScanOptions): void {
  const lengths = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd().length)
    .filter((length) => length >= 20);
  if (lengths.length < 25) {
    return;
  }
  const average = lengths.reduce((total, length) => total + length, 0) / lengths.length;
  const variance = lengths.reduce((total, length) => total + (length - average) ** 2, 0) / lengths.length;
  const coefficient = Math.sqrt(variance) / average;
  if (coefficient > 0.28) {
    return;
  }
  addEvidence(state, {
    patternId: "uniform_line_lengths",
    title: "Unusually uniform line lengths",
    category: "layout_style",
    weight: 5,
    line: 1,
    excerpt: `mean line length ${average.toFixed(1)}, coefficient ${coefficient.toFixed(2)}`,
    reason: "Stylometry-oriented detectors use layout uniformity as a low-cost generated-code feature.",
    falsePositiveRisk: "Formatters and hand-wrapped prose/code can be uniform; this is low-weight evidence.",
    source: "https://github.com/BennettSchwartz/Codect"
  });
}

function applyNullGuardMetric(text: string, state: ScanState, options: ScanOptions): void {
  NULL_GUARD_RE.lastIndex = 0;
  const matches = [...text.matchAll(NULL_GUARD_RE)];
  if (matches.length < 5) {
    return;
  }
  addMetricHits(
    state,
    matches.map((match): [number, string] => [lineForOffset(text, match.index ?? 0), match[0].trim()]),
    Math.min(16, 4 + matches.length * 1.5),
    options,
    {
      patternId: "null_guard_cluster",
      title: "Dense defensive null/type guard cluster",
      category: "error_handling",
      reason: "Educational detectors and empirical studies note generated code often front-loads exhaustive guards around simple logic.",
      falsePositiveRisk: "API boundaries and validation libraries should be defensive; cluster with other signals before judging.",
      source: "https://github.com/Gabriel-Dalton/AI-Code-Detector"
    }
  );
}

function applyManySmallHelpersMetric(path: string, text: string, state: ScanState, options: ScanOptions): void {
  const suffix = extname(path).toLowerCase();
  const lines = text.split(/\r?\n/);
  let functionLines: number[] = [];
  if (suffix in PYTHON) {
    PY_FUNCTION_RE.lastIndex = 0;
    functionLines = [...text.matchAll(PY_FUNCTION_RE)].map((match) => lineForOffset(text, match.index ?? 0));
  } else if (suffix in TS_JS) {
    JS_FUNCTION_RE.lastIndex = 0;
    functionLines = [...text.matchAll(JS_FUNCTION_RE)].map((match) => lineForOffset(text, match.index ?? 0));
  } else {
    return;
  }
  if (functionLines.length < 4) {
    return;
  }
  const averageLines = Math.max(1, lines.filter((line) => line.trim() && !isCommentLine(line)).length / functionLines.length);
  if (averageLines > 16) {
    return;
  }
  addMetricHits(
    state,
    functionLines.map((line): [number, string] => [line, `function near line ${line}`]),
    8,
    options,
    {
      patternId: "many_small_helpers",
      title: "Many small helper functions in one file",
      category: "structure",
      reason: "ChatGPT-vs-human code studies found generated code tends to over-decompose into concise modular helper functions.",
      falsePositiveRisk: "Functional style and utility modules are expected to look like this.",
      source: "https://arxiv.org/pdf/2311.02640"
    }
  );
}

function applyLowCouplingMetric(path: string, text: string, state: ScanState, context: ProjectContext, _options: ScanOptions): void {
  if (isTestPath(path)) {
    return;
  }
  const suffix = extname(path).toLowerCase();
  const functions = suffix in PYTHON ? [...text.matchAll(PY_FUNCTION_RE)].length : suffix in TS_JS ? [...text.matchAll(JS_FUNCTION_RE)].length : 0;
  if (functions < 4) {
    return;
  }
  const imports = suffix in PYTHON ? pythonImportSpecs(text) : suffix in TS_JS ? jsImportSpecs(text) : [];
  const hasRelativeImport = imports.some((spec) => spec.startsWith("."));
  const internalImports = imports.filter((spec) => context.localModules.has(normalizeImportPackage(spec))).length;
  if (imports.length > 2 || hasRelativeImport || internalImports > 0) {
    return;
  }
  addEvidence(state, {
    patternId: "low_coupling_helper_island",
    title: "Self-contained helper island",
    category: "structure",
    weight: 6,
    line: 1,
    excerpt: "file has multiple helpers and little/no project coupling",
    reason: "Generated snippets are often standalone, low-dependency islands rather than code woven into the surrounding project.",
    falsePositiveRisk: "Utility modules and kata solutions often have intentionally low coupling.",
    source: "https://arxiv.org/pdf/2306.14397"
  });
}

function applyPythonVerboseDocstringMetric(text: string, state: ScanState, options: ScanOptions): void {
  const functionMatches = [...text.matchAll(PY_FUNCTION_RE)];
  const hits: [number, string][] = [];
  for (const match of functionMatches) {
    const start = match.index ?? 0;
    const line = lineForOffset(text, start);
    const after = text.slice(start, start + 1200);
    const docMatch = after.match(/:\s*\n\s*(?:\"\"\"|''')([\s\S]{0,900}?)(?:\"\"\"|''')/);
    if (!docMatch?.[1]) {
      continue;
    }
    const doc = docMatch[1];
    const labels = ["Args:", "Arguments:", "Returns:", "Raises:", "Yields:"].filter((label) => doc.includes(label)).length;
    const firstLine = doc.trim().split(/\r?\n/, 1)[0] ?? "docstring";
    if (labels >= 2 || /^(?:This|The)\s+(?:function|method)\b/i.test(firstLine)) {
      hits.push([line, firstLine.slice(0, 120)]);
    }
  }
  if (hits.length === 0) {
    return;
  }
  addMetricHits(state, hits, Math.min(18, 9 * hits.length), options, {
    patternId: "small_function_verbose_docstring",
    title: "Verbose docstring on a small/simple function",
    category: "comment_style",
    reason: "AI code often emits fully formed docstrings for tiny helpers where the project would normally keep code terse.",
    falsePositiveRisk: "Public libraries with strict docstring policy can legitimately trigger this.",
    source: "https://aquilax.ai/blog/detect-ai-written-code"
  });
}

function applyPythonValidationMetric(text: string, state: ScanState, options: ScanOptions): void {
  const lines = text.split(/\r?\n/);
  const hits: [number, string][] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || !/^\s*def\s+\w+\s*\(/.test(line)) {
      continue;
    }
    const window = lines.slice(index + 1, index + 13).join("\n");
    const guardCount = (window.match(NULL_GUARD_RE) ?? []).length + (window.match(/raise\s+ValueError\s*\(/g) ?? []).length;
    if (guardCount >= 3 && /raise\s+ValueError/.test(window)) {
      hits.push([index + 1, line.trim()]);
    }
  }
  if (hits.length === 0) {
    return;
  }
  addMetricHits(state, hits, Math.min(16, 8 * hits.length), options, {
    patternId: "front_loaded_python_validation",
    title: "Front-loaded defensive validation cluster",
    category: "error_handling",
    reason: "Generated helpers often start with exhaustive None/type/range checks and generic ValueError handling.",
    falsePositiveRisk: "API-boundary and safety-critical functions should validate aggressively.",
    source: "https://aquilax.ai/blog/detect-ai-written-code"
  });
}

function applyJSDocCoverageMetric(text: string, state: ScanState, _options: ScanOptions): void {
  JSDOC_RE.lastIndex = 0;
  JS_FUNCTION_RE.lastIndex = 0;
  const jsdocCount = [...text.matchAll(JSDOC_RE)].length;
  const functionCount = [...text.matchAll(JS_FUNCTION_RE)].length;
  if (functionCount < 2 || jsdocCount < Math.max(2, Math.ceil(functionCount * 0.8))) {
    return;
  }
  addEvidence(state, {
    patternId: "high_jsdoc_coverage",
    title: "High JSDoc coverage on simple helpers",
    category: "comment_style",
    weight: Math.min(12, jsdocCount * 4),
    line: 1,
    excerpt: `${jsdocCount} JSDoc blocks for ${functionCount} functions`,
    reason: "Codect/Gabriel-Dalton-style detectors use near-universal generated docs as a weak LLM signal.",
    falsePositiveRisk: "Public SDKs and strict documentation policies can intentionally require this.",
    source: "https://github.com/BennettSchwartz/Codect"
  });
}

function applyMockDensityMetric(text: string, state: ScanState, _options: ScanOptions): void {
  MOCK_RE.lastIndex = 0;
  const matches = [...text.matchAll(MOCK_RE)];
  if (matches.length < 4) {
    return;
  }
  addEvidence(state, {
    patternId: "mock_heavy_test",
    title: "Mock-heavy generated-test smell",
    category: "test_slop",
    weight: Math.min(18, 4 + matches.length * 2),
    line: lineForOffset(text, matches[0]?.index ?? 0),
    excerpt: `mock-like test constructs: ${matches.length}`,
    reason: "Empirical agent-test research found coding agents add mocks more often; over-mocking can hide real behavior.",
    falsePositiveRisk: "External API boundary tests legitimately need mocks; combine with assertion quality.",
    source: "https://arxiv.org/html/2602.00409v1"
  });
}

function applyUnknownImportMetric(path: string, text: string, context: ProjectContext, state: ScanState, options: ScanOptions): void {
  const suffix = extname(path).toLowerCase();
  const specs = suffix in PYTHON ? pythonImportSpecs(text) : suffix in TS_JS ? jsImportSpecs(text) : [];
  if (specs.length === 0) {
    return;
  }
  const unknown = new Set<string>();
  const generic = new Set<string>();
  for (const spec of specs) {
    const normalized = normalizeImportPackage(spec);
    if (!normalized || normalized.startsWith(".") || normalized.startsWith("/") || normalized.startsWith("http")) {
      continue;
    }
    if (suffix in TS_JS && (normalized.startsWith("node:") || normalized in NODE_BUILTINS || isAliasImport(spec, context.aliases))) {
      continue;
    }
    if (suffix in PYTHON && normalized in PYTHON_STDLIB) {
      continue;
    }
    const dependencyName = normalizeDependencyName(normalized);
    if (context.dependencies.has(dependencyName) || context.dependencies.has(normalized) || context.localModules.has(normalized) || context.localModules.has(dependencyName)) {
      continue;
    }
    unknown.add(normalized);
    if (/(?:^|[-_])(?:utils?|helpers?|core|common|tools?|lib|sdk|client|connector|wrapper|service)(?:$|[-_])/i.test(normalized)) {
      generic.add(normalized);
    }
  }
  if (unknown.size === 0) {
    return;
  }
  const examples = [...unknown].slice(0, options.maxEvidencePerPattern);
  addEvidence(state, {
    patternId: "unknown_dependency_reference",
    title: "Import not found in manifests/local modules",
    category: "hallucination_risk",
    weight: Math.min(18, 6 * examples.length),
    line: 1,
    excerpt: examples.join(", "),
    reason: "Package-hallucination papers define missing imported packages as a concrete supply-chain review target.",
    falsePositiveRisk: "Optional dependencies, monorepo aliases, workspaces, and private packages can false-positive.",
    source: "https://arxiv.org/html/2501.19012v1"
  });
  if (generic.size > 0) {
    addEvidence(state, {
      patternId: "plausible_generic_package_name",
      title: "Plausible generic missing package name",
      category: "hallucination_risk",
      weight: Math.min(10, 5 * generic.size),
      line: 1,
      excerpt: [...generic].slice(0, options.maxEvidencePerPattern).join(", "),
      reason: "Hallucinated/slopsquatted packages often sound plausible with utils/helper/sdk/client/service naming.",
      falsePositiveRisk: "Many real packages use generic suffixes; this is only a secondary missing-dependency risk signal.",
      source: "https://arxiv.org/html/2406.10279v3"
    });
  }
}

function addMetricHits(
  state: ScanState,
  hits: [number, string][],
  score: number,
  options: ScanOptions,
  metadata: Omit<Evidence, "weight" | "line" | "excerpt">
): void {
  const visible = hits.slice(0, options.maxEvidencePerPattern);
  if (visible.length === 0) {
    return;
  }
  const perHit = score / visible.length;
  for (const [line, excerpt] of visible) {
    addEvidence(state, {
      ...metadata,
      weight: perHit,
      line,
      excerpt: excerpt.slice(0, 220)
    });
  }
}

function addEvidence(state: ScanState, evidence: Evidence): void {
  const rounded: Evidence = { ...evidence, weight: round(evidence.weight) };
  state.evidence.push(rounded);
  state.categoryScores[rounded.category] = (state.categoryScores[rounded.category] ?? 0) + rounded.weight;
}

function pythonImportSpecs(text: string): string[] {
  PY_IMPORT_RE.lastIndex = 0;
  return [...text.matchAll(PY_IMPORT_RE)].flatMap((match) => [match[1], match[2]].filter(isString));
}

function jsImportSpecs(text: string): string[] {
  JS_IMPORT_RE.lastIndex = 0;
  return [...text.matchAll(JS_IMPORT_RE)].flatMap((match) => [match[1], match[2], match[3], match[4]].filter(isString));
}

function normalizeImportPackage(spec: string): string {
  const trimmed = spec.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("@")) {
    const parts = trimmed.split("/");
    return parts.length >= 2 && parts[0] && parts[1] ? `${parts[0]}/${parts[1]}` : trimmed;
  }
  return trimmed.split(/[/.]/, 1)[0] ?? "";
}

function buildProjectContext(root: string): ProjectContext {
  const dependencies = new Set<string>();
  const aliases: string[] = [];
  for (const dependency of readNodeDependencies(join(root, "package.json"))) {
    dependencies.add(dependency);
  }
  for (const dependency of readPythonDependencies(join(root, "pyproject.toml"))) {
    dependencies.add(dependency);
  }
  for (const dependency of readRequirements(join(root, "requirements.txt"))) {
    dependencies.add(dependency);
  }
  aliases.push(...readTsconfigAliases(join(root, "tsconfig.json")));
  const localModules = discoverLocalModules(root);
  return { root, dependencies, localModules, aliases };
}

function readNodeDependencies(path: string): string[] {
  const data = readJsonObject(path);
  if (!data) {
    return [];
  }
  const keys = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
  const deps: string[] = [];
  for (const key of keys) {
    const value = data[key];
    if (isRecord(value)) {
      deps.push(...Object.keys(value));
    }
  }
  return deps.map(normalizeDependencyName);
}

function readTsconfigAliases(path: string): string[] {
  const data = readJsonObject(path);
  const compilerOptions = isRecord(data?.compilerOptions) ? data.compilerOptions : undefined;
  const paths = isRecord(compilerOptions?.paths) ? compilerOptions.paths : undefined;
  if (!paths) {
    return [];
  }
  return Object.keys(paths).map((key) => key.replace(/\/\*$/, ""));
}

function readPythonDependencies(path: string): string[] {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const deps: string[] = [];
  for (const match of text.matchAll(/^\s*["']([A-Za-z0-9_.-]+)(?:[<>=!~;\[\s][^"']*)?["']\s*,?\s*$/gm)) {
    if (match[1]) {
      deps.push(normalizeDependencyName(match[1]));
    }
  }
  return deps;
}

function readRequirements(path: string): string[] {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("-"))
    .map((line) => normalizeDependencyName(line.split(/[<>=!~;\[\s]/, 1)[0] ?? ""))
    .filter((line) => line.length > 0);
}

function readJsonObject(path: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function discoverLocalModules(root: string): Set<string> {
  const modules = new Set<string>();
  for (const base of [root, join(root, "src")]) {
    let entries;
    try {
      entries = readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name in IGNORED_DIRECTORIES) {
        continue;
      }
      const entryPath = join(base, entry.name);
      if (entry.isDirectory()) {
        modules.add(entry.name);
        continue;
      }
      const suffix = extname(entry.name).toLowerCase();
      if (suffix in CODE_EXTENSIONS) {
        modules.add(basename(entry.name, suffix));
      }
    }
  }
  return modules;
}

function normalizeDependencyName(name: string): string {
  const lowered = name.trim().toLowerCase();
  return lowered.startsWith("@") ? lowered : lowered.replaceAll("-", "_");
}

function isAliasImport(spec: string, aliases: readonly string[]): boolean {
  return aliases.some((alias) => spec === alias || spec.startsWith(`${alias}/`));
}

function isTestPath(path: string): boolean {
  const normalized = path.toLowerCase().split(sep);
  const name = basename(path).toLowerCase();
  return normalized.includes("test") || normalized.includes("tests") || name.startsWith("test_") || /\.(?:test|spec)\.[jt]sx?$/.test(name);
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("#") || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*");
}

function lineForOffset(text: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset && index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
    }
  }
  return line;
}

function excerptForOffset(text: string, offset: number): string {
  const start = text.lastIndexOf("\n", offset) + 1;
  const nextNewline = text.indexOf("\n", offset);
  const end = nextNewline >= 0 ? nextNewline : text.length;
  return text.slice(start, end).trim().slice(0, 220);
}

function safeRelative(path: string, root: string): string {
  const rel = relative(root, path);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    return path;
  }
  return rel;
}

function confidenceForScore(score: number): Confidence {
  if (score >= 70) {
    return "high";
  }
  if (score >= 40) {
    return "medium";
  }
  if (score >= 20) {
    return "low";
  }
  return "clean";
}

function repositoryScore(files: readonly FileReport[]): number {
  if (files.length === 0) {
    return 0;
  }
  const topScores = files.slice(0, 10).map((file) => file.score);
  const topAverage = topScores.reduce((total, score) => total + score, 0) / topScores.length;
  const strongest = files[0]?.score ?? 0;
  const coverage = Math.min(25, files.filter((file) => file.score >= 20).length * 3);
  return Math.min(100, strongest * 0.55 + topAverage * 0.3 + coverage);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundRecord(record: Record<string, number>): Record<string, number> {
  const rounded: Record<string, number> = {};
  for (const [key, value] of Object.entries(record)) {
    rounded[key] = round(value);
  }
  return rounded;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
