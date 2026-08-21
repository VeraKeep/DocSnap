/* ------------------------------------------------------------------ */
/* Lightweight client-side transcript extraction for PDF / DOCX / TXT  */
/* ------------------------------------------------------------------ */
/* This module runs entirely in the browser (no node APIs) and is the  */
/* client-side companion to MeetingsnapApp.tsx. It turns an uploaded   */
/* .pdf or .docx into plain transcript text that then flows into the   */
/* unchanged analyze -> AI-extraction -> persist pipeline.             */
/*                                                                    */
/* Design notes (no heavy deps):                                      */
/*  - DOCX is a ZIP of XML. We inflate word/document.xml with `fflate` */
/*    (a ~8 KB pure-JS zip/deflate lib) and strip the XML tags.       */
/*  - PDF text lives inside FlateDecode-compressed content streams.    */
/*    We locate the streams referenced by each page's /Contents,      */
/*    inflate them with the same tiny lib, and parse the text-showing  */
/*    operators (Tj / TJ / ' / ") — no pdf.js, no worker, no canvas.  */
/*  - Everything is best-effort. If nothing readable comes out (e.g. a */
/*    scanned/image-only PDF) we throw a friendly message so the app   */
/*    falls back to "export as .txt or paste below" instead of a crash.*/
/* ------------------------------------------------------------------ */
import { inflateSync, unzipSync } from "fflate";

const FRIENDLY_BINARY_MESSAGE =
  "This file has no extractable text (it may be a scanned image or an unreadable format). " +
  "Export your transcript as .txt, or paste it directly below.";

/** Friendly guidance used when a file's text can't be pulled out. */
export function binaryFallbackMessage(fileName: string): string {
  const ext = (fileName.split(".").pop() ?? "").toUpperCase();
  return `${fileName} (${ext}) has no extractable text — it may be a scanned image or an unsupported format. Export your transcript as .txt or paste it below.`;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
function ensureBytes(data: string | Uint8Array): Uint8Array {
  if (data instanceof Uint8Array) return data;
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data.charCodeAt(i) & 0xff;
  return out;
}

/** Text is considered meaningful only if it has a usable amount of it. */
function meaningful(text: string): boolean {
  const t = text.trim();
  if (t.length < 20) return false;
  const printable = (t.match(/[\x20-\x7E\n\r\t]/g) ?? []).length;
  return t.length ? printable / t.length >= 0.6 : false;
}

/* ------------------------------------------------------------------ */
/* DOCX: a zip container; pull word/document.xml and strip the tags    */
/* ------------------------------------------------------------------ */
export function extractDocxText(data: string | Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(ensureBytes(data));
  } catch {
    throw new Error("This .docx file could not be read (corrupt zip or not a real Word file). " + FRIENDLY_BINARY_MESSAGE);
  }
  const xmlEntry = files["word/document.xml"];
  if (!xmlEntry) {
    throw new Error("This .docx file has no readable document body. " + FRIENDLY_BINARY_MESSAGE);
  }
  const xml = new TextDecoder("utf-8").decode(xmlEntry);
  // Escape XML entities so <w:t> inner text decodes correctly after stripping.
  const withEntities = xml
    .replace(/&lt;/g, "\u0001L")
    .replace(/&gt;/g, "\u0002G")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
  // Paragraph boundaries: </w:p> -> newline (keeps lines readable as a transcript).
  const paragraphs = withEntities.replace(/<\/w:p>/g, "\n");
  // Drop every tag; keep only text nodes.
  const text = paragraphs.replace(/<[^>]+>/g, "");
  const clean = text
    .replace(/\u0001L/g, "<")
    .replace(/\u0002G/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!meaningful(clean)) {
    throw new Error("This .docx file has no extractable text. " + FRIENDLY_BINARY_MESSAGE);
  }
  return clean;
}

/* ------------------------------------------------------------------ */
/* PDF: locate /Contents streams, inflate FlateDecode, parse text ops  */
/* ------------------------------------------------------------------ */

/** Decode a PDF string-literal escape sequence. */
function decodeEscape(seq: string): string {
  switch (seq) {
    case "n":
      return "\n";
    case "r":
      return "\r";
    case "t":
      return "\t";
    case "b":
      return "\b";
    case "f":
      return "\f";
    case "(":
      return "(";
    case ")":
      return ")";
    case "\\":
      return "\\";
    default: {
      // Octal byte code, e.g. \341 -> é
      if (/^[0-7]{1,3}$/.test(seq)) {
        return winAnsiChar(parseInt(seq, 8));
      }
      return seq;
    }
  }
}

/**
 * Map a PDF byte (latin1 code unit) to a Unicode char using a
 * WinAnsiEncoding approximation (covers the common accents in
 * machine-generated transcript PDFs). Chars 0x20-0x7E are ASCII.
 */
function winAnsiChar(code: number): string {
  if (code >= 0x20 && code <= 0x7e) return String.fromCharCode(code);
  if (code >= 0xa0) return String.fromCharCode(code); // Latin-1 range
  const win1252: Record<number, number> = {
    0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
    0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
    0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
    0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
    0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
    0x9e: 0x017e, 0x9f: 0x0178,
  };
  const mapped = win1252[code];
  return mapped !== undefined ? String.fromCharCode(mapped) : "";
}

/** Decode a PDF hex string <48656C6C6F> -> "Hello". */
function decodeHex(hex: string): string {
  const clean = hex.replace(/\s/g, "");
  let out = "";
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const byte = parseInt(clean.slice(i, i + 2), 16);
    if (!Number.isNaN(byte)) out += winAnsiChar(byte);
  }
  return out;
}

