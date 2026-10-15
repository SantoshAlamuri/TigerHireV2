/**
 * DOCX plain-text extraction for Node (Vercel/serverless).
 * mammoth@1.12 is incompatible with @xmldom/xmldom@0.9 (mimeType + errorHandler).
 * We patch mammoth's xml parser shim before loading mammoth.
 */

import { logger } from "@/lib/observability/logger";

let mammothXmlPatched = false;

export function patchMammothXmlParserForXmldom09(): void {
  if (mammothXmlPatched) return;
  mammothXmlPatched = true;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammothXmldom = require("mammoth/lib/xml/xmldom") as {
    parseFromString: (xml: string) => Document;
  };

  mammothXmldom.parseFromString = (string: string): Document => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const xmldom = require("@xmldom/xmldom") as {
      DOMParser: new (opts?: { onError?: (level: string, message: string) => void }) => {
        parseFromString: (source: string, mimeType: string) => Document;
      };
    };

    let fatal: { level: string; message: string } | null = null;
    const domParser = new xmldom.DOMParser({
      onError: (level: string, message: string) => {
        if (level === "fatalError") {
          fatal = { level, message };
        }
      },
    });

    const document = domParser.parseFromString(string, "text/xml");
    if (fatal === null) {
      return document;
    }
    const err = fatal as { level: string; message: string };
    throw new Error(`${err.level}: ${err.message}`);
  };
}

export async function extractDocxPlainText(buffer: Buffer): Promise<string> {
  patchMammothXmlParserForXmldom09();
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  const text = (result.value ?? "").trim();
  logger.info("[docx-extract] mammoth extraction complete", {
    chars: text.length,
  });
  return text;
}
