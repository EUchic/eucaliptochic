"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon";

// El micrófono del asistente. Graba lo que dice Andrea, nota cuando deja de hablar y lo manda solo.
// Con OpenAI conectado el audio se convierte en texto en el servidor (sirve igual en iPhone, Android
// y en la app instalada). Sin OpenAI usa el dictado del teléfono y manda lo que haya escuchado.

export type EstadoVoz = "quieto" | "pidiendo" | "escuchando" | "escribiendo";
export type PistasVoz = { nombres: string[]; piezas: string[] };
type Opciones = { alTexto: (t: string) => void; avisar: (m: string, malo?: boolean) => void; pistas: PistasVoz };

const SILENCIO_MS = 1500; // una pausa así de larga quiere decir "ya terminé"
const SIN_VOZ_MS = 8000; // si no dice nada en este rato, se cierra solo
const MAX_MS = 60000; // un minuto por audio

export function useVoz({ alTexto, avisar, pistas }: Opciones) {
  const [estado, setEstado] = useState<EstadoVoz>("quieto");
  const [modo, setModo] = useState<"nube" | "dictado">("nube");
  const [oido, setOido] = useState("");
  const medidor = useRef<HTMLButtonElement>(null);
  const nube = useRef<boolean | null>(null);
  const sesion = useRef<{ parar: (mandar: boolean) => void } | null>(null);
  const cb = useRef({ alTexto, avisar, pistas });
  cb.current = { alTexto, avisar, pistas };

  const revisar = useCallback(() => {
    fetch("/api/voz", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { listo: false }))
      .then((j) => { nube.current = !!j?.listo; })
      .catch(() => {});
  }, []);

  useEffect(() => {
    revisar();
    return () => sesion.current?.parar(false);
  }, [revisar]);

  const pintar = (v: number) => medidor.current?.style.setProperty("--nivel", v.toFixed(3));
  const hayDictado = () => !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const transcribir = async (audio: Blob): Promise<string> => {
    const f = new FormData();
    const ext = audio.type.includes("mp4") ? "mp4" : audio.type.includes("ogg") ? "ogg" : "webm";
    f.append("audio", audio, `voz.${ext}`);
    f.append("pistas", JSON.stringify(cb.current.pistas));
    try {
      const r = await fetch("/api/voz", { method: "POST", body: f });
      const j = await r.json().catch(() => ({}));
      if (r.status === 501) {
        nube.current = false;
        cb.current.avisar(
          "Todavía no está conectada la IA que entiende audios. " +
            (hayDictado() ? "Tocá el micrófono otra vez y uso el dictado del teléfono." : "Por ahora escribilo abajo."),
          true,
        );
        return "";
      }
      if (!r.ok) { cb.current.avisar(j?.error || "No pude entender el audio. Probá de nuevo.", true); return ""; }
      if (!j?.texto) { cb.current.avisar("No te entendí bien. Probá de nuevo, un poquito más cerca del teléfono.", true); return ""; }
      return String(j.texto);
    } catch {
      cb.current.avisar("Sin internet no puedo entender el audio. Escribilo abajo.", true);
      return "";
    }
  };

  /** Graba con el micrófono y se detiene sola cuando Andrea se queda callada. */
  const grabar = async () => {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    let ctx: AudioContext | null = null;
    try { ctx = AC ? new AC() : null; ctx?.resume().catch(() => {}); } catch { ctx = null; }

    let abortado = false;
    sesion.current = { parar: () => { abortado = true; } };
    setModo("nube"); setOido(""); setEstado("pidiendo");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e: any) {
      ctx?.close().catch(() => {});
      sesion.current = null; setEstado("quieto");
      if (!abortado) {
        const permiso = e?.name === "NotAllowedError" || e?.name === "SecurityError";
        cb.current.avisar(
          permiso
            ? "El teléfono no dio permiso al micrófono. En Ajustes, dejá que el navegador use el micrófono y probá otra vez."
            : "No pude usar el micrófono. Revisá que otra app no lo esté usando.",
          true,
        );
      }
      return;
    }
    if (abortado) {
      stream.getTracks().forEach((t) => t.stop()); ctx?.close().catch(() => {});
      sesion.current = null; setEstado("quieto");
      return;
    }

    const tipo = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find((t) => {
      try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
    }) ?? "";
    let mr: MediaRecorder;
    try { mr = new MediaRecorder(stream, { ...(tipo ? { mimeType: tipo } : {}), audioBitsPerSecond: 48000 }); }
    catch { mr = new MediaRecorder(stream); }

    const trozos: Blob[] = [];
    let mandar = true, hablo = false, maxRms = 0, parado = false, cerrado = false, raf = 0;
    const inicio = performance.now();

    const cerrar = async () => {
      if (cerrado) return;
      cerrado = true;
      cancelAnimationFrame(raf); clearTimeout(tope);
      stream.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
      pintar(0);
      sesion.current = null;
      if (!mandar) { setEstado("quieto"); return; }
      // Si el medidor funcionaba y nunca oyó voz, no gastamos en mandar silencio.
      if (!hablo && maxRms > 0) { setEstado("quieto"); cb.current.avisar("No te escuché. Tocá el micrófono y hablame un poquito más cerca.", true); return; }
      const audio = new Blob(trozos, { type: mr.mimeType || tipo || "audio/webm" });
      if (audio.size < 800) { setEstado("quieto"); cb.current.avisar("No se grabó nada. Probá de nuevo.", true); return; }
      setEstado("escribiendo");
      const texto = await transcribir(audio);
      setEstado("quieto");
      if (texto) cb.current.alTexto(texto);
    };
    const parar = (m: boolean) => {
      if (parado) return;
      parado = true; mandar = m;
      try { if (mr.state !== "inactive") mr.stop(); else cerrar(); } catch { cerrar(); }
    };
    mr.ondataavailable = (e) => { if (e.data?.size) trozos.push(e.data); };
    mr.onstop = () => { cerrar(); };
    const tope = window.setTimeout(() => parar(true), MAX_MS);
    sesion.current = { parar };

    try { mr.start(); } catch {
      stream.getTracks().forEach((t) => t.stop()); ctx?.close().catch(() => {});
      sesion.current = null; setEstado("quieto");
      cb.current.avisar("No pude grabar aquí. Escribilo abajo.", true);
      return;
    }
    setEstado("escuchando");

    // Medidor de voz: aprende el ruido del lugar en el primer instante y de ahí distingue cuándo habla.
    if (ctx) {
      try {
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Float32Array(an.fftSize);
        let piso = Infinity, umbral = 0.02, suave = 0, ultimaVoz = 0;
        const tick = () => {
          if (parado) return;
          an.getFloatTimeDomainData(buf);
          let s = 0;
          for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
          const rms = Math.sqrt(s / buf.length);
          maxRms = Math.max(maxRms, rms);
          const t = performance.now() - inicio;
          if (t < 300) {
            piso = Math.min(piso, rms);
            umbral = Math.min(0.06, Math.max(0.012, piso * 2.5));
          } else {
            if (rms > umbral) { hablo = true; ultimaVoz = t; }
            if (hablo && t - ultimaVoz > SILENCIO_MS) return parar(true);
            if (!hablo && t > SIN_VOZ_MS) return parar(true);
          }
          suave = suave * 0.7 + Math.min(1, rms / (umbral * 4)) * 0.3;
          pintar(suave);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch { hablo = true; }
    } else {
      hablo = true; // sin medidor: se manda cuando ella toca "Ya terminé" o al minuto
    }
  };

  /** Plan B sin OpenAI: el dictado del teléfono. Manda lo que haya oído aunque el teléfono no lo marque como final. */
  const dictar = (SR: any) => {
    let r: any;
    try { r = new SR(); } catch { cb.current.avisar("Este teléfono no deja dictar aquí. Escribilo abajo.", true); return; }
    r.lang = "es-CR"; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    let texto = "", problema = "", cancelado = false, parado = false, listo = false, hablo = false, espera = 0;
    const tope = window.setTimeout(() => parar(true), MAX_MS);
    const terminar = () => {
      if (listo) return;
      listo = true;
      clearTimeout(espera); clearTimeout(tope);
      sesion.current = null; setOido(""); setEstado("quieto");
      if (cancelado) return;
      const t = texto.trim();
      if (t) cb.current.alTexto(t);
      else cb.current.avisar(problema || "No te escuché. Tocá el micrófono y hablame un poquito más cerca.", true);
    };
    const parar = (mandar: boolean) => {
      if (parado) return;
      parado = true; cancelado = !mandar;
      clearTimeout(espera);
      try { r.stop(); } catch { terminar(); }
      window.setTimeout(terminar, 1200); // en iPhone a veces no avisa que terminó
    };
    const armar = () => { clearTimeout(espera); espera = window.setTimeout(() => parar(true), hablo ? SILENCIO_MS + 300 : SIN_VOZ_MS); };
    r.onresult = (e: any) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      texto = t; hablo = true; setOido(t.trim()); armar();
    };
    r.onerror = (e: any) => {
      const err = e?.error;
      if (err === "not-allowed" || err === "service-not-allowed") problema = "El teléfono no deja dictar aquí. Revisá el permiso del micrófono, o escribilo abajo.";
      else if (err === "network") problema = "El dictado necesita internet. Escribilo abajo.";
      else if (err === "audio-capture") problema = "No encontré el micrófono.";
    };
    r.onend = terminar;
    sesion.current = { parar };
    setModo("dictado"); setOido(""); setEstado("escuchando"); armar();
    try { r.start(); } catch { problema = "No pude empezar a dictar. Probá de nuevo."; terminar(); }
  };

  const empezar = useCallback(() => {
    if (sesion.current) return;
    try { window.speechSynthesis?.cancel(); } catch {}
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const puedeGrabar = typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    if (nube.current !== true) revisar();
    if (puedeGrabar && (nube.current !== false || !SR)) { grabar(); return; }
    if (SR) { dictar(SR); return; }
    cb.current.avisar("Este navegador no deja usar el micrófono. Escribilo abajo.", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisar]);

  const terminar = useCallback(() => sesion.current?.parar(true), []);
  const cancelar = useCallback(() => sesion.current?.parar(false), []);

  return { estado, modo, oido, medidor, empezar, terminar, cancelar };
}

