#!/bin/bash
# TigerHire — idibu webhook mock test
# Run against dev preview after migration 20260520120000_idibu_integration is applied.
#
# Usage:
#   export WEBHOOK_URL="https://your-dev-preview.vercel.app/api/webhooks/idibu"
#   export WEBHOOK_SECRET="your-idibu-webhook-secret-from-env"
#   export JOB_ID="861e8c58-9c72-4c46-8534-a02207a35cbc"
#   ./scripts/test-idibu-webhook.sh

set -euo pipefail

WEBHOOK_URL="${WEBHOOK_URL:-https://your-dev-preview.vercel.app/api/webhooks/idibu}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-your-idibu-webhook-secret-from-env}"
JOB_ID="${JOB_ID:-861e8c58-9c72-4c46-8534-a02207a35cbc}"

if [[ "$WEBHOOK_URL" == *"your-dev-preview"* ]] || [[ "$WEBHOOK_SECRET" == *"your-idibu"* ]]; then
  echo "Set WEBHOOK_URL, WEBHOOK_SECRET, and optionally JOB_ID before running." >&2
  exit 1
fi

# ─────────────────────────────────────────────
# TEST 1: Happy path — candidate with CV
# ─────────────────────────────────────────────
echo "=== TEST 1: Happy path ==="
curl -s -w "\nHTTP %{http_code}\n" \
  -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Idibu-Event: candidate.create" \
  -H "x-idibu-webhook-secret: $WEBHOOK_SECRET" \
  -d '{
  "payload": {
    "id": "mock-idibu-001",
    "firstname": "Test",
    "lastname": "Candidate",
    "comms_status": "applied",
    "email": "test.idibu.candidate@example.com",
    "background_info": "",
    "created_by": {
      "id": "1",
      "profile_id": "1",
      "email": "recruiter@enate.com",
      "firstname": "Santosh",
      "lastname": "TigerHire",
      "group": { "id": "1", "label": "Default" },
      "subgroup": { "id": "1", "parent_id": "1", "label": "Default" }
    },
    "creation_date": "2026-05-20T14:00:00+05:30",
    "source": "Indeed",
    "vacancies": [
      {
        "id": "idibu-vac-123",
        "reference": "'"$JOB_ID"'",
        "title": "QA Engineer",
        "status": {
          "id": "1",
          "type": "default",
          "label": "Added"
        }
      }
    ],
    "attachments": [
      {
        "file_id": "mock-file-001",
        "filename": "Test_Candidate_CV.pdf",
        "file_link": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        "type": "cv_doc"
      }
    ],
    "custom_fields": [
      { "value": "3 years", "name": "Total Experience" },
      { "value": "Yes", "name": "Right to work in India?" }
    ]
  },
  "payload-information": {
    "timestamp": "2026-05-20T14:00:05+05:30",
    "webhook_event": "candidate.create"
  }
}'

echo ""
echo "→ Check: candidates table for test.idibu.candidate@example.com"
echo "→ Check: applications table for source = 'idibu:Indeed'"
echo "→ Check: fit_scores table for a new row against job $JOB_ID"
echo ""

sleep 5

