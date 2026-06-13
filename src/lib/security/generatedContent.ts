import DOMPurify from "dompurify";
export { isSafeGeneratedHref } from "./generatedLinks";

const GENERATED_CONTENT_CONFIG = {
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  FORBID_ATTR: ["srcdoc"],
  FORBID_TAGS: ["script", "iframe", "object", "embed", "link", "meta"],
};

export function sanitizeGeneratedHtml(content: string): string {
  return DOMPurify.sanitize(content, {
    ...GENERATED_CONTENT_CONFIG,
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
  });
}

export function sanitizeGeneratedSvg(content: string): string {
  const normalized = normalizeGeneratedSvg(content);
  if (!/^\s*<svg\b/i.test(normalized)) return "";
  return DOMPurify.sanitize(normalized, {
    ...GENERATED_CONTENT_CONFIG,
    USE_PROFILES: { svg: true, svgFilters: true },
  });
}

function normalizeGeneratedSvg(content: string): string {
  let normalized = content.trim().replace(/^```(?:svg|xml)?\s*/i, "").replace(/```\s*$/, "").trim();

  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    try {
      const decoded = JSON.parse(normalized);
      if (typeof decoded === "string") normalized = decoded;
    } catch {
      // Continue with conservative entity decoding below.
    }
  }

  if (/&(?:lt|gt|quot|apos|amp);/i.test(normalized)) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = normalized;
    normalized = textarea.value;
  }

  normalized = normalized
    .replace(/\\"/g, '"')
    .replace(/stroke=(['"])black\1/gi, "stroke=$1white$1")
    .replace(/stroke=(['"])#000(?:000)?\1/gi, "stroke=$1white$1");

  return normalized.trim();
}

export function sanitizeMermaidSvg(content: string): string {
  return sanitizeGeneratedSvg(content);
}
