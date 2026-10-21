/**
 * Remuxeador puro en TypeScript de segmentos MPEG-TS (.ts de HLS) a MP4 (.mp4
 * ISO BMFF estandar con ftyp + moov + mdat).
 *
 * No recodifica video ni audio: extrae los NALUs H.264 (AVC1) y las tramas AAC
 * (ADTS -> raw AAC) tal cual vienen en los segmentos .ts y arma las tablas del
 * contenedor MP4 (stts, ctts, stss, stsz, stsc, co64/stco) en memoria. Asi
 * funciona tanto en el navegador como en serverless sin depender de ffmpeg.
 */

export type OpcionesRemux = {
  /** Ancho por defecto si el SPS no lo especifica (ej. de RESOLUTION en el m3u8). */
  width?: number
  /** Alto por defecto si el SPS no lo especifica. */
  height?: number
}

type VideoSample = {
  data: Uint8Array
  pts: number
  dts: number
  isKeyframe: boolean
}

type AudioSample = {
  data: Uint8Array
  pts: number
}

const FRECUENCIAS_AAC = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
]

/**
 * Convierte una lista de segmentos MPEG-TS (y opcionalmente segmentos de audio
 * separados si el stream HLS usa #EXT-X-MEDIA:TYPE=AUDIO) en un archivo .mp4.
 */
export function remuxTsToMp4(
  segmentosVideo: Uint8Array[],
  segmentosAudio: Uint8Array[] = [],
  opciones: OpcionesRemux = {}
): Uint8Array {
  const demuxPrimario = demuxarSegmentosTs(segmentosVideo)
  const demuxAudio = segmentosAudio.length > 0 ? demuxarSegmentosTs(segmentosAudio) : null

  const videoSamples = demuxPrimario.videoSamples
  const sps = demuxPrimario.sps
  const pps = demuxPrimario.pps

  const audioSamples =
    demuxAudio && demuxAudio.audioSamples.length > 0
      ? demuxAudio.audioSamples
      : demuxPrimario.audioSamples
  const audioConfig =
    demuxAudio && demuxAudio.audioSamples.length > 0
      ? demuxAudio.audioConfig
      : demuxPrimario.audioConfig

  if (videoSamples.length === 0 && audioSamples.length === 0) {
    // Si los segmentos ya eran fMP4 (contienen caja ftyp o moof), concatenarlos tal cual.
    return concatenarBuffers(segmentosVideo)
  }

  let width = opciones.width || 1920
  let height = opciones.height || 1080
  if (sps) {
    const dims = parsearDimensionesSps(sps)
    if (dims && dims.width > 0 && dims.height > 0) {
      width = dims.width
      height = dims.height
    }
  }

  return construirMp4({
    videoSamples,
    sps: sps ?? new Uint8Array([0x67, 0x64, 0x00, 0x2a]),
    pps: pps ?? new Uint8Array([0x68, 0xeb, 0xe3, 0xcb, 0x22, 0xc0]),
    width,
    height,
    audioSamples,
    audioConfig,
  })
}

type AudioConfig = {
  profile: number
  samplingFreqIndex: number
  sampleRate: number
  channelConfig: number
}

