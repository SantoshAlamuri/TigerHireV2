# How to Compress PDF Files for Upload

## Problem

You're seeing the error: **"File(s) too large: [filename]. Maximum size is 4 MB per file."**

This happens because the upload system has a 4MB limit per file to ensure fast processing and avoid timeouts.

## Quick Solutions

### Option 1: Online PDF Compressors (Easiest)

1. **SmallPDF** (Recommended)
   - Go to: https://smallpdf.com/compress-pdf
   - Upload your PDF
   - Click "Compress PDF"
   - Download the compressed version
   - Usually reduces size by 50-70%

2. **ILovePDF**
   - Go to: https://www.ilovepdf.com/compress-pdf
   - Upload and compress
   - Download the result

3. **PDF24**
   - Go to: https://tools.pdf24.org/en/compress-pdf
   - Upload and compress
   - Download

### Option 2: Adobe Acrobat (If You Have It)

1. Open the PDF in Adobe Acrobat
2. Go to **File → Reduce File Size**
3. Choose compression level (usually "Medium" works well)
4. Save the file

### Option 3: Command Line (For Developers)

If you have Ghostscript installed:

```bash
gs -sDEVICE=pdfwrite \
   -dCompatibilityLevel=1.4 \
   -dPDFSETTINGS=/ebook \
   -dNOPAUSE \
   -dQUIET \
   -dBATCH \
   -sOutputFile=compressed.pdf \
   original.pdf
```

### Option 4: Remove Images (If PDF Has Many Images)

1. Open PDF in Adobe Acrobat or similar tool
2. Remove or compress images
3. Save the file

## Why 4MB Limit?

- **Vercel body limit**: 4.5MB (we use 4MB for safety)
- **Processing speed**: Larger files take longer to parse and score
- **Timeout prevention**: Keeps uploads fast and reliable

## Tips for Best Compression

1. **Remove unnecessary images**: If your resume has logos or photos, consider removing them
2. **Use standard fonts**: Custom fonts can increase file size
3. **Compress images**: If you must include images, compress them first
4. **Remove metadata**: Some PDFs have large metadata that can be removed

## After Compression

1. Check the file size (should be under 4MB)
2. Try uploading again
3. The upload should work successfully

## Still Having Issues?

If your PDF is still too large after compression:

- Split into multiple pages if possible
- Remove any embedded media
- Consider converting to a Word document (.docx) which often compresses better
