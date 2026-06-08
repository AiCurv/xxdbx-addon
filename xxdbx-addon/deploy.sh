#!/bin/bash
# Deploy xxdbx-addon V9 to Vercel
# Run this script after authenticating with `npx vercel login`

set -e

echo "🚀 Deploying xxdbx-addon V9.0.0 to Vercel..."
echo ""

# Check if vercel CLI is available
if ! command -v vercel &> /dev/null; then
    echo "Installing Vercel CLI..."
    npm install -g vercel
fi

# Check if logged in
if ! vercel whoami &> /dev/null; then
    echo "❌ Not logged in to Vercel. Running login..."
    vercel login
fi

# Deploy to production
echo "Deploying to production..."
vercel --prod --yes

echo ""
echo "✅ Deployed! Test at: https://xxdbx-addon.vercel.app/manifest.json"
echo "   Should show version 9.0.0"
