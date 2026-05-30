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
  return DOMPurify.sanitize(content, {
    ...GENERATED_CONTENT_CONFIG,
    USE_PROFILES: { svg: true, svgFilters: true },
  });
}

export function sanitizeMermaidSvg(content: string): string {
  return sanitizeGeneratedSvg(content);
}
