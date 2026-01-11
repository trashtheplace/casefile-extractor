import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import * as cheerio from 'cheerio'

// Configuration
const CONFIG = {
  maxSources: 12,
  maxImagesPerPage: 8,
  fetchTimeout: 10000,
  delayBetweenRequests: 600,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
}

// Types
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

// Utility functions
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

// Fetch with timeout
async function fetchWithTimeout(url: string, timeout = CONFIG.fetchTimeout): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': CONFIG.userAgent },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

// Extract episode data
function extractEpisodeData(html: string, url: string) {
  const $ = cheerio.load(html)
  
  // Get title
  const title = $('h1.entry-title, h1.post-title, h1').first().text().trim() 
    || $('title').text().split('|')[0].trim()
    || 'Unknown Episode'
  
  // Get main content
  const contentSelectors = ['article .entry-content', '.post-content', '.entry-content', 'article', 'main']
  let $content = null
  for (const sel of contentSelectors) {
    if ($(sel).length) {
      $content = $(sel).first()
      break
    }
  }
  if (!$content) $content = $('body')
  
  // Extract text
  const text = $content.text().replace(/\s+/g, ' ').trim().slice(0, 12000)
  
  // Extract source links
  const sourceLinks = new Set<string>()
  $content.find('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    const normalized = normalizeUrl(href, url)
    if (normalized && !normalized.includes('casefilepodcast.com')) {
      sourceLinks.add(normalized)
    }
  })
  
  // Also check for source sections
  $('a[href]').each((_, el) => {
    const $el = $(el)
    const parentText = $el.parent().text().toLowerCase()
    const href = $el.attr('href')
    if (!href) return
    const normalized = normalizeUrl(href, url)
    if ((parentText.includes('source') || parentText.includes('reference')) && normalized) {
      if (!normalized.includes('casefilepodcast.com')) {
        sourceLinks.add(normalized)
      }
    }
  })
  
  return {
    title,
    text,
    sourceLinks: Array.from(sourceLinks).slice(0, CONFIG.maxSources),
  }
}

// Extract images from page
function extractImagesFromPage(html: string, pageUrl: string, pageTitle: string): ImageCandidate[] {
  const $ = cheerio.load(html)
  const images: ImageCandidate[] = []
  
  // Remove non-content areas
  $('nav, footer, aside, .sidebar, .navigation, .menu, .widget, .ad, .advertisement').remove()
  
  $('img').each((_, el) => {
    if (images.length >= CONFIG.maxImagesPerPage) return false
    
    const $img = $(el)
    const src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src')
    if (!src) return
    
    const imageUrl = normalizeUrl(src, pageUrl)
    if (!imageUrl || !isImageUrl(imageUrl)) return
    
    // Skip tiny images
    const width = parseInt($img.attr('width') || '0')
    const height = parseInt($img.attr('height') || '0')
    if ((width > 0 && width < 100) || (height > 0 && height < 100)) return
    
    // Get context
    const alt = $img.attr('alt') || ''
    const title = $img.attr('title') || ''
    
    let caption = ''
    const $figure = $img.closest('figure')
    if ($figure.length) {
      caption = $figure.find('figcaption').text().trim()
    }
    if (!caption) {
      caption = $img.parent().find('.caption, .wp-caption-text').text().trim()
    }
    
    let context = ''
    const $container = $img.closest('p, div, article, section').first()
    if ($container.length) {
      context = $container.text().replace(/\s+/g, ' ').trim().slice(0, 250)
    }
    
    images.push({
      url: imageUrl,
      alt: alt || title,
      caption,
      context,
      sourcePageUrl: pageUrl,
      sourcePageTitle: pageTitle,
    })
  })
  
  // Check OG image
  const ogImage = $('meta[property="og:image"]').attr('content')
  if (ogImage && images.length < CONFIG.maxImagesPerPage) {
    const imageUrl = normalizeUrl(ogImage, pageUrl)
    if (imageUrl && isImageUrl(imageUrl)) {
      const ogTitle = $('meta[property="og:title"]').attr('content') || ''
      const ogDesc = $('meta[property="og:description"]').attr('content') || ''
      images.push({
        url: imageUrl,
        alt: ogTitle,
        caption: ogDesc,
        context: '',
        sourcePageUrl: pageUrl,
        sourcePageTitle: pageTitle,
      })
    }
  }
  
  return images
}

