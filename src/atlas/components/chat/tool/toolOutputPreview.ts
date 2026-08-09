import type { ArtifactData, FileChange } from "../types";
import { redactToolText } from "./toolTextRedaction";

export type ToolPreviewResultItem = {
  title: string;
  summary?: string;
  url?: string;
};

export type ToolCheckpointPreview = {
  available: boolean;
  toolCallId: string;
  fileCount: number;
};

export type ToolOutputPreview = {
  summary: string;
  /** Short, user-facing failure text extracted from the structured result. */
  errorMessage?: string;
  checkpoint?: ToolCheckpointPreview;
  stdout?: string;
  stderr?: string;
  exitCode?: string;
  results: ToolPreviewResultItem[];
  files: FileChange[];
  artifact?: ArtifactData;
  imageUri?: string;
  content?: string;
  raw: string;
};

function compactText(value: unknown, maxLength = 220): string {
  if (value === undefined || value === null || value === "") return "";
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function compactErrorText(value: unknown, maxLength = 360): string {
  const text = compactText(value, maxLength);
  if (!text) return "";
  return redactToolText(text).trim();
}

// Keep terminal payloads lossless enough for the expanded command view. The
// compact form above is intentionally used for one-line summaries, but using
// it for stdout/stderr destroys line breaks and makes shell output look like a
// clipped paragraph instead of a terminal transcript.
function preserveText(value: unknown, maxLength = 12_000): string {
  if (value === undefined || value === null || value === "") return "";
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.slice(0, maxLength).trim();
}

function parseMaybeJson(output: string): unknown {
  if (!output) return "";
  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function firstValue(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function unwrapOutputSource(record: Record<string, unknown>): Record<string, unknown> {
  const output = record.output;
  if (isNonEmptyRecord(output)) return output;

  const result = record.result;
  if (isNonEmptyRecord(result)) return result;

  const data = record.data;
  if (isNonEmptyRecord(data)) return data;

  const rawResult = record.rawResult || record.raw_result;
  if (isNonEmptyRecord(rawResult)) return rawResult;

  return record;
}

function outputCandidates(record: Record<string, unknown>, parsed: unknown): Record<string, unknown>[] {
  const candidates = [record, unwrapOutputSource(record)];
  if (isNonEmptyRecord(parsed) && parsed !== record) {
    candidates.push(parsed);
  }

  return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
}

function findFromCandidates(candidates: Record<string, unknown>[], keys: string[]): unknown {
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = candidate[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }
  return undefined;
}

function normalizeResults(value: unknown): ToolPreviewResultItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).map((item, index) => {
    const record = asRecord(item);
    return {
      title: compactText(record.title || record.name || record.url || `Result ${index + 1}`, 120),
      summary: compactText(record.summary || record.snippet || record.description || record.content, 180),
      url: compactText(record.url || record.link, 180),
    };
  });
}

function normalizeFileRecord(value: unknown): FileChange | undefined {
  const record = asRecord(value);
  const rawPath = firstValue(record.path, record.file, record.name, record.file_path, record.filePath);
  const path = compactText(rawPath, 180);
  if (!path) return undefined;

  const linesAdded = firstValue(record.linesAdded, record.lines_added, record.additions, record.added);
  const linesRemoved = firstValue(record.linesRemoved, record.lines_removed, record.deletions, record.removed);
  const rawChangeType = firstValue(record.changeType, record.change_type, record.action, record.operation);
  const changeType = rawChangeType === "created" || rawChangeType === "create"
    ? "created"
    : rawChangeType === "deleted" || rawChangeType === "delete"
      ? "deleted"
      : "modified";

  return {
    path,
    changeType,
    linesAdded: typeof linesAdded === "number" ? linesAdded : undefined,
    linesRemoved: typeof linesRemoved === "number" ? linesRemoved : undefined,
    diff: typeof record.diff === "string" ? record.diff : undefined,
  };
}

function normalizeFiles(value: unknown): FileChange[] {
  if (Array.isArray(value)) {
    return value.slice(0, 5).map(normalizeFileRecord).filter((file): file is FileChange => Boolean(file));
  }
  const singleFile = normalizeFileRecord(value);
  return singleFile ? [singleFile] : [];
}

function fileChangeSummary(file: FileChange): string {
  const filename = file.path.replace(/\\/g, "/").split("/").pop() || file.path;
  const verb = file.changeType === "created" ? "Created" : file.changeType === "deleted" ? "Deleted" : "Updated";
  return `${verb} ${filename}`;
}

function normalizeCheckpoint(value: unknown): ToolCheckpointPreview | undefined {
  const record = asRecord(value);
  if (record.available !== true || typeof record.tool_call_id !== "string") return undefined;
  return {
    available: true,
    toolCallId: record.tool_call_id,
    fileCount: typeof record.file_count === "number" ? record.file_count : 0,
  };
}

function normalizeArtifact(value: unknown): ArtifactData | undefined {
  const record = asRecord(value);
  const type = record.type;
  const content = record.content;
  if (
    type !== "code" &&
    type !== "markdown" &&
    type !== "svg" &&
    type !== "html" &&
    type !== "openui" &&
    type !== "diagram"
  ) {
    return undefined;
  }
  if (typeof content !== "string" || !content.trim()) return undefined;

  return {
    id: typeof record.id === "string" ? record.id : undefined,
    type,
    title: compactText(record.title || record.name || "Generated artifact", 120) || "Generated artifact",
    language: typeof record.language === "string" ? record.language : undefined,
    content,
    version: typeof record.version === "number" ? record.version : undefined,
    chatId: typeof record.chatId === "string" ? record.chatId : typeof record.chat_id === "string" ? record.chat_id : undefined,
    messageId: typeof record.messageId === "string" ? record.messageId : typeof record.message_id === "string" ? record.message_id : undefined,
  };
}

function inferCommandSummary(stdout: string, stderr: string, exitCode: unknown): string {
  const output = `${stdout}\n${stderr}`.toLowerCase();
  const exitCodeText = exitCode === undefined ? "" : String(exitCode);
  const failedExit = exitCodeText !== "" && exitCodeText !== "0";
  const hasFailureText = /\b(failed|failure|error|errored|panic|exception)\b/.test(output);
  const hasTestText = /\b(test|tests|spec|specs|passed|failing|failed)\b/.test(output);
  const hasBuildText = /\b(build|built|bundle|compiled|compiling|vite|webpack|tsc|cargo)\b/.test(output);
  const passedMatch =
    output.match(/tests?:\s*(\d+)\s+passed/) ||
    output.match(/(\d+)\s+(?:tests?|specs?)\s+passed/) ||
    output.match(/(\d+)\s+passed/) ||
    output.match(/passed\s+(\d+)/);
  const failedMatch =
    output.match(/tests?:\s*(\d+)\s+failed/) ||
    output.match(/(\d+)\s+(?:tests?|specs?)\s+failed/) ||
    output.match(/(\d+)\s+failed/) ||
    output.match(/failed\s+(\d+)/);

  if (failedExit || failedMatch || hasFailureText && !/\b0\s+failed\b/.test(output)) {
    if (hasTestText) return failedMatch?.[1] ? `Tests failed: ${failedMatch[1]} failed` : "Tests failed";
    if (hasBuildText) return "Build failed";
    return failedExit ? `Command failed: exit ${exitCodeText}` : "Command failed";
  }

  if (hasTestText && (passedMatch || /\bpass(?:ed)?\b/.test(output))) {
    return passedMatch?.[1] ? `Tests passed: ${passedMatch[1]} passed` : "Tests passed";
  }

  if (hasBuildText && /\b(success|successful|completed|built|compiled|finished|done)\b/.test(output)) {
    return "Build passed";
  }

  if (exitCodeText === "0" && (stdout || stderr)) {
    return "Command passed";
  }

  return "";
}

export function buildToolOutputPreview(output: string): ToolOutputPreview {
  const parsed = parseMaybeJson(output);
  const record = asRecord(parsed);
  const candidates = outputCandidates(record, parsed);
  const resultSource = findFromCandidates(candidates, ["results", "items", "data"]);
  const results = normalizeResults(resultSource);
  const fileSource = findFromCandidates(candidates, ["files", "changed_files", "changedFiles"]);
  const files = normalizeFiles(fileSource).length > 0
    ? normalizeFiles(fileSource)
    : normalizeFiles(findFromCandidates(candidates, ["file", "changed_file", "changedFile"]) || unwrapOutputSource(record));
  const checkpointSource = findFromCandidates(candidates, ["checkpoint"]);
  const checkpoint = normalizeCheckpoint(checkpointSource);
  const artifactSource = findFromCandidates(candidates, ["artifact", "generated_artifact", "generatedArtifact"]);
  const artifact = normalizeArtifact(artifactSource || unwrapOutputSource(record) || record);
  const stdout = preserveText(findFromCandidates(candidates, ["stdout", "output_text", "outputText"]));
  const stderr = preserveText(findFromCandidates(candidates, ["stderr", "error"]));
  const content = preserveText(
    firstValue(
      findFromCandidates(candidates, ["content", "result", "summary", "message", "excerpt"]),
      typeof parsed === "string" ? parsed : undefined,
    ),
    600,
  );
  const exitCode = findFromCandidates(candidates, ["exit_code", "exitCode", "code"]);
  const imageUri = compactText(findFromCandidates(candidates, ["image_uri", "imageUri", "image_url"]), 500);
  const raw = typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
  const commandSummary = inferCommandSummary(stdout, stderr, exitCode);
  const errorMessage = compactErrorText(
    findFromCandidates(candidates, ["error", "stderr", "error_message", "errorMessage", "error_text", "errorText"]),
  );

  let summary = "";
  if (imageUri) {
    summary = "Image generated";
  } else if (results.length > 0) {
    const resultCount = Array.isArray(resultSource) ? resultSource.length : results.length;
    summary = `${resultCount} results: ${results[0].title}`;
  } else if (artifact) {
    summary = `${artifact.type} artifact: ${artifact.title}`;
  } else if (commandSummary) {
    summary = commandSummary;
  } else if (files.length > 0) {
    summary = files.length === 1 ? fileChangeSummary(files[0]) : `${files.length} files changed`;
  } else {
    summary = compactText(
      firstValue(
        findFromCandidates(candidates, ["summary", "result", "error", "stderr", "stdout", "content", "message", "excerpt"]),
        parsed,
      ),
      180,
    );
  }

  return {
    summary,
    errorMessage: errorMessage || undefined,
    checkpoint,
    stdout,
    stderr,
    exitCode: exitCode === undefined ? undefined : String(exitCode),
    results,
    files,
    artifact,
    imageUri: imageUri || undefined,
    content,
    raw,
  };
}
