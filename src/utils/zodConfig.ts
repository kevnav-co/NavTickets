// La CSP de producción (vercel.json) no permite eval. Zod 4 intenta usar
// `new Function` para acelerar validaciones y, al bloquearlo la CSP, cae al modo
// normal pero deja una violación de seguridad en el navegador. `jitless` le dice
// que no lo intente. Se importa antes que cualquier esquema (src/index.tsx).
import { z } from 'zod';

z.config({ jitless: true });