// Build LLM prompt
function buildPrompt(episodeTitle: string, episodeText: string, sourcePages: SourcePage[], allImages: ImageCandidate[]): string {
  const imageList = allImages.map((img, i) => {
    return `[IMG_${i}]
  URL: ${img.url}
  Alt: ${img.alt || '(none)'}
  Caption: ${img.caption || '(none)'}
  Context: ${img.context?.slice(0, 200) || '(none)'}
  Source: ${img.sourcePageTitle} (${img.sourcePageUrl})`
  }).join('\n\n')

  const sourceTexts = sourcePages.slice(0, 8).map(p => {
    return `--- SOURCE: ${p.title} (${p.url}) ---
${p.text.slice(0, 2500)}`
  }).join('\n\n')

  return `You are analyzing a true crime podcast episode to extract key people, locations, and match relevant images.

EPISODE: "${episodeTitle}"

<EPISODE_TEXT>
${episodeText.slice(0, 10000)}
</EPISODE_TEXT>

<SOURCE_TEXTS>
${sourceTexts}
</SOURCE_TEXTS>

<IMAGE_CANDIDATES>
${imageList}
</IMAGE_CANDIDATES>

TASK: Extract the main characters (people) and key locations from this case. Match each entity with relevant images from the candidates.

RULES:
1. Focus on the MAIN people: victims, suspects/perpetrators, key investigators, important witnesses
2. Include key LOCATIONS: crime scene, important places mentioned
3. Only use images from IMAGE_CANDIDATES - reference by IMG_X index
4. For PRONOUNS: only include if explicitly stated or clearly implied in text. Use format "he/him", "she/her", "they/them", or "" if unknown
5. For image metadata: only include what's explicitly stated. Use empty string "" or empty array [] if unknown
6. Keep descriptions factual and from the source material only

OUTPUT FORMAT: Return ONLY valid JSON (no markdown, no explanation):

{
  "episode_title": "string",
  "summary": "2-3 sentence overview of the case",
  "entities": [
    {
      "name": "Full Name",
      "type": "Person | Location | Organization",
      "role": "victim | suspect | perpetrator | investigator | witness | location | other",
      "description": "1-2 factual sentences about this entity",
      "pronouns": "he/him or she/her or they/them or empty string",
      "images": [
        {
          "image_index": 0,
          "relevance": "brief description of why this image relates to this entity",
          "people_shown": ["names if explicitly stated"],
          "date": "YYYY-MM-DD or empty string",
          "location": "location name or empty string"
        }
      ]
    }
  ]
}`
}

// Call LLM
async function callLLM(prompt: string): Promise<any> {
  const client = new Anthropic()
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })
  
  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  
  // Parse JSON
  let jsonStr = text
  if (text.includes('```json')) {
    jsonStr = text.split('```json')[1].split('```')[0]
  } else if (text.includes('```')) {
    jsonStr = text.split('```')[1].split('```')[0]
  }
  
  return JSON.parse(jsonStr.trim())
}

