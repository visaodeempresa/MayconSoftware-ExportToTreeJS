package com.mayconsoftware.sweethome3d.plugin.exporttothreejs;

import com.eteks.sweethome3d.model.DoorOrWindow;
import com.eteks.sweethome3d.model.Home;
import com.eteks.sweethome3d.model.HomePieceOfFurniture;
import com.eteks.sweethome3d.model.Room;
import com.eteks.sweethome3d.model.Wall;
import com.eteks.sweethome3d.plugin.Plugin;
import com.eteks.sweethome3d.plugin.PluginAction;

import javax.swing.JFileChooser;
import javax.swing.JOptionPane;
import javax.swing.filechooser.FileNameExtensionFilter;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Action that exports SweetHome3D floor plan data (rooms, walls, doors, windows)
 * as a JSON file compatible with the apartment-floorplan-3d Three.js project.
 *
 * Coordinate mapping:
 *   SH3D x  → Three.js x  (east)
 *   SH3D y  → Three.js z  (south, no inversion)
 *   SH3D z  → Three.js y  (up)
 *   All values converted from cm to meters.
 */
public class ExportToThreeJSAction extends PluginAction {

    private static final String EXPORT_VERSION = "0.0.1";
    private static final double FLOOR_THICKNESS_M = 0.12;

    private final Plugin plugin;

    public ExportToThreeJSAction(Plugin plugin) {
        this.plugin = plugin;
        putPropertyValue(Property.NAME, "Export to Three.js");
        putPropertyValue(Property.MENU, "Tools");

        // Load localized properties (ExportToThreeJSAction.properties)
        setEnabled(true);
    }

    // ───────────────────────── entry point ──────────────────────────

    @Override
    public void execute() {
        Home home = this.plugin.getHome();

        // ── Collect walls ──────────────────────────────────────────
        List<Wall> walls = new ArrayList<Wall>(home.getWalls());

        // ── Compute bounding box origin from ALL wall endpoints ────
        double xMin = Double.MAX_VALUE;
        double yMin = Double.MAX_VALUE;
        double xMax = -Double.MAX_VALUE;
        double yMax = -Double.MAX_VALUE;

        for (Wall w : walls) {
            double xs = w.getXStart();
            double ys = w.getYStart();
            double xe = w.getXEnd();
            double ye = w.getYEnd();
            if (xs < xMin) xMin = xs;
            if (xe < xMin) xMin = xe;
            if (ys < yMin) yMin = ys;
            if (ye < yMin) yMin = ye;
            if (xs > xMax) xMax = xs;
            if (xe > xMax) xMax = xe;
            if (ys > yMax) yMax = ys;
            if (ye > yMax) yMax = ye;
        }

        // Also include room vertices in bounding box
        List<Room> rooms = new ArrayList<Room>(home.getRooms());
        for (Room r : rooms) {
            float[][] pts = r.getPoints();
            for (float[] pt : pts) {
                if (pt[0] < xMin) xMin = pt[0];
                if (pt[1] < yMin) yMin = pt[1];
                if (pt[0] > xMax) xMax = pt[0];
                if (pt[1] > yMax) yMax = pt[1];
            }
        }

        // If there is nothing at all, still allow export with zero origin
        if (xMin == Double.MAX_VALUE) {
            xMin = 0;
            yMin = 0;
            xMax = 0;
            yMax = 0;
        }

        final double originX = xMin; // cm
        final double originY = yMin; // cm

        // ── Collect doors & windows ────────────────────────────────
        List<HomePieceOfFurniture> doorsWindows = new ArrayList<HomePieceOfFurniture>();
        for (HomePieceOfFurniture piece : home.getFurniture()) {
            if (piece instanceof DoorOrWindow) {
                doorsWindows.add(piece);
            }
        }

        // ── File chooser ──────────────────────────────────────────
        JFileChooser chooser = new JFileChooser();
        chooser.setDialogTitle("Export to Three.js JSON");
        chooser.setFileFilter(new FileNameExtensionFilter("JSON files (*.json)", "json"));

        String homeName = home.getName();
        String suggestedName;
        if (homeName != null && !homeName.isEmpty()) {
            // Strip path and extension for a clean default name
            File f = new File(homeName);
            String base = f.getName();
            int dot = base.lastIndexOf('.');
            if (dot > 0) base = base.substring(0, dot);
            suggestedName = base + "_threejs.json";
        } else {
            suggestedName = "sweethome3d_export.json";
        }
        chooser.setSelectedFile(new File(suggestedName));

        int result = chooser.showSaveDialog(null);
        if (result != JFileChooser.APPROVE_OPTION) {
            return; // user cancelled
        }

        File outputFile = chooser.getSelectedFile();
        // Ensure .json extension
        if (!outputFile.getName().toLowerCase(Locale.ROOT).endsWith(".json")) {
            outputFile = new File(outputFile.getAbsolutePath() + ".json");
        }

        // ── Build JSON ────────────────────────────────────────────
        try {
            String json = buildJson(home, rooms, walls, doorsWindows, originX, originY, xMax, yMax);
            writeFile(outputFile, json);

            JOptionPane.showMessageDialog(null,
                    "Exported successfully to:\n" + outputFile.getAbsolutePath()
                            + "\n\nRooms: " + rooms.size()
                            + "\nWalls: " + walls.size()
                            + "\nDoors/Windows: " + doorsWindows.size(),
                    "Export to Three.js",
                    JOptionPane.INFORMATION_MESSAGE);
        } catch (IOException ex) {
            JOptionPane.showMessageDialog(null,
                    "Error writing file:\n" + ex.getMessage(),
                    "Export to Three.js – Error",
                    JOptionPane.ERROR_MESSAGE);
        }
    }

