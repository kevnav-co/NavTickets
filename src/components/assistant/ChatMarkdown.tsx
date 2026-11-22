// Markdown mínimo para las respuestas del asistente en el chat público.
// El texto viene de un modelo (contenido no confiable), así que se construyen
// nodos de React —nunca HTML con innerHTML— y solo se reconoce lo que el chat
// necesita: párrafos, viñetas, listas numeradas, negrita y cursiva. Los títulos
// se muestran como texto en negrita; el código y los enlaces, como texto plano
// (un enlace de Markdown no se vuelve clicable).
import React from 'react';

export type ChatInline = { type: 'text' | 'strong' | 'em'; text: string };
export type ChatBlock =
  | { type: 'p'; lines: ChatInline[][] }
  | { type: 'ul' | 'ol'; items: ChatInline[][] }
  | { type: 'heading'; content: ChatInline[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

/** Quita lo que el chat no muestra: comillas invertidas y enlaces [texto](url) → texto. */
function stripUnsupported(s: string): string {
  return s
    .replace(/```[a-z]*\s*/gi, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\((?:[^)\s]+)\)/g, '$1');
}

/** Negrita (**x** o __x__) y cursiva (*x* o _x_) en una línea. Un asterisco suelto queda como texto. */
export function parseInline(line: string): ChatInline[] {
  const out: ChatInline[] = [];
  const re = /\*\*(.+?)\*\*|__(.+?)__|\*([^*\s][^*]*?)\*|(?<![\p{L}\p{N}])_([^_\s][^_]*?)_(?![\p{L}\p{N}])/gu;
  let last = 0;
  let m: RegExpExecArray | null;
  const s = stripUnsupported(line);
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ type: 'text', text: s.slice(last, m.index) });
    if (m[1] !== undefined || m[2] !== undefined) out.push({ type: 'strong', text: m[1] ?? m[2] });
    else out.push({ type: 'em', text: m[3] ?? m[4] });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ type: 'text', text: s.slice(last) });
  return out.filter((t) => t.text !== '');
}

export function parseChatMarkdown(md: string): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  let para: ChatInline[][] | null = null;
  let list: { type: 'ul' | 'ol'; items: ChatInline[][] } | null = null;
  const flush = () => {
    if (para) blocks.push({ type: 'p', lines: para });
    if (list) blocks.push(list);
    para = null;
    list = null;
  };

  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim() || RULE.test(raw)) {
      flush();
      continue;
    }
    const bullet = BULLET.exec(raw);
    const numbered = bullet ? null : NUMBERED.exec(raw);
    const kind = bullet ? 'ul' : numbered ? 'ol' : null;
    if (kind) {
      if (para || (list && list.type !== kind)) flush();
      if (!list) list = { type: kind, items: [] };
      list.items.push(parseInline((bullet ?? numbered)![1]));
      continue;
    }
    const heading = HEADING.exec(raw);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', content: parseInline(heading[1]) });
      continue;
    }
    if (list) flush();
    (para ??= []).push(parseInline(raw.trim()));
  }
  flush();
  return blocks;
}

const Inline: React.FC<{ parts: ChatInline[] }> = ({ parts }) => (
  <>
    {parts.map((p, i) =>
      p.type === 'strong' ? <strong key={i} className="font-semibold">{p.text}</strong>
        : p.type === 'em' ? <em key={i}>{p.text}</em>
          : <React.Fragment key={i}>{p.text}</React.Fragment>,
    )}
  </>
);

const ChatMarkdown: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex flex-col gap-1.5">
    {parseChatMarkdown(text).map((b, i) => {
      if (b.type === 'heading') return <p key={i} className="font-semibold"><Inline parts={b.content} /></p>;
      if (b.type === 'p') {
        return (
          <p key={i}>
            {b.lines.map((l, j) => (
              <React.Fragment key={j}>{j > 0 && <br />}<Inline parts={l} /></React.Fragment>
            ))}
          </p>
        );
      }
      const List = b.type === 'ul' ? 'ul' : 'ol';
      return (
        <List key={i} className={`pl-5 space-y-0.5 ${b.type === 'ul' ? 'list-disc' : 'list-decimal'}`}>
          {b.items.map((it, j) => <li key={j}><Inline parts={it} /></li>)}
        </List>
      );
    })}
  </div>
);

export default ChatMarkdown;
