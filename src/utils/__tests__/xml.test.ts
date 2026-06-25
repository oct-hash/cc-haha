import { describe, expect, it } from 'bun:test';
import { escapeXml, escapeXmlAttr } from '../xml';

describe('escapeXml', () => {
  it('escapes ampersands', () => {
    expect(escapeXml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than signs', () => {
    expect(escapeXml('<tag>')).toBe('&lt;tag&gt;');
  });

  it('escapes greater-than signs', () => {
    expect(escapeXml('3 > 2')).toBe('3 &gt; 2');
  });

  it('returns unchanged string if no special chars', () => {
    expect(escapeXml('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(escapeXml('')).toBe('');
  });

  it('escapes multiple special characters', () => {
    expect(escapeXml('a < b && c > d')).toBe('a &lt; b &amp;&amp; c &gt; d');
  });
});

describe('escapeXmlAttr', () => {
  it('escapes double quotes', () => {
    expect(escapeXmlAttr('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeXmlAttr("it's")).toBe('it&apos;s');
  });

  it('escapes XML special chars plus quotes', () => {
    expect(escapeXmlAttr('<a href="x">')).toBe('&lt;a href=&quot;x&quot;&gt;');
  });

  it('returns unchanged string if no special chars', () => {
    expect(escapeXmlAttr('simple')).toBe('simple');
  });
});
