/** 写系统剪贴板；不可用或被拒绝时返回 false 而不是抛出。 */
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