    // ───────────────────── JSON construction ───────────────────────

    private String buildJson(Home home,
                             List<Room> rooms,
                             List<Wall> walls,
                             List<HomePieceOfFurniture> doorsWindows,
                             double originX, double originY,
                             double xMax, double yMax) {

        StringBuilder sb = new StringBuilder(8192);
        String nl = "\n";

        double wallHeightCm = home.getWallHeight();
        double wallHeightM = r4(wallHeightCm / 100.0);
        double totalWidthM = r4((xMax - originX) / 100.0);
        double totalDepthM = r4((yMax - originY) / 100.0);

        // Determine default wall thickness (most common among walls)
        double defaultThicknessCm = computeDefaultThickness(walls);

        // Source name
        String source;
        String homeName = home.getName();
        if (homeName != null && !homeName.isEmpty()) {
            source = new File(homeName).getName();
        } else {
            source = "SweetHome3D Export";
        }

        // ── meta ───────────────────────────────────────────────────
        sb.append("{").append(nl);
        sb.append("  \"meta\": {").append(nl);
        sb.append("    \"source\": ").append(jsonStr(source)).append(",").append(nl);
        sb.append("    \"exportPlugin\": \"MayconSoftware-ExportToTreeJS\",").append(nl);
        sb.append("    \"exportVersion\": \"").append(EXPORT_VERSION).append("\",").append(nl);
        sb.append("    \"origin_cm\": {\"x\": ").append(r4(originX)).append(", \"y\": ").append(r4(originY)).append("},").append(nl);
        sb.append("    \"total_m\": {\"width\": ").append(totalWidthM).append(", \"depth\": ").append(totalDepthM).append("},").append(nl);
        sb.append("    \"wallHeight_m\": ").append(wallHeightM).append(",").append(nl);
        sb.append("    \"floorThickness_m\": ").append(FLOOR_THICKNESS_M).append(",").append(nl);
        sb.append("    \"wallThickness_default_m\": ").append(r4(defaultThicknessCm / 100.0)).append(",").append(nl);
        sb.append("    \"note\": \"Exported by MayconSoftware-ExportToTreeJS plugin. Units: meters.\"").append(nl);
        sb.append("  },").append(nl);

        // ── rooms ──────────────────────────────────────────────────
        sb.append("  \"rooms\": [").append(nl);
        for (int i = 0; i < rooms.size(); i++) {
            Room room = rooms.get(i);
            sb.append(buildRoomJson(room, originX, originY));
            if (i < rooms.size() - 1) sb.append(",");
            sb.append(nl);
        }
        sb.append("  ],").append(nl);

        // ── walls ──────────────────────────────────────────────────
        sb.append("  \"walls\": [").append(nl);
        for (int i = 0; i < walls.size(); i++) {
            Wall wall = walls.get(i);
            sb.append(buildWallJson(wall, originX, originY, wallHeightCm));
            if (i < walls.size() - 1) sb.append(",");
            sb.append(nl);
        }
        sb.append("  ],").append(nl);

        // ── doors_windows ──────────────────────────────────────────
        sb.append("  \"doors_windows\": [").append(nl);
        for (int i = 0; i < doorsWindows.size(); i++) {
            HomePieceOfFurniture piece = doorsWindows.get(i);
            sb.append(buildDoorWindowJson(piece, originX, originY));
            if (i < doorsWindows.size() - 1) sb.append(",");
            sb.append(nl);
        }
        sb.append("  ]").append(nl);

        sb.append("}").append(nl);
        return sb.toString();
    }

