import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const define = {
    'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(env.VITE_FIREBASE_API_KEY),
    'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(env.VITE_FIREBASE_AUTH_DOMAIN),
    'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(env.VITE_FIREBASE_PROJECT_ID),
    'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(env.VITE_FIREBASE_STORAGE_BUCKET),
    'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(env.VITE_FIREBASE_APP_ID),
    'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(env.VITE_GOOGLE_MAPS_API_KEY),
    'process.env.VITE_FIREBASE_API_KEY': JSON.stringify(env.VITE_FIREBASE_API_KEY),
    'process.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(env.VITE_FIREBASE_AUTH_DOMAIN),
    'process.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(env.VITE_FIREBASE_PROJECT_ID),
    'process.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(env.VITE_FIREBASE_STORAGE_BUCKET),
    'process.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    'process.env.VITE_FIREBASE_APP_ID': JSON.stringify(env.VITE_FIREBASE_APP_ID),
    'process.env.VITE_VAPID_KEY': JSON.stringify(env.VITE_VAPID_KEY),
  };

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB
        },
        manifest: {
          name: "NavTickets Gestión Industrial",
          short_name: "NavTickets",
          description: "Sistema profesional de gestión de mantenimiento industrial Navas.",
          theme_color: "#7b1113",
          background_color: "#ffffff",
          display: "standalone",
          scope: "/",
          start_url: "/",
          id: "/",
          categories: ["business", "productivity", "utilities"],
          icons: [
            {
              src: "https://firebasestorage.googleapis.com/v0/b/navas-33818730-80986.firebasestorage.app/o/Icon-app.png?alt=media&token=11895e56-9aaa-4691-92ca-3b66c4c8417d",
              sizes: "192x192",
              type: "image/png",
              purpose: "any"
            },
            {
              src: "https://firebasestorage.googleapis.com/v0/b/navas-33818730-80986.firebasestorage.app/o/Icon-app.png?alt=media&token=11895e56-9aaa-4691-92ca-3b66c4c8417d",
              sizes: "512x512",
              type: "image/png",
              purpose: "any"
            },
            {
              src: "https://firebasestorage.googleapis.com/v0/b/navas-33818730-80986.firebasestorage.app/o/Icon-app.png?alt=media&token=11895e56-9aaa-4691-92ca-3b66c4c8417d",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable"
            },
            {
              src: "https://firebasestorage.googleapis.com/v0/b/navas-33818730-80986.firebasestorage.app/o/Icon-app.png?alt=media&token=11895e56-9aaa-4691-92ca-3b66c4c8417d",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable"
            }
          ],
          shortcuts: [
            {
              name: "Nueva Orden",
              short_name: "Orden",
              description: "Crear una nueva orden de servicio",
              url: "/orders/new",
              icons: [{ src: "https://firebasestorage.googleapis.com/v0/b/navas-33818730-80986.firebasestorage.app/o/Icon-app.png?alt=media&token=11895e56-9aaa-4691-92ca-3b66c4c8417d", sizes: "192x192" }]
            },
            {
              name: "Nuevo Cliente",
              short_name: "Cliente",
              description: "Registrar un nuevo cliente",
              url: "/clients/new",
              icons: [{ src: "https://firebasestorage.googleapis.com/v0/b/navas-33818730-80986.firebasestorage.app/o/Icon-app.png?alt=media&token=11895e56-9aaa-4691-92ca-3b66c4c8417d", sizes: "192x192" }]
            }
          ],
          screenshots: [
            {
              src: "https://firebasestorage.googleapis.com/v0/b/navas-33818730-80986.firebasestorage.app/o/Icon-app.png?alt=media&token=11895e56-9aaa-4691-92ca-3b66c4c8417d",
              sizes: "512x512",
              type: "image/png",
              form_factor: "wide",
              label: "Pantalla de Inicio Navas"
            },
            {
              src: "https://firebasestorage.googleapis.com/v0/b/navas-33818730-80986.firebasestorage.app/o/Icon-app.png?alt=media&token=11895e56-9aaa-4691-92ca-3b66c4c8417d",
              sizes: "512x512",
              type: "image/png",
              label: "Gestión Móvil"
            }
          ]
        },
      })
    ],
    define: define,
    build: {
      outDir: 'dist', 
      assetsDir: 'assets',
      emptyOutDir: true,
      sourcemap: false,
      minify: 'terser',
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          // Las cargas dinámicas (React.lazy y await import()) ya hacen el trabajo duro.
          // Dejamos que el motor de Vite (Rollup) optimice automáticamente las relaciones entre librerías.
        },
      },
    },
    server: {
      port: 8080,
      host: true,
      strictPort: true,
      headers: {
        'Service-Worker-Allowed': '/',
        'Permissions-Policy': 'geolocation=*',
      }
    }
  };
});
