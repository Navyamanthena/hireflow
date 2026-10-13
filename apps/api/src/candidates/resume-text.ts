import { BadRequestException } from '@nestjs/common';
// Import the library entry directly: pdf-parse's index.js runs a debug
// self-test when it thinks it is the main module.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse.js');

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

/** Turn an uploaded PDF / text file into plain text for the LLM. */
export async function extractResumeText(file: Express.Multer.File): Promise<string> {
  const name = file.originalname.toLowerCase();
  let text: string;

  if (file.mimetype === 'application/pdf' || name.endsWith('.pdf')) {
    if (file.buffer.subarray(0, 5).toString() !== '%PDF-') {
      throw new BadRequestException('File is not a valid PDF');
    }
    try {
      text = (await pdfParse(file.buffer)).text;
    } catch {
      throw new BadRequestException('Could not read text from this PDF');
    }
  } else if (/\.(txt|md)$/.test(name) || file.mimetype.startsWith('text/')) {
    text = file.buffer.toString('utf8');
  } else {
    throw new BadRequestException('Upload a .pdf, .txt or .md resume');
  }

  text = text.replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 30) {
    throw new BadRequestException(
      'No readable text found. Scanned/image PDFs are not supported; paste the text instead.',
    );
  }
  return text.slice(0, 60000);
}
