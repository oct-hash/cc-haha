#!/bin/bash
# Pre-commit hook - runs before git commit

set -e

echo "Running pre-commit checks..."

# Check for console.log
if git diff --cached | grep -q "console\.log"; then
  echo "❌ Found console.log in staged changes"
  exit 1
fi

# Check for debugger statements
if git diff --cached | grep -q "debugger"; then
  echo "❌ Found debugger statement"
  exit 1
fi

# Check for TODO without author
if git diff --cached | grep -qE "^\+.*TODO"; then
  echo "⚠️  Found TODO (consider adding your name)"
fi

echo "✅ Pre-commit checks passed"