function demuxarSegmentosTs(segmentos: Uint8Array[]) {
  let pmtPid = -1
  let videoPid = -1
  let audioPid = -1

  const videoPesChunks: Uint8Array[] = []
  const audioPesChunks: Uint8Array[] = []

  const videoSamples: VideoSample[] = []
  const audioSamples: AudioSample[] = []
  let sps: Uint8Array | null = null
  let pps: Uint8Array | null = null
  let audioConfig: AudioConfig | null = null

  const procesarVideoPes = (pes: Uint8Array) => {
    const parsed = parsearCabeceraPes(pes)
    if (!parsed) return
    const { payload, pts, dts } = parsed
    const nalus = separarNalusAnnexB(payload)
    if (nalus.length === 0) return

    let vclNalus: Uint8Array[] = []
    let isKeyframe = false

    const emitirFrame = () => {
      if (vclNalus.length === 0) return
      let totalBytes = 0
      for (const n of vclNalus) totalBytes += 4 + n.byteLength
      const avcc = new Uint8Array(totalBytes)
      const view = new DataView(avcc.buffer)
      let offset = 0
      for (const n of vclNalus) {
        view.setUint32(offset, n.byteLength, false)
        avcc.set(n, offset + 4)
        offset += 4 + n.byteLength
      }
      videoSamples.push({
        data: avcc,
        pts,
        dts,
        isKeyframe,
      })
      vclNalus = []
      isKeyframe = false
    }

    let tieneVcl = false
    for (const nalu of nalus) {
      if (nalu.byteLength === 0) continue
      const nalType = nalu[0] & 0x1f
      if (nalType === 7) {
        if (!sps) sps = nalu
      } else if (nalType === 8) {
        if (!pps) pps = nalu
      } else if (nalType === 9) {
        // Access Unit Delimiter: si ya habia un frame VCL en este PES, lo cerramos.
        if (tieneVcl) {
          emitirFrame()
          tieneVcl = false
        }
      } else if (nalType >= 1 && nalType <= 5) {
        if (nalType === 5) isKeyframe = true
        tieneVcl = true
        vclNalus.push(nalu)
      } else if (nalType === 6) {
        // SEI
        vclNalus.push(nalu)
      }
    }

    if (tieneVcl) emitirFrame()
  }

  const procesarAudioPes = (pes: Uint8Array) => {
    const parsed = parsearCabeceraPes(pes)
    if (!parsed) return
    const { payload, pts } = parsed
    let pos = 0
    let frameIndex = 0
    while (pos + 7 <= payload.byteLength) {
      if (payload[pos] !== 0xff || (payload[pos + 1] & 0xf0) !== 0xf0) {
        pos++
        continue
      }
      const protectionAbsent = payload[pos + 1] & 0x01
      const headerLen = protectionAbsent ? 7 : 9
      const profile = ((payload[pos + 2] >> 6) & 0x03) + 1
      const samplingFreqIndex = (payload[pos + 2] >> 2) & 0x0f
      const channelConfig = ((payload[pos + 2] & 0x01) << 2) | ((payload[pos + 3] >> 6) & 0x03)
      const frameLength =
        ((payload[pos + 3] & 0x03) << 11) | (payload[pos + 4] << 3) | ((payload[pos + 5] >> 5) & 0x07)

      if (frameLength <= headerLen || pos + frameLength > payload.byteLength) {
        break
      }

      const sampleRate = FRECUENCIAS_AAC[samplingFreqIndex] ?? 48000
      if (!audioConfig) {
        audioConfig = {
          profile,
          samplingFreqIndex,
          sampleRate,
          channelConfig: channelConfig || 2,
        }
      }

      const rawAac = payload.slice(pos + headerLen, pos + frameLength)
      const framePts = pts + Math.round((frameIndex * 1024 * 90000) / sampleRate)
      audioSamples.push({ data: rawAac, pts: framePts })

      pos += frameLength
      frameIndex++
    }
  }

  const flushVideo = () => {
    if (videoPesChunks.length === 0) return
    const unido = concatenarBuffers(videoPesChunks)
    videoPesChunks.length = 0
    procesarVideoPes(unido)
  }

  const flushAudio = () => {
    if (audioPesChunks.length === 0) return
    const unido = concatenarBuffers(audioPesChunks)
    audioPesChunks.length = 0
    procesarAudioPes(unido)
  }

  for (const seg of segmentos) {
    let offset = 0
    // Sincronizar al primer byte 0x47
    while (offset + 188 <= seg.byteLength && seg[offset] !== 0x47) {
      offset++
    }

    for (; offset + 188 <= seg.byteLength; offset += 188) {
      if (seg[offset] !== 0x47) continue

      const tei = seg[offset + 1] & 0x80
      if (tei) continue

      const pusi = (seg[offset + 1] & 0x40) !== 0
      const pid = ((seg[offset + 1] & 0x1f) << 8) | seg[offset + 2]
      const afc = (seg[offset + 3] >> 4) & 0x03

      // Sin carga util
      if (afc === 0 || afc === 2) continue

      let pos = offset + 4
      if (afc === 3) {
        const adaptationLength = seg[pos]
        pos += 1 + adaptationLength
      }
      if (pos >= offset + 188) continue

      if (pid === 0) {
        // PAT
        let patPos = pos
        if (pusi) patPos += 1 + seg[patPos]
        if (patPos + 12 <= offset + 188 && seg[patPos] === 0x00) {
          const sectionLength = ((seg[patPos + 1] & 0x0f) << 8) | seg[patPos + 2]
          const endPat = Math.min(offset + 188, patPos + 3 + sectionLength - 4)
          let p = patPos + 8
          while (p + 4 <= endPat) {
            const programNum = (seg[p] << 8) | seg[p + 1]
            const progPid = ((seg[p + 2] & 0x1f) << 8) | seg[p + 3]
            if (programNum !== 0) {
              pmtPid = progPid
              break
            }
            p += 4
          }
        }
      } else if (pid === pmtPid && pmtPid !== -1) {
        // PMT
        let pmtPos = pos
        if (pusi) pmtPos += 1 + seg[pmtPos]
        if (pmtPos + 12 <= offset + 188 && seg[pmtPos] === 0x02) {
          const sectionLength = ((seg[pmtPos + 1] & 0x0f) << 8) | seg[pmtPos + 2]
          const progInfoLen = ((seg[pmtPos + 10] & 0x0f) << 8) | seg[pmtPos + 11]
          let esPos = pmtPos + 12 + progInfoLen
          const endPmt = Math.min(offset + 188, pmtPos + 3 + sectionLength - 4)
          while (esPos + 5 <= endPmt) {
            const streamType = seg[esPos]
            const elementaryPid = ((seg[esPos + 1] & 0x1f) << 8) | seg[esPos + 2]
            const esInfoLen = ((seg[esPos + 3] & 0x0f) << 8) | seg[esPos + 4]
            if (streamType === 0x1b && videoPid === -1) videoPid = elementaryPid
            if ((streamType === 0x0f || streamType === 0x11) && audioPid === -1) audioPid = elementaryPid
            esPos += 5 + esInfoLen
          }
        }
      } else if (pid === videoPid || (videoPid === -1 && pid === 256)) {
        if (pusi) flushVideo()
        videoPesChunks.push(seg.subarray(pos, offset + 188))
      } else if (pid === audioPid || (audioPid === -1 && pid === 257)) {
        if (pusi) flushAudio()
        audioPesChunks.push(seg.subarray(pos, offset + 188))
      }
    }
  }

  flushVideo()
  flushAudio()

  return { videoSamples, audioSamples, sps, pps, audioConfig }
}

