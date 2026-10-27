export interface MentionFileItem {
  path: string;
  name: string;
  dir: string;
}

export function filterMentionFiles(
  files: readonly string[],
  query: string,
): MentionFileItem[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) {
    return files.slice(0, 10).map((path) => {
      const lastSlash = path.lastIndexOf("/");
      return {
        path,
        name: lastSlash === -1 ? path : path.slice(lastSlash + 1),
        dir: lastSlash === -1 ? "" : path.slice(0, lastSlash),
      };
    });
  }

  const matches: Array<{ item: MentionFileItem; score: number }> = [];
  for (const path of files) {
    const lowerPath = path.toLowerCase();
    const lastSlash = path.lastIndexOf("/");
    const name = lastSlash === -1 ? path : path.slice(lastSlash + 1);
    const dir = lastSlash === -1 ? "" : path.slice(0, lastSlash);
    const lowerName = name.toLowerCase();

    if (lowerName === q) {
      matches.push({ item: { path, name, dir }, score: 100 });
    } else if (lowerName.startsWith(q)) {
      matches.push({ item: { path, name, dir }, score: 80 });
    } else if (lowerName.includes(q)) {
      matches.push({ item: { path, name, dir }, score: 50 });
    } else if (lowerPath.includes(q)) {
      matches.push({ item: { path, name, dir }, score: 20 });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 10).map((m) => m.item);
}