/** Parse one text-showing command body out of a PDF content stream. */
function parseContentStream(s: string): string {
  const lines: string[] = [];
  let i = 0;
  let buf = "";
  while (i < s.length) {
    const c = s[i];
    if (c === "(") {
      // literal string — read to matching ")" honouring escapes & nesting
      let j = i + 1;
      let depth = 1;
      let out = "";
      while (j < s.length && depth > 0) {
        const ch = s[j];
        if (ch === "\\") {
          let k = j + 1;
          let seq = "";
          if (/[0-7]/.test(s[k] ?? "")) {
            while (k < s.length && /[0-7]/.test(s[k]) && seq.length < 3) seq += s[k++];
          } else {
            seq = s[k] ?? "";
            k++;
          }
          out += decodeEscape(seq);
          j = k;
        } else if (ch === "(") {
          depth++;
          out += "(";
          j++;
        } else if (ch === ")") {
          depth--;
          if (depth > 0) out += ")";
          j++;
        } else {
          out += ch;
          j++;
        }
      }
      buf += out;
      i = j;
    } else if (c === "<") {
      if (s[i + 1] === "<") {
        i += 2; // dictionary start, skip
        continue;
      }
      let j = i + 1;
      let hex = "";
      while (j < s.length && s[j] !== ">") {
        hex += s[j];
        j++;
      }
      buf += decodeHex(hex);
      i = j + 1;
    } else if (c === "T" && s[i + 1] === "j") {
      lines.push(buf);
      buf = "";
      i += 2;
    } else if (c === "T" && s[i + 1] === "J") {
      lines.push(buf);
      buf = "";
      i += 2;
    } else if (c === "'") {
      lines.push(buf);
      buf = "";
      i += 1;
    } else if (c === '"') {
      lines.push(buf);
      buf = "";
      i += 1;
    } else {
      i++;
    }
  }
  if (buf.trim()) lines.push(buf);
  return lines.filter((l) => l.trim()).join("\n");
}

/** Pull an indirect object's body (/...obj ... endobj) out of the PDF. */
function getObjectBody(raw: string, num: number): string | null {
  const re = new RegExp(`\\b${num}\\s+\\d+\\s+obj\\b([\\s\\S]*?)\\bendobj`, "g");
  const m = re.exec(raw);
  return m ? m[1] : null;
}

/** Collect content-stream object numbers from every /Contents ref. */
function collectContentObjects(raw: string): number[] {
  const nums: number[] = [];
  const re = /\/Contents\s*(\d+\s+\d+\s+R|\[\s*\d+\s+\d+\s+R(?:\s+\d+\s+\d+\s+R)*\s*\])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const block = m[1];
    const numRe = /(\d+)\s+\d+\s+R/g;
    let n: RegExpExecArray | null;
    while ((n = numRe.exec(block))) nums.push(Number(n[1]));
  }
  return nums;
}

export function extractPdfText(data: string | Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(ensureBytes(data));
  if (!raw.includes("%PDF") || !raw.includes("/Contents")) {
    throw new Error("This file is not a readable PDF. " + FRIENDLY_BINARY_MESSAGE);
  }
  const objNums = collectContentObjects(raw);
  if (objNums.length === 0) {
    throw new Error("This PDF has no extractable text (it may be scanned images only). " + FRIENDLY_BINARY_MESSAGE);
  }
  const pageTexts: string[] = [];
  for (const num of objNums) {
    const body = getObjectBody(raw, num);
    if (!body) continue;
    const streamMatch = body.match(/\bstream\r?\n([\s\S]*?)\r?\nendstream/);
    if (!streamMatch) continue;
    const isFlate = /\/Filter\s*(\/\w+|\[[^\]]*\/FlateDecode[^\]]*\])/.test(
      body.replace(/\s+/g, " "),
    ) && /FlateDecode/.test(body);
    let decoded: string;
    try {
      const bytes = ensureBytes(streamMatch[1]);
      const inflated = isFlate ? inflateSync(bytes) : bytes;
      decoded = new TextDecoder("latin1").decode(inflated);
    } catch {
      continue;
    }
    const pageText = parseContentStream(decoded);
    if (meaningful(pageText)) pageTexts.push(pageText);
  }
  if (pageTexts.length === 0) {
    throw new Error("This PDF has no extractable text (it may be scanned images only). " + FRIENDLY_BINARY_MESSAGE);
  }
  return pageTexts.join("\n").trim();
}

/* ------------------------------------------------------------------ */
/* Public entry: pick the parser by extension                          */
/* ------------------------------------------------------------------ */
const TEXT_EXTENSIONS = ["txt", "text", "md", "vtt", "srt", "log"];

export async function extractFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const ext = name.split(".").pop() ?? "";

  if (TEXT_EXTENSIONS.includes(ext)) {
    const t = (await file.text()).trim();
    if (!meaningful(t)) throw new Error(binaryFallbackMessage(file.name));
    return t;
  }
  if (ext === "docx") {
    const buf = await file.arrayBuffer();
    return extractDocxText(new Uint8Array(buf));
  }
  if (ext === "pdf") {
    const buf = await file.arrayBuffer();
    return extractPdfText(new Uint8Array(buf));
  }
  // Unknown extension: try a plain-text decode, but fail honestly on binary.
  const buf = await file.arrayBuffer();
  const text = new TextDecoder("utf-8").decode(buf);
  if (!meaningful(text)) throw new Error(binaryFallbackMessage(file.name));
  return text;
}
