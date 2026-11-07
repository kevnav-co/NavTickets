import { escapeHtml, safeUrl } from './html';

const unescapeAmp = (s: string) => s.replace(/&amp;/g, '&');

/**
 * Markdown mínimo → HTML para pestañas personalizadas.
 * Todo el texto se escapa primero; los enlaces solo admiten https:/mailto:.
 */
export function renderSimpleMarkdown(md: string): string {
  const html = escapeHtml(md)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-gray-900 text-gray-100 p-4 rounded-2xl overflow-x-auto text-sm my-4"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-primary px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-8 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-black mt-8 mb-4">$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, text: string, rawUrl: string) => {
      const url = safeUrl(unescapeAmp(rawUrl));
      return url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:no-underline">${text}</a>`
        : text;
    })
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/^---$/gm, '<hr class="my-6 border-gray-200" />')
    .replace(/\n\n/g, '</p><p class="mb-4 leading-relaxed text-gray-700">');

  return `<div class="markdown-content"><p class="mb-4 leading-relaxed text-gray-700">${html}</p></div>`;
}
