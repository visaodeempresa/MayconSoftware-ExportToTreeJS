#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# rescue-zip.sh — Copia o ZIP exportado pelo plugin do container
# sandbox do SweetHome3D para o Desktop (ou destino informado).
#
# Uso:
#   ./rescue-zip.sh                     # copia o mais recente para ~/Desktop
#   ./rescue-zip.sh ~/Downloads         # copia para ~/Downloads
#   ./rescue-zip.sh /minha/pasta        # copia para pasta específica
# ─────────────────────────────────────────────────────────────────
set -e

CONTAINER_DATA="$HOME/Library/Containers/com.eteks.sweethome3d.SweetHome3D/Data"
DEST="${1:-$HOME/Desktop}"

if [ ! -d "$CONTAINER_DATA" ]; then
    echo "❌ Container do SweetHome3D não encontrado em:"
    echo "   $CONTAINER_DATA"
    echo ""
    echo "   O SweetHome3D pode não estar instalado via App Store,"
    echo "   ou o container pode ter outro nome."
    echo "   Tente: ls ~/Library/Containers/ | grep -i sweet"
    exit 1
fi

# Encontra todos os ZIPs exportados pelo plugin
ZIPS=$(find "$CONTAINER_DATA" -maxdepth 1 -name "*_threejs.zip" -type f 2>/dev/null | sort -t/ -k9)

if [ -z "$ZIPS" ]; then
    echo "❌ Nenhum arquivo *_threejs.zip encontrado em:"
    echo "   $CONTAINER_DATA"
    echo ""
    echo "   Certifique-se de ter exportado pelo plugin antes."
    exit 1
fi

COUNT=$(echo "$ZIPS" | wc -l | tr -d ' ')
echo "📦 Encontrado(s) $COUNT ZIP(s) no container:"
echo ""

i=1
while IFS= read -r f; do
    SIZE=$(du -h "$f" | cut -f1 | tr -d ' ')
    DATE=$(stat -f "%Sm" -t "%d/%m/%Y %H:%M" "$f")
    NAME=$(basename "$f")
    echo "  [$i] $NAME  ($SIZE, $DATE)"
    i=$((i + 1))
done <<< "$ZIPS"

echo ""

if [ "$COUNT" -eq 1 ]; then
    SELECTED="$ZIPS"
else
    read -p "Qual copiar? (número, ou ENTER para o mais recente): " CHOICE
    if [ -z "$CHOICE" ]; then
        SELECTED=$(echo "$ZIPS" | tail -1)
    else
        SELECTED=$(echo "$ZIPS" | sed -n "${CHOICE}p")
        if [ -z "$SELECTED" ]; then
            echo "❌ Opção inválida."
            exit 1
        fi
    fi
fi

BASENAME=$(basename "$SELECTED")
mkdir -p "$DEST"
cp "$SELECTED" "$DEST/$BASENAME"

echo ""
echo "✅ Copiado para: $DEST/$BASENAME"
echo ""
echo "Para rodar:"
echo "  cd $DEST"
echo "  unzip $BASENAME"
echo "  cd ${BASENAME%.zip}"
echo "  npm install"
echo "  npm run dev"
echo "  # Abra http://localhost:5183"
