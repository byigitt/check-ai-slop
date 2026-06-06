export type Confidence = "clean" | "low" | "medium" | "high";

export interface ScanOptions {
  maxFileBytes: number;
  includeHidden: boolean;
  maxEvidencePerPattern: number;
  includeUnknownImports: boolean;
  includeGitSignals: boolean;
}

export interface Evidence {
  patternId: string;
  title: string;
  category: string;
  weight: number;
  line: number;
  excerpt: string;
  reason: string;
  falsePositiveRisk: string;
  source: string;
}

export interface FileReport {
  path: string;
  score: number;
  confidence: Confidence;
  categoryScores: Record<string, number>;
  metrics: Record<string, number | string | boolean>;
  evidence: Evidence[];
}

export interface ScanReport {
  root: string;
  score: number;
  confidence: Confidence;
  filesScanned: number;
  filesSkipped: number;
  bytesScanned: number;
  evidenceCount: number;
  files: FileReport[];
  errors: string[];
}

export interface PatternSpec {
  id: string;
  title: string;
  category: string;
  weight: number;
  maxScore: number;
  regex: RegExp;
  extensions?: Readonly<Record<string, true>>;
  reason: string;
  falsePositiveRisk: string;
  source: string;
}
