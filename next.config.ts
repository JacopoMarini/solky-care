import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  serverExternalPackages: ['mongoose', 'bcryptjs', 'jsonwebtoken', 'exceljs'],
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