    // ── Room JSON ──────────────────────────────────────────────────

    private String buildRoomJson(Room room, double originX, double originY) {
        StringBuilder sb = new StringBuilder();
        String name = room.getName();
        if (name == null || name.isEmpty()) {
            name = "Room";
        }

        // Floor color
        Integer color = room.getFloorColor();
        String colorHex = (color != null) ? String.format("#%06x", color & 0xFFFFFF) : "#cccccc";

        // Polygon vertices (SH3D cm → meters, with origin offset)
        float[][] pts = room.getPoints();
        double polyMinX = Double.MAX_VALUE, polyMinZ = Double.MAX_VALUE;
        double polyMaxX = -Double.MAX_VALUE, polyMaxZ = -Double.MAX_VALUE;

        sb.append("    {").append("\n");
        sb.append("      \"name\": ").append(jsonStr(name)).append(",").append("\n");
        sb.append("      \"floorColor_hex\": \"").append(colorHex).append("\",").append("\n");
        sb.append("      \"polygon_m\": [").append("\n").append("        ");

        for (int i = 0; i < pts.length; i++) {
            double mx = r4((pts[i][0] - originX) / 100.0); // SH3D x → Three.js x
            double mz = r4((pts[i][1] - originY) / 100.0); // SH3D y → Three.js z

            if (mx < polyMinX) polyMinX = mx;
            if (mz < polyMinZ) polyMinZ = mz;
            if (mx > polyMaxX) polyMaxX = mx;
            if (mz > polyMaxZ) polyMaxZ = mz;

            sb.append("[").append(mx).append(", ").append(mz).append("]");
            if (i < pts.length - 1) {
                sb.append(", ");
                // Line break every 3 vertices for readability
                if ((i + 1) % 3 == 0) {
                    sb.append("\n        ");
                }
            }
        }

        sb.append("\n      ],").append("\n");

        // Bounding box
        sb.append("      \"bbox\": {").append("\n");
        sb.append("        \"origin\": {\"x\": ").append(r4(polyMinX)).append(", \"z\": ").append(r4(polyMinZ)).append("},").append("\n");
        sb.append("        \"size\": {\"x\": ").append(r4(polyMaxX - polyMinX)).append(", \"z\": ").append(r4(polyMaxZ - polyMinZ)).append("}").append("\n");
        sb.append("      }").append("\n");
        sb.append("    }");

        return sb.toString();
    }

    // ── Wall JSON ──────────────────────────────────────────────────

    private String buildWallJson(Wall wall, double originX, double originY, double defaultHeightCm) {
        StringBuilder sb = new StringBuilder();

        double xs = (wall.getXStart() - originX) / 100.0;
        double zs = (wall.getYStart() - originY) / 100.0;
        double xe = (wall.getXEnd() - originX) / 100.0;
        double ze = (wall.getYEnd() - originY) / 100.0;

        double thickness = wall.getThickness() / 100.0;

        // Wall height: use wall-specific height if set, otherwise home default
        Float wallHeight = wall.getHeight();
        double heightM;
        if (wallHeight != null && wallHeight > 0) {
            heightM = wallHeight / 100.0;
        } else {
            heightM = defaultHeightCm / 100.0;
        }

        // Euclidean length
        double dx = xe - xs;
        double dz = ze - zs;
        double length = Math.sqrt(dx * dx + dz * dz);

        String id = String.format("%08x", wall.hashCode());

        sb.append("    {");
        sb.append("\"id\":\"").append(id).append("\", ");
        sb.append("\"from\":{\"x\":").append(r4(xs)).append(",\"z\":").append(r4(zs)).append("}, ");
        sb.append("\"to\":{\"x\":").append(r4(xe)).append(",\"z\":").append(r4(ze)).append("}, ");
        sb.append("\"t\":").append(r4(thickness)).append(",");
        sb.append("\"h\":").append(r4(heightM)).append(",");
        sb.append("\"L\":").append(r4(length));
        sb.append("}");

        return sb.toString();
    }