function parsearCabeceraPes(pes: Uint8Array): { payload: Uint8Array; pts: number; dts: number } | null {
  if (pes.byteLength < 9) return null
  if (pes[0] !== 0x00 || pes[1] !== 0x00 || pes[2] !== 0x01) return null

  const flags = pes[7]
  const ptsDtsFlags = (flags >> 6) & 0x03
  const headerDataLen = pes[8]
  const payloadStart = 9 + headerDataLen
  if (payloadStart > pes.byteLength) return null

  let pts = 0
  let dts = 0
  if ((ptsDtsFlags & 0x02) !== 0 && pes.byteLength >= 14) {
    pts = leerTimestampPes(pes, 9)
    dts = pts
  }
  if ((ptsDtsFlags & 0x01) !== 0 && pes.byteLength >= 19) {
    dts = leerTimestampPes(pes, 14)
  }

  return {
    payload: pes.subarray(payloadStart),
    pts,
    dts,
  }
}

function leerTimestampPes(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] & 0x0e) * 536870912 +
    ((buf[offset + 1] & 0xff) << 22) +
    ((buf[offset + 2] & 0xfe) << 14) +
    ((buf[offset + 3] & 0xff) << 7) +
    ((buf[offset + 4] & 0xfe) >> 1)
  )
}

function separarNalusAnnexB(buf: Uint8Array): Uint8Array[] {
  const nalus: Uint8Array[] = []
  const len = buf.byteLength
  let nalStart = -1
  let i = 0

  while (i < len) {
    if (
      i + 2 < len &&
      buf[i] === 0x00 &&
      buf[i + 1] === 0x00 &&
      (buf[i + 2] === 0x01 || (i + 3 < len && buf[i + 2] === 0x00 && buf[i + 3] === 0x01))
    ) {
      const startCodeLen = buf[i + 2] === 0x01 ? 3 : 4
      if (nalStart !== -1 && i > nalStart) {
        nalus.push(buf.subarray(nalStart, i))
      }
      nalStart = i + startCodeLen
      i = nalStart
    } else {
      i++
    }
  }
  if (nalStart !== -1 && nalStart < len) {
    nalus.push(buf.subarray(nalStart, len))
  }
  return nalus
}

/**
 * Extrae ancho y alto reales de un NALU SPS H.264 decodificando Exp-Golomb.
 */
