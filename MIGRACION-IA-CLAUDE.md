# Mover toda la IA a tu cuenta de Claude

Documento de decisión. Explica las dos formas de dejar de depender de las
**rutinas de Claude Code** y pasar a que el motor hable con Claude usando solo tu
cuenta. Léelo y me dices cuál hacemos. **Todavía no hay nada tocado.**

---

## 0. Aclaración de base (importante)

El motor **ya funciona con tu cuenta de Claude**, no con una API key. El token de
las rutinas (`ANALYSIS_ROUTINE_TOKEN`, `ANGLE_ROUTINE_TOKEN`, etc.) empieza por
`sk-ant-oat01`: es exactamente lo que produce `claude setup-token`, tu
suscripción Pro/Max. Las "rutinas" son *Claude Code routines* que corren en la
nube de Anthropic, facturadas a tu plan.

Entonces esto **no va de "conectar la cuenta"** —ya está conectada—. Va de
**dónde y cómo corre la IA**:

- **Hoy:** disparas un webhook → una sesión agéntica de Claude Code arranca en la
  nube de Anthropic → lee el buzón en Supabase → escribe la respuesta → el `tick`
  la drena. Asíncrono y pesado.
- **Objetivo:** que sea **tu propio código** el que llame a Claude con el mismo
  token, sin pasar por el producto de rutinas.

La pregunta real que decides aquí es: cuando ese código llame a Claude,
**¿trae todo el Agent SDK (Opción A) o solo una llamada directa (Opción B)?**

---

## 1. Lo que es común a las dos opciones

Da igual A o B, esto no cambia:

- **La credencial:** `claude setup-token` → pegas `sk-ant-oat01…` en una variable
  de entorno. Cero API key, cero facturación por token. Consume tu ventana de Max.
- **Los cuatro pasos de IA** que hoy son rutinas:
  1. **Análisis** — leer la noticia y puntuarla 1–10.
  2. **Ángulo** — decidir el enfoque y la tesis.
  3. **LinkedIn** — escribir el post.
  4. **Instagram** — escribir el guion del carrusel (de ahí sale también Facebook).
- **Lo que se reutiliza tal cual del código actual:**
  - Los buzones `jobs_angle`, `jobs_linkedin`, `jobs_instagram`.
  - Los parsers: `parseAngleResponse`, `parseLinkedinResponse` (`content/parse.ts`)
    y `parseInstagramResponse` (`render/carousel.ts`).
  - El `tick` que materializa las piezas y toda la publicación (Buffer, LinkedIn).
  - El dashboard en Vercel, Supabase, la config, los umbrales, las cuentas.
- **Lo que desaparece:** los ficheros de disparo de rutinas
  (`routine-webhook.ts`, `analysis-routine.ts`, `content/routines.ts`) y las
  rutinas configuradas en la nube. La lógica de cada prompt pasa a vivir en el
  repo, versionada, cambiable en un solo sitio.

---

## 2. Opción A — Traer todo el Agent SDK

Montar el `@anthropic-ai/claude-agent-sdk` completo: el modelo corre como
**agente con herramientas y autonomía multi-vuelta** (leer la base, buscar en
web, seguir enlaces, autocorregirse), igual que hace Houston.

### Qué gana
- **Sube el techo de calidad.** Deja de estar limitado a "lo que le metes en el
  prompt". Puede investigar de verdad: abrir la fuente primaria, verificar una
  cifra, buscar el detalle de una ronda de inversión.
- **Verificación antes de publicar.** Un paso de fact-check con búsqueda web
  antes de que algo salga a tus redes reales.
- **Pasadas de editor.** Escribe → se critica contra tus reglas → reescribe.
- **Flexibiliza el futuro.** Formatos nuevos (TikTok, newsletter, hilos) sin
  cablear la lógica de cada uno a mano.

### Qué cuesta
- **Consumo alto.** Cada sesión agéntica reenvía contexto en cada vuelta de
  herramienta. Es **justo el gasto que estás intentando quitar**; devora tu
  ventana de Max rápido.
- **Lento.** Vuelve a minutos, no segundos.
- **No determinista.** Puede entrar en bucle o hacer una tontería; necesita
  guardarraíles. Para un sistema que **publica solo en cuentas reales**, la
  predecibilidad es una virtud que pierdes.
- **No cabe en Vercel.** El SDK agéntico necesita contenedor persistente y
  filesystem. Obliga a un worker fuera de Vercel (Railway / PC).
- **Más superficie de revocación:** más actividad automática con el token de
  suscripción, que es lo que más se parece a abuso.

---

## 3. Opción B — Solo lo que se necesita (llamada directa)

Reemplazar cada rutina por **una llamada de un tiro** a la Messages API con el
mismo token. Los cuatro pasos son generaciones de JSON estructurado —ya los
parseas—, no necesitan un agente con herramientas. Es lo que de verdad hace
Houston a nivel de credencial:

```
POST https://api.anthropic.com/v1/messages
Authorization: Bearer sk-ant-oat01…        ← el mismo token de hoy
anthropic-beta: oauth-…                     ← te identifica como Claude Code
```

