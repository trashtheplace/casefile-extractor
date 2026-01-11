import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Casefile Extractor',
  description: 'Extract entities and images from Casefile podcast episodes',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
