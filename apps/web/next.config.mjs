/** @type {import('next').NextConfig} */
const nextConfig = {
  // The data and API packages are TypeScript workspace sources; let Next compile them.
  transpilePackages: ['@quorum/api', '@quorum/db'],
  // pg / dsql-signer are Node-only; keep them server-side, never bundled for the browser.
  serverExternalPackages: ['pg', '@aws-sdk/dsql-signer'],
};

export default nextConfig;
