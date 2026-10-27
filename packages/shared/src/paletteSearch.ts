/**
 * 命令面板搜索打分（移植自 t3code packages/shared/src/paletteSearch.ts）。
 *
 * 只保留纯函数部分：折叠、词首匹配、连写词、拼写容错、分组排序与高亮区间切分。
 * t3code 里与 contracts 耦合的消息检索索引、线程打开统计（ThreadOpenStats）
 * 在 pi-web 没有服务端索引支撑，故不移植。
 */

const ALPHANUMERIC = /[\p{L}\p{N}]/u;
const LOWERCASE = /\p{Ll}/u;
const UPPERCASE = /\p{Lu}/u;
const DIGIT = /\p{N}/u;
const LETTER = /\p{L}/u;
const COMBINING_MARKS = /\p{M}/gu;
// Emoji 等符号也可以被搜索，所以它们也算词首。
const SYMBOL = /\p{So}/u;
const APOSTROPHE = /['’]/;

interface SearchField {
  /** 大小写与重音折叠后的文本，一个 UTF-16 单元对应源文本一个单元。 */
  readonly text: string;
  /** `text` 中词首位置为 1。 */
  readonly wordStarts: Uint8Array;
}

export interface SearchRange {
  readonly start: number;
  readonly end: number;
}

// 线程标题、分支名、项目名在连续按键时会重复读取，折叠一次即可省掉重复开销。
// 一次按键会读所有字段，所以上限必须能容纳它们，否则缓存每次都会被清空。
const fieldCache = new Map<string, SearchField>();
const FIELD_CACHE_LIMIT = 100_000;

function foldCharacter(character: string): string {
  // 直引号能匹配弯引号：iOS 键盘打出的就是 "’"。
  return character
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace("ς", "σ")
    .replace(/[‘’]/, "'");
}

/**
 * `text` 逐 UTF-16 单元做大小写与重音折叠，这样偏移与词首仍能直接读 `text`，
 * 高亮无需再做映射。折叠后长度变化的字符（"ß"、"ﬁ"）保持原样。
 */
function foldInPlace(text: string): string {
  return text
    .replace(/[\u0080-\uffff]/g, (character) => {
      const folded = foldCharacter(character);
      return folded.length === 1 ? folded : character;
    })
    .toLowerCase();
}

// 中文与日文没有空格，所以每个汉字或假名都算一个词首。
function isCjk(character: string): boolean {
  const code = character.codePointAt(0)!;
  return (
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff)
  );
}

/**
 * `character` 在 `previous` 之后是否开启一个词（`beforePrevious` 在开头时为 ""）：
 * 前一个字符不是字母、驼峰或数字边界，或本身就是中日韩字符。标题与消息共用这一条规则。
 */
function isWordStart(
  beforePrevious: string,
  previous: string,
  character: string,
  next: string,
): boolean {
  // 所有格或缩写不开启新词："Julius’s"。
  const afterApostrophe = APOSTROPHE.test(previous) && ALPHANUMERIC.test(beforePrevious);
  return (
    (ALPHANUMERIC.test(character) || SYMBOL.test(character)) &&
    !afterApostrophe &&
    (previous === "" ||
      !ALPHANUMERIC.test(previous) ||
      (LOWERCASE.test(previous) && UPPERCASE.test(character)) ||
      // 缩写里最后一个大写字母开启下一个词："JSONSchema"。
      (UPPERCASE.test(previous) && UPPERCASE.test(character) && LOWERCASE.test(next)) ||
      DIGIT.test(previous) !== DIGIT.test(character) ||
      isCjk(character))
  );
}

function foldSearchField(source: string): SearchField {
  const wordStarts = new Uint8Array(source.length);
  const characters = Array.from(source);
  let index = 0;
  for (const [position, character] of characters.entries()) {
    const previous = characters[position - 1] ?? "";
    const next = characters[position + 1] ?? "";
    if (isWordStart(characters[position - 2] ?? "", previous, character, next)) {
      wordStarts[index] = 1;
    }
    index += character.length;
  }
  return { text: foldInPlace(source), wordStarts };
}

function prepareSearchField(source: string): SearchField {
  const cached = fieldCache.get(source);
  if (cached) return cached;
  // 先出先出：读取不会重新插入，那比重折叠还贵，而上限远大于一次按键要读的字段数。
  if (fieldCache.size >= FIELD_CACHE_LIMIT) {
    fieldCache.delete(fieldCache.keys().next().value!);
  }
  const field = foldSearchField(source);
  fieldCache.set(source, field);
  return field;
}

