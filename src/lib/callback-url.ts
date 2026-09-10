// Sanea un callbackUrl que viaja por query string o formData antes de
// pasarlo a signIn({ redirectTo }). Sin esto, un link armado a mano con
// ?callbackUrl=https://evil.com (o //evil.com, protocol-relative) podría
// usar el login legítimo para mandar a alguien a un sitio externo después
// de autenticarse (open redirect) — solo se acepta una ruta relativa propia.
export function callbackUrlSeguro(valor: unknown): string {
  if (typeof valor === "string" && valor.startsWith("/") && !valor.startsWith("//")) {
    return valor;
  }
  return "/";
}
