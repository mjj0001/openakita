import { useMemo, useRef, useState } from "react";
import type { MdModules } from "../utils/chatTypes";
import { preprocessMath } from "../utils/mathPreprocess";

const MARKDOWN_PREVIEW_CHAR_LIMIT = 40_000;

export function MarkdownContent({
  content,
  mdModules,
  className,
  streaming = false,
}: {
  content: string;
  mdModules?: MdModules | null;
  className?: string;
  streaming?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  // Track whether THIS mounted instance has ever seen streaming=true.
  // If yes, the user just watched the content arrive — don't slam it shut the
  // instant streaming flips to false. They can still collapse via the button.
  // Fresh mounts of historic messages start with wasStreaming=false, so the
  // preview gate fires normally for genuinely large old messages.
  const wasStreamingRef = useRef(streaming);
  if (streaming) wasStreamingRef.current = true;
  const wasStreaming = wasStreamingRef.current;

  const shouldPreview = !streaming && !wasStreaming && content.length > MARKDOWN_PREVIEW_CHAR_LIMIT;
  const displayContent = useMemo(() => {
    // 先做 LaTeX 定界符归一（\(..\) → $..$，\[..\] → $$..$$），再按需折叠。
    // 归一只作用于代码块之外的散文，详见 utils/mathPreprocess.ts。
    const normalized = preprocessMath(content);
    if (!shouldPreview || expanded) return normalized;
    return `${normalized.slice(0, MARKDOWN_PREVIEW_CHAR_LIMIT)}\n\n... 内容过长，已折叠 ${normalized.length - MARKDOWN_PREVIEW_CHAR_LIMIT} 字符。`;
  }, [content, expanded, shouldPreview]);

  return (
    <div className={className}>
      {mdModules ? (
        <mdModules.ReactMarkdown remarkPlugins={mdModules.remarkPlugins} rehypePlugins={mdModules.rehypePlugins}>
          {displayContent}
        </mdModules.ReactMarkdown>
      ) : (
        <div style={{ whiteSpace: "pre-wrap" }}>{displayContent}</div>
      )}
      {shouldPreview && (
        <button
          type="button"
          className="msgActionBtn"
          onClick={() => setExpanded((v) => !v)}
          style={{ marginTop: 6 }}
        >
          {expanded ? "收起长内容" : "展开全文"}
        </button>
      )}
    </div>
  );
}
