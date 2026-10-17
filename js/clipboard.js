export class ClipboardError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ClipboardError';
    this.code = code;
  }
}
/** Only resolves after the browser confirms that writing succeeded. */
export async function copyToClipboard(text, { clipboard = globalThis.navigator?.clipboard } = {}) {
  if (typeof text !== 'string' || text.length === 0)
    throw new ClipboardError('EMPTY', 'Generate a password before copying.');
  if (typeof clipboard?.writeText !== 'function')
    throw new ClipboardError(
      'UNSUPPORTED',
      'Clipboard access is unavailable. Select the password and copy it manually.',
    );
  try {
    await clipboard.writeText(text);
  } catch {
    throw new ClipboardError(
      'DENIED',
      'Clipboard access was denied. Select the password and copy it manually.',
    );
  }
  return true;
}
