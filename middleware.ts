// middleware.ts
// Next.js requires this file at the project root to register Edge middleware.
// The actual same-origin guard lives in security/originGuard.ts; this file is a
// thin entry point that wires it to the /api/* matcher.

import type { NextRequest } from "next/server";
import { originGuard } from "./security/originGuard";

export const config = {
  matcher: "/api/:path*",
};

export default function middleware(req: NextRequest) {
  return originGuard(req);
}