function parsearDimensionesSps(spsNalu: Uint8Array): { width: number; height: number } | null {
  try {
    // Quitar bytes de prevencion de emulacion (00 00 03 -> 00 00)
    const rbsp: number[] = []
    for (let i = 1; i < spsNalu.byteLength; i++) {
      if (i >= 3 && spsNalu[i] === 0x03 && spsNalu[i - 1] === 0x00 && spsNalu[i - 2] === 0x00) {
        continue
      }
      rbsp.push(spsNalu[i])
    }
    let bitPos = 0
    const leerBits = (n: number): number => {
      let val = 0
      for (let i = 0; i < n; i++) {
        const byteIdx = bitPos >> 3
        if (byteIdx >= rbsp.length) return 0
        const bitIdx = 7 - (bitPos & 7)
        val = (val << 1) | ((rbsp[byteIdx] >> bitIdx) & 1)
        bitPos++
      }
      return val
    }
    const leerUE = (): number => {
      let zeros = 0
      while (bitPos < rbsp.length * 8 && leerBits(1) === 0) zeros++
      return (1 << zeros) - 1 + leerBits(zeros)
    }
    const leerSE = (): number => {
      const ue = leerUE()
      return ue & 1 ? (ue + 1) >> 1 : -(ue >> 1)
    }

    const profileIdc = leerBits(8)
    leerBits(16) // constraint flags + level_idc
    leerUE() // seq_parameter_set_id

    let chromaFormatIdc = 1
    if (
      profileIdc === 100 ||
      profileIdc === 110 ||
      profileIdc === 122 ||
      profileIdc === 244 ||
      profileIdc === 44 ||
      profileIdc === 83 ||
      profileIdc === 86 ||
      profileIdc === 118 ||
      profileIdc === 128
    ) {
      chromaFormatIdc = leerUE()
      if (chromaFormatIdc === 3) leerBits(1)
      leerUE() // bit_depth_luma_minus8
      leerUE() // bit_depth_chroma_minus8
      leerBits(1) // qpprime_y_zero_transform_bypass_flag
      const seqScalingMatrixPresent = leerBits(1)
      if (seqScalingMatrixPresent) {
        const count = chromaFormatIdc !== 3 ? 8 : 12
        for (let i = 0; i < count; i++) {
          if (leerBits(1)) {
            const sizeOfScalingList = i < 6 ? 16 : 64
            let lastScale = 8
            let nextScale = 8
            for (let j = 0; j < sizeOfScalingList; j++) {
              if (nextScale !== 0) {
                const delta = leerSE()
                nextScale = (lastScale + delta + 256) % 256
              }
              lastScale = nextScale === 0 ? lastScale : nextScale
            }
          }
        }
      }
    }

    leerUE() // log2_max_frame_num_minus4
    const picOrderCntType = leerUE()
    if (picOrderCntType === 0) {
      leerUE()
    } else if (picOrderCntType === 1) {
      leerBits(1)
      leerSE()
      leerSE()
      const numRefFramesInPicOrderCntCycle = leerUE()
      for (let i = 0; i < numRefFramesInPicOrderCntCycle; i++) leerSE()
    }
    leerUE() // max_num_ref_frames
    leerBits(1) // gaps_in_frame_num_value_allowed_flag
    const picWidthInMbsMinus1 = leerUE()
    const picHeightInMapUnitsMinus1 = leerUE()
    const frameMbsOnlyFlag = leerBits(1)
    if (!frameMbsOnlyFlag) leerBits(1)
    leerBits(1) // direct_8x8_inference_flag
    const frameCroppingFlag = leerBits(1)
    let cropLeft = 0
    let cropRight = 0
    let cropTop = 0
    let cropBottom = 0
    if (frameCroppingFlag) {
      cropLeft = leerUE()
      cropRight = leerUE()
      cropTop = leerUE()
      cropBottom = leerUE()
    }

    const cropUnitX = chromaFormatIdc === 0 ? 1 : 2
    const cropUnitY = (chromaFormatIdc === 0 ? 1 : 2) * (2 - frameMbsOnlyFlag)
    const width = (picWidthInMbsMinus1 + 1) * 16 - (cropLeft + cropRight) * cropUnitX
    const height =
      (2 - frameMbsOnlyFlag) * (picHeightInMapUnitsMinus1 + 1) * 16 - (cropTop + cropBottom) * cropUnitY
    return { width, height }
  } catch {
    return null
  }
}

