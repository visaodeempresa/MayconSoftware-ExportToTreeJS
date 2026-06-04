#!/bin/bash
# Downloads SweetHome3D.jar needed for compiling the plugin.
# Run this script before building with: ./download-sweethome3d.sh

set -e

DEST="lib/SweetHome3D.jar"
URL="https://sourceforge.net/projects/sweethome3d/files/SweetHome3D/SweetHome3D-7.5/SweetHome3D-7.5.jar/download"

if [ -f "$DEST" ]; then
    echo "✓ $DEST already exists, skipping download."
    exit 0
fi

mkdir -p lib
echo "Downloading SweetHome3D.jar..."
curl -L -o "$DEST" "$URL"
echo "✓ Downloaded to $DEST"
