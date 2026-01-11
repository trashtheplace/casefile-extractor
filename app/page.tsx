'use client'

import { useState } from 'react'

interface ImageData {
  url: string
  alt: string
  caption: string
  sourcePageUrl: string
  attribution: string
  relevance?: string
  people_shown?: string[]
  date?: string
  location?: string
}

interface Entity {
  name: string
  type: string
  role: string
  description: string
  pronouns: string
  images: ImageData[]
}

interface AnalysisResult {
  episode: {
    title: string
    url: string
  }
  summary: string
  entities: Entity[]
  allImages: ImageData[]
}

export default function Home() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [selectedImage, setSelectedImage] = useState<ImageData | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!url.trim()) {
      setError('Please enter a Casefile episode URL')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)
    setStatus('Starting analysis...')

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })

      // Handle streaming response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error('No response body')

      let fullText = ''
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value)
        fullText += chunk
        
        // Parse status updates
        const lines = fullText.split('\n')
        for (const line of lines) {
          if (line.startsWith('STATUS:')) {
            setStatus(line.replace('STATUS:', '').trim())
          }
        }
      }

      // Find the JSON result
      const jsonMatch = fullText.match(/RESULT:([\s\S]+)$/m)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[1])
        if (data.error) {
          setError(data.error)
        } else {
          setResult(data)
        }
      } else {
        setError('Failed to parse response')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
      setStatus('')
    }
  }

  const downloadImage = async (imageUrl: string, filename: string) => {
    try {
      const response = await fetch(`/api/download?url=${encodeURIComponent(imageUrl)}`)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert('Failed to download image')
    }
  }

  const downloadAllImages = async () => {
    if (!result) return
    
    // Download each image
    for (let i = 0; i < result.allImages.length; i++) {
      const img = result.allImages[i]
      const ext = img.url.split('.').pop()?.split('?')[0] || 'jpg'
      await downloadImage(img.url, `casefile-${i + 1}.${ext}`)
      // Small delay between downloads
      await new Promise(r => setTimeout(r, 300))
    }
  }

  const exportJSON = () => {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'casefile-export.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="container">
      <header className="header">
        <h1>Casefile Extractor</h1>
        <p>Extract characters, locations, and images from Casefile episodes</p>
      </header>

      <section className="form-section">
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <input
              type="url"
              className="input-url"
              placeholder="Paste Casefile episode URL (e.g., https://casefilepodcast.com/case-104-silk-road/)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
            />
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Analyzing...' : 'Extract'}
            </button>
          </div>
        </form>

        {loading && (
          <div className="status-bar">
            <div className="spinner" />
            <span>{status || 'Processing...'}</span>
          </div>
        )}

        {error && (
          <div className="error-box">
            {error}
          </div>
        )}
      </section>

      {result && (
        <>
          <div className="results-header">
            <h2>{result.episode.title}</h2>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-secondary" onClick={exportJSON}>
                Export JSON
              </button>
              <button className="btn-secondary" onClick={downloadAllImages}>
                Download All Images
              </button>
            </div>
          </div>

          <div className="summary-box">
            <h3>Case Summary</h3>
            <p>{result.summary}</p>
          </div>

          <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 600 }}>
            Characters &amp; Locations ({result.entities.length})
          </h3>
          
          <div className="entities-grid">
            {result.entities.map((entity, idx) => (
              <div key={idx} className="entity-card">
                <div className="entity-header">
                  <div className="entity-type">{entity.type}</div>
                  <div className="entity-name">{entity.name}</div>
                  {entity.role && entity.role !== 'other' && (
                    <div className="entity-role">{entity.role}</div>
                  )}
                  {entity.pronouns && (
                    <div className="entity-pronouns">{entity.pronouns}</div>
                  )}
                </div>
                
                <div className="entity-description">
                  {entity.description}
                </div>

                <div className="entity-images">
                  <div className="entity-images-title">
                    Images ({entity.images.length})
                  </div>
                  {entity.images.length > 0 ? (
                    <div className="image-grid">
                      {entity.images.map((img, imgIdx) => (
                        <div 
                          key={imgIdx} 
                          className="image-thumb"
                          onClick={() => setSelectedImage(img)}
                        >
                          <img 
                            src={img.url} 
                            alt={img.alt || entity.name}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="no-images">No images found</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {result.allImages.length > 0 && (
            <div className="all-images-section">
              <h3>All Discovered Images ({result.allImages.length})</h3>
              <div className="all-images-grid">
                {result.allImages.map((img, idx) => (
                  <div 
                    key={idx} 
                    className="all-image-card"
                    onClick={() => setSelectedImage(img)}
                  >
                    <img 
                      src={img.url} 
                      alt={img.alt || `Image ${idx + 1}`}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23333" width="100" height="100"/><text x="50" y="50" text-anchor="middle" fill="%23666" dy=".3em">No image</text></svg>'
                      }}
                    />
                    <div className="caption">
                      {img.caption || img.alt || img.attribution || 'Unknown'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Image Modal */}
      {selectedImage && (
        <div className="modal-overlay" onClick={() => setSelectedImage(null)}>
          <button className="modal-close" onClick={() => setSelectedImage(null)}>×</button>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <img 
              src={selectedImage.url} 
              alt={selectedImage.alt || 'Image'}
              className="modal-image"
            />
            <div className="modal-info">
              {selectedImage.caption && <h4>{selectedImage.caption}</h4>}
              {selectedImage.alt && <p><strong>Alt:</strong> {selectedImage.alt}</p>}
              {selectedImage.relevance && <p><strong>Relevance:</strong> {selectedImage.relevance}</p>}
              {selectedImage.people_shown && selectedImage.people_shown.length > 0 && (
                <p><strong>People shown:</strong> {selectedImage.people_shown.join(', ')}</p>
              )}
              {selectedImage.date && <p><strong>Date:</strong> {selectedImage.date}</p>}
              {selectedImage.location && <p><strong>Location:</strong> {selectedImage.location}</p>}
              <p className="attribution">
                Source: {selectedImage.attribution} 
                {selectedImage.sourcePageUrl && (
                  <> — <a href={selectedImage.sourcePageUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>View source</a></>
                )}
              </p>
              <div className="modal-actions">
                <button 
                  className="btn-secondary"
                  onClick={() => downloadImage(selectedImage.url, `image.${selectedImage.url.split('.').pop()?.split('?')[0] || 'jpg'}`)}
                >
                  Download Image
                </button>
                <button 
                  className="btn-secondary"
                  onClick={() => window.open(selectedImage.url, '_blank')}
                >
                  Open Original
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
