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
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Action that exports SweetHome3D floor plan data (rooms, walls, doors, windows)
 * as a complete Vite + Three.js project inside a ZIP file.
 *
 * Coordinate mapping:
 *   SH3D x  → Three.js x  (east)
 *   SH3D y  → Three.js z  (south, no inversion)
 *   All values converted from cm to meters.
 *   Origin normalized to bounding box min.
 *   Version 0.2.0
 */
public class ExportToThreeJSAction extends PluginAction {

    private static final double FLOOR_THICKNESS_M = 0.12;

    private final Plugin plugin;

    /**
     * All template files inside the JAR under /template/.
     * They are written to the ZIP root (without the template/ prefix).
     */
    private static final String[] TEMPLATE_FILES = {
        "index.html",
        "package.json",
        "tsconfig.json",
        "src/style.css",
        "src/main.ts",
        "src/app.ts",
        "src/scene/camera.ts",
        "src/scene/helpers.ts",
        "src/scene/lights.ts",
        "src/scene/renderer.ts",
        "src/scene/resize.ts",
        "src/floorplan/types.ts",
        "src/floorplan/generate.ts",
        "src/floorplan/floors.ts",
        "src/floorplan/walls.ts",
        "src/utils/textSprite.ts",
    };

    public ExportToThreeJSAction(Plugin plugin) {
        this.plugin = plugin;
        putPropertyValue(Property.NAME, "Export to Three.js");
        putPropertyValue(Property.MENU, "Tools");
        setEnabled(true);
    }

    // ───────────────────────── entry point ──────────────────────────

    @Override
    public void execute() {
        Home home = this.plugin.getHome();

        // ── Collect data ───────────────────────────────────────────
        List<Wall> walls = new ArrayList<Wall>(home.getWalls());
        List<Room> rooms = new ArrayList<Room>(home.getRooms());

        // ── Compute bounding box from ALL wall endpoints + room vertices
        double xMin = Double.MAX_VALUE;
        double yMin = Double.MAX_VALUE;

        for (Wall w : walls) {
            double xs = w.getXStart();
            double ys = w.getYStart();
            double xe = w.getXEnd();
            double ye = w.getYEnd();
            if (xs < xMin) xMin = xs;
            if (xe < xMin) xMin = xe;
            if (ys < yMin) yMin = ys;
            if (ye < yMin) yMin = ye;
        }

        for (Room r : rooms) {
            float[][] pts = r.getPoints();
            for (float[] pt : pts) {
                if (pt[0] < xMin) xMin = pt[0];
                if (pt[1] < yMin) yMin = pt[1];
            }
        }

        if (xMin == Double.MAX_VALUE) {
            xMin = 0;
            yMin = 0;
        }

        final double originX = xMin;
        final double originY = yMin;

        // ── Collect doors & windows ────────────────────────────────
        List<HomePieceOfFurniture> doorsWindows = new ArrayList<HomePieceOfFurniture>();
        for (HomePieceOfFurniture piece : home.getFurniture()) {
            if (piece instanceof DoorOrWindow) {
                doorsWindows.add(piece);
            }
        }

        // ── File chooser for ZIP ───────────────────────────────────
        JFileChooser chooser = new JFileChooser();
        chooser.setDialogTitle("Export to Three.js ZIP Project");
        chooser.setFileFilter(new FileNameExtensionFilter("ZIP files (*.zip)", "zip"));

        String homeName = home.getName();
        String suggestedName;
        if (homeName != null && !homeName.isEmpty()) {
            File f = new File(homeName);
            String base = f.getName();
            int dot = base.lastIndexOf('.');
            if (dot > 0) base = base.substring(0, dot);
            suggestedName = base + "_threejs.zip";
        } else {
            suggestedName = "sweethome3d_threejs.zip";
        }
        chooser.setSelectedFile(new File(suggestedName));

        int result = chooser.showSaveDialog(null);
        if (result != JFileChooser.APPROVE_OPTION) {
            return;
        }

        File outputFile = chooser.getSelectedFile();
        if (!outputFile.getName().toLowerCase(Locale.ROOT).endsWith(".zip")) {
            outputFile = new File(outputFile.getAbsolutePath() + ".zip");
        }

        // ── Build model.ts content ─────────────────────────────────
        double wallHeightCm = home.getWallHeight();
        double wallHeightM = r4(wallHeightCm / 100.0);
        double defaultThicknessCm = computeDefaultThickness(walls);
        double defaultThicknessM = r4(defaultThicknessCm / 100.0);

        // Match doors/windows to walls
        Map<Wall, List<String>> wallOpeningsMap = matchDoorsToWalls(walls, doorsWindows, originX, originY, wallHeightCm);

        String modelTs = buildModelTs(rooms, walls, wallOpeningsMap, originX, originY,
                wallHeightM, defaultThicknessM, wallHeightCm);

        // ── Write ZIP ──────────────────────────────────────────────
        try {
            writeZip(outputFile, modelTs);

            JOptionPane.showMessageDialog(null,
                    "Exported Three.js project to:\n" + outputFile.getAbsolutePath()
                            + "\n\nRooms: " + rooms.size()
                            + "\nWalls: " + walls.size()
                            + "\nDoors/Windows: " + doorsWindows.size()
                            + "\n\nTo run:\n  1. Unzip\n  2. npm install\n  3. npm run dev"
                            + "\n  4. Open http://localhost:5183",
                    "Export to Three.js",
                    JOptionPane.INFORMATION_MESSAGE);
        } catch (IOException ex) {
            JOptionPane.showMessageDialog(null,
                    "Error writing ZIP:\n" + ex.getMessage(),
                    "Export to Three.js – Error",
                    JOptionPane.ERROR_MESSAGE);
        }
    }

