import { createServer } from "vite";

let serverPromise;

export function loadSourceModule(relativePath) {
  serverPromise ??= createServer({ server: { middlewareMode: true }, appType: "custom" });
  const filePath = new URL(relativePath, import.meta.url).pathname.replace(/^\/[A-Za-z]:/, (drive) => drive.slice(1));
  return serverPromise.then((server) => server.ssrLoadModule(filePath));
}

export async function closeSourceModuleLoader() {
  if (serverPromise) {
    const server = await serverPromise;
    await server.close();
    serverPromise = undefined;
  }
}
