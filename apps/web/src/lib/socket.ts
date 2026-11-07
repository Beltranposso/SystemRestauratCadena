import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { EVENTOS, type CanalSede } from '@restaurantes/shared';
import { useDispositivo } from './sesion';
import { refrescarMarca } from './marca';
import { refrescarConfiguracion, type Configuracion } from './configuracion';

type Credencial = { token?: string | null; deviceToken?: string | null };
type Sala = { sedeId: number; canal: CanalSede } | { entradaId: string };

/**
 * Conecta a Socket.IO, se une a las salas indicadas (y vuelve a unirse al reconectar)
 * y registra los manejadores de eventos. Devuelve si hay conexión, para mostrarlo en pantalla.
 */
export function useTiempoReal(
  credencial: Credencial | null,
  salas: Sala[],
  manejadores: Record<string, (datos: never) => void>,
) {
  const [conectado, setConectado] = useState(false);
  const refManejadores = useRef(manejadores);
  refManejadores.current = manejadores;
  const claveSalas = JSON.stringify(salas);
  const clave = `${credencial?.token ?? ''}|${credencial?.deviceToken ?? ''}|${claveSalas}`;

  useEffect(() => {
    if (credencial === null) return;
    const auth: Record<string, string> = {};
    if (credencial.token) auth.token = credencial.token;
    if (credencial.deviceToken) auth.deviceToken = credencial.deviceToken;

    const socket: Socket = io({ auth, transports: ['websocket', 'polling'] });
    const unirse = () => {
      for (const s of JSON.parse(claveSalas) as Sala[]) {
        if ('entradaId' in s) socket.emit(EVENTOS.unirseEspera, s);
        else socket.emit(EVENTOS.unirseSede, s);
      }
    };
    socket.on('connect', () => {
      setConectado(true);
      unirse();
    });
    socket.on('disconnect', () => setConectado(false));
    if (credencial.deviceToken) {
      // Equipo desactivado o con token cambiado desde el dashboard: vuelve a la pantalla de vincular
      const revocar = () => useDispositivo.getState().olvidar(true);
      socket.on(EVENTOS.dispositivoRevocado, revocar);
      socket.on('connect_error', (e) => {
        if (e.message === 'DISPOSITIVO_INVALIDO') revocar();
      });
    }
    socket.onAny((evento: string, datos: unknown) => {
      // Cambio de apariencia: caja, cocina, kiosco y pantalla se repintan sin recargar
      if (evento === EVENTOS.marcaActualizada) void refrescarMarca();
      if (evento === EVENTOS.configuracionActualizada)
        void refrescarConfiguracion(datos as Configuracion);
      refManejadores.current[evento]?.(datos as never);
    });
    return () => {
      socket.close();
    };
  }, [clave]);

  return conectado;
}

/** Tono corto con WebAudio (sin archivos de audio). */
export function sonar(tipo: 'listo' | 'nuevo' = 'listo') {
  try {
    const ctx = new AudioContext();
    const notas = tipo === 'listo' ? [880, 1175] : [660];
    notas.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.frequency.value = f;
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.18;
      vol.gain.setValueAtTime(0.0001, t);
      vol.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(vol).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* sin audio disponible */
  }
}