    // ───────────────────── ZIP writing ─────────────────────────────

    private void writeZip(File outputFile, String modelTs) throws IOException {
        ZipOutputStream zos = null;
        try {
            zos = new ZipOutputStream(new FileOutputStream(outputFile));

            // Write all template files from JAR resources
            for (String templatePath : TEMPLATE_FILES) {
                String resourcePath = "/template/" + templatePath;
                InputStream is = getClass().getResourceAsStream(resourcePath);
                if (is == null) {
                    throw new IOException("Missing template resource: " + resourcePath);
                }
                try {
                    byte[] data = readAllBytes(is);
                    ZipEntry entry = new ZipEntry(templatePath);
                    zos.putNextEntry(entry);
                    zos.write(data);
                    zos.closeEntry();
                } finally {
                    is.close();
                }
            }

            // Write the dynamically generated model.ts
            ZipEntry modelEntry = new ZipEntry("src/floorplan/model.ts");
            zos.putNextEntry(modelEntry);
            zos.write(modelTs.getBytes("UTF-8"));
            zos.closeEntry();

        } finally {
            if (zos != null) {
                try { zos.close(); } catch (IOException ignored) {}
            }
        }
    }

    /**
     * Read all bytes from an InputStream (Java 1.8 compatible).
     */
    private static byte[] readAllBytes(InputStream is) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream(4096);
        byte[] buf = new byte[4096];
        int n;
        while ((n = is.read(buf)) != -1) {
            baos.write(buf, 0, n);
        }
        return baos.toByteArray();
    }

    // ───────────── Door/Window → Wall matching ─────────────────────

    /**
     * For each door/window, find the closest wall line segment,
     * project the piece center onto the wall to compute the offset,
     * and build the opening string. Returns a map of wall → list of
     * opening TypeScript object literals.
     */
    private Map<Wall, List<String>> matchDoorsToWalls(
            List<Wall> walls,
            List<HomePieceOfFurniture> doorsWindows,
            double originX, double originY,
            double defaultHeightCm) {

        Map<Wall, List<String>> map = new LinkedHashMap<Wall, List<String>>();

        for (HomePieceOfFurniture piece : doorsWindows) {
            // Piece center in cm (SH3D coords)
            double pcx = piece.getX();
            double pcy = piece.getY();

            Wall bestWall = null;
            double bestDist = Double.MAX_VALUE;
            double bestProjection = 0;

            for (Wall w : walls) {
                double wxs = w.getXStart();
                double wys = w.getYStart();
                double wxe = w.getXEnd();
                double wye = w.getYEnd();

                // Wall direction vector
                double dx = wxe - wxs;
                double dy = wye - wys;
                double lenSq = dx * dx + dy * dy;
                if (lenSq < 1e-8) continue;

                // Project piece center onto wall line
                double t = ((pcx - wxs) * dx + (pcy - wys) * dy) / lenSq;
                t = Math.max(0, Math.min(1, t));

                double projX = wxs + t * dx;
                double projY = wys + t * dy;

                double dist = Math.sqrt((pcx - projX) * (pcx - projX) + (pcy - projY) * (pcy - projY));

                if (dist < bestDist) {
                    bestDist = dist;
                    bestWall = w;
                    bestProjection = t * Math.sqrt(lenSq); // distance from wall start in cm
                }
            }

            if (bestWall == null) continue;

            // Compute opening properties
            double widthCm = piece.getWidth();
            double heightCm = piece.getHeight();
            double elevationCm = piece.getElevation();

            // Offset is to the left edge of the opening
            double offsetCm = bestProjection - widthCm / 2.0;

            // Convert to meters
            double offsetM = r4((offsetCm) / 100.0);
            double widthM = r4(widthCm / 100.0);
            double heightM = r4(heightCm / 100.0);
            double elevationM = r4(elevationCm / 100.0);

            // Determine kind: door if elevation < 1cm, else window
            String kind = (elevationCm < 1.0) ? "door" : "window";

            // Build the TypeScript object literal string
            String opening;
            if ("door".equals(kind)) {
                opening = "        { kind: 'door', offset: " + offsetM
                        + ", width: " + widthM
                        + ", height: " + heightM + " }";
            } else {
                opening = "        { kind: 'window', offset: " + offsetM
                        + ", width: " + widthM
                        + ", height: " + heightM
                        + ", elevation: " + elevationM + " }";
            }

            List<String> list = map.get(bestWall);
            if (list == null) {
                list = new ArrayList<String>();
                map.put(bestWall, list);
            }
            list.add(opening);
        }

        return map;
    }

    // ───────────── model.ts generation ─────────────────────────────

    private String buildModelTs(
            List<Room> rooms,
            List<Wall> walls,
            Map<Wall, List<String>> wallOpeningsMap,
            double originX, double originY,
            double wallHeightM, double defaultThicknessM,
            double wallHeightCm) {

        StringBuilder sb = new StringBuilder(8192);
        String nl = "\n";

        sb.append("import type { Floorplan } from './types'").append(nl);
        sb.append(nl);
        sb.append("export const apartmentPlan: Floorplan = {").append(nl);
        sb.append("  units: 'm',").append(nl);
        sb.append("  defaults: {").append(nl);
        sb.append("    wallHeight: ").append(fmtNum(wallHeightM)).append(",").append(nl);
        sb.append("    wallThickness: ").append(fmtNum(defaultThicknessM)).append(",").append(nl);
        sb.append("    wallColor: 0xc8cad0,").append(nl);
        sb.append("    floorThickness: ").append(fmtNum(FLOOR_THICKNESS_M)).append(",").append(nl);
        sb.append("    wallOpacity: 0.35,").append(nl);
        sb.append("    floorOpacity: 0.65,").append(nl);
        sb.append("  },").append(nl);

        // ── rooms ──────────────────────────────────────────────────
        sb.append("  rooms: [").append(nl);
        for (int i = 0; i < rooms.size(); i++) {
            Room room = rooms.get(i);
            appendRoom(sb, room, i, originX, originY);
            if (i < rooms.size() - 1) sb.append(",");
            sb.append(nl);
        }
        sb.append("  ],").append(nl);

        // ── walls ──────────────────────────────────────────────────
        sb.append("  walls: [").append(nl);
        for (int i = 0; i < walls.size(); i++) {
            Wall wall = walls.get(i);
            List<String> openings = wallOpeningsMap.get(wall);
            appendWall(sb, wall, i, originX, originY, wallHeightCm, openings);
            if (i < walls.size() - 1) sb.append(",");
            sb.append(nl);
        }
        sb.append("  ],").append(nl);

        sb.append("}").append(nl);
        return sb.toString();
    }

    private void appendRoom(StringBuilder sb, Room room, int index,
                            double originX, double originY) {
        String name = room.getName();
        if (name == null || name.isEmpty()) {
            name = "Room";
        }

        // Floor color
        Integer color = room.getFloorColor();
        String colorHex;
        if (color != null) {
            colorHex = "0x" + String.format("%06x", color & 0xFFFFFF);
        } else {
            colorHex = "0xcccccc";
        }

        // Polygon vertices (SH3D cm → meters, with origin offset)
        float[][] pts = room.getPoints();
        double polyMinX = Double.MAX_VALUE, polyMinZ = Double.MAX_VALUE;
        double polyMaxX = -Double.MAX_VALUE, polyMaxZ = -Double.MAX_VALUE;

        // Compute bounding box of polygon
        for (float[] pt : pts) {
            double mx = r4((pt[0] - originX) / 100.0);
            double mz = r4((pt[1] - originY) / 100.0);
            if (mx < polyMinX) polyMinX = mx;
            if (mz < polyMinZ) polyMinZ = mz;
            if (mx > polyMaxX) polyMaxX = mx;
            if (mz > polyMaxZ) polyMaxZ = mz;
        }

        sb.append("    {").append("\n");
        sb.append("      id: 'room_").append(index).append("',\n");
        sb.append("      name: '").append(escapeTs(name)).append("',\n");
        sb.append("      floorColor: ").append(colorHex).append(",\n");

        // Polygon
        sb.append("      polygon: [\n");
        for (int j = 0; j < pts.length; j++) {
            double mx = r4((pts[j][0] - originX) / 100.0);
            double mz = r4((pts[j][1] - originY) / 100.0);
            sb.append("        { x: ").append(fmtNum(mx)).append(", z: ").append(fmtNum(mz)).append(" }");
            if (j < pts.length - 1) sb.append(",");
            sb.append("\n");
        }
        sb.append("      ],\n");

        sb.append("      origin: { x: ").append(fmtNum(r4(polyMinX))).append(", z: ").append(fmtNum(r4(polyMinZ))).append(" },\n");
        sb.append("      size: { x: ").append(fmtNum(r4(polyMaxX - polyMinX))).append(", z: ").append(fmtNum(r4(polyMaxZ - polyMinZ))).append(" },\n");
        sb.append("    }");
    }

    private void appendWall(StringBuilder sb, Wall wall, int index,
                            double originX, double originY,
                            double defaultHeightCm,
                            List<String> openings) {

        double xs = r4((wall.getXStart() - originX) / 100.0);
        double zs = r4((wall.getYStart() - originY) / 100.0);
        double xe = r4((wall.getXEnd() - originX) / 100.0);
        double ze = r4((wall.getYEnd() - originY) / 100.0);

        double thicknessM = r4(wall.getThickness() / 100.0);

        Float wallHeight = wall.getHeight();
        double heightM;
        if (wallHeight != null && wallHeight > 0) {
            heightM = r4(wallHeight / 100.0);
        } else {
            heightM = r4(defaultHeightCm / 100.0);
        }

        sb.append("    {").append("\n");
        sb.append("      id: 'w_").append(index).append("',\n");
        sb.append("      from: { x: ").append(fmtNum(xs)).append(", z: ").append(fmtNum(zs)).append(" },\n");
        sb.append("      to: { x: ").append(fmtNum(xe)).append(", z: ").append(fmtNum(ze)).append(" },\n");
        sb.append("      thickness: ").append(fmtNum(thicknessM)).append(",\n");
        sb.append("      height: ").append(fmtNum(heightM)).append(",\n");

        if (openings != null && !openings.isEmpty()) {
            sb.append("      openings: [\n");
            for (int k = 0; k < openings.size(); k++) {
                sb.append(openings.get(k));
                if (k < openings.size() - 1) sb.append(",");
                sb.append("\n");
            }
            sb.append("      ],\n");
        }

        sb.append("    }");
    }

    // ───────────────────── helpers ─────────────────────────────────

    /**
     * Determine the most common wall thickness among walls (in cm).
     * Falls back to 12.0 cm if no walls exist.
     */
    private double computeDefaultThickness(List<Wall> walls) {
        if (walls.isEmpty()) return 12.0;

        Map<Long, int[]> freq = new LinkedHashMap<Long, int[]>();
        for (Wall w : walls) {
            long key = Math.round(w.getThickness() * 1000);
            int[] count = freq.get(key);
            if (count == null) {
                count = new int[]{0};
                freq.put(key, count);
            }
            count[0]++;
        }

        long bestKey = 0;
        int bestCount = 0;
        for (Map.Entry<Long, int[]> e : freq.entrySet()) {
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
     * Format a number for TypeScript output: no trailing zeros beyond 2 decimal places,
     * but always at least 1 decimal digit so it looks like a float.
     */
    private static String fmtNum(double v) {
        // Use enough precision
        String s = String.format(Locale.ROOT, "%.4f", v);
        // Remove trailing zeros but keep at least one decimal digit
        if (s.contains(".")) {
            while (s.endsWith("0") && !s.endsWith(".0")) {
                s = s.substring(0, s.length() - 1);
            }
        }
        return s;
    }

    /**
     * Escape a string for TypeScript single-quoted string literal.
     */
    private static String escapeTs(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '\'': sb.append("\\'"); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:   sb.append(c);
            }
        }
        return sb.toString();
    }
}
