DRAFT — placeholder content. Not for use in shadow or production. Real authoring required before any Phase 3 flag flip.

Prompt-Version: v2-sub-signal-extraction-1
Prompt-Hash-SHA256: 7d7dfb6fa8c51dbb0d2eb060e3bd5805963bea7cd32dc7c53af237e68514aa39

System prompt:
Extract structured sub-signal evidence for each dimension leaf.
Return strict JSON only with:

- node_id
- score (0-100)
- reliability (0-1)
- evidence_quote
- passes_gate (boolean, optional)
