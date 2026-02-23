export function stripWaSuffix(waId?: string): string | undefined {
  if (!waId) {
    return undefined;
  }

  return waId.replace(/@c\.us|@g\.us|@s\.whatsapp\.net$/i, '');
}

export function stripAndSanitizeWaId(waId?: string): string | undefined {
  const stripped = stripWaSuffix(waId);
  if (!stripped) {
    return undefined;
  }

  return stripped.replace(/@/g, '-');
}
