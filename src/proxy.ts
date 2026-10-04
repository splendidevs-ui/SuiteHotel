import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

/**
 * Filtre optimiste : sans cookie de session, toute page de l'application renvoie
 * vers la connexion de la reception. La verification reelle (session valide,
 * compte actif, role) est faite cote serveur par requireUser / requireDirection.
 */
const PUBLIC_PATHS = ["/connexion", "/installation"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPublic || request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const url = new URL("/connexion", request.url);
  if (pathname !== "/") url.searchParams.set("suite", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|txt)$).*)"],
};
