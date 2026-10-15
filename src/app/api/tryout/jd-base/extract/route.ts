export const maxDuration = 60;

import { NextRequest } from "next/server";
import { z } from "zod";
import { MAX_STANDARD_UPLOAD_BYTES } from "@/lib/constants/upload-limits";
import { extractTextFromBuffer, inferMimeFromName } from "@/lib/services/extract-document-text";
import { requireTryoutAuth } from "@/lib/tryout/auth";
import {
  tryoutCsrfGuard,
  tryoutError,
  tryoutJson,
  tryoutPreflight,
} from "@/lib/tryout/route-helpers";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
];

const MIN_JD_CHARS = 50;

export async function OPTIONS(request: NextRequest) {
  return tryoutPreflight(request) ?? tryoutJson(request, {}, 204);
}

export async function POST(request: NextRequest) {
  const preflight = tryoutPreflight(request);
  if (preflight) return preflight;
  const csrf = tryoutCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { error } = await requireTryoutAuth(request);
    if (error) return error;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return tryoutError(request, "Upload a PDF, Word, or text job description file.", 400);
    }
    if (file.size > MAX_STANDARD_UPLOAD_BYTES) {
      return tryoutError(request, "File too large. Maximum size is 10 MB.", 400);
    }

    const effectiveType = (file.type && file.type.trim()) || inferMimeFromName(file.name) || "";
    if (!ALLOWED_TYPES.includes(effectiveType)) {
      return tryoutError(request, "Invalid file type. Use PDF, DOCX, DOC, or TXT.", 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!buffer.length) return tryoutError(request, "File is empty", 400);

    let jdText: string;
    try {
      jdText = (await extractTextFromBuffer(buffer, effectiveType, file.name)).trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return tryoutError(request, msg, 422);
    }

    const parsed = z.string().min(MIN_JD_CHARS).safeParse(jdText);
    if (!parsed.success) {
      return tryoutError(
        request,
        `Could not extract enough job description text (need at least ${MIN_JD_CHARS} characters). Try pasting the JD instead.`,
        422,
      );
    }

    return tryoutJson(request, {
      jd_text: parsed.data,
      file_name: file.name,
      character_count: parsed.data.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return tryoutError(request, msg, 502);
  }
}
