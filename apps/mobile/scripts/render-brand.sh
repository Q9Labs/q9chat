#!/bin/sh
# Renders the PNGs Expo needs from the SVG sources in assets/brand. Needs rsvg-convert.
set -eu
cd "$(dirname "$0")/../assets"
render() { rsvg-convert -w "$3" -h "$3" "brand/$1.svg" -o "$2.png"; }
render icon icon 1024
render glyph splash-icon 1024
render adaptive-foreground adaptive-icon 1024
render adaptive-monochrome adaptive-monochrome 1024
render icon favicon 48
