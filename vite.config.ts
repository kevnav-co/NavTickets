import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isAnalyze = process.env.ANALYZE === 'true';

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
          description: "Sistema profesional de gestión de mantenimiento industrial.",
          theme_color: "#7b1113",
          background_color: "#ffffff",
          display: "standalone",
          scope: "/",
          start_url: "/",
          id: "/",
          categories: ["business", "productivity", "utilities"],
          icons: [
            { src: "/assets/icon-app.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/assets/icon-app.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/assets/icon-app.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "/assets/icon-app.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
          ],
          shortcuts: [
            { name: "Nueva Orden", short_name: "Orden", description: "Crear una nueva orden de servicio", url: "/orders/new", icons: [{ src: "/assets/icon-app.png", sizes: "192x192" }] },
            { name: "Nuevo Cliente", short_name: "Cliente", description: "Registrar un nuevo cliente", url: "/clients/new", icons: [{ src: "/assets/icon-app.png", sizes: "192x192" }] }
          ],
          screenshots: [
            { src: "/assets/icon-app.png", sizes: "512x512", type: "image/png", form_factor: "wide", label: "Pantalla de Inicio" },
            { src: "/assets/icon-app.png", sizes: "512x512", type: "image/png", label: "Gestión Móvil" }
          ]
        },
      }),
      isAnalyze && visualizer({
        filename: 'dist/stats.html',
        open: true,
        gzipSize: true,
        brotliSize: true,
      })
    ],
    define: define,
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
      sourcemap: false,
      minify: 'terser',
      chunkSizeWarningLimit: 1000,
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
          passes: 2,
        },
        mangle: {
          safari10: true,
        },
        format: {
          comments: false,
        },
      },
      rollupOptions: {
        output: {
          manualChunks: {
            // React core - always loaded
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],

            // State management & data fetching
            'vendor-tanstack': ['@tanstack/react-query', '@tanstack/react-query-devtools'],

            // Supabase - heavy, load on demand
            'vendor-supabase': ['@supabase/supabase-js'],

            // UI libraries - split by usage
            'vendor-lucide': ['lucide-react'],
            'vendor-zod': ['zod'],
            'vendor-date-fns': ['date-fns'],

            // Charts - only for accounting/admin
            'vendor-recharts': ['recharts'],

            // Maps - only for client map view
            'vendor-leaflet': ['leaflet', 'react-leaflet'],
            'vendor-google-maps': ['@vis.gl/react-google-maps'],

            // PDF/Export - heavy, on demand
            'vendor-jspdf': ['jspdf', 'jspdf-autotable'],
            'vendor-xlsx': ['xlsx'],

            // Image/Video processing
            'vendor-image-compression': ['browser-image-compression'],

            // Offline DB
            'vendor-dexie': ['dexie'],

            // Notifications
            'vendor-onesignal': ['react-onesignal'],

            // Form/Input helpers
            'vendor-forms': ['react-currency-input-field', 'react-textarea-autosize'],

            // OneSignal service worker (auto-loaded)
            'workbox-runtime': ['workbox-core', 'workbox-routing', 'workbox-strategies', 'workbox-cacheable-response', 'workbox-expiration', 'workbox-precaching'],
          },
          // Optimize chunk naming for better caching
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name.split('.');
            const ext = info[info.length - 1];
            if (/\.(png|jpe?g|gif|svg|webp|ico)$/.test(assetInfo.name)) {
              return `assets/images/[name]-[hash].${ext}`;
            }
            if (/\.(woff2?|eot|ttf|otf)$/.test(assetInfo.name)) {
              return `assets/fonts/[name]-[hash].${ext}`;
            }
            return `assets/[ext]/[name]-[hash].${ext}`;
          },
        },
        // Tree shaking optimizations
        treeshake: {
          moduleSideEffects: 'no-external',
          propertyReadSideEffects: false,
          tryCatchDeoptimization: false,
        },
      },
      // CSS code splitting
      cssCodeSplit: true,
      // Module preload polyfill
      modulePreload: {
        polyfill: true,
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
    },
    // Optimize dependencies
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@tanstack/react-query',
        '@supabase/supabase-js',
        'lucide-react',
        'zod',
        'date-fns',
        'dexie',
      ],
      exclude: ['workbox-window'], // Exclude from pre-bundling
    },
    // Esbuild options for faster builds
    esbuild: {
      treeShaking: true,
      legalComments: 'none',
    },
  };
});
