import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Las fuentes del carrusel se leen del disco en tiempo de ejecucion, y el
  // trazado automatico de Vercel no las ve porque nadie las importa: solo se
  // referencian por ruta. Sin esto, el render falla en produccion y funciona en
  // local, que es la peor forma de enterarse.
  outputFileTracingIncludes: {
    "/api/**": ["./src/engine/render/fonts/**"],
  },
};

export default nextConfig;
