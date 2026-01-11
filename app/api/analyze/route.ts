import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CONFIG = {
  maxSources: 10,
  maxImagesPerPage: 6,
  fetchTimeout: 8000,
  delayBetweenRequests: 500,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
}

interface ImageCandidate {
  url: string
  alt: string
  caption: string
  context: string
  sourcePageUrl: string
  sourcePageTitle: string
}

interface SourcePage {
  url: string
  title: string
  text: string
}

function normalizeUrl(url: string, baseUrl: string): string | null {
  try {
    const absolute = new URL(url, baseUrl)
    if (!['http:', 'https:'].includes(absolute.protocol)) return null
    absolute.hash = ''
    return absolute.href
  } catch {
    return null
  }
}

function isImageUrl(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
  const lower = url.toLowerCase()
  return imageExtensions.some(ext => lower.includes(ext))
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractTextContent(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTitle(html: string): string {
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
  if (h1Match) return h1Match[1].trim()
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) return titleMatch[1].split('|')[0].trim()
  return 'Untitled'
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = []
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    const normalized = normalizeUrl(match[1], baseUrl)
    if (normalized && !normalized.includes('casefilepodcast.com')) {
      links.push(normalized)
    }
  }
return Array.from(new Set(links)).slice(0, CONFIG.maxSources)}

function extractImages(html: string, pageUrl: string, pageTitle: string): ImageCandidate[] {
  const images: ImageCandidate[] = []
  const regex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = regex.exec(html)) !== null && images.length < CONFIG.maxImagesPerPage) {
    const src = match[0]
    const srcUrl = match[1]
    const imageUrl = normalizeUrl(srcUrl, pageUrl)
    if (!imageUrl || !isImageUrl(imageUrl)) continue
    const altMatch = src.match(/alt=["']([^"']*)["']/i)
    const alt = altMatch ? altMatch[1] : ''
    const widthMatch = src.match(/width=["']?(\d+)/i)
    const width = widthMatch ? parseInt(widthMatch[1]) : 999
    if (width < 100) continue
    images.push({ url: imageUrl, alt, caption: '', context: '', sourcePageUrl: pageUrl, sourcePageTitle: pageTitle })
  }
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
  if (ogMatch && images.length < CONFIG.maxImagesPerPage) {
    const imageUrl = normalizeUrl(ogMatch[1], pageUrl)
    if (imageUrl && isImageUrl(imageUrl)) {
      images.push({ url: imageUrl, alt: pageTitle, caption: '', context: '', sourcePageUrl: pageUrl, sourcePageTitle: pageTitle })
    }
  }
  return images
}

function buildPrompt(episodeTitle: string, episodeText: string, sourcePages: SourcePage[], allImages: ImageCandidate[]): string {
  const imageList = allImages.slice(0, 30).map((img, i) => `[IMG_${i}] URL: ${img.url} | Alt: ${img.alt || '(none)'} | Source: ${img.sourcePageTitle}`).join('\n')
  const sourceTexts = sourcePages.slice(0, 6).map(p => `--- SOURCE: ${p.title} ---\n${p.text.slice(0, 2000)}`).join('\n\n')
  return `Analyze this true crime podcast episode and extract key people and locations.

EPISODE: "${episodeTitle}"

EPISODE TEXT:
${episodeText.slice(0, 8000)}

SOURCE TEXTS:
${sourceTexts}

IMAGE CANDIDATES:
${imageList}

Extract the main people (victims, suspects, investigators) and key locations. Match relevant images.

RULES:
- Only use images from the list above (reference by IMG_X)
- For pronouns: only include if clearly stated (he/him, she/her, they/them, or empty string)
- Keep descriptions factual, from source material only

Return ONLY valid JSON:
{
  "episode_title": "string",
  "summary": "2-3 sentence case overview",
  "entities": [
    {
      "name": "Full Name",
      "type": "Person or Location",
      "role": "victim/suspect/investigator/witness/location/other",
      "description": "1-2 factual sentences",
      "pronouns": "he/him or she/her or they/them or empty",
      "images": [{ "image_index": 0, "relevance": "why this image relates" }]
    }
  ]
}`
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()
    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 })
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    const episodeResponse = await fetch(url, { headers: { 'User-Agent': CONFIG.userAgent }, signal: AbortSignal.timeout(CONFIG.fetchTimeout) })
    if (!episodeResponse.ok) return NextResponse.json({ error: `Failed to fetch episode: HTTP ${episodeResponse.status}` }, { status: 400 })
    const episodeHtml = await episodeResponse.text()
    const episodeTitle = extractTitle(episodeHtml)
    const episodeText = extractTextContent(episodeHtml)
    const sourceLinks = extractLinks(episodeHtml, url)
    const allImages: ImageCandidate[] = extractImages(episodeHtml, url, episodeTitle)
    const sourcePages: SourcePage[] = []
    for (const sourceUrl of sourceLinks.slice(0, CONFIG.maxSources)) {
      await delay(CONFIG.delayBetweenRequests)
      try {
        const response = await fetch(sourceUrl, { headers: { 'User-Agent': CONFIG.userAgent }, signal: AbortSignal.timeout(CONFIG.fetchTimeout) })
        if (!response.ok) continue
        const contentType = response.headers.get('content-type') || ''
        if (!contentType.includes('text/html')) continue
        const html = await response.text()
        sourcePages.push({ url: sourceUrl, title: extractTitle(html), text: extractTextContent(html).slice(0, 4000) })
        allImages.push(...extractImages(html, sourceUrl, extractTitle(html)))
      } catch { continue }
    }
    const uniqueImages: ImageCandidate[] = []
    const seenUrls = new Set<string>()
    for (const img of allImages) { if (!seenUrls.has(img.url)) { seenUrls.add(img.url); uniqueImages.push(img) } }
    const prompt = buildPrompt(episodeTitle, episodeText, sourcePages, uniqueImages)
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!anthropicResponse.ok) { const errorText = await anthropicResponse.text(); return NextResponse.json({ error: `Claude API error: ${errorText}` }, { status: 500 }) }
    const anthropicData = await anthropicResponse.json()
    const responseText = anthropicData.content?.[0]?.text || ''
    let llmResult
    try {
      let jsonStr = responseText
      if (responseText.includes('```json')) jsonStr = responseText.split('```json')[1].split('```')[0]
      else if (responseText.includes('```')) jsonStr = responseText.split('```')[1].split('```')[0]
      llmResult = JSON.parse(jsonStr.trim())
    } catch { return NextResponse.json({ error: 'Failed to parse Claude response' }, { status: 500 }) }
    const result = {
      episode: { title: episodeTitle, url },
      summary: llmResult.summary || '',
      entities: (llmResult.entities || []).map((entity: any) => ({
        name: entity.name, type: entity.type, role: entity.role || '', description: entity.description, pronouns: entity.pronouns || '',
        images: (entity.images || []).map((imgRef: any) => {
          const img = uniqueImages[imgRef.image_index]
          if (!img) return null
          return { url: img.url, alt: img.alt, caption: img.caption, sourcePageUrl: img.sourcePageUrl, attribution: new URL(img.sourcePageUrl).hostname, relevance: imgRef.relevance }
        }).filter(Boolean),
      })),
      allImages: uniqueImages.slice(0, 50).map(img => ({ url: img.url, alt: img.alt, caption: img.caption, sourcePageUrl: img.sourcePageUrl, attribution: new URL(img.sourcePageUrl).hostname })),
    }
    return NextResponse.json(result)
  } catch (error) { return NextResponse.json({ error: `Server error: ${error}` }, { status: 500 }) }
}