function construirMp4(params: {
  videoSamples: VideoSample[]
  sps: Uint8Array
  pps: Uint8Array
  width: number
  height: number
  audioSamples: AudioSample[]
  audioConfig: AudioConfig | null
}): Uint8Array {
  const { videoSamples, sps, pps, width, height, audioSamples, audioConfig } = params

  // Calcular tamanos de payload en mdat: primero todo el chunk de video, luego todo el chunk de audio
  let videoDataSize = 0
  for (const s of videoSamples) videoDataSize += s.data.byteLength
  let audioDataSize = 0
  for (const s of audioSamples) audioDataSize += s.data.byteLength
  const mdatPayloadSize = videoDataSize + audioDataSize

  const ftyp = box("ftyp", u8([
    // major_brand: isom, minor_version: 512, compatible_brands: isom, iso2, avc1, mp41
    0x69, 0x73, 0x6f, 0x6d,
    0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d,
    0x69, 0x73, 0x6f, 0x32,
    0x61, 0x76, 0x63, 0x31,
    0x6d, 0x70, 0x34, 0x31,
  ]))

  // Primera pasada con offsets 0 para medir el tamano exacto de moov
  const moovDummy = armarMoov({
    videoSamples,
    sps,
    pps,
    width,
    height,
    audioSamples,
    audioConfig,
    videoChunkOffset: 0,
    audioChunkOffset: 0,
  })

  const mdatDataStart = ftyp.byteLength + moovDummy.byteLength + 8
  const videoChunkOffset = mdatDataStart
  const audioChunkOffset = mdatDataStart + videoDataSize

  const moov = armarMoov({
    videoSamples,
    sps,
    pps,
    width,
    height,
    audioSamples,
    audioConfig,
    videoChunkOffset,
    audioChunkOffset,
  })

  const totalSize = ftyp.byteLength + moov.byteLength + 8 + mdatPayloadSize
  const salida = new Uint8Array(totalSize)
  let ptr = 0
  salida.set(ftyp, ptr)
  ptr += ftyp.byteLength
  salida.set(moov, ptr)
  ptr += moov.byteLength

  // Cabecera mdat
  const mdatView = new DataView(salida.buffer, ptr, 8)
  mdatView.setUint32(0, 8 + mdatPayloadSize, false)
  salida[ptr + 4] = 0x6d // 'm'
  salida[ptr + 5] = 0x64 // 'd'
  salida[ptr + 6] = 0x61 // 'a'
  salida[ptr + 7] = 0x74 // 't'
  ptr += 8

  for (const s of videoSamples) {
    salida.set(s.data, ptr)
    ptr += s.data.byteLength
  }
  for (const s of audioSamples) {
    salida.set(s.data, ptr)
    ptr += s.data.byteLength
  }

  return salida
}

function armarMoov(params: {
  videoSamples: VideoSample[]
  sps: Uint8Array
  pps: Uint8Array
  width: number
  height: number
  audioSamples: AudioSample[]
  audioConfig: AudioConfig | null
  videoChunkOffset: number
  audioChunkOffset: number
}): Uint8Array {
  const { videoSamples, sps, pps, width, height, audioSamples, audioConfig, videoChunkOffset, audioChunkOffset } =
    params

  const traks: Uint8Array[] = []
  let duracionMaximaMs = 0

  if (videoSamples.length > 0) {
    const { trak, duration90k } = armarVideoTrak({
      videoSamples,
      sps,
      pps,
      width,
      height,
      chunkOffset: videoChunkOffset,
    })
    traks.push(trak)
    duracionMaximaMs = Math.max(duracionMaximaMs, Math.round((duration90k * 1000) / 90000))
  }

  if (audioSamples.length > 0 && audioConfig) {
    const { trak, durationMs } = armarAudioTrak({
      audioSamples,
      audioConfig,
      chunkOffset: audioChunkOffset,
      trackId: videoSamples.length > 0 ? 2 : 1,
    })
    traks.push(trak)
    duracionMaximaMs = Math.max(duracionMaximaMs, durationMs)
  }

  const mvhd = armarMvhd(duracionMaximaMs, traks.length + 1)
  return box("moov", mvhd, ...traks)
}

