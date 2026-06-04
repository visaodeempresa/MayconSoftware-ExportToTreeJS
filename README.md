# MayconSoftware – Export to Three.js

SweetHome3D plugin that exports floor plan data (rooms, walls, doors, windows) as a JSON file for Three.js 3D visualization.

The output JSON is designed to be directly consumed by the [apartment-floorplan-3d](https://github.com/visaodeempresa/apartment-floorplan-3d) Three.js project.

## Installation

1. Download `MayconSoftware-ExportToTreeJS.sh3p` from the [Releases](../../releases) page.
2. In SweetHome3D, go to **Furniture → Import plugin…** (or drag-and-drop the `.sh3p` file onto the SweetHome3D window).
3. Restart SweetHome3D.

## Usage

1. Open a floor plan in SweetHome3D.
2. Go to **Tools → Export to Three.js**.
3. Choose a location and filename for the JSON output.
4. Click **Save**.

The plugin exports all rooms, walls, and doors/windows from the current home.

## JSON Output Format

All measurements are in **meters**. Coordinates are transformed from SweetHome3D's coordinate system to Three.js:

| SweetHome3D | Three.js | Direction |
|-------------|----------|-----------|
| x           | x        | East      |
| y           | z        | South     |
| z           | y        | Up        |

An origin offset is applied so that the bounding box starts near `(0, 0)`.

### Structure

```json
{
  "meta": {
    "source": "filename.sh3d",
    "exportPlugin": "MayconSoftware-ExportToTreeJS",
    "exportVersion": "0.0.1",
    "origin_cm": { "x": 88.008, "y": 131.051 },
    "total_m": { "width": 12.648, "depth": 5.536 },
    "wallHeight_m": 2.43,
    "floorThickness_m": 0.12,
    "wallThickness_default_m": 0.05,
    "note": "Exported by MayconSoftware-ExportToTreeJS plugin. Units: meters."
  },
  "rooms": [
    {
      "name": "Room Name",
      "floorColor_hex": "#1a3c8f",
      "polygon_m": [[x1, z1], [x2, z2], ...],
      "bbox": {
        "origin": { "x": 0.0, "z": 0.0 },
        "size": { "x": 5.0, "z": 4.0 }
      }
    }
  ],
  "walls": [
    {
      "id": "6aa24b78",
      "from": { "x": 5.069, "z": 0.081 },
      "to": { "x": 7.516, "z": 0.083 },
      "t": 0.05,
      "h": 2.43,
      "L": 2.447
    }
  ],
  "doors_windows": [
    {
      "name": "Front Door",
      "kind": "door",
      "center": { "x": 3.5, "z": 5.0 },
      "angle_deg": 270.2,
      "width_m": 0.782,
      "height_m": 2.085,
      "elevation_m": 0.0
    }
  ]
}
```

### Fields

#### `meta`
| Field | Description |
|-------|-------------|
| `source` | Original SH3D filename |
| `exportPlugin` | Plugin identifier |
| `exportVersion` | Plugin version |
| `origin_cm` | Bounding box origin in SH3D coordinates (cm) |
| `total_m` | Total floor plan dimensions in meters |
| `wallHeight_m` | Default wall height from the home |
| `floorThickness_m` | Floor slab thickness (fixed 0.12 m) |
| `wallThickness_default_m` | Most common wall thickness |

#### `rooms[]`
| Field | Description |
|-------|-------------|
| `name` | Room name as set in SweetHome3D |
| `floorColor_hex` | Floor color in `#RRGGBB` hex |
| `polygon_m` | Array of `[x, z]` vertices forming the room polygon (meters) |
| `bbox` | Axis-aligned bounding box with `origin` and `size` |

#### `walls[]`
| Field | Description |
|-------|-------------|
| `id` | Wall identifier (hashcode hex) |
| `from` / `to` | Start and end coordinates `{x, z}` in meters |
| `t` | Wall thickness in meters |
| `h` | Wall height in meters |
| `L` | Wall length in meters |

#### `doors_windows[]`
| Field | Description |
|-------|-------------|
| `name` | Name from SweetHome3D catalog |
| `kind` | `"door"` or `"window"` |
| `center` | Center position `{x, z}` in meters |
| `angle_deg` | Rotation angle in degrees |
| `width_m` | Opening width |
| `height_m` | Opening height |
| `elevation_m` | Bottom elevation above floor (0 for doors) |

## Building from Source

### Prerequisites

- Java JDK 8 or higher
- Apache Ant
- SweetHome3D.jar in the `lib/` directory

### Get SweetHome3D.jar

```bash
mkdir -p lib
wget 'https://sourceforge.net/projects/sweethome3d/files/SweetHome3D/SweetHome3D-7.5/SweetHome3D-7.5.jar/download' \
  -O lib/SweetHome3D.jar
```

### Build

```bash
ant build
```

The plugin file will be at `dist/MayconSoftware-ExportToTreeJS.sh3p`.

## Requirements

- SweetHome3D 6.0 or higher
- Java 8 or higher

## License

MIT License — see [LICENSE](LICENSE) for details.

## Author

**MayconSoftware** — [visaodeempresa@gmail.com](mailto:visaodeempresa@gmail.com)
