# Jooble Integration Checklist

This checklist guides you through integrating TigerHire with Jooble via XML feed.

## Prerequisites

- ✅ XML feed is live at: `https://tigerhire.io/api/jobs/feed.xml`
- ✅ Feed returns valid XML with job data
- ✅ Feed is publicly accessible (no authentication required)
- ✅ Feed includes all required fields (title, company, location, description, apply_url)

## Step-by-Step Process

### 1. Verify XML Feed

**Test the feed:**

```bash
curl https://tigerhire.io/api/jobs/feed.xml
```

**Expected response:**

- Status: 200 OK
- Content-Type: application/xml
- Valid XML structure with `<jobs>` root and `<job>` elements

**Verify feed contains:**

- [ ] Job IDs
- [ ] Job titles
- [ ] Company names
- [ ] Locations
- [ ] Descriptions
- [ ] Apply URLs
- [ ] Posted dates
- [ ] Salary information (if available)

### 2. Prepare Support Ticket Information

**Information to include:**

- **Company Name:** TigerHire
- **Contact Email:** [Your support email]
- **Integration Purpose:** ATS Integration - Job Posting
- **XML Feed URL:** `https://tigerhire.io/api/jobs/feed.xml`
- **Feed Format:** XML (already formatted for Jooble)
- **Update Frequency:** Real-time (feed updates when jobs are posted/closed)
- **Expected Volume:** [Estimate number of jobs per month]

### 3. Submit Support Ticket

**Where:** [Jooble Help Center](https://jooblehelpcenter.freshdesk.com/en/support/tickets/new)

**Ticket Template:**

```
Subject: ATS Integration Request - XML Feed for Job Posting

Hello Jooble Team,

We would like to integrate TigerHire with Jooble to automatically post our job vacancies.

Company Details:
- Company Name: TigerHire
- Website: https://tigerhire.io
- Contact Email: [your-email]

Integration Details:
- XML Feed URL: https://tigerhire.io/api/jobs/feed.xml
- Feed Format: XML
- Update Frequency: Real-time (feed updates automatically)
- Expected Job Volume: [X] jobs per month

We have attached our XML feed for review. The feed includes:
- Job titles, descriptions, locations
- Company names
- Apply URLs
- Salary information (when available)
- Job posting dates

We would like to:
1. Post jobs automatically via the XML feed
2. Receive candidate applications back to our ATS

Please let us know if you need any additional information or if there are any specific requirements for the feed format.

Thank you,
[Your Name]
[Your Title]
TigerHire
```

### 4. Follow Up

**Timeline:**

- Initial response: 2-5 business days
- Review period: 1-2 weeks
- Setup completion: 2-3 weeks total

**What to expect:**

- Jooble will review your XML feed format
- They may request adjustments to the feed structure
- Once approved, they'll start pulling jobs automatically
- You'll receive confirmation when integration is live

### 5. Verify Integration

**After setup is complete:**

- [ ] Jobs appear on Jooble within 24-48 hours of posting
- [ ] Job details match TigerHire listings
- [ ] Apply URLs work correctly
- [ ] Applications are routed back to TigerHire (if configured)
- [ ] Closed jobs are removed from Jooble

**Monitoring:**

- Check Jooble regularly for first few weeks
- Monitor application flow
- Report any issues to Jooble support

## Troubleshooting

### Feed Not Accessible

- **Issue:** Jooble can't access the feed
- **Solution:** Verify feed URL is publicly accessible, check CORS headers if needed

### Jobs Not Appearing

- **Issue:** Jobs posted but not showing on Jooble
- **Solution:**
  - Verify feed contains active jobs
  - Check feed XML format matches Jooble requirements
  - Contact Jooble support with feed URL

### Format Issues

- **Issue:** Jooble requests feed format changes
- **Solution:** Update `src/app/api/jobs/feed.xml/route.ts` to match their requirements

### Application Routing

- **Issue:** Applications not coming back to TigerHire
- **Solution:** Work with Jooble support to configure webhook/API callback

## Notes

- Jooble pulls from the feed on a schedule (typically daily or more frequently)
- Feed is cached for 1 hour, so updates may take up to 1 hour to appear
- Ensure feed always returns valid XML (even with 0 jobs)
- Keep feed URL stable - changing it requires re-submission to Jooble

## Support Contacts

- **Jooble Help Center:** https://jooblehelpcenter.freshdesk.com/
- **Jooble Partner Page:** https://jooble.org/partner/for-publishers
