import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    // Allow tunneled dev access (any ngrok subdomain)
    allowedHosts: [".ngrok-free.app", ".ngrok.app"],
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Required for @bsv/sdk compatibility
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['@bsv/sdk'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
});
