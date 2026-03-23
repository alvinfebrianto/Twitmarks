const ALLOWED_TAGS = new Set([
  "blockquote",
  "a",
  "p",
  "br",
  "span",
  "div",
  "img",
]);

const SELF_CLOSING_TAGS = new Set(["br", "img"]);

const ALLOWED_ATTRS = new Set([
  "href",
  "data-theme",
  "data-lang",
  "data-dnt",
  "class",
  "lang",
  "dir",
  "src",
  "alt",
]);

const ALLOWED_URI_REGEX =
  /^(https?:\/\/)?(www\.)?(twitter\.com|x\.com|t\.co|pic\.twitter\.com|platform\.twitter\.com|pbs\.twimg\.com|video\.twimg\.com)\//i;

const URI_ATTRS = new Set(["href", "src"]);

function filterAttributes(attrs: string): string {
  const results: string[] = [];
  const attrRegex = /([a-z][a-z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

  for (const match of attrs.matchAll(attrRegex)) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? "";

    if (!ALLOWED_ATTRS.has(name)) {
      continue;
    }
    if (URI_ATTRS.has(name) && !ALLOWED_URI_REGEX.test(value)) {
      continue;
    }

    results.push(`${name}="${value}"`);
  }

  return results.length > 0 ? ` ${results.join(" ")}` : "";
}

export function sanitizeTweetHtml(html: string): string {
  let result = html;

  // Strip script tags and their content
  result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");

  // Strip style tags and their content
  result = result.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "");

  // Strip HTML comments
  result = result.replace(/<!--[\s\S]*?-->/g, "");

  // Process HTML tags
  result = result.replace(
    /<\/?([a-z][a-z0-9]*)\b([^>]*?)\s*\/?>/gi,
    (fullMatch, tagName: string, attrs: string) => {
      const tag = tagName.toLowerCase();

      if (!ALLOWED_TAGS.has(tag)) {
        return "";
      }

      const isClosing = fullMatch.startsWith("</");
      if (isClosing) {
        return `</${tag}>`;
      }

      if (SELF_CLOSING_TAGS.has(tag)) {
        return `<${tag}${filterAttributes(attrs)}>`;
      }

      return `<${tag}${filterAttributes(attrs)}>`;
    }
  );

  return result;
}