# ─────────────────────────────────────────────
# TEST 2: Duplicate — same email, same job
# ─────────────────────────────────────────────
echo "=== TEST 2: Duplicate (should skip) ==="
curl -s -w "\nHTTP %{http_code}\n" \
  -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Idibu-Event: candidate.create" \
  -H "x-idibu-webhook-secret: $WEBHOOK_SECRET" \
  -d '{
  "payload": {
    "id": "mock-idibu-002",
    "firstname": "Test",
    "lastname": "Candidate",
    "email": "test.idibu.candidate@example.com",
    "source": "Indeed",
    "vacancies": [{ "id": "idibu-vac-123", "reference": "'"$JOB_ID"'", "title": "QA Engineer", "status": { "id": "1", "type": "default", "label": "Added" } }],
    "attachments": [{ "file_id": "mock-file-002", "filename": "Test_CV.pdf", "file_link": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", "type": "cv_doc" }],
    "custom_fields": [],
    "created_by": { "id": "1", "profile_id": "1", "email": "r@e.com", "firstname": "S", "lastname": "T", "group": { "id": "1", "label": "D" }, "subgroup": { "id": "1", "parent_id": "1", "label": "D" } },
    "creation_date": "2026-05-20T14:05:00+05:30",
    "comms_status": "applied",
    "background_info": ""
  },
  "payload-information": { "timestamp": "2026-05-20T14:05:05+05:30", "webhook_event": "candidate.create" }
}'

echo ""
echo "→ Check: NO second candidate or application created"
echo ""

sleep 2

# ─────────────────────────────────────────────
# TEST 3: Bad vacancy — unknown job ID
# ─────────────────────────────────────────────
echo "=== TEST 3: Unknown job → dead letter ==="
curl -s -w "\nHTTP %{http_code}\n" \
  -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Idibu-Event: candidate.create" \
  -H "x-idibu-webhook-secret: $WEBHOOK_SECRET" \
  -d '{
  "payload": {
    "id": "mock-idibu-003",
    "firstname": "Lost",
    "lastname": "Candidate",
    "email": "lost.candidate@example.com",
    "source": "Foundit",
    "vacancies": [{ "id": "idibu-vac-999", "reference": "00000000-0000-0000-0000-000000000000", "title": "Fake Job", "status": { "id": "1", "type": "default", "label": "Added" } }],
    "attachments": [{ "file_id": "mock-file-003", "filename": "Lost_CV.pdf", "file_link": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", "type": "cv_doc" }],
    "custom_fields": [],
    "created_by": { "id": "1", "profile_id": "1", "email": "r@e.com", "firstname": "S", "lastname": "T", "group": { "id": "1", "label": "D" }, "subgroup": { "id": "1", "parent_id": "1", "label": "D" } },
    "creation_date": "2026-05-20T14:10:00+05:30",
    "comms_status": "applied",
    "background_info": ""
  },
  "payload-information": { "timestamp": "2026-05-20T14:10:05+05:30", "webhook_event": "candidate.create" }
}'

echo ""
echo "→ Check: idibu_dead_letter table has a row with error_reason = job_not_found"
echo "→ Check: NO candidate created for lost.candidate@example.com"
echo ""

sleep 2

# ─────────────────────────────────────────────
# TEST 4: No CV attachment
# ─────────────────────────────────────────────
echo "=== TEST 4: No CV → pending_cv ==="
curl -s -w "\nHTTP %{http_code}\n" \
  -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Idibu-Event: candidate.create" \
  -H "x-idibu-webhook-secret: $WEBHOOK_SECRET" \
  -d '{
  "payload": {
    "id": "mock-idibu-004",
    "firstname": "NoCv",
    "lastname": "Person",
    "email": "nocv.person@example.com",
    "source": "LinkedIn",
    "vacancies": [{ "id": "idibu-vac-123", "reference": "'"$JOB_ID"'", "title": "QA Engineer", "status": { "id": "1", "type": "default", "label": "Added" } }],
    "attachments": [],
    "custom_fields": [],
    "created_by": { "id": "1", "profile_id": "1", "email": "r@e.com", "firstname": "S", "lastname": "T", "group": { "id": "1", "label": "D" }, "subgroup": { "id": "1", "parent_id": "1", "label": "D" } },
    "creation_date": "2026-05-20T14:15:00+05:30",
    "comms_status": "applied",
    "background_info": ""
  },
  "payload-information": { "timestamp": "2026-05-20T14:15:05+05:30", "webhook_event": "candidate.create" }
}'

echo ""
echo "→ Check: candidate created with processing_status = 'pending_cv'"
echo "→ Check: NO fit_scores row (scoring skipped without CV)"
echo ""

sleep 2

# ─────────────────────────────────────────────
# TEST 5: Bad secret → 401
# ─────────────────────────────────────────────
echo "=== TEST 5: Wrong secret → 401 ==="
curl -s -w "\nHTTP %{http_code}\n" \
  -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Idibu-Event: candidate.create" \
  -H "x-idibu-webhook-secret: wrong-secret-value" \
  -d '{
  "payload": {
    "id": "mock-idibu-005",
    "firstname": "Hacker",
    "lastname": "McHackface",
    "email": "hacker@evil.com",
    "source": "Evil Board"
  },
  "payload-information": { "timestamp": "2026-05-20T14:20:00+05:30", "webhook_event": "candidate.create" }
}'

echo ""
echo "→ Check: HTTP 401 returned, nothing created in any table"
echo ""

# ─────────────────────────────────────────────
# VERIFICATION QUERIES
# ─────────────────────────────────────────────
echo "========================================="
echo "Run these in Supabase SQL editor to verify:"
echo "========================================="
echo ""
echo "-- Test 1: candidate + application + score"
echo "SELECT c.full_name, c.email, c.entry_path, c.source_detail, c.external_id, a.source AS app_source, a.apply_method"
echo "FROM candidates c"
echo "LEFT JOIN applications a ON a.candidate_id = c.id AND a.job_id = '$JOB_ID'"
echo "WHERE c.email = 'test.idibu.candidate@example.com';"
echo ""
echo "SELECT candidate_id, job_id, overall_score, scoring_status"
echo "FROM fit_scores"
echo "WHERE candidate_id IN (SELECT id FROM candidates WHERE email = 'test.idibu.candidate@example.com')"
echo "  AND superseded_at IS NULL;"
echo ""
echo "-- Test 3: dead letter"
echo "SELECT id, error_reason, created_at FROM idibu_dead_letter ORDER BY created_at DESC LIMIT 5;"
echo ""
echo "-- Test 4: pending_cv"
echo "SELECT full_name, email, processing_status FROM candidates WHERE email = 'nocv.person@example.com';"
echo ""
echo "-- Cost tracking"
echo "SELECT provider, service, external_id, job_id, candidate_id, metadata, created_at"
echo "FROM platform_cost_events"
echo "WHERE service = 'idibu_webhook'"
echo "ORDER BY created_at DESC LIMIT 5;"
echo ""
echo "-- CLEANUP after testing (review before running)"
echo "-- DELETE FROM applications WHERE candidate_id IN (SELECT id FROM candidates WHERE email IN ('test.idibu.candidate@example.com', 'nocv.person@example.com'));"
echo "-- DELETE FROM candidates WHERE email IN ('test.idibu.candidate@example.com', 'nocv.person@example.com');"
echo "-- DELETE FROM idibu_dead_letter WHERE payload_json->'payload'->>'id' LIKE 'mock-idibu-%';"
