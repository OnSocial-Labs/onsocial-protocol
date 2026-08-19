/** Two-letter monogram for unset place banners / marks. */
export function communityMonogram(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) {
    const word = parts[0]!;
    if (word.startsWith('@') && word.length > 1) {
      return word.slice(1, 3).toUpperCase();
    }
    return word.slice(0, 2).toUpperCase();
  }
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}
