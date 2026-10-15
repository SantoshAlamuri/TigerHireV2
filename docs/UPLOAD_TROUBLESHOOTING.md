# Upload Troubleshooting Guide

This document helps diagnose why uploads are failing in the agency upload-profile endpoint.

## Common Failure Points

### 1. File Size Issues (413 Error or "File too large" message)

**Symptoms:**

- `413 Payload Too Large` error
- `File(s) too large: [filename]. Maximum size is 4 MB per file.`

**Causes:**

- File exceeds 4MB limit (Vercel's 4.5MB body limit)
- Multiple files in bulk upload exceed total size
- PDF contains high-resolution images or embedded fonts

**Solutions:**

- ✅ Client-side validation now prevents files > 4MB
- **Compress PDFs before upload:**
  - Use online tools: [SmallPDF](https://smallpdf.com/compress-pdf), [ILovePDF](https://www.ilovepdf.com/compress-pdf), or [PDF24](https://tools.pdf24.org/en/compress-pdf)
  - Use Adobe Acrobat: File → Reduce File Size
  - Use command line: `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile=compressed.pdf original.pdf`
- Remove images or reduce image quality in the PDF
- Use smaller files or split bulk uploads
- For very large files, consider splitting into multiple uploads

### 2. Timeout Issues (504 Error)

**Symptoms:** `504 Gateway Timeout` error

**Causes:**

- AI processing (CV parsing + scoring) takes > 60 seconds
- Large files take too long to process
- Network latency to Supabase/Anthropic

**Solutions:**

- ✅ Route has `maxDuration = 60` configured
- Use bulk upload endpoint (saves without processing, processes later)
- Check Anthropic API response times
- Consider async processing for large files

### 3. Storage Bucket Issues

**Symptoms:** Upload succeeds but file not saved, or storage errors

**Causes:**

- `candidate-cvs` bucket doesn't exist in Supabase Storage
- Bucket permissions not configured correctly
- Storage quota exceeded

**Check:**

```sql
-- In Supabase SQL Editor
SELECT name, public FROM storage.buckets WHERE name = 'candidate-cvs';
```

**Fix:**

1. Go to Supabase Dashboard → Storage
2. Create bucket `candidate-cvs` if missing
3. Set to public or configure RLS policies
4. Ensure service role has write access

### 4. Database Errors

**Symptoms:** `503 Database error while saving the profile`

**Causes:**

- Database connection issues
- Missing tables/columns
- Foreign key constraints
- Duplicate key violations

**Check:**

- Verify `candidates` table exists
- Check `applications` table structure
- Verify `agency_clients` relationship exists

### 5. Rate Limiting (429 Error)

**Symptoms:** `429 Too many uploads`

**Causes:**

- Exceeded 30 uploads per minute limit
- Bulk uploads count as multiple requests

**Solutions:**

- Wait 60 seconds before retrying
- Use bulk upload endpoint for multiple files (5 per minute limit)

### 6. Authentication/Authorization Issues

**Symptoms:** `401 Unauthorized` or `403 Forbidden`

**Causes:**

- User not logged in
- User doesn't have "agency" role
- No organisation associated with account
- Client not linked to agency

**Check:**

- Verify user has agency role
- Check `agency_clients` table for client linkage
- Verify `organisation_id` in user profile

### 7. AI/Anthropic API Issues

**Symptoms:** `503 CV parsing is not configured` or parsing timeouts

**Causes:**

- Missing `ANTHROPIC_API_KEY` environment variable
- Invalid API key
- Anthropic API rate limits
- API timeout

**Check:**

```bash
# Verify env var is set
echo $ANTHROPIC_API_KEY
```

**Fix:**

- Add `ANTHROPIC_API_KEY` to Vercel environment variables
- Verify key is valid and has credits
- Check Anthropic dashboard for rate limits

### 8. File Type/Format Issues

**Symptoms:** `400 Invalid file type` or parsing errors

**Causes:**

- File not PDF or Word format
- Corrupted file
- Image-only PDF (no text)
- Password-protected PDF

**Solutions:**

- Only upload `.pdf`, `.doc`, or `.docx` files
- Ensure PDFs have selectable text (not scanned images)
- Remove password protection from PDFs

## Diagnostic Steps

### Step 1: Check Browser Console

Look for:

- Network errors (413, 504, 500)
- Error messages in response JSON
- Failed fetch requests

### Step 2: Check Server Logs

In Vercel dashboard or Sentry:

- Look for error logs from `/api/agency/upload-profile`
- Check for specific error messages
- Note timestamps and user IDs

### Step 3: Test File Upload

1. Try a small PDF (< 1MB)
2. Try a Word document
3. Check if error is file-specific or general

### Step 4: Verify Configuration

```bash
# Check environment variables
- NEXT_PUBLIC_SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- ANTHROPIC_API_KEY
```

### Step 5: Test Storage Bucket

```sql
-- Test if bucket exists and is accessible
SELECT * FROM storage.buckets WHERE name = 'candidate-cvs';

-- Test upload (in Supabase dashboard)
-- Go to Storage → candidate-cvs → Upload file
```

## Error Response Codes

| Code | Meaning             | Action                                      |
| ---- | ------------------- | ------------------------------------------- |
| 400  | Bad Request         | Check file format, size, required fields    |
| 401  | Unauthorized        | User not logged in                          |
| 403  | Forbidden           | User lacks agency role or client not linked |
| 404  | Not Found           | Client organisation not found               |
| 413  | Payload Too Large   | File > 4MB                                  |
| 429  | Too Many Requests   | Rate limit exceeded, wait 60s               |
| 500  | Server Error        | Check logs, database, storage               |
| 503  | Service Unavailable | Check AI API, storage config, env vars      |
| 504  | Gateway Timeout     | Processing took too long, try smaller file  |

## Quick Fixes

### If uploads consistently fail:

1. **Check storage bucket exists:**
   - Supabase Dashboard → Storage → Verify `candidate-cvs` bucket

2. **Verify environment variables:**
   - Vercel Dashboard → Settings → Environment Variables
   - Ensure all required vars are set

3. **Test with minimal file:**
   - Create a simple 1-page PDF with text
   - Try uploading that first

4. **Check rate limits:**
   - Wait 60 seconds between uploads
   - Use bulk endpoint for multiple files

5. **Review error messages:**
   - Check browser console for specific error
   - Look at network tab for response body

## Still Failing?

If uploads still fail after checking all above:

1. **Check Sentry/error tracking:**
   - Look for detailed error logs
   - Check stack traces

2. **Test API directly:**

   ```bash
   curl -X POST https://your-domain.com/api/agency/upload-profile \
     -H "Cookie: your-session-cookie" \
     -F "file=@test.pdf" \
     -F "clientOrgId=your-client-id"
   ```

3. **Check database connectivity:**
   - Verify Supabase is accessible
   - Check for connection pool exhaustion

4. **Review recent changes:**
   - Check git history for recent upload-related changes
   - Verify migrations are applied

## Prevention

To prevent upload failures:

1. ✅ Client-side validation (file size, type)
2. ✅ Proper error handling in API routes
3. ✅ Timeout configuration (`maxDuration = 60`)
4. ✅ Rate limiting to prevent abuse
5. ✅ Graceful degradation (save candidate even if processing fails)

## Related Files

- `src/app/api/agency/upload-profile/route.ts` - Main upload endpoint
- `src/app/api/agency/upload-profile/bulk/route.ts` - Bulk upload endpoint
- `src/lib/agents/public-apply.ts` - Processing logic
- `src/lib/services/extract-document-text.ts` - File extraction
