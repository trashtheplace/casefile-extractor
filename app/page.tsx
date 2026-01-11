'use client'

import { useState } from 'react'

interface ImageData {
  url: string
  alt: string
  caption: string
  sourcePageUrl: string
  attribution: string
  relevance?: string
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
    setStatus('Analyzing episode... This may take 30-60 seconds.')
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await response.json()
      if (!response.ok || data.error) {
        setError(data.error || 'Request failed')
      } else {
        setResult(data)
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
      const response = await fetch('/api/download?url=' + encodeURIComponent(imageUrl))
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(blobUrl)
    } catch {
      alert('Failed to download image')
    }
  }

  const downloadAllImages = async () => {
    if (!result) return
    for (let i = 0; i < result.allImages.length; i++) {
      const img = result.allImages[i]
      const ext = img.url.split('.').pop()?.split('?')[0] || 'jpg'
      await downloadImage(img.url, 'casefile-' + (i + 1) + '.' + ext)
      await new Promise(r => setTimeout(r, 300))
    }
  }

  const exportJSON = () => {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const blobUrl = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = 'casefile-export.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(blobUrl)
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
            <input type="url" className="input-url" placeholder="Paste Casefile episode URL" value={url} onChange={(e) => setUrl(e.target.value)} disabled={loading} />
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Analyzing...' : 'Extract'}</button>
          </div>
        </form>
        {loading && <div className="status-bar"><div className="spinner" /><span>{status}</span></div>}
        {error && <div className="error-box">{error}</div>}
      </section>
      {result && (
        <>
          <div className="results-header">
            <h2>{result.episode.title}</h2>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-secondary" onClick={exportJSON}>Export JSON</button>
              <button className="btn-secondary" onClick={downloadAllImages}>Download All Images</button>
            </div>
          </div>
          <div className="summary-box"><h3>Case Summary</h3><p>{result.summary}</p></div>
          <h3 style={{ marginBottom: '1rem' }}>Characters &amp; Locations ({result.entities.length})</h3>
          <div className="entities-grid">
            {result.entities.map((entity, idx) => (
              <div key={idx} className="entity-card">
                <div className="entity-header">
                  <div className="entity-type">{entity.type}</div>
                  <div className="entity-name">{entity.name}</div>
                  {entity.role && <div className="entity-role">{entity.role}</div>}
                  {entity.pronouns && <div className="entity-pronouns">{entity.pronouns}</div>}
                </div>
                <div className="entity-description">{entity.description}</div>
                <div className="entity-images">
                  <div className="entity-images-title">Images ({entity.images.length})</div>
                  {entity.images.length > 0 ? (
                    <div className="image-grid">
                      {entity.images.map((img, imgIdx) => (
                        <div key={imgIdx} className="image-thumb" onClick={() => setSelectedImage(img)}>
                          <img src={img.url} alt={img.alt || entity.name} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        </div>
                      ))}
                    </div>
                  ) : <div className="no-images">No images found</div>}
                </div>
              </div>
            ))}
          </div>
          {result.allImages.length > 0 && (
            <div className="all-images-section">
              <h3>All Discovered Images ({result.allImages.length})</h3>
              <div className="all-images-grid">
                {result.allImages.map((img, idx) => (
                  <div key={idx} className="all-image-card" onClick={() => setSelectedImage(img)}>
                    <img src={img.url} alt={img.alt || 'Image'} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    <div className="caption">{img.caption || img.alt || img.attribution}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {selectedImage && (
        <div className="modal-overlay" onClick={() => setSelectedImage(null)}>
          <button className="modal-close" onClick={() => setSelectedImage(null)}>×</button>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <img src={selectedImage.url} alt={selectedImage.alt || 'Image'} className="modal-image" />
            <div className="modal-info">
              {selectedImage.alt && <p><strong>Alt:</strong> {selectedImage.alt}</p>}
              {selectedImage.relevance && <p><strong>Relevance:</strong> {selectedImage.relevance}</p>}
              <p className="attribution">Source: {selectedImage.attribution}</p>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => downloadImage(selectedImage.url, 'image.jpg')}>Download</button>
                <button className="btn-secondary" onClick={() => window.open(selectedImage.url, '_blank')}>Open Original</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
