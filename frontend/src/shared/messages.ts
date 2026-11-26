// Spanish (Argentina), neutral professional wording. A missing key is a compile error.
export const messages = {
  appName: "Waxline",
  signInTitle: "Ingresar a Waxline",
  usernameLabel: "Usuario",
  passwordLabel: "Contraseña",
  signInButton: "Ingresar",
  signOutButton: "Salir",
  signingIn: "Ingresando…",
  signingOut: "Saliendo…",
  welcome: (name: string) => `Bienvenido, ${name}`,
  wrongCredentials: "Usuario o contraseña incorrectos.",
  locked: "Demasiados intentos fallidos. Intente de nuevo más tarde.",
  serverBusy: "El servidor está ocupado. Intente de nuevo en unos minutos.",
  validationRequired: "Complete el usuario y la contraseña.",
  offline: "No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.",
  sessionExpired: "Su sesión expiró. Ingrese nuevamente.",
  signOutNotConfirmed:
    "Su sesión se cerró en este equipo, pero no se pudo confirmar en el servidor. Cuando tenga conexión, ingrese y salga de nuevo.",
  offlineBanner: "Sin conexión. Algunas acciones no estarán disponibles.",
  backOnline: "Conexión restablecida.",
  loading: "Cargando…",
  retryButton: "Reintentar",
  genericError: "Ocurrió un error inesperado. Intente de nuevo.",
} as const;

export type MessageId = keyof typeof messages;
