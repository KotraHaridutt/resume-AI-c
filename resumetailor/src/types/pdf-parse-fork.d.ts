declare module 'pdf-parse-fork' {
  interface PDFParseOptions {
    data: Buffer
  }

  interface PDFParseResult {
    text: string
    numpages: number
    [key: string]: any
  }

  class PDFParse {
    constructor(options: PDFParseOptions)
    getText(): Promise<PDFParseResult>
    destroy(): Promise<void>
  }

  export = PDFParse
}
