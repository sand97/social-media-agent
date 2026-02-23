export function parseKeywordsQuery(
  keywords: string | string[] | undefined,
): string[] {
  if (!keywords) {
    return [];
  }

  const chunks = Array.isArray(keywords) ? keywords : [keywords];

  return Array.from(
    new Set(
      chunks
        .flatMap((chunk) => chunk.split(','))
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    ),
  );
}

export function parsePositiveIntQuery(
  rawValue: string | undefined,
  fallback: number,
): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}
