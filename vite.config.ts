import { defineConfig } from "vite";

// Relative base so the build works both locally and under https://<user>.github.io/<repo>/.
export default defineConfig({
  base: "./",
  build: {
    // Babylon.js is large; one chunk is fine for a game that needs it all at start-up.
    chunkSizeWarningLimit: 9000,
  },
});