### Qué gana
- **Mucho más rápido.** Segundos en vez de minutos, y sin la espera de hasta 5
  min del drenaje: el resultado se escribe en la base en el acto.
- **Mucho menos consumo.** Sin harness ni herramientas ni multi-vuelta: una
  fracción de los tokens. Estira tu plan Max.
- **Predecible.** JSON con esquema, fácil de validar. Menos formas de romperse.
- **Eliges el modelo por paso.** Haiku para analizar en volumen; Sonnet/Opus para
  escribir. (Limitado a los modelos que la identidad de Claude Code permite.)
- **Toda la lógica en tu repo.** Se acaba el "montón de rutinas" que no puedes
  cambiar fácil.
- **Cabe en Vercel** (es un `fetch` de salida), aunque conviene un worker (ver §5).

### Qué cuesta
- **Techo de calidad más bajo:** solo transforma lo que le das; no investiga por
  su cuenta.
- **Cada formato nuevo = un prompt + un parser nuevos** (sencillo, pero manual).
- **Vía no documentada:** las cabeceras que te identifican como Claude Code no son
  una API pública; Anthropic puede cambiarlas o bloquearlas.

---

## 4. Comparación rápida

| | Hoy (rutinas) | A · Agent SDK | B · Llamada directa |
|---|---|---|---|
| Velocidad | Minutos + drenaje | Minutos | **Segundos** |
| Consumo de tu Max | Alto | Alto | **Bajo** |
| Predecible | Media | Baja | **Alta** |
| Elegir modelo por paso | No | Sí | **Sí** |
| Investiga / verifica solo | No | **Sí** | No |
| Corre en Vercel | Sí | No | Sí (mejor worker) |
| Lógica en tu repo | No | Sí | **Sí** |
| Esfuerzo de montaje | — | Alto | **Bajo** |

---

## 5. Dónde se despliega

Sub-decisión que depende sobre todo del **riesgo de revocación**:

| Host | Coste | Nota |
|---|---|---|
| **Tu PC / mini-server en casa** | 0 € | El más seguro: IP residencial, la menos sospechosa |
| **GitHub Actions programado** | Gratis (2000 min/mes) | Cron, efímero, token en secrets; IP de datacenter |
| **Railway Hobby** | ~5 USD/mes | Contenedor siempre vivo; **único que aloja la Opción A** |
| **Vercel (dentro del tick actual)** | Ya lo pagas | Solo Opción B; límite de 300s y IP de datacenter |

- **Opción B** puede quedarse *inline* en el `tick` de Vercel (cambio mínimo) o
  moverse a un worker que sondea Supabase.
- **Opción A** exige worker persistente: Vercel serverless no la aloja.

---

## 6. La advertencia que aplica a las dos

Ninguna opción arregla **la revocación**. El token de suscripción usado en
automático es lo que ya se te murió dos veces (`OAuth access token has been
revoked`). No tiene refresh: cuando cae, vuelves a correr `claude setup-token` y
pegas el nuevo. Correrlo desde **tu casa** (IP residencial) reduce el riesgo;
ninguna arquitectura lo elimina.

Lo **único inmune** es una **API key de consola** (`sk-ant-api03`): estable, no
revocable por abuso, documentada — pero es facturación por token, ya no "gratis
con mi Max". Es la decisión de fondo: *barato pero frágil* (suscripción) vs
*estable pero medido* (API key). Puedes empezar con suscripción y mover a API key
solo el día que algo agéntico y pesado lo justifique.

---

## 7. Mi recomendación

**Híbrido, empezando por B:**

1. Monta la **Opción B** (llamada directa, single-shot), con Haiku en análisis y
   Sonnet en escritura. Mata el consumo, gana velocidad, centraliza la lógica.
   Es poco código: ~un módulo que llama a Messages y escribe en el buzón, más
   borrar los tres ficheros de rutinas.
2. Córrela primero **en tu PC** para probarla gratis y con la IP más segura; si
   luego quieres cloud, Railway Hobby.
3. Deja la **Opción A para más adelante y de forma quirúrgica**: un solo paso de
   investigación/verificación sobre las 1–2 noticias top del día, cuando notes
   que la calidad del ángulo topa. El mismo worker de B aloja después ese paso
   agéntico — elegir B ahora **no cierra** la puerta a A.

Lo que **no** haría: montar todo el Agent SDK de entrada. Pagas hoy el coste
(consumo, latencia, complejidad, worker obligatorio) por beneficios que aún no
usas.

---

## 8. Decisiones que tienes que tomar (para cuando lo leas)

1. **¿A o B?** (recomiendo B, con A quirúrgico después).
2. **¿Dónde corre?** PC en casa / GitHub Actions / Railway / Vercel.
3. **¿Suscripción o API key?** (recomiendo suscripción ahora, API key cuando haya
   un paso agéntico pesado).
4. **¿Qué modelo por paso?** (sugerencia: Haiku análisis, Sonnet ángulo+escritura).
5. **¿Migramos los 4 pasos de golpe o uno primero** —el de análisis, que es el
   más caro y el que más se te ha caído— **como prueba?**

Cuando lo tengas claro, me dices y lo montamos.
