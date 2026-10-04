import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Developpement uniquement : permet d'ouvrir l'appli depuis une tablette ou un autre
  // poste de la reception (http://192.168.x.x:3300). Sans effet en production.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.local"],
};

export default nextConfig;
