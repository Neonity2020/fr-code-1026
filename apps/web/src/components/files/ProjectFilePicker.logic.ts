/**
 * 文件选择器纯逻辑,对齐 t3code ProjectFilePicker.logic:
 * - 查询归一(去空白、去前导 @ . /)
 * - 有序子序列匹配,返回高亮索引
 * - t3code 排序在服务端完成;本实现服务端只返回全量索引,排序在客户端做:
 *   文件名全等 > 前缀 > 文件名子序列 > 路径子序列,短路径优先。
 */
export const PROJECT_FILE_PICKER_RESULT_LIMIT = 200;

export interface ProjectFilePickerMatch {
  readonly name: string;
  readonly nameMatchIndices: ReadonlyArray<number>;
  readonly path: string;
  readonly pathMatchIndices: ReadonlyArray<number>;
}

export function normalizeFilePickerQuery(rawQuery: string): string {
  return rawQuery.replaceAll(/\s/g, "").replace(/^[@./]+/, "").toLowerCase();
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * First ordered subsequence of `query` inside `value`, as highlight indices.
 * Returns null when `value` does not contain the subsequence at all.
 */
function findMatchIndices(value: string, query: string): number[] | null {
  if (!query) return [];

  const normalizedValue = value.toLowerCase();
  const indices: number[] = [];
  let queryIndex = 0;

  for (let valueIndex = 0; valueIndex < normalizedValue.length; valueIndex += 1) {
    if (normalizedValue[valueIndex] !== query[queryIndex]) continue;
    indices.push(valueIndex);
    queryIndex += 1;
    if (queryIndex === query.length) return indices;
  }

  return null;
}

function rankFileMatch(path: string, name: string, query: string): number | null {
  const normalizedName = name.toLowerCase();
  if (normalizedName === query) return 400;
  if (normalizedName.startsWith(query)) return 300;
  if (findMatchIndices(name, query) !== null) return 200;
  if (findMatchIndices(path, query) !== null) return 100;
  return null;
}

export function filterProjectFiles(
  files: ReadonlyArray<string>,
  rawQuery: string,
  limit = PROJECT_FILE_PICKER_RESULT_LIMIT,
): ProjectFilePickerMatch[] {
  if (limit <= 0) return [];
  const query = normalizeFilePickerQuery(rawQuery);

  if (query.length === 0) {
    return files.slice(0, limit).map((filePath) => ({
      name: fileName(filePath),
      nameMatchIndices: [],
      path: filePath,
      pathMatchIndices: [],
    }));
  }

  const ranked: Array<{ match: ProjectFilePickerMatch; score: number }> = [];
  for (const filePath of files) {
    if (ranked.length >= 2000) break;
    const name = fileName(filePath);
    const score = rankFileMatch(filePath, name, query);
    if (score === null) continue;
    ranked.push({
      match: {
        name,
        nameMatchIndices: findMatchIndices(name, query) ?? [],
        path: filePath,
        pathMatchIndices: findMatchIndices(filePath, query) ?? [],
      },
      score: score - Math.min(filePath.length, 1000) / 1000,
    });
  }

  ranked.sort((left, right) => right.score - left.score || (left.match.path < right.match.path ? -1 : 1));
  return ranked.slice(0, limit).map((entry) => entry.match);
}
