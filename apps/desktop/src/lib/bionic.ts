/**
 * Transforms plain words in HTML into Bionic Reading format by wrapping
 * the first 40-50% of characters in a bold fixation span.
 */
export function applyBionicReading(html: string): string {
  // Parse using browser DOMParser to safely preserve HTML tags, images, links
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  function processNode(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      if (!text.trim()) return;

      // Split text preserving spaces and punctuation
      const words = text.split(/(\s+|[.,!?;:"()[\]{}]+)/);
      const span = document.createElement("span");

      for (const token of words) {
        if (!token) continue;
        if (/^\s+$/.test(token) || /^[.,!?;:"()[\]{}]+$/.test(token)) {
          span.appendChild(document.createTextNode(token));
        } else {
          // Word: bold first 40-50%
          const len = token.length;
          let fixLen = 1;
          if (len <= 3) {
            fixLen = 1;
          } else if (len <= 6) {
            fixLen = 2;
          } else if (len <= 9) {
            fixLen = 3;
          } else {
            fixLen = Math.ceil(len * 0.4);
          }

          const boldPart = token.slice(0, fixLen);
          const restPart = token.slice(fixLen);

          const boldEl = document.createElement("b");
          boldEl.className = "bionic-fixation";
          boldEl.textContent = boldPart;
          span.appendChild(boldEl);

          if (restPart) {
            span.appendChild(document.createTextNode(restPart));
          }
        }
      }

      if (node.parentNode) {
        node.parentNode.replaceChild(span, node);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      // Skip code blocks, footnote callouts, anchor tags, and script tags
      if (
        el.tagName === "CODE" ||
        el.tagName === "PRE" ||
        el.classList.contains("footnote-callout") ||
        el.classList.contains("anchor-tag")
      ) {
        return;
      }
      Array.from(el.childNodes).forEach(processNode);
    }
  }

  Array.from(doc.body.childNodes).forEach(processNode);
  return doc.body.innerHTML;
}
