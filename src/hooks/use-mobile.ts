import * as React from "react"

const MOBILE_BREAKPOINT = 768

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

/**
 * La version que genera shadcn arranca en `undefined` y hace setState dentro de
 * un efecto, lo que dispara un render en cascada (y falla el lint de
 * react-hooks). useSyncExternalStore es la forma prevista por React para leer
 * un store externo como matchMedia, y da un valor correcto en el primer render
 * del cliente. En el servidor asumimos escritorio.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false
  )
}