    // ── Door / Window JSON ─────────────────────────────────────────

    private String buildDoorWindowJson(HomePieceOfFurniture piece, double originX, double originY) {
        StringBuilder sb = new StringBuilder();

        String name = piece.getName();
        if (name == null || name.isEmpty()) {
            name = "Unknown";
        }

        // Determine kind
        String kind;
        // Check name heuristic first, then catalog info
        String nameLower = name.toLowerCase(Locale.ROOT);
        if (nameLower.contains("window") || nameLower.contains("janela")) {
            kind = "window";
        } else if (nameLower.contains("door") || nameLower.contains("porta")) {
            kind = "door";
        } else {
            // Fall back: if elevation > 0 it is likely a window
            kind = (piece.getElevation() > 0) ? "window" : "door";
        }

        double cx = r4((piece.getX() - originX) / 100.0);
        double cz = r4((piece.getY() - originY) / 100.0);
        double angleDeg = r4(Math.toDegrees(piece.getAngle()));
        double widthM = r4(piece.getWidth() / 100.0);
        double heightM = r4(piece.getHeight() / 100.0);
        double elevationM = r4(piece.getElevation() / 100.0);

        sb.append("    {");
        sb.append("\"name\":").append(jsonStr(name)).append(", ");
        sb.append("\"kind\":\"").append(kind).append("\", ");
        sb.append("\"center\":{\"x\":").append(cx).append(", \"z\":").append(cz).append("}, ");
        sb.append("\"angle_deg\":").append(angleDeg).append(", ");
        sb.append("\"width_m\":").append(widthM).append(", ");
        sb.append("\"height_m\":").append(heightM).append(", ");
        sb.append("\"elevation_m\":").append(elevationM);
        sb.append("}");

        return sb.toString();
    }

    // ───────────────────── helpers ─────────────────────────────────

    /**
     * Determine the most common wall thickness among walls (in cm).
     * Falls back to 12.0 cm if no walls exist.
     */
    private double computeDefaultThickness(List<Wall> walls) {
        if (walls.isEmpty()) return 12.0;

        // Simple frequency count
        java.util.Map<Long, int[]> freq = new java.util.LinkedHashMap<Long, int[]>();
        for (Wall w : walls) {
            long key = Math.round(w.getThickness() * 1000); // avoid float precision issues
            int[] count = freq.get(key);
            if (count == null) {
                count = new int[]{0};
                freq.put(key, count);
            }
            count[0]++;
        }

        long bestKey = 0;
        int bestCount = 0;
        for (java.util.Map.Entry<Long, int[]> e : freq.entrySet()) {
            if (e.getValue()[0] > bestCount) {
                bestCount = e.getValue()[0];
                bestKey = e.getKey();
            }
        }
        return bestKey / 1000.0;
    }

    /**
     * Round a double to 4 decimal places.
     */
    private static double r4(double v) {
        return Math.round(v * 10000.0) / 10000.0;
    }

    /**
     * Escape a string for JSON (handles quotes, backslashes, control chars).
     */
    private static String jsonStr(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder(s.length() + 8);
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append('"');
        return sb.toString();
    }

    /**
     * Write content to file as UTF-8.
     */
    private static void writeFile(File file, String content) throws IOException {
        Writer writer = null;
        try {
            writer = new BufferedWriter(new OutputStreamWriter(new FileOutputStream(file), "UTF-8"));
            writer.write(content);
        } finally {
            if (writer != null) {
                try { writer.close(); } catch (IOException ignored) {}
            }
        }
    }
}
