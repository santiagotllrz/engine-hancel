"use server"

import { revalidatePath } from "next/cache"

import { idDeCuentaActual } from "@/lib/accounts"
import * as listas from "@/engine/capas/listas"

/**
 * Las acciones de las listas de subtemas. La logica vive en el motor
 * (engine/capas/listas.ts); aqui solo se toma la cuenta de la sesion y se
 * refresca /capas.
 */

export type ActionResult = listas.ActionResult

export async function crearLista(nombre: string, elementos: string): Promise<ActionResult> {
  const r = await listas.crearLista(await idDeCuentaActual(), nombre, elementos)
  revalidatePath("/capas")
  return r
}

export async function renombrarLista(listId: string, nombre: string): Promise<ActionResult> {
  const r = await listas.renombrarLista(await idDeCuentaActual(), listId, nombre)
  revalidatePath("/capas")
  return r
}

export async function borrarLista(listId: string): Promise<ActionResult> {
  const r = await listas.borrarLista(await idDeCuentaActual(), listId)
  revalidatePath("/capas")
  return r
}

export async function anadirALista(listId: string, elementos: string): Promise<ActionResult> {
  const r = await listas.anadirALista(await idDeCuentaActual(), listId, elementos)
  revalidatePath("/capas")
  return r
}

export async function renombrarElemento(itemId: string, nombre: string): Promise<ActionResult> {
  const r = await listas.renombrarElemento(await idDeCuentaActual(), itemId, nombre)
  revalidatePath("/capas")
  return r
}

export async function borrarElemento(itemId: string): Promise<ActionResult> {
  const r = await listas.borrarElemento(await idDeCuentaActual(), itemId)
  revalidatePath("/capas")
  return r
}

export async function usarLista(topicId: string, listId: string): Promise<ActionResult> {
  const r = await listas.usarLista(await idDeCuentaActual(), topicId, listId)
  revalidatePath("/capas")
  return r
}

export async function quitarLista(topicId: string, listId: string): Promise<ActionResult> {
  const r = await listas.quitarLista(await idDeCuentaActual(), topicId, listId)
  revalidatePath("/capas")
  return r
}

export async function subtemasEnBloque(topicId: string, texto: string): Promise<ActionResult> {
  const r = await listas.subtemasEnBloque(await idDeCuentaActual(), topicId, texto)
  revalidatePath("/capas")
  return r
}