// 粘贴查询时可能带引号："fix sidebar"。
const WRAPPING_QUOTES = /^\s*["'`“”‘’]+|["'`“”‘’]+\s*$/g;

/** 折叠后的查询：去空白、折叠大小写与重音；没有可匹配内容时为空串。 */
export function foldSearchQuery(query: string): string {
  return foldInPlace(query.replace(WRAPPING_QUOTES, "").normalize("NFC"))
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .join(" ");
}

function wordEnd(field: SearchField, index: number): number {
  let end = index + 1;
  while (end < field.text.length && !field.wordStarts[end] && ALPHANUMERIC.test(field.text[end]!)) {
    end++;
  }
  return end;
}

// 一次替换、插入、删除或相邻交换；`swapOnly` 时只允许交换。
function withinOneEdit(left: string, right: string, swapOnly: boolean): boolean {
  if (Math.abs(left.length - right.length) > (swapOnly ? 0 : 1)) return false;
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index++;
  const restLeft = left.slice(index);
  const restRight = right.slice(index);
  const swapped =
    restLeft.length > 1 &&
    restLeft[0] === restRight[1] &&
    restLeft[1] === restRight[0] &&
    restLeft.slice(2) === restRight.slice(2);
  if (swapOnly) return swapped;
  return (
    swapped ||
    restLeft === restRight ||
    restLeft.slice(1) === restRight.slice(1) ||
    restLeft.slice(1) === restRight ||
    restLeft === restRight.slice(1)
  );
}

const WHOLE_WORD = 1;
// 整个字段等于查询时的加分，把整词匹配抬到这一档。
const WHOLE_NAME = 1.5;
const MID_WORD = 0.3;
const TYPO = 0.45;
// 连写在一起的整词是精确匹配，所以与容错同级、高于词中命中。
const JOINED_WORDS = 0.6;

interface TokenMatch extends SearchRange {
  readonly score: number;
  /** 连写词的多个独立区间。 */
  readonly letters?: ReadonlyArray<SearchRange>;
}

/**
 * 词中命中需要四个以上字符并带 `midWord`，所以 "del" 不会命中 "model"。
 * 拼写容错保留首字母（交换除外）；短词允许更少编辑以降低噪声。
 * 纯数字不做容错，避免不同的 PR 编号互相命中。
 */
function matchToken(
  field: SearchField,
  token: string,
  typos: boolean,
  isPrimary: boolean,
  midWord: boolean,
): TokenMatch | null {
  if (token.length === 0) return null;
  let best: TokenMatch | null = null;
  const ownBoundary = !ALPHANUMERIC.test(token[0]!) && !SYMBOL.test(token[0]!);
  for (
    let index = field.text.indexOf(token);
    index !== -1;
    index = field.text.indexOf(token, index + 1)
  ) {
    // 以标点开头的 token（".ts"）自带边界，消息里也是如此。
    if (field.wordStarts[index] || ownBoundary) {
      // 匹配结束在词尾时算整词："t3c" 是 "t3code" 的前缀，
      // ".ts" 在 "index.ts" 里是整词，在 "parser.tsx" 里是前缀。
      const end = index + token.length;
      const whole =
        end >= field.text.length ||
        field.wordStarts[end] === 1 ||
        !ALPHANUMERIC.test(field.text[end]!);
      let runEnd = end;
      while (runEnd < field.text.length && ALPHANUMERIC.test(field.text[runEnd]!)) runEnd++;
      const score = whole ? WHOLE_WORD : 0.7 + (0.2 * token.length) / (runEnd - index);
      if (best === null || score > best.score) {
        best = { score, start: index, end: index + token.length };
      }
      if (score === WHOLE_WORD) return best;
    } else if (midWord && token.length >= 4 && best === null) {
      best = { score: MID_WORD, start: index, end: index + token.length };
    }
  }
  // 连写词是精确匹配，不走容错通道：别处的强匹配不能盖掉 "VS Code" 对 "vscode"。
  if ((best === null || best.score <= MID_WORD) && isPrimary) {
    const joined = matchJoinedWords(field, token);
    if (joined) return joined;
  }
  if ((best !== null && best.score > MID_WORD) || !typos || token.length < 3) return best;
  // 数字跳过容错以保持编号可区分；带数字的单词（"t3code"）不跳过。
  if (LETTER.test(token)) {
    for (let index = 0; index < field.text.length; index++) {
      if (!field.wordStarts[index]) continue;
      // 人们很少打错首字母，所以容错保留它，除非交换了更长词的前两个字母（"ing" 不是 "nig…"）。
      const first = field.text[index];
      const firstLetterKept =
        first === token[0] ||
        (token.length > 3 && first === token[1] && field.text[index + 1] === token[0]);
      if (!firstLetterKept) continue;
      // 整个词段，跨越驼峰连接："githbu" 命中 "GitHub"。
      let runEnd = index + 1;
      while (runEnd < field.text.length && ALPHANUMERIC.test(field.text[runEnd]!)) runEnd++;
      const word = field.text.slice(index, runEnd);
      // 短词容忍交换或缺一个字母（"srv" 对 "serv…"）；
      // 三四个字母词的其它编辑太宽泛（"cron" 会命中所有 "con…"）。
      const short = token.length <= 4;
      // 先试等长，"githbu" 才能高亮整个 "GitHub"。
      const lengths = short
        ? [token.length, token.length + 1]
        : [token.length, token.length - 1, token.length + 1];
      for (const length of lengths) {
        if (length > word.length) continue;
        const prefix = word.slice(0, length);
        if (withinOneEdit(token, prefix, short && length === token.length)) {
          return { score: TYPO, start: index, end: index + length };
        }
      }
    }
  }
  return best;
}

/**
 * 标题里短词后接短前缀是噪声（"inth" 命中 "in thread"）。
 * 只允许出现在开头（"t3co"）、三字母之前（"gomod"）或作为整词（"vscode"）。
 */
function matchJoinedWords(field: SearchField, token: string): TokenMatch | null {
  const firstWord = field.wordStarts.indexOf(1);
  for (let start = 0; start < field.text.length; start++) {
    if (!field.wordStarts[start] || field.text[start] !== token[0]) continue;
    const runs: SearchRange[] = [];
    let at = start;
    let rest = token;
    while (rest.length > 0 && at < field.text.length) {
      const end = wordEnd(field, at);
      if (rest.length <= end - at && field.text.startsWith(rest, at)) {
        runs.push({ start: at, end: at + rest.length });
        rest = "";
      } else if (rest.startsWith(field.text.slice(at, end))) {
        runs.push({ start: at, end });
        rest = rest.slice(end - at);
        at = end;
        while (at < field.text.length && !field.wordStarts[at]) at++;
      } else {
        break;
      }
    }
    const last = runs.at(-1);
    if (rest.length > 0 || last === undefined || runs.length < 2) continue;
    if (
      last.end === wordEnd(field, last.start) ||
      last.end - last.start >= 3 ||
      start === firstWord ||
      runs.slice(0, -1).every((run) => run.end - run.start >= 3)
    ) {
      return { score: JOINED_WORDS, start, end: last.end, letters: runs };
    }
  }
  return null;
}

interface WeightedSearchField {
  readonly value: string;
  readonly weight: number;
  /** 只认整词命中（短查询匹配关键词时用）。 */
  readonly wholeWords?: boolean;
  /**
   * 只认词首命中且不容错：隐藏关键词若宽松命中，会列出用户看不懂为何命中的结果。
   */
  readonly keyword?: boolean;
  /**
   * 线程所在位置（项目、环境）：能帮上匹配，但那里的词首不会让匹配变强，
   * 所以它不会关掉标题的连写词与容错。
   */
  readonly context?: boolean;
  /**
   * 四个以上字母的 token 可以命中词内。只给线程标题开：
   * 在命令名或分支名里读起来像噪声（"arch" 命中 "Search"）。
   */
  readonly midWord?: boolean;
}

interface SearchFieldsMatch {
  /** 约 0.3（词中）到 1.5（完全等于标题）。 */
  readonly quality: number;
  /** 每个 token 都在词首命中，且没有走容错。 */
  readonly strong: boolean;
  /** 首个字段里命中的区间，用于高亮。 */
  readonly primaryRanges: ReadonlyArray<SearchRange>;
}

const FILLER_WORDS = new Set(["a", "an", "and", "for", "in", "of", "on", "the", "to", "with"]);

// 排序后合并重叠区间。
function mergeRanges(ranges: ReadonlyArray<SearchRange>): SearchRange[] {
  const merged: SearchRange[] = [];
  for (const range of [...ranges].sort((left, right) => left.start - right.start)) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) {
      merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, range.end) };
    } else {
      merged.push({ start: range.start, end: range.end });
    }
  }
  return merged;
}