// Main API handler
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()
  
  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: string) => {
        controller.enqueue(encoder.encode(msg + '\n'))
      }
      
      try {
        const { url } = await request.json()
        
        if (!url) {
          send('RESULT:' + JSON.stringify({ error: 'No URL provided' }))
          controller.close()
          return
        }

        // Check API key
        if (!process.env.ANTHROPIC_API_KEY) {
          send('RESULT:' + JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }))
          controller.close()
          return
        }
        
        // Step 1: Fetch episode page
        send('STATUS:Fetching episode page...')
        
        let episodeResponse: Response
        try {
          episodeResponse = await fetchWithTimeout(url)
          if (!episodeResponse.ok) {
            throw new Error(`HTTP ${episodeResponse.status}`)
          }
        } catch (err) {
          send('RESULT:' + JSON.stringify({ error: `Failed to fetch episode: ${err}` }))
          controller.close()
          return
        }
        
        const episodeHtml = await episodeResponse.text()
        const episodeData = extractEpisodeData(episodeHtml, url)
        
        send(`STATUS:Found episode: ${episodeData.title}`)
        send(`STATUS:Found ${episodeData.sourceLinks.length} source links`)
        
        // Step 2: Extract images from episode page
        const allImages: ImageCandidate[] = []
        const episodeImages = extractImagesFromPage(episodeHtml, url, episodeData.title)
        allImages.push(...episodeImages)
        
        // Step 3: Crawl sources
        const sourcePages: SourcePage[] = []
        
        for (let i = 0; i < episodeData.sourceLinks.length; i++) {
          const sourceUrl = episodeData.sourceLinks[i]
          const hostname = new URL(sourceUrl).hostname
          
          send(`STATUS:Crawling source ${i + 1}/${episodeData.sourceLinks.length}: ${hostname}`)
          
          await delay(CONFIG.delayBetweenRequests)
          
          try {
            const response = await fetchWithTimeout(sourceUrl)
            if (!response.ok) continue
            
            const contentType = response.headers.get('content-type') || ''
            if (!contentType.includes('text/html')) continue
            
            const html = await response.text()
            const $ = cheerio.load(html)
            
            const title = $('h1').first().text().trim() || $('title').text().trim() || 'Untitled'
            const text = $('article, main, .content, body').first().text().replace(/\s+/g, ' ').trim()
            
            sourcePages.push({
              url: sourceUrl,
              title: title.slice(0, 100),
              text: text.slice(0, 4000),
            })
            
            // Extract images
            const images = extractImagesFromPage(html, sourceUrl, title)
            allImages.push(...images)
            
          } catch (err) {
            // Skip failed sources
            continue
          }
        }
        
        send(`STATUS:Crawled ${sourcePages.length} sources, found ${allImages.length} images`)
        
        // Deduplicate images
        const uniqueImages: ImageCandidate[] = []
        const seenUrls = new Set<string>()
        for (const img of allImages) {
          if (!seenUrls.has(img.url)) {
            seenUrls.add(img.url)
            uniqueImages.push(img)
          }
        }
        
        send(`STATUS:${uniqueImages.length} unique images after dedup`)
        
        // Step 4: Call LLM
        send('STATUS:Analyzing with Claude...')
        
        const prompt = buildPrompt(episodeData.title, episodeData.text, sourcePages, uniqueImages)
        
        let llmResult: any
        try {
          llmResult = await callLLM(prompt)
        } catch (err) {
          send('RESULT:' + JSON.stringify({ error: `LLM error: ${err}` }))
          controller.close()
          return
        }
        
        send(`STATUS:Found ${llmResult.entities?.length || 0} entities`)
        
        // Step 5: Build final result
        const result = {
          episode: {
            title: episodeData.title,
            url: url,
          },
          summary: llmResult.summary || '',
          entities: (llmResult.entities || []).map((entity: any) => ({
            name: entity.name,
            type: entity.type,
            role: entity.role || '',
            description: entity.description,
            pronouns: entity.pronouns || '',
            images: (entity.images || []).map((imgRef: any) => {
              const img = uniqueImages[imgRef.image_index]
              if (!img) return null
              return {
                url: img.url,
                alt: img.alt,
                caption: img.caption,
                sourcePageUrl: img.sourcePageUrl,
                attribution: new URL(img.sourcePageUrl).hostname,
                relevance: imgRef.relevance,
                people_shown: imgRef.people_shown || [],
                date: imgRef.date || '',
                location: imgRef.location || '',
              }
            }).filter(Boolean),
          })),
          allImages: uniqueImages.map(img => ({
            url: img.url,
            alt: img.alt,
            caption: img.caption,
            sourcePageUrl: img.sourcePageUrl,
            attribution: new URL(img.sourcePageUrl).hostname,
          })),
        }
        
        send('RESULT:' + JSON.stringify(result))
        controller.close()
        
      } catch (err) {
        send('RESULT:' + JSON.stringify({ error: `Unexpected error: ${err}` }))
        controller.close()
      }
    }
  })
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  })
}
