import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Task 22: add visionControlSourceMarker() here.
// plugins: [react(), visionControlSourceMarker()] // Added in task 22

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
  },
});
