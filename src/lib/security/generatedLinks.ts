const SAFE_GENERATED_HREF_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function isSafeGeneratedHref(href?: string | null): href is string {
  if (!href) return false;

  try {
    const url = new URL(href, "https://zen.local");
    return SAFE_GENERATED_HREF_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}
