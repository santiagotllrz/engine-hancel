"use client"

import * as React from "react"

import { quitarLogoMarca, subirLogoMarca, type ActionResult } from "@/app/estudio/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

/**
 * El logo que cierra los carruseles.
 *
 * Va en la ultima lamina, la que invita a seguir la cuenta. Si no hay logo esa
 * lamina sigue saliendo —la llamada es lo que convierte un carrusel en
 * audiencia— pero con la marca tipografica en vez del logo.
 */
export function LogoMarca({ logo }: { logo: string | null }) {
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<ActionResult | null>(null)
  const input = React.useRef<HTMLInputElement>(null)

  const subir = (archivo: File) => {
    const form = new FormData()
    form.set("logo", archivo)
    setResult(null)
    startTransition(async () => {
      const r = await subirLogoMarca(form)
      setResult(r)
      if (r.ok && input.current) input.current.value = ""
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Logo</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          Aparece en la lamina de cierre de cada carrusel. PNG, JPG o WEBP, hasta 2 MB. Un PNG con
          fondo transparente es lo que mejor queda sobre la foto.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {logo ? (
          <div className="flex items-center gap-4">
            {/* Sobre cuadros: un logo blanco sobre fondo blanco se veria vacio y
                parecia que no se habia subido. */}
            <div
              className="flex size-24 items-center justify-center rounded-md border p-2"
              style={{
                backgroundImage:
                  "linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)",
                backgroundSize: "12px 12px",
                backgroundPosition: "0 0,0 6px,6px -6px,-6px 0",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="Logo de la marca" className="max-h-full max-w-full object-contain" />
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setResult(null)
                startTransition(async () => setResult(await quitarLogoMarca()))
              }}
            >
              Quitar
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Sin logo: el cierre sale con el rotulo de la marca, no con una imagen.
          </p>
        )}

        <Input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={pending}
          onChange={(e) => {
            const archivo = e.target.files?.[0]
            if (archivo) subir(archivo)
          }}
        />

        {pending ? <span className="text-muted-foreground text-sm">Subiendo…</span> : null}
        {result?.ok ? <span className="text-sm text-emerald-600">Guardado.</span> : null}
        {result && !result.ok ? (
          <span className="text-destructive text-sm">{result.error}</span>
        ) : null}
      </CardContent>
    </Card>
  )
}
