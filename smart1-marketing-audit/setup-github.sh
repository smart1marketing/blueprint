#!/usr/bin/env bash
# One-time push of this project to a new GitHub repository.
# Usage:  ./setup-github.sh https://github.com/YOUR-ORG/smart1-marketing-audit.git
set -e

REMOTE="$1"
if [ -z "$REMOTE" ]; then
  echo "Usage: ./setup-github.sh <git-remote-url>"
  exit 1
fi

if [ -f .env ]; then
  echo "Warning: .env exists locally. It is gitignored and will not be pushed."
fi

git init
git add .
git commit -m "Marketing Efficiency Audit: questionnaire, calculator, OpenAI findings"
git branch -M main
git remote add origin "$REMOTE"
git push -u origin main

echo
echo "Pushed. Next: Render -> New -> Blueprint -> select this repo -> Apply."
echo "Then add OPENAI_API_KEY under the service's Environment tab."