/**
 * 查询的每个 token 都必须命中某个字段。质量是各 token 最佳加权命中的平均值，
 * 首个字段整体等于查询或包含查询时再加分。
 */
function matchSearchFields(
  normalizedQuery: string,
  fields: ReadonlyArray<WeightedSearchField>,
  options?: { readonly typos?: boolean },
): SearchFieldsMatch | null {
  if (normalizedQuery.length === 0) return null;
  const prepared = fields
    .filter((field) => field.value.length > 0)
    .map((field) => ({
      field: prepareSearchField(field.value),
      weight: field.weight,
      wholeWords: field.wholeWords ?? false,
      keyword: field.keyword ?? false,
      context: field.context ?? false,
      allowMidWord: field.midWord ?? false,
    }));
  const primary = fields[0]?.value ? prepared[0]?.field : undefined;
  // 空 token 会命中任何位置，并让 `matchToken` 死循环。
  const tokens = normalizedQuery.split(" ").filter((token) => token.length > 0);
  if (tokens.length === 0) return null;
  // 短语式查询（"fix the sidebar"）带虚词，名称可能不含它们：命中即算，但不强制。
  const fillerOptional = tokens.some((token) => !FILLER_WORDS.has(token));
  const primaryRanges: SearchRange[] = [];
  let total = 0;
  let counted = 0;
  let strong = true;
  for (const token of tokens) {
    let best = 0;
    let bestPrimary: TokenMatch | null = null;
    let atWordStart = false;
    for (const { field, weight, wholeWords, keyword, context, allowMidWord } of prepared) {
      if (best >= weight && field !== primary && atWordStart) continue;
      const typos = (options?.typos ?? false) && !keyword;
      // 连写词只在名称里算数。
      const match = matchToken(field, token, typos, field === primary, allowMidWord);
      if (match === null || match.score < (wholeWords ? WHOLE_WORD : keyword ? 0.7 : 0)) continue;
      if (field === primary) bestPrimary = match;
      if (match.score >= 0.7 && !context) atWordStart = true;
      if (match.score * weight > best) best = match.score * weight;
    }
    if (best === 0) {
      if (fillerOptional && FILLER_WORDS.has(token)) continue;
      return null;
    }
    strong &&= atWordStart;
    if (bestPrimary) primaryRanges.push(...(bestPrimary.letters ?? [bestPrimary]));
    total += best;
    counted += 1;
  }
  let quality = total / counted;
  if (primary) {
    if (primary.text === normalizedQuery) quality += WHOLE_NAME - WHOLE_WORD;
    else if (tokens.length > 1 && primary.text.includes(normalizedQuery)) quality += 0.25;
  }
  return {
    quality,
    strong,
    primaryRanges: mergeRanges(primaryRanges),
  };
}

