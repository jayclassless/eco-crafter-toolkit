import { describe, expect, it } from 'vitest'

import { bbcodeToHtml } from './bbcode-to-html'

describe('bbcodeToHtml', () => {
  it('returns empty string for empty input', () => {
    expect(bbcodeToHtml('')).toBe('')
  })

  it('escapes raw HTML in the input so injection is neutralized', () => {
    expect(bbcodeToHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(bbcodeToHtml('a < b && c > d')).toBe('a &lt; b &amp;&amp; c &gt; d')
    expect(bbcodeToHtml(`it's "quoted"`)).toBe('it&#39;s &quot;quoted&quot;')
  })

  it('converts heading tags', () => {
    expect(bbcodeToHtml('[h1]A[/h1][h2]B[/h2][h3]C[/h3]')).toBe('<h1>A</h1><h2>B</h2><h3>C</h3>')
  })

  it('converts paragraph and inline formatting tags', () => {
    expect(bbcodeToHtml('[p]Hello [b]world[/b] and [i]friends[/i][/p]')).toBe(
      '<p>Hello <strong>world</strong> and <em>friends</em></p>'
    )
    expect(bbcodeToHtml('[u]underlined[/u]')).toBe('<u>underlined</u>')
    expect(bbcodeToHtml('[quote]q[/quote]')).toBe('<blockquote>q</blockquote>')
    expect(bbcodeToHtml('[code]c[/code]')).toBe('<code>c</code>')
  })

  it('converts hr tags in both forms', () => {
    expect(bbcodeToHtml('a[hr]b[hr][/hr]c')).toBe('a<hr />b<hr />c')
  })

  it('converts ordered and unordered lists with both [*] and [/*] markers', () => {
    expect(bbcodeToHtml('[list][*]one[*]two[*]three[/list]')).toBe(
      '<ul><li>one</li><li>two</li><li>three</li></ul>'
    )
    expect(bbcodeToHtml('[list][*]one[/*][*]two[/*][/list]')).toBe(
      '<ul><li>one</li><li>two</li></ul>'
    )
    expect(bbcodeToHtml('[olist][*]one[*]two[/olist]')).toBe('<ol><li>one</li><li>two</li></ol>')
  })

  it('drops list content before the first [*]', () => {
    expect(bbcodeToHtml('[list]ignored[*]kept[/list]')).toBe('<ul><li>kept</li></ul>')
  })

  it('converts [url=href]text[/url] anchors with safe http(s) hrefs', () => {
    expect(bbcodeToHtml('[url=https://example.com]click[/url]')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">click</a>'
    )
    expect(bbcodeToHtml('[url=http://example.com]x[/url]')).toContain('href="http://example.com"')
  })

  it('strips [url] tags whose hrefs are not http(s)', () => {
    expect(bbcodeToHtml('[url=javascript:alert(1)]click[/url]')).toBe('click')
    expect(bbcodeToHtml('[url=ftp://x]click[/url]')).toBe('click')
    expect(bbcodeToHtml('[url=/local]click[/url]')).toBe('click')
  })

  it('converts [url]href[/url] with the href as the link text', () => {
    expect(bbcodeToHtml('[url]https://example.com/x[/url]')).toBe(
      '<a href="https://example.com/x" target="_blank" rel="noopener noreferrer">https://example.com/x</a>'
    )
  })

  it('converts [img] tags with safe http(s) src', () => {
    expect(bbcodeToHtml('[img]https://example.com/a.png[/img]')).toBe(
      '<img src="https://example.com/a.png" alt="" loading="lazy" />'
    )
    expect(bbcodeToHtml('[img]javascript:alert(1)[/img]')).toBe('')
  })

  it('converts Steam-style [img src="..."][/img] tags', () => {
    expect(bbcodeToHtml('[img src="https://example.com/a.png"][/img]')).toBe(
      '<img src="https://example.com/a.png" alt="" loading="lazy" />'
    )
  })

  it('expands {STEAM_CLAN_IMAGE} in [img] sources to the Steam CDN base', () => {
    const input = '[img src="{STEAM_CLAN_IMAGE}/25097638/abc123.gif"][/img]'
    expect(bbcodeToHtml(input)).toBe(
      '<img src="https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/clans/25097638/abc123.gif" alt="" loading="lazy" />'
    )
  })

  it('drops [img src="..."] with non-http(s) src after placeholder expansion', () => {
    expect(bbcodeToHtml('[img src="javascript:alert(1)"][/img]')).toBe('')
  })

  it('handles a real Steam patch-notes excerpt', () => {
    const sample =
      '[h3]Hey Citizens,[/h3][p]we have just released Hotfix 13.0.2 to address an issue.[/p][p][/p][list][*][p][b]Fixed:[/b] Building with blocks failed.[/p][/*][/list]'
    const html = bbcodeToHtml(sample)
    expect(html).toContain('<h3>Hey Citizens,</h3>')
    expect(html).toContain('<p>we have just released Hotfix 13.0.2 to address an issue.</p>')
    expect(html).toContain('<ul><li>')
    expect(html).toContain('<strong>Fixed:</strong>')
  })

  it('passes through unknown tags as escaped text without crashing', () => {
    expect(bbcodeToHtml('[unknown]x[/unknown]')).toBe('[unknown]x[/unknown]')
  })
})
