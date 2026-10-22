// Tiny Markdown renderer for AI answers: paragraphs, headings, bullet/numbered lists, **bold**, *italic*, `code`.
// It builds React elements (never raw HTML), so model output can't inject scripts.

const renderInline = (text, keyPrefix) => {
  const parts = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  let match;
  let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("**")) parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) parts.push(<code key={key} className="rounded bg-stone-100 px-1 text-[0.85em]">{token.slice(1, -1)}</code>);
    else parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
};

export default function Markdown({ text }) {
  const blocks = [];
  let list = null;
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={`l${blocks.length}`} className={`my-1.5 space-y-0.5 pl-5 ${list.ordered ? "list-decimal" : "list-disc"}`}>
        {list.items.map((item, i) => (
          <li key={i}>{renderInline(item, `li${blocks.length}-${i}`)}</li>
        ))}
      </Tag>
    );
    list = null;
  };

  text.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,4}\s+(.*)$/);

    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet || numbered)[1]);
      return;
    }
    flushList();
    if (!line.trim()) return;
    if (heading) blocks.push(<p key={index} className="mt-2 font-semibold">{renderInline(heading[1], `h${index}`)}</p>);
    else blocks.push(<p key={index} className="my-1.5">{renderInline(line, `p${index}`)}</p>);
  });
  flushList();

  return <div className="text-sm leading-relaxed [&>*:first-child]:mt-0">{blocks}</div>;
}
