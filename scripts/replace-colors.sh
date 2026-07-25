#!/bin/bash
# Script to replace hardcoded #7b1113 colors with Tailwind theme classes
# Usage: bash replace-colors.sh

FILES=$(grep -rl "7b1113\|6a0f11\|5a0c0e\|8b2123" src/components/ 2>/dev/null | sort)

echo "Processing $(echo "$FILES" | wc -l) files..."

for f in $FILES; do
  echo "  $f"

  # Hover states (must come before non-hover)
  sed -i 's/hover:bg-\[#6a0f11\]/hover:bg-primary-dark/g' "$f"
  sed -i 's/hover:bg-\[#5a0c0e\]/hover:bg-primary-dark/g' "$f"
  sed -i 's/hover:bg-\[#8b2123\]/hover:bg-primary-dark/g' "$f"
  sed -i 's/hover:bg-\[#9f3a3c\]/hover:bg-primary-light/g' "$f"

  # Active/selected states with #5a0c0e
  sed -i 's/border-\[#5a0c0e\]/border-primary-dark/g' "$f"

  # Opacity variants (must come before non-opacity)
  sed -i 's/shadow-\[#7b1113\]\/30/shadow-primary\/30/g' "$f"
  sed -i 's/shadow-\[#7b1113\]\/20/shadow-primary\/20/g' "$f"
  sed -i 's/bg-\[#7b1113\]\/40/bg-primary\/40/g' "$f"
  sed -i 's/bg-\[#7b1113\]\/20/bg-primary\/20/g' "$f"
  sed -i 's/bg-\[#7b1113\]\/10/bg-primary\/10/g' "$f"
  sed -i 's/from-\[#7b1113\]/from-primary/g' "$f"
  sed -i 's/via-\[#7b1113\]/via-primary/g' "$f"
  sed -i 's/to-\[#7b1113\]/to-primary/g' "$f"

  # Focus variants
  sed -i 's/focus:ring-\[#7b1113\]\/50/focus:ring-primary\/50/g' "$f"
  sed -i 's/focus:ring-\[#7b1113\]\/20/focus:ring-primary\/20/g' "$f"
  sed -i 's/focus:ring-\[#7b1113\]\/10/focus:ring-primary\/10/g' "$f"
  sed -i 's/focus:border-\[#7b1113\]/focus:border-primary/g' "$f"

  # focus-within
  sed -i 's/focus-within:border-\[#7b1113\]/focus-within:border-primary/g' "$f"
  sed -i 's/focus-within:ring-\[#7b1113\]/focus-within:ring-primary/g' "$f"

  # Standard color utilities
  sed -i 's/bg-\[#7b1113\]/bg-primary/g' "$f"
  sed -i 's/text-\[#7b1113\]/text-primary/g' "$f"
  sed -i 's/border-\[#7b1113\]/border-primary/g' "$f"
  sed -i 's/fill-\[#7b1113\]/fill-primary/g' "$f"
  sed -i 's/ring-\[#7b1113\]/ring-primary/g' "$f"

  # Group hover
  sed -i 's/group-hover:text-\[#7b1113\]/group-hover:text-primary/g' "$f"
  sed -i 's/group-hover:bg-\[#7b1113\]/group-hover:bg-primary/g' "$f"

  # hover variants (without opacity)
  sed -i 's/hover:border-\[#7b1113\]/hover:border-primary/g' "$f"
  sed -i 's/hover:text-\[#7b1113\]/hover:text-primary/g' "$f"
  sed -i 's/hover:bg-\[#7b1113\]/hover:bg-primary/g' "$f"

  # Inline CSS in map component and others
  sed -i "s/'#7b1113'/'var(--color-primary)'/g" "$f"
  sed -i "s/\"#7b1113\"/'var(--color-primary)'/g" "$f"

  echo "  ✓ Done"
done

echo ""
echo "All files processed!"