// OCR for uploaded images (tesseract.js — pure WASM, no system installs).
// Used to decide what the AI model receives: if an image contains readable
// text we send the TEXT (cheaper, more accurate); only text-free images are
// sent as actual images to a vision model.

import { createWorker, Worker } from 'tesseract.js'

let workerPromise: Promise<Worker> | null = null

function getWorker(): Promise<Worker> {
  // Singleton — model data (~10MB) loads once and is reused
  if (!workerPromise) workerPromise = createWorker('eng')
  return workerPromise
}

export interface OcrResult {
  /** Extracted text, cleaned up ('' when nothing readable) */
  text: string
  /** Whether the image should be treated as text content */
  hasText: boolean
  confidence: number
}

const MIN_TEXT_CHARS = 20
const MIN_CONFIDENCE = 55

export async function extractText(image: Buffer): Promise<OcrResult> {
  try {
    const worker = await getWorker()
    const { data } = await worker.recognize(image)
    const text = (data.text ?? '').trim()
    const confidence = data.confidence ?? 0
    const hasText = text.length >= MIN_TEXT_CHARS && confidence >= MIN_CONFIDENCE
    return { text: hasText ? text : '', hasText, confidence }
  } catch (err: any) {
    console.warn('[ocr] recognition failed:', err.message)
    return { text: '', hasText: false, confidence: 0 }
  }
}
