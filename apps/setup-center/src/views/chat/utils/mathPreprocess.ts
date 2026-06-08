// LaTeX / math preprocessing for the markdown pipeline.
//
// 背景（issue #580 "不支持latex"）：大模型输出数学公式时几乎都用 LaTeX 的
// 标准定界符 `\( ... \)`（行内）和 `\[ ... \]`（行间），偶尔用 `$ ... $` /
// `$$ ... $$`。但 react-markdown 的 remark-math 只认 `$` 形式，且 markdown
// 本身会把 `\[`、`\]` 里的反斜杠当成"转义标点"吃掉，于是公式在聊天里被渲染
// 成裸文本（截图里那一坨 `[ \frac{1}{n}\sum_i ... ]`）。
//
// 这里在送进 react-markdown 之前做一次轻量改写：把 `\(...\)` / `\[...\]`
// 统一改写成 remark-math 认识的 `$...$` / `$$...$$`，并且只在"散文"片段里
// 做——代码块（``` 围栏 / 行内 `code`）原样保留，避免把正在讨论 LaTeX 源码
// 或 shell 里的 `$VAR`、`\(` 误伤。
//
// 设计参考了若干成熟的 LLM 桌面端实现，思路一致：preprocess 阶段做定界符
// 归一 + 货币 `$` escape，再交给 remark-math + rehype-katex 渲染。

// 把文本按"代码围栏"切片：```...``` 或 ~~~...~~~ 整段保留。
const CODE_FENCE_SPLIT_RE = /((?:```|~~~)[\s\S]*?(?:```|~~~))/g;
// 行内代码 `like this` 整段保留。
const INLINE_CODE_SPLIT_RE = /(`[^`\n]+`)/g;

// `\( ... \)` 行内数学 —— 不跨段落（限制在单行内，避免贪婪误吞）。
const LATEX_INLINE_RE = /\\\(([^\n]+?)\\\)/g;
// `\[ ... \]` 行间数学 —— 允许跨行。
const LATEX_DISPLAY_RE = /\\\[([\s\S]+?)\\\]/g;

// `$` 紧跟数字时视为货币金额（$5、$19.99、$1,299），escape 成 `\$`，
// 避免 remark-math 在 singleDollarTextMath 下把两个货币符号之间的文字
// 当成行内公式。数学表达式几乎总是以字母或 `\命令` 开头，所以这个启发
// 式的误伤率极低。
const CURRENCY_DOLLAR_RE = /(^|[^\\$])\$(?=\d)/g;

function rewriteLatexBracketDelimiters(text: string): string {
  return text
    .replace(LATEX_INLINE_RE, (_m, body: string) => `$${body}$`)
    .replace(LATEX_DISPLAY_RE, (_m, body: string) => `$$${body}$$`);
}

function escapeCurrencyDollars(text: string): string {
  return text.replace(CURRENCY_DOLLAR_RE, "$1\\$");
}

function transformProse(text: string): string {
  // 行内代码片段同样原样保留，其余散文做货币 escape + 定界符归一。
  // 顺序很关键：先在"原始文本"上 escape 货币 `$`，再把 `\(..\)` 改写成
  // `$..$`。否则像 `\(5x\)` 这种以数字开头的行内公式被改写成 `$5x$` 后，
  // 会被货币正则误当成金额、把开头的 `$` escape 掉，导致公式破损。
  return text
    .split(INLINE_CODE_SPLIT_RE)
    .map((part) =>
      part.startsWith("`") ? part : rewriteLatexBracketDelimiters(escapeCurrencyDollars(part)),
    )
    .join("");
}

/**
 * 把 LLM/用户输出里的 LaTeX 定界符归一成 remark-math 认识的 `$` 形式，
 * 仅作用于代码块之外的散文。返回值可直接喂给 react-markdown。
 */
export function preprocessMath(content: string): string {
  if (!content) return content;
  // 快速短路：没有任何可能的数学定界符时直接返回，省掉正则与 split 开销。
  if (!content.includes("\\(") && !content.includes("\\[") && !content.includes("$")) {
    return content;
  }
  return content
    .split(CODE_FENCE_SPLIT_RE)
    .map((part) => (/^(?:```|~~~)/.test(part) ? part : transformProse(part)))
    .join("");
}
