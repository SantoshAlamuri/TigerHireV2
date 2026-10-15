#!/bin/bash

# Run UI tests and display results
echo "🚀 Starting UI Tests for Tabs and Scores..."
echo ""

# Run the tests
npm run test:e2e -- tabs-and-scores ui-regression --reporter=list

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All tests passed!"
    echo ""
    echo "📊 View detailed report:"
    echo "   npm run test:e2e -- --ui"
    echo "   or open playwright-report/index.html"
else
    echo ""
    echo "❌ Some tests failed. Check the output above for details."
    echo ""
    echo "📊 View detailed report:"
    echo "   npm run test:e2e -- --ui"
    echo "   or open playwright-report/index.html"
    exit 1
fi