function armarVideoTrak(params: {
  videoSamples: VideoSample[]
  sps: Uint8Array
  pps: Uint8Array
  width: number
  height: number
  chunkOffset: number
}): { trak: Uint8Array; duration90k: number } {
  const { videoSamples, sps, pps, width, height, chunkOffset } = params
  const n = videoSamples.length

  // Duraciones por sample en escala 90000 Hz
  const deltas: number[] = new Array(n)
  let sumaValida = 0
  let conteoValido = 0
  for (let i = 0; i < n - 1; i++) {
    const d = videoSamples[i + 1].dts - videoSamples[i].dts
    if (d > 0 && d < 90000 * 5) {
      deltas[i] = d
      sumaValida += d
      conteoValido++
    } else {
      deltas[i] = -1
    }
  }
  const deltaPromedio = conteoValido > 0 ? Math.round(sumaValida / conteoValido) : 3000
  for (let i = 0; i < n - 1; i++) {
    if (deltas[i] <= 0) deltas[i] = deltaPromedio
  }
  deltas[n - 1] = n > 1 ? deltas[n - 2] : deltaPromedio

  let duration90k = 0
  for (const d of deltas) duration90k += d

  // Composicion PTS - DTS (normalizada a >= 0 para ctts version 0)
  let minCts = 0
  const ctsRaw: number[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const c = videoSamples[i].pts - videoSamples[i].dts
    const cClamped = Math.abs(c) < 90000 * 5 ? c : 0
    ctsRaw[i] = cClamped
    if (cClamped < minCts) minCts = cClamped
  }
  const ctsOffsets = ctsRaw.map((c) => c - minCts)

  // stts (run-length encoded)
  const sttsEntries: { count: number; delta: number }[] = []
  for (const d of deltas) {
    const last = sttsEntries[sttsEntries.length - 1]
    if (last && last.delta === d) last.count++
    else sttsEntries.push({ count: 1, delta: d })
  }
  const sttsBuf = new Uint8Array(8 + sttsEntries.length * 8)
  const sttsView = new DataView(sttsBuf.buffer)
  sttsView.setUint32(4, sttsEntries.length, false)
  sttsEntries.forEach((e, idx) => {
    sttsView.setUint32(8 + idx * 8, e.count, false)
    sttsView.setUint32(12 + idx * 8, e.delta, false)
  })
  const stts = box("stts", sttsBuf)

  // ctts (run-length encoded)
  const cttsEntries: { count: number; offset: number }[] = []
  for (const off of ctsOffsets) {
    const last = cttsEntries[cttsEntries.length - 1]
    if (last && last.offset === off) last.count++
    else cttsEntries.push({ count: 1, offset: off })
  }
  const cttsBuf = new Uint8Array(8 + cttsEntries.length * 8)
  const cttsView = new DataView(cttsBuf.buffer)
  cttsView.setUint32(4, cttsEntries.length, false)
  cttsEntries.forEach((e, idx) => {
    cttsView.setUint32(8 + idx * 8, e.count, false)
    cttsView.setUint32(12 + idx * 8, e.offset, false)
  })
  const ctts = box("ctts", cttsBuf)

  // stss (keyframes 1-indexed)
  const keyframes: number[] = []
  videoSamples.forEach((s, idx) => {
    if (s.isKeyframe) keyframes.push(idx + 1)
  })
  if (keyframes.length === 0) keyframes.push(1)
  const stssBuf = new Uint8Array(8 + keyframes.length * 4)
  const stssView = new DataView(stssBuf.buffer)
  stssView.setUint32(4, keyframes.length, false)
  keyframes.forEach((k, idx) => stssView.setUint32(8 + idx * 4, k, false))
  const stss = box("stss", stssBuf)

  // stsz
  const stszBuf = new Uint8Array(12 + n * 4)
  const stszView = new DataView(stszBuf.buffer)
  stszView.setUint32(8, n, false)
  videoSamples.forEach((s, idx) => stszView.setUint32(12 + idx * 4, s.data.byteLength, false))
  const stsz = box("stsz", stszBuf)

  // stsc: 1 solo chunk con los n samples
  const stscBuf = new Uint8Array(20)
  const stscView = new DataView(stscBuf.buffer)
  stscView.setUint32(4, 1, false)
  stscView.setUint32(8, 1, false) // first_chunk = 1
  stscView.setUint32(12, n, false) // samples_per_chunk = n
  stscView.setUint32(16, 1, false) // sample_description_index = 1
  const stsc = box("stsc", stscBuf)

  // stco (1 chunk offset)
  const stcoBuf = new Uint8Array(12)
  const stcoView = new DataView(stcoBuf.buffer)
  stcoView.setUint32(4, 1, false)
  stcoView.setUint32(8, chunkOffset >>> 0, false)
  const stco = box("stco", stcoBuf)

  // avcC + avc1 + stsd
  const profileIdc = sps.byteLength > 1 ? sps[1] : 0x64
  const profileCompat = sps.byteLength > 2 ? sps[2] : 0x00
  const levelIdc = sps.byteLength > 3 ? sps[3] : 0x2a
  const avcC = box(
    "avcC",
    u8([
      0x01,
      profileIdc,
      profileCompat,
      levelIdc,
      0xff, // lengthSizeMinusOne = 3 (4 bytes)
      0xe1, // numOfSequenceParameterSets = 1
      (sps.byteLength >> 8) & 0xff,
      sps.byteLength & 0xff,
    ]),
    sps,
    u8([
      0x01, // numOfPictureParameterSets = 1
      (pps.byteLength >> 8) & 0xff,
      pps.byteLength & 0xff,
    ]),
    pps
  )

  const avc1Header = new Uint8Array(78)
  const avc1View = new DataView(avc1Header.buffer)
  avc1View.setUint16(6, 1, false) // data_reference_index = 1
  avc1View.setUint16(24, width, false)
  avc1View.setUint16(26, height, false)
  avc1View.setUint32(28, 0x00480000, false) // horizresolution 72 dpi
  avc1View.setUint32(32, 0x00480000, false) // vertresolution 72 dpi
  avc1View.setUint16(40, 1, false) // frame_count = 1
  avc1View.setUint16(74, 0x0018, false) // depth = 24
  avc1View.setInt16(76, -1, false) // pre_defined = -1
  const avc1 = box("avc1", avc1Header, avcC)

  const stsdHeader = new Uint8Array(8)
  new DataView(stsdHeader.buffer).setUint32(4, 1, false)
  const stsd = box("stsd", stsdHeader, avc1)

  const stbl = box("stbl", stsd, stts, ctts, stss, stsc, stsz, stco)
  const vmhd = box("vmhd", u8([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))
  const dinf = armarDinf()
  const minf = box("minf", vmhd, dinf, stbl)

  const mdhd = armarMdhd(90000, duration90k)
  const hdlr = armarHdlr("vide", "VideoHandler")
  const mdia = box("mdia", mdhd, hdlr, minf)

  const durationMs = Math.round((duration90k * 1000) / 90000)
  const tkhd = armarTkhd({ trackId: 1, durationMs, width, height, isAudio: false })
  return { trak: box("trak", tkhd, mdia), duration90k }
}

function armarAudioTrak(params: {
  audioSamples: AudioSample[]
  audioConfig: AudioConfig
  chunkOffset: number
  trackId: number
}): { trak: Uint8Array; durationMs: number } {
  const { audioSamples, audioConfig, chunkOffset, trackId } = params
  const n = audioSamples.length
  const sampleRate = audioConfig.sampleRate
  const totalSamples = n * 1024
  const durationMs = Math.round((totalSamples * 1000) / sampleRate)

  // stts: n tramas de 1024 muestras cada una
  const sttsBuf = new Uint8Array(16)
  const sttsView = new DataView(sttsBuf.buffer)
  sttsView.setUint32(4, 1, false)
  sttsView.setUint32(8, n, false)
  sttsView.setUint32(12, 1024, false)
  const stts = box("stts", sttsBuf)

  // stsz
  const stszBuf = new Uint8Array(12 + n * 4)
  const stszView = new DataView(stszBuf.buffer)
  stszView.setUint32(8, n, false)
  audioSamples.forEach((s, idx) => stszView.setUint32(12 + idx * 4, s.data.byteLength, false))
  const stsz = box("stsz", stszBuf)

  // stsc: 1 chunk con n samples
  const stscBuf = new Uint8Array(20)
  const stscView = new DataView(stscBuf.buffer)
  stscView.setUint32(4, 1, false)
  stscView.setUint32(8, 1, false)
  stscView.setUint32(12, n, false)
  stscView.setUint32(16, 1, false)
  const stsc = box("stsc", stscBuf)

  // stco
  const stcoBuf = new Uint8Array(12)
  const stcoView = new DataView(stcoBuf.buffer)
  stcoView.setUint32(4, 1, false)
  stcoView.setUint32(8, chunkOffset >>> 0, false)
  const stco = box("stco", stcoBuf)

  // AudioSpecificConfig (2 bytes): audioObjectType (5 bits) + samplingFreqIndex (4 bits) + channelConfig (4 bits)
  const ascByte1 = ((audioConfig.profile & 0x1f) << 3) | ((audioConfig.samplingFreqIndex & 0x0e) >> 1)
  const ascByte2 = ((audioConfig.samplingFreqIndex & 0x01) << 7) | ((audioConfig.channelConfig & 0x0f) << 3)

  const esds = box(
    "esds",
    u8([
      0x00, 0x00, 0x00, 0x00, // version + flags
      0x03, 0x19, // ES_Descriptor tag=3, len=25
      0x00, 0x02, // ES_ID = 2
      0x00, // flags
      0x04, 0x11, // DecoderConfigDescriptor tag=4, len=17
      0x40, // objectTypeIndication = 0x40 (Audio ISO/IEC 14496-3)
      0x15, // streamType = 5 (AudioStream) << 2 | 1
      0x00, 0x00, 0x00, // bufferSizeDB
      0x00, 0x01, 0xf4, 0x00, // maxBitrate (128kbps)
      0x00, 0x01, 0xf4, 0x00, // avgBitrate
      0x05, 0x02, // DecoderSpecificInfo tag=5, len=2
      ascByte1,
      ascByte2,
      0x06, 0x01, 0x02, // SLConfigDescriptor tag=6, len=1, predefined=2
    ])
  )

  const mp4aHeader = new Uint8Array(28)
  const mp4aView = new DataView(mp4aHeader.buffer)
  mp4aView.setUint16(6, 1, false) // data_reference_index = 1
  mp4aView.setUint16(16, audioConfig.channelConfig, false)
  mp4aView.setUint16(18, 16, false) // sampleSize = 16
  mp4aView.setUint32(24, (sampleRate << 16) >>> 0, false)
  const mp4a = box("mp4a", mp4aHeader, esds)

  const stsdHeader = new Uint8Array(8)
  new DataView(stsdHeader.buffer).setUint32(4, 1, false)
  const stsd = box("stsd", stsdHeader, mp4a)

  const stbl = box("stbl", stsd, stts, stsc, stsz, stco)
  const smhd = box("smhd", new Uint8Array(8))
  const dinf = armarDinf()
  const minf = box("minf", smhd, dinf, stbl)

  const mdhd = armarMdhd(sampleRate, totalSamples)
  const hdlr = armarHdlr("soun", "SoundHandler")
  const mdia = box("mdia", mdhd, hdlr, minf)

  const tkhd = armarTkhd({ trackId, durationMs, width: 0, height: 0, isAudio: true })
  return { trak: box("trak", tkhd, mdia), durationMs }
}

function armarMvhd(durationMs: number, nextTrackId: number): Uint8Array {
  const buf = new Uint8Array(100)
  const view = new DataView(buf.buffer)
  view.setUint32(12, 1000, false) // timescale = 1000 ms
  view.setUint32(16, durationMs, false)
  view.setUint32(20, 0x00010000, false) // rate = 1.0
  view.setUint16(24, 0x0100, false) // volume = 1.0
  // Matriz identidad
  view.setUint32(36, 0x00010000, false)
  view.setUint32(52, 0x00010000, false)
  view.setUint32(68, 0x40000000, false)
  view.setUint32(96, nextTrackId, false)
  return box("mvhd", buf)
}

function armarTkhd(params: {
  trackId: number
  durationMs: number
  width: number
  height: number
  isAudio: boolean
}): Uint8Array {
  const buf = new Uint8Array(84)
  const view = new DataView(buf.buffer)
  view.setUint32(0, 0x00000007, false) // flags: track_enabled | track_in_movie | track_in_preview
  view.setUint32(12, params.trackId, false)
  view.setUint32(20, params.durationMs, false)
  view.setUint16(36, params.isAudio ? 0x0100 : 0, false) // volume
  // Matriz identidad
  view.setUint32(40, 0x00010000, false)
  view.setUint32(56, 0x00010000, false)
  view.setUint32(72, 0x40000000, false)
  view.setUint32(76, (params.width << 16) >>> 0, false)
  view.setUint32(80, (params.height << 16) >>> 0, false)
  return box("tkhd", buf)
}

function armarMdhd(timescale: number, duration: number): Uint8Array {
  const buf = new Uint8Array(24)
  const view = new DataView(buf.buffer)
  view.setUint32(12, timescale, false)
  view.setUint32(16, duration, false)
  view.setUint16(20, 0x55c4, false) // lang = 'und'
  return box("mdhd", buf)
}

function armarHdlr(handlerType: string, name: string): Uint8Array {
  const nameBytes = new TextEncoder().encode(name + "\0")
  const buf = new Uint8Array(24 + nameBytes.byteLength)
  for (let i = 0; i < 4; i++) buf[8 + i] = handlerType.charCodeAt(i)
  buf.set(nameBytes, 24)
  return box("hdlr", buf)
}

function armarDinf(): Uint8Array {
  const urlBox = box("url ", u8([0x00, 0x00, 0x00, 0x01]))
  const drefHeader = new Uint8Array(8)
  new DataView(drefHeader.buffer).setUint32(4, 1, false)
  const dref = box("dref", drefHeader, urlBox)
  return box("dinf", dref)
}

function box(type: string, ...payloads: Uint8Array[]): Uint8Array {
  let size = 8
  for (const p of payloads) size += p.byteLength
  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  view.setUint32(0, size, false)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  let offset = 8
  for (const p of payloads) {
    out.set(p, offset)
    offset += p.byteLength
  }
  return out
}

function u8(bytes: number[]): Uint8Array {
  return new Uint8Array(bytes)
}

export function concatenarBuffers(buffers: Uint8Array[]): Uint8Array {
  let total = 0
  for (const b of buffers) total += b.byteLength
  const out = new Uint8Array(total)
  let offset = 0
  for (const b of buffers) {
    out.set(b, offset)
    offset += b.byteLength
  }
  return out
}