export interface SearchTermsMatch {
  readonly score: number;
  readonly quality: number;
  /** 分组排序用的质量（可能更低）；见 `scoreSearchTerms`。 */
  readonly groupQuality?: number;
  readonly strong: boolean;
  readonly ranges: ReadonlyArray<SearchRange>;
}

const KEYWORD_QUALITY = 0.65;
// 低于这个长度，关键词前缀会命中太多："co" 或 "pro" 会列出大部分设置项。
// 短查询仍能命中与它相等的关键词（"pr"）。
const KEYWORD_QUERY_MIN_LENGTH = 4;

/**
 * 关键词权重更低，隐藏词不能把分组抬到名称命中的结果之上。
 * 短查询要求整词命中，避免常见前缀列出大部分设置项。
 */
export function scoreSearchTerms(
  normalizedQuery: string,
  terms: ReadonlyArray<string>,
  options?: { readonly typos?: boolean },
): SearchTermsMatch | null {
  // 虚词（"the ci"）不该让短查询变长。
  const meaningful = normalizedQuery
    .split(" ")
    .filter((token) => !FILLER_WORDS.has(token))
    .join(" ");
  const short = (meaningful || normalizedQuery).length < KEYWORD_QUERY_MIN_LENGTH;
  const match = matchSearchFields(
    normalizedQuery,
    terms.map((value, index) =>
      index === 0
        ? { value, weight: 1 }
        : // 完整输入的别名（"pr"）是刻意输入的，高于仅名称前缀。
          { value, weight: short ? 0.8 : 0.6, wholeWords: short, keyword: true },
    ),
    options,
  );
  return (
    match && {
      score: match.quality,
      quality: match.quality,
      // 低于词首档：只在隐藏关键词里命中的结果不能压过名称命中的结果。
      // 组内精确别名仍然胜过名称前缀（"pr" 让 "Open pull requests" 排第一）。
      ...(match.primaryRanges.length > 0
        ? {}
        : { groupQuality: Math.min(match.quality, KEYWORD_QUALITY) }),
      strong: match.strong,
      ranges: match.primaryRanges,
    }
  );
}

