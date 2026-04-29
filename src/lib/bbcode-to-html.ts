const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch] ?? ch)
}

function isSafeHttpUrl(href: string): boolean {
  return /^https?:\/\//i.test(href)
}

function transformLists(input: string): string {
  return input.replace(
    /\[(list|olist)\]([\s\S]*?)\[\/\1\]/gi,
    (_match, tag: string, inner: string) => {
      const wrapper = tag.toLowerCase() === 'olist' ? 'ol' : 'ul'
      const startIdx = inner.indexOf('[*]')
      if (startIdx === -1) return ''
      const body = inner.slice(startIdx + 3)
      const rawItems = body.split('[*]')
      const items = rawItems
        .map((item) => item.replace(/\[\/\*\]/g, '').trim())
        .filter((item) => item.length > 0)
        .map((item) => `<li>${item}</li>`)
        .join('')
      return items ? `<${wrapper}>${items}</${wrapper}>` : ''
    }
  )
}

function transformLinks(input: string): string {
  let out = input.replace(
    /\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi,
    (_match, href: string, text: string) => {
      const trimmedHref = href.trim()
      if (!isSafeHttpUrl(trimmedHref)) return text
      return `<a href="${trimmedHref}" target="_blank" rel="noopener noreferrer">${text}</a>`
    }
  )
  out = out.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_match, body: string) => {
    const trimmed = body.trim()
    if (!isSafeHttpUrl(trimmed)) return body
    return `<a href="${trimmed}" target="_blank" rel="noopener noreferrer">${trimmed}</a>`
  })
  return out
}

// Steam News uses {STEAM_CLAN_IMAGE} as a placeholder for the CDN base of
// community images attached to clan posts.
const STEAM_CLAN_IMAGE = 'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/clans'

function expandImagePlaceholders(src: string): string {
  return src.replace('{STEAM_CLAN_IMAGE}', STEAM_CLAN_IMAGE)
}

function renderImg(rawSrc: string): string {
  const src = expandImagePlaceholders(rawSrc.trim())
  if (!isSafeHttpUrl(src)) return ''
  return `<img src="${src}" alt="" loading="lazy" />`
}

function transformImages(input: string): string {
  // Steam's modern syntax: [img src="..."][/img] — escapeHtml has already
  // turned the attribute quotes into &quot;.
  let out = input.replace(
    /\[img\s+src=&quot;([\s\S]*?)&quot;\s*\][\s\S]*?\[\/img\]/gi,
    (_match, src: string) => renderImg(src)
  )
  // Legacy syntax: [img]URL[/img]
  out = out.replace(/\[img\]([\s\S]*?)\[\/img\]/gi, (_match, src: string) => renderImg(src))
  return out
}

const SIMPLE_TAGS: Array<[RegExp, string]> = [
  [/\[h1\]([\s\S]*?)\[\/h1\]/gi, '<h1>$1</h1>'],
  [/\[h2\]([\s\S]*?)\[\/h2\]/gi, '<h2>$1</h2>'],
  [/\[h3\]([\s\S]*?)\[\/h3\]/gi, '<h3>$1</h3>'],
  [/\[p\]([\s\S]*?)\[\/p\]/gi, '<p>$1</p>'],
  [/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>'],
  [/\[i\]([\s\S]*?)\[\/i\]/gi, '<em>$1</em>'],
  [/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>'],
  [/\[quote\]([\s\S]*?)\[\/quote\]/gi, '<blockquote>$1</blockquote>'],
  [/\[code\]([\s\S]*?)\[\/code\]/gi, '<code>$1</code>'],
  [/\[hr\]\[\/hr\]/gi, '<hr />'],
  [/\[hr\]/gi, '<hr />'],
]

export function bbcodeToHtml(input: string): string {
  if (!input) return ''
  let text = escapeHtml(input)
  text = transformLists(text)
  text = transformLinks(text)
  text = transformImages(text)
  for (const [pattern, replacement] of SIMPLE_TAGS) {
    text = text.replace(pattern, replacement)
  }
  return text
}
