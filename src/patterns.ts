import type { PatternSpec } from "./types.js";

export const TS_JS: Record<string, true> = {
  ".ts": true,
  ".tsx": true,
  ".js": true,
  ".jsx": true,
  ".mjs": true,
  ".cjs": true,
  ".mts": true,
  ".cts": true
};
export const PYTHON: Record<string, true> = {
  ".py": true,
  ".pyi": true
};
export const TEST_EXTENSIONS: Record<string, true> = {
  ".py": true,
  ".js": true,
  ".jsx": true,
  ".ts": true,
  ".tsx": true
};

export const REGEX_PATTERNS: readonly PatternSpec[] = [
  {
    id: "ts_exact_is_record_guard",
    title: "Exact was-gpt-here TypeScript isRecord guard",
    category: "fingerprint",
    weight: 24,
    maxScore: 24,
    regex: /function\s+isRecord\s*\(\s*value\s*:\s*unknown\s*\)\s*:\s*value\s+is\s+Record\s*<\s*string\s*,\s*unknown\s*>\s*\{\s*return\s+typeof\s+value\s*={3}\s*['"]object['"]\s*&&\s*value\s*!==\s*null\s*;?\s*\}/gm,
    extensions: TS_JS,
    reason: "The referenced was-gpt-here project treats this normalized helper as a common GPT-style TypeScript artifact.",
    falsePositiveRisk: "A human can write or copy the same guard; strong only when it clusters with other signals.",
    source: "https://github.com/ericzakariasson/was-gpt-here"
  },
  {
    id: "ts_record_guard_family",
    title: "Generic unknown-to-Record type guard family",
    category: "defensive_typescript",
    weight: 9,
    maxScore: 18,
    regex: /\bfunction\s+(?:isRecord|isObject|isPlainObject)\s*\([^)]*:\s*unknown\s*\)\s*:\s*[^\{;\n]*\bis\s+Record\s*<\s*string\s*,\s*unknown\s*>/gm,
    extensions: TS_JS,
    reason: "Generalizes the exact GPT-style helper into the broader safe-object guard idiom often emitted around unknown JSON/API data.",
    falsePositiveRisk: "Common in validation-heavy TypeScript; low score unless repeated or paired with other evidence.",
    source: "https://github.com/ericzakariasson/was-gpt-here"
  },
  {
    id: "self_admitted_ai_comment",
    title: "Self-admitted AI-generation comment",
    category: "provenance",
    weight: 42,
    maxScore: 84,
    regex: /\b(?:generated|written|created|implemented|authored|coded)\s+(?:by|through|using|via|with)\s+(?:ChatGPT|OpenAI|Copilot|GPT[- ]?(?:3(?:\.5)?|4(?:o)?|5(?:\.5)?)|Claude(?:\s+Opus\s+4\.8)?|Anthropic|Gemini|Cursor|Windsurf)\b/gim,
    reason: "Self-admitted generated-code studies use this verb/preposition/model-family shape to collect GPT-written GitHub code.",
    falsePositiveRisk: "Can match docs or code that discusses AI; line context is reported so reviewers can reject those cases.",
    source: "https://arxiv.org/pdf/2406.19544"
  },
  {
    id: "ai_provenance_block",
    title: "AI provenance/model/prompt block in comments",
    category: "provenance",
    weight: 22,
    maxScore: 44,
    regex: /^\s*(?:(?:\/\/|#|\/\*|\*)\s*)?.*\b(?:prompt|model\s*:|generated on|human modifications|testing required|AI[- ]generated|LLM[- ]generated|Claude\s+Opus\s+4\.8|GPT[- ]?5\.5|Co-authored-by:\s*(?:Claude|ChatGPT|Cursor|Copilot))\b/gim,
    reason: "Self-admitted generated-code comments often preserve model, prompt, timestamp, human-edit, or testing metadata.",
    falsePositiveRisk: "AI product code and docs may mention these words; scan output keeps it as evidence, not proof.",
    source: "https://arxiv.org/pdf/2406.19544"
  },
  {
    id: "template_customization_comment",
    title: "Template/customization instruction left in source",
    category: "template_artifact",
    weight: 8,
    maxScore: 24,
    regex: /^\s*(?:\/\/|#|\*)\s*(?:TODO:?\s*)?(?:Replace|Customize|Add|Update|Insert|Configure)\b.*\b(?:your|actual|real|implementation|API key|endpoint|logic|path|URL|token)\b/gim,
    reason: "LLM sample code frequently leaves customization instructions that should not survive in production source.",
    falsePositiveRisk: "Scaffold/example repositories use similar comments intentionally.",
    source: "https://arxiv.org/pdf/2306.14397"
  },
  {
    id: "conversational_preamble",
    title: "Conversational assistant preamble left above code",
    category: "template_artifact",
    weight: 14,
    maxScore: 28,
    regex: /^(?:\s*(?:\/\/|#|\/\*)\s*)?(?:sure|certainly|of course|here(?:'|’)s|below is|the following|let me)\b.{0,120}$/gim,
    reason: "Heuristic detectors flag assistant-answer preambles accidentally pasted into source files.",
    falsePositiveRisk: "Docs, examples, and comment-heavy tutorials can contain conversational wording.",
    source: "https://github.com/Gabriel-Dalton/AI-Code-Detector"
  },
  {
    id: "tutorial_comment_phrasing",
    title: "Tutorial narration in comments",
    category: "comment_style",
    weight: 6,
    maxScore: 18,
    regex: /^\s*(?:\/\/|#|\*)\s*(?:First,?\s+we|Then,?\s+we|Now,?\s+we|Next,?\s+we|Let's)\b/gim,
    reason: "Public heuristic detectors and generated-code surveys call out tutorial phrasing as a recurring LLM artifact.",
    falsePositiveRisk: "Expected in educational material; weak by itself.",
    source: "https://github.com/BenjaminSRussell/Ai_code_detector"
  },
  {
    id: "this_function_prose",
    title: "Obvious 'This function/method/class...' prose",
    category: "comment_style",
    weight: 6,
    maxScore: 18,
    regex: /^\s*(?:\/\/|#|\*|\"\"\"|''')\s*(?:This\s+(?:function|method|class|module)|The\s+(?:function|method|class)\s+)\b/gim,
    reason: "Generated code often narrates the obvious API surface instead of project-specific intent.",
    falsePositiveRisk: "Normal in public APIs with explicit documentation standards.",
    source: "https://aquilax.ai/blog/detect-ai-written-code"
  },
  {
    id: "formal_error_sentence",
    title: "Over-formal generic error sentence",
    category: "error_handling",
    weight: 6,
    maxScore: 18,
    regex: /(?:raise\s+\w*Error\s*\(|throw\s+new\s+\w*Error\s*\(|logger\.(?:error|warning)\s*\(|console\.error\s*\().{0,140}['"](?:The\s+provided|The\s+specified|Invalid\s+[^'"]+provided|[^'"]+must\s+be\s+[^'"]+got\s+\{|[^'"]+is\s+not\s+in\s+a\s+valid\s+format|[^'"]+cannot\s+be\s+empty)/gis,
    reason: "AI code tends to produce polished, complete validation/error prose even in small helpers.",
    falsePositiveRisk: "Good SDKs and user-facing validation libraries also write polished errors.",
    source: "https://aquilax.ai/blog/detect-ai-written-code"
  },
  {
    id: "ts_catch_error_normalization",
    title: "Over-defensive TypeScript catch(error) normalization",
    category: "error_handling",
    weight: 7,
    maxScore: 21,
    regex: /catch\s*\(\s*(?:error|err)\s*\)\s*\{[\s\S]{0,500}\b(?:error|err)\s+instanceof\s+Error\s*\?\s*(?:error|err)\.message\s*:\s*(?:String\(\s*(?:error|err)\s*\)|['"][^'"]+['"])/gm,
    extensions: TS_JS,
    reason: "Generated TypeScript often normalizes unknown thrown values with a full defensive ternary before rethrowing/logging.",
    falsePositiveRisk: "Mature TypeScript projects deliberately do this at boundaries.",
    source: "https://arxiv.org/pdf/2311.02640"
  },
  {
    id: "console_error_fallback_catch",
    title: "catch + console.error + generic fallback",
    category: "error_handling",
    weight: 8,
    maxScore: 24,
    regex: /catch\s*\([^)]*\)\s*\{[\s\S]{0,300}console\.error\s*\([^)]*\)[\s\S]{0,300}\breturn\s+(?:\[\]|\{\}|null|false|true|undefined|['"][^'"]{0,8}['"]|default\w*)\s*;/gm,
    extensions: TS_JS,
    reason: "LLM code frequently wraps whole helpers in try/catch, logs to console, then returns a safe-looking default.",
    falsePositiveRisk: "Demos, CLIs, and UI fallbacks can use the same structure legitimately.",
    source: "https://arxiv.org/pdf/2306.14397"
  },
  {
    id: "python_catch_all_exception",
    title: "Catch-all Python exception with print/log/return",
    category: "error_handling",
    weight: 8,
    maxScore: 24,
    regex: /except\s+Exception\s+as\s+\w+\s*:\s*\n(?:[^\n]*\n){0,4}\s*(?:print|logger\.(?:error|exception)|return)\b/gm,
    extensions: PYTHON,
    reason: "Heuristic detectors call out broad `except Exception` plus generic handling as common AI-code structure.",
    falsePositiveRisk: "Boundary code can intentionally catch broad exceptions; weak without other signals.",
    source: "https://github.com/BenjaminSRussell/Ai_code_detector"
  },
  {
    id: "generic_error_copy",
    title: "Generic error-copy phrase",
    category: "error_handling",
    weight: 5,
    maxScore: 15,
    regex: /\b(?:an error occurred|something went wrong|failed to process|please try again later)\b/gim,
    reason: "Generated catch blocks often use generic, user-facing fallback copy instead of project-specific errors.",
    falsePositiveRisk: "Common UI copy; low-weight supporting evidence only.",
    source: "https://github.com/BenjaminSRussell/Ai_code_detector"
  },
  {
    id: "placeholder_secret_literal",
    title: "Placeholder secret or credential literal",
    category: "security_slop",
    weight: 16,
    maxScore: 48,
    regex: /\b(?:api[_-]?key|secret|token|password|private[_-]?key|jwt[_-]?secret)\s*=\s*['"](?:your[-_ ]?|change[-_ ]?me|replace[-_ ]?me|secret[_-]?key[_-]?here|<[^>]+>|x{3,}|test|demo|password)['"]/gim,
    reason: "LLM snippets often leave placeholder credentials that become production security slop.",
    falsePositiveRisk: "Examples and tests intentionally include dummy secrets; path context matters.",
    source: "https://aquilax.ai/blog/detect-ai-written-code"
  },
  {
    id: "weak_test_assertion",
    title: "Weak or tautological generated-test assertion",
    category: "test_slop",
    weight: 7,
    maxScore: 28,
    regex: /^\s*(?:assert\s+(?:result|response|data|output)\s*(?:is\s+not\s+None|!=\s*None)?|assert\s+True\b|self\.assertTrue\(\s*(?:result|response|data|output)\s*\)|expect\([^)]*\)\.(?:toBeTruthy|toBeDefined|toMatchSnapshot|not\.toThrow)\s*\()/gim,
    extensions: TEST_EXTENSIONS,
    reason: "Generated tests often assert that mocked or happy-path values merely exist, inflating coverage without behavior checks.",
    falsePositiveRisk: "Smoke tests may intentionally be weak; scan scores this only as supporting evidence.",
    source: "https://arxiv.org/html/2602.00409v1"
  },
  {
    id: "old_openai_node_sdk_in_modern_ts",
    title: "Outdated OpenAI Node SDK pattern",
    category: "stale_api",
    weight: 6,
    maxScore: 12,
    regex: /new\s+Configuration\s*\([\s\S]{0,220}\bapiKey\b[\s\S]{0,220}\)[\s\S]{0,220}new\s+OpenAIApi\s*\(/gm,
    extensions: TS_JS,
    reason: "Outdated-but-plausible API usage is a common LLM failure mode when code is generated from stale training examples.",
    falsePositiveRisk: "Old projects may legitimately still use old SDK versions; dependency versions should be checked in review.",
    source: "https://codeslick.dev/learn/ai-code-detection"
  },
  {
    id: "unsafe_dynamic_code_execution",
    title: "Unsafe dynamic code execution shortcut",
    category: "security_slop",
    weight: 12,
    maxScore: 36,
    regex: /\b(?:eval|exec|compile|Function)\s*\(/gm,
    reason: "LLM security research and standard security rules repeatedly flag generated shortcuts using dynamic code execution.",
    falsePositiveRisk: "Tooling/tests may intentionally evaluate code; higher severity when input is non-literal.",
    source: "https://bandit.readthedocs.io/en/latest/blacklists/blacklist_calls.html"
  },
  {
    id: "shell_command_interpolation",
    title: "Shell command interpolation shortcut",
    category: "security_slop",
    weight: 12,
    maxScore: 36,
    regex: /(?:subprocess\.(?:run|call|Popen|check_output|check_call)\([^\n)]*(?:shell\s*=\s*True|f['"]|\.format\(|\+\s*\w+)|child_process\.(?:exec|execSync)\s*\(\s*(?:`[^`]*\$\{|[^'"`\s]))/gms,
    reason: "Generated scripts often take shell=True/exec shortcuts that security tooling treats as command-injection risks.",
    falsePositiveRisk: "Build scripts with fixed commands can be safe; reviewers should check argument sources.",
    source: "https://github.com/eslint-community/eslint-plugin-security/blob/main/docs/avoid-command-injection-node.md"
  },
  {
    id: "tls_verification_disabled",
    title: "TLS certificate verification disabled",
    category: "security_slop",
    weight: 16,
    maxScore: 48,
    regex: /(?:requests\.[a-z]+\([^)]*verify\s*=\s*False|ssl\._create_unverified_context\s*\(|rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]0['"])/gims,
    reason: "AI snippets often include make-it-work TLS bypasses; this is concrete security slop, regardless of authorship.",
    falsePositiveRisk: "Local-dev self-signed fixtures can be legitimate; suppress only when clearly test-scoped.",
    source: "https://www.aikido.dev/blog/python-security-vulnerabilities"
  },
  {
    id: "placeholder_stub_implementation",
    title: "Placeholder or stub implementation shipped in code",
    category: "incomplete_code",
    weight: 10,
    maxScore: 30,
    regex: /\b(?:TODO|FIXME|XXX|HACK|placeholder|stub|not implemented|implement later|for now|temporary|mock implementation)\b[\s\S]{0,180}(?:pass\b|throw\s+new\s+Error\s*\(['"]Not implemented|return\s+(?:null|undefined|\{\}|\[\]|None)|\.\.\.)/gim,
    reason: "AI-generated code often looks complete while leaving plausible placeholder surfaces behind.",
    falsePositiveRisk: "Normal backlog comments in tests/examples can match; stronger in exported or API code.",
    source: "https://github.com/flamehaven01/AI-SLOP-Detector"
  },
  {
    id: "js_any_escape_hatch",
    title: "TypeScript any escape hatch cluster",
    category: "type_safety_slop",
    weight: 4,
    maxScore: 16,
    regex: /\b(?:as\s+any|:\s*any\b|<any>)/g,
    extensions: TS_JS,
    reason: "AI slop detectors treat repeated `any` escape hatches as quality risk, especially when paired with generated-looking defensive wrappers.",
    falsePositiveRisk: "Migration code and untyped third-party boundaries may require `any`; low-weight supporting evidence only.",
    source: "https://github.com/flamehaven01/AI-SLOP-Detector"
  },
  {
    id: "disabled_test_artifact",
    title: "Disabled generated-test artifact",
    category: "test_slop",
    weight: 8,
    maxScore: 24,
    regex: /\b(?:describe|it|test)\.(?:skip|todo|only)\s*\(|\b(?:xit|xtest)\s*\(/g,
    extensions: TEST_EXTENSIONS,
    reason: "Structural slop detectors flag disabled tests because generated suites often leave brittle scenarios skipped instead of fixed.",
    falsePositiveRisk: "Intentional quarantines exist; report as review priority, not proof.",
    source: "https://github.com/flamehaven01/AI-SLOP-Detector"
  }
];