// 整词与前缀同档，这样 "Compact" 不会压过 "Compaction"。
function matchClass(quality: number): number {
  return quality >= WHOLE_NAME ? 3 : quality >= 0.7 ? 2 : quality >= 0.4 ? 1 : 0;
}

export interface RankedSearchItem<T, M> {
  readonly item: T;
  readonly match: M;
}

/**
 * 按匹配档位给分组排序，让连续输入稳定，线程使用频率也不会压过同等匹配的命令。
 * 只有在没有词首命中时才尝试容错：容错在真实命中旁边只会添乱。
 */
export function rankSearchGroups<
  G,
  T,
  M extends {
    readonly score: number;
    readonly quality: number;
    readonly strong: boolean;
    readonly pickedAt?: number;
    readonly pickedExactly?: boolean;
    readonly groupQuality?: number;
  },
>(
  groups: ReadonlyArray<{ readonly group: G; readonly items: ReadonlyArray<T> }>,
  score: (item: T, options: { readonly typos: boolean }, group: G) => M | null,
): Array<{ readonly group: G; readonly ranked: ReadonlyArray<RankedSearchItem<T, M>> }> {
  const rank = (typos: boolean) =>
    groups.map(({ group, items }) => ({
      group,
      ranked: items.flatMap((item) => {
        const match = score(item, { typos }, group);
        return match === null ? [] : [{ item, match }];
      }),
    }));
  let ranked = rank(false);
  if (!ranked.some((entry) => entry.ranked.some(({ match }) => match.strong))) {
    ranked = rank(true);
  }
  return ranked
    .flatMap(({ group, ranked: items }, order) => {
      if (items.length === 0) return [];
      // 使用频率不能把仅在项目里命中的结果抬到标题命中之上，也不能跨档。
      const wordMatch = (match: M) => Math.min(matchClass(match.quality), 2);
      const exactPickAt = (match: M) => (match.pickedExactly ? (match.pickedAt ?? 0) : 0);
      const sorted = [...items].sort(
        (left, right) =>
          wordMatch(right.match) - wordMatch(left.match) ||
          exactPickAt(right.match) - exactPickAt(left.match) ||
          matchClass(right.match.quality) - matchClass(left.match.quality) ||
          (right.match.pickedAt ?? 0) - (left.match.pickedAt ?? 0) ||
          right.match.score - left.match.score,
      );
      const best = Math.max(
        ...items.map(({ match }) => matchClass(match.groupQuality ?? match.quality)),
      );
      return [{ group, ranked: sorted, best, order }];
    })
    .sort((left, right) => right.best - left.best || left.order - right.order)
    .map(({ group, ranked: items }) => ({ group, ranked: items }));
}

/** 单列表版的 `rankSearchGroups`。 */
export function rankSearchItems<
  T,
  M extends { readonly score: number; readonly quality: number; readonly strong: boolean },
>(
  items: ReadonlyArray<T>,
  score: (item: T, options: { readonly typos: boolean }) => M | null,
): ReadonlyArray<RankedSearchItem<T, M>> {
  return rankSearchGroups([{ group: null, items }], score)[0]?.ranked ?? [];
}

export interface SearchTextPart {
  readonly text: string;
  readonly highlighted: boolean;
  readonly start: number;
}

/** `text` 按有序且不重叠的 `ranges` 切成普通段与高亮段。 */
export function splitSearchText(
  text: string,
  ranges: ReadonlyArray<SearchRange>,
): SearchTextPart[] {
  const parts: SearchTextPart[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      parts.push({ text: text.slice(cursor, range.start), highlighted: false, start: cursor });
    }
    parts.push({ text: text.slice(range.start, range.end), highlighted: true, start: range.start });
    cursor = range.end;
  }
  if (cursor < text.length || parts.length === 0) {
    parts.push({ text: text.slice(cursor), highlighted: false, start: cursor });
  }
  return parts;
}

/** 面板里各类分组最多显示的行数。 */
export const PALETTE_THREAD_LIMIT = 20;
export const PALETTE_SECONDARY_LIMIT = 3;
