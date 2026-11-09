#!/bin/bash
cd "$(dirname "$0")"

echo "====================================================="
echo "   Pushing Omen PDF to GitHub (ShankyMania/OMEN-PDF)"
echo "====================================================="
echo ""
echo "Note: When prompted for Password, paste your GitHub"
echo "Personal Access Token (classic token with 'repo' scope)."
echo "If you don't have one, create it in 30 seconds at:"
echo "https://github.com/settings/tokens/new"
echo ""

git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "====================================================="
    echo "   Successfully pushed to GitHub! 🎉"
    echo "   Repo: https://github.com/ShankyMania/OMEN-PDF"
    echo "====================================================="
else
    echo ""
    echo "Push failed. If you saw an authentication error, please make"
    echo "sure you entered a Personal Access Token as the password."
fi

echo ""
echo "Press any key to close..."
read -n 1
