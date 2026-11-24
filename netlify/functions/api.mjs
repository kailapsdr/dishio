// Netlify runs this file for every address that starts with /api/.
// All the real work is in ../dishio/server.mjs.

import { createServer } from "../dishio/server.mjs";

let handle; // created once per running copy, so limits and caches are shared

export default async (req, context) => {
  handle ??= createServer(process.env);
  return handle(req, context);
};

export const config = {
  path: "/api/*",
};
