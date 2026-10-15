# UI Testing Guide

## Overview

Comprehensive Playwright E2E tests have been created to verify tabs functionality and score display after recent fixes. These tests ensure that the UI regression issues (tabs not working, scores not returning) are properly validated.

## Test Files

### 1. `e2e/tabs-and-scores.spec.ts`

**Tabs Functionality Tests:**

- ✅ Company Jobs Tabs - visibility, clickability, filtering
- ✅ Recruiter Jobs Tabs - tab switching
- ✅ Hiring Requests Tabs - tab functionality
- ✅ Tab switching between All/Active/Closed
- ✅ Data updates when tabs change

**Scores Functionality Tests:**

- ✅ FitScore display on job detail pages
- ✅ Scores on candidate detail pages
- ✅ Candidate scores page loading
- ✅ Score API integration and error handling
- ✅ Score refresh on page visibility change
- ✅ Loading states and spinners

**Integration Tests:**

- ✅ Tabs work correctly with API calls
- ✅ Network request monitoring

### 2. `e2e/ui-regression.spec.ts`

**Regression Prevention Tests:**

- ✅ Tab state persistence during navigation
- ✅ Score data integrity (no console errors)
- ✅ Score cards render without layout issues
- ✅ Rapid tab clicking doesn't break UI
- ✅ Tab functionality with slow network
- ✅ Empty score state handling
- ✅ API error handling

## Running the Tests

### Run all UI tests:

```bash
npm run test:e2e
```

### Run specific test file:

```bash
npm run test:e2e tabs-and-scores
npm run test:e2e ui-regression
```

### Run in headed mode (see browser):

```bash
npm run test:e2e -- --headed
```

### Run specific test:

```bash
npm run test:e2e -- -g "tabs are visible and clickable"
```

### Run with UI (interactive mode):

```bash
npm run test:e2e -- --ui
```

## Test Coverage

### Tabs Coverage:

- ✅ All tab states (All, Active, Closed)
- ✅ Tab visual feedback (active state styling)
- ✅ Data filtering per tab
- ✅ Multiple tab types (Jobs, Hiring Requests)
- ✅ Rapid clicking edge cases
- ✅ Network latency handling

### Scores Coverage:

- ✅ Score display on multiple page types
- ✅ API integration
- ✅ Loading states
- ✅ Error handling
- ✅ Empty states
- ✅ Visibility change refetching
- ✅ Layout integrity

## Key Test Scenarios

### 1. Tab Functionality

- **Test**: Tabs are visible and clickable
- **Verifies**: Basic tab UI elements render correctly

- **Test**: Clicking tabs filters data correctly
- **Verifies**: API calls are made with correct parameters (status=open, status=closed)

- **Test**: Switching between tabs updates data
- **Verifies**: Cache key changes trigger refetches (fixes the regression)

### 2. Score Functionality

- **Test**: Scores load on job detail page
- **Verifies**: FitScore API integration works

- **Test**: Score API returns data without errors
- **Verifies**: No 500 errors, proper error handling

- **Test**: Scores refresh when page becomes visible
- **Verifies**: Visibility change listener works correctly

### 3. Regression Prevention

- **Test**: Rapid tab clicking doesn't break UI
- **Verifies**: State management handles rapid changes

- **Test**: Tab works with slow network
- **Verifies**: Loading states work correctly under latency

- **Test**: Handles API errors gracefully
- **Verifies**: Error boundaries and fallback UI

## Test Data Requirements

Tests use these test accounts:

- **Company Admin**: `hiring@razorpay.com` / `Demo@1234`
- **Recruiter**: `recruiter@razorpay.com` / `Demo@1234`
- **Candidate**: `rahul.dev@gmail.com` / `Demo@1234`

Ensure these accounts exist in your test database.

## Debugging Failed Tests

### View test report:

```bash
npm run test:e2e
# Opens HTML report automatically
```

### Run with trace:

```bash
npm run test:e2e -- --trace on
```

### Debug specific test:

```bash
npm run test:e2e -- --debug -g "tabs are visible"
```

### Screenshot on failure:

Screenshots are automatically saved to `test-results/` on failure.

## Continuous Integration

These tests should run in CI/CD pipeline:

- On every PR
- Before production deployment
- Nightly regression runs

## Maintenance

When adding new tab or score features:

1. Add corresponding test cases
2. Update this documentation
3. Ensure test accounts have necessary data
4. Run tests locally before committing

## Related Fixes

These tests verify the fixes made to:

- `src/lib/hooks/use-api.ts` - Fixed cache key updates when params change
- Tab state management - Ensures tabs trigger proper refetches
- Score API integration - Verifies scores load correctly