export type Voz = ReturnType<typeof useVoz>;

/** Lo que se ve mientras escucha: un círculo grande que late con la voz, lo que va entendiendo y dos botones claros. */
export function Escuchando({ voz }: { voz: Voz }) {
  const { estado, modo, oido } = voz;
  const titulo =
    estado === "pidiendo" ? "Dale permiso al micrófono" :
    estado === "escribiendo" ? "Escribiendo lo que dijiste…" :
    "Te escucho…";
  return (
    <div className={`ch-oyendo is-${estado} is-${modo}`} role="status" aria-live="polite">
      <p className="ch-oyendo-titulo">{titulo}</p>
      {oido && estado === "escuchando" && <p className="ch-oyendo-texto">{oido}</p>}
      <button
        type="button" ref={voz.medidor} className="ch-oyendo-circulo" onClick={voz.terminar}
        disabled={estado !== "escuchando"} aria-label="Ya terminé, mandalo"
      >
        {estado === "escribiendo" ? <span className="pn-girando" /> : <Icon n="mic" s={44} />}
      </button>
      {estado === "escuchando" && <p className="ch-oyendo-ayuda">Cuando terminés de hablar, lo mando solo.</p>}
      {estado !== "escribiendo" && (
        <div className="ch-oyendo-botones">
          <button type="button" className="pn-boton is-claro" onClick={voz.cancelar}>Cancelar</button>
          {estado === "escuchando" && (
            <button type="button" className="pn-boton" onClick={voz.terminar}><Icon n="check" s={22} /> Ya terminé</button>
          )}
        </div>
      )}
    </div>
  );
}
