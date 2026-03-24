import { describe, expect, it } from "vitest";
import { sanitizeTweetHtml } from "./sanitize-html";

describe("sanitizeTweetHtml", () => {
  it("strips script tags and their content", () => {
    expect(sanitizeTweetHtml('<script>alert("xss")</script>')).toBe("");
  });

  it("strips style tags and their content", () => {
    expect(
      sanitizeTweetHtml("<style>body{color:red}</style><p>hello</p>")
    ).toBe("<p>hello</p>");
  });

  it("preserves allowed tags with allowed attributes", () => {
    const input =
      '<blockquote class="twitter-tweet" data-lang="en" data-dnt="true" data-theme="dark"><p lang="en" dir="ltr">hello</p></blockquote>';
    expect(sanitizeTweetHtml(input)).toBe(input);
  });

  it("strips disallowed attributes from allowed tags", () => {
    expect(
      sanitizeTweetHtml(
        '<blockquote class="twitter-tweet" onclick="evil()" style="color:red"><p>hello</p></blockquote>'
      )
    ).toBe('<blockquote class="twitter-tweet"><p>hello</p></blockquote>');
  });

  it("escapes quotes in single-quoted attribute values", () => {
    expect(
      sanitizeTweetHtml(
        `<blockquote data-dnt='x"onfocus="alert(1)"tabindex="1'>test</blockquote>`
      )
    ).toBe(
      '<blockquote data-dnt="x&quot;onfocus=&quot;alert(1)&quot;tabindex=&quot;1">test</blockquote>'
    );
  });

  it("removes disallowed tags but keeps content", () => {
    expect(sanitizeTweetHtml("<b>bold</b> <em>italic</em>")).toBe(
      "bold italic"
    );
  });

  it("preserves href with allowed Twitter domains", () => {
    const input = '<a href="https://twitter.com/user/status/123">link</a>';
    expect(sanitizeTweetHtml(input)).toBe(input);
  });

  it("preserves encoded ampersands in href values", () => {
    const input = '<a href="https://twitter.com/x?a=1&amp;b=2">link</a>';
    expect(sanitizeTweetHtml(input)).toBe(input);
  });

  it("does not leak content when attributes contain greater-than", () => {
    const input = '<a href="https://twitter.com/x" title="a>b">link</a>';
    expect(sanitizeTweetHtml(input)).toBe(
      '<a href="https://twitter.com/x">link</a>'
    );
  });

  it("preserves t.co links", () => {
    const input = '<a href="https://t.co/abc123">link</a>';
    expect(sanitizeTweetHtml(input)).toBe(input);
  });

  it("removes href with disallowed domains", () => {
    expect(
      sanitizeTweetHtml('<a href="https://evil.com/phishing">link</a>')
    ).toBe("<a>link</a>");
  });

  it("preserves img with allowed src domains", () => {
    const input =
      '<img src="https://pbs.twimg.com/media/photo.jpg" alt="photo">';
    expect(sanitizeTweetHtml(input)).toBe(input);
  });

  it("removes img src with disallowed domains", () => {
    expect(
      sanitizeTweetHtml(
        '<img src="https://evil.com/tracker.gif" alt="tracker">'
      )
    ).toBe('<img alt="tracker">');
  });

  it("strips HTML comments", () => {
    expect(sanitizeTweetHtml("<!-- comment --><p>hello</p>")).toBe(
      "<p>hello</p>"
    );
  });

  it("handles full tweet embed (integration test)", () => {
    const input =
      '<blockquote class="twitter-tweet" data-lang="en" data-dnt="true" data-theme="dark"><p lang="en" dir="ltr">hello</p>&mdash; user <a href="https://twitter.com/user/status/123">Feb 20</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>';
    const result = sanitizeTweetHtml(input);

    expect(result).toContain("twitter-tweet");
    expect(result).toContain('data-theme="dark"');
    expect(result).toContain('data-dnt="true"');
    expect(result).toContain('data-lang="en"');
    expect(result).toContain('href="https://twitter.com/user/status/123"');
    expect(result).toContain("&mdash;");
    expect(result).not.toContain("<script");
  });

  it("returns empty string for script-only input", () => {
    expect(sanitizeTweetHtml('<script>alert("xss")</script>').trim()).toBe("");
  });

  it("preserves br tags", () => {
    expect(sanitizeTweetHtml("<p>line1<br>line2</p>")).toBe(
      "<p>line1<br>line2</p>"
    );
  });

  it("preserves pbs.twimg.com and video.twimg.com src domains", () => {
    const input =
      '<img src="https://video.twimg.com/tweet_video/abc.mp4" alt="video">';
    expect(sanitizeTweetHtml(input)).toBe(input);
  });
});
