import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { diaLargo } from '../lib/formato';
import type { Reserva } from '../lib/tipos';

/**
 * Comprobante de la reserva: número (código) grande y un QR con ese mismo código.
 * En la entrada, el personal lo escanea con un lector (o lo digita) en Mesas → Reservas de hoy.
 */
export function ComprobanteReserva({ r }: { r: Reserva }) {
  const [qr, setQr] = useState('');
  useEffect(() => {
    void QRCode.toString(r.codigoConfirmacion, {
      type: 'svg',
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#1F1A17', light: '#FFFFFF' },
    }).then(setQr);
  }, [r.codigoConfirmacion]);

  return (
    <div className="comanda rounded-t-xl p-6 text-left shadow-sm">
      <div className="flex items-center gap-5">
        <div
          className="h-32 w-32 shrink-0 [&_svg]:h-full [&_svg]:w-full"
          role="img"
          aria-label={`Código QR de la reserva ${r.codigoConfirmacion}`}
          dangerouslySetInnerHTML={{ __html: qr }}
        />
        <div className="min-w-0">
          <p className="text-sm text-ink-muted">Número de reserva</p>
          <p className="cifra-ancha text-4xl tracking-[0.12em] text-brand-red sm:text-5xl">
            {r.codigoConfirmacion}
          </p>
          <p className="mt-1 text-xs text-ink-muted">Muestra el QR o dicta el número al llegar.</p>
        </div>
      </div>
      <dl className="mt-5 space-y-2 border-t border-dashed border-line pt-4 text-sm">
        <Fila t="Sede" v={r.sede.nombre} />
        <Fila t="Dirección" v={r.sede.direccion} />
        <Fila t="Día" v={diaLargo(r.fecha)} />
        <Fila t="Hora" v={r.hora} />
        <Fila t="Personas" v={String(r.personas)} />
        {r.mesa && <Fila t="Mesa" v={`${r.mesa.codigo}, ${r.mesa.zona.toLowerCase()}`} />}
        <Fila t="A nombre de" v={r.cliente.nombre} />
      </dl>
    </div>
  );
}

function Fila({ t, v }: { t: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{t}</dt>
      <dd className="text-right font-semibold first-letter:uppercase">{v}</dd>
    </div>
  );
}
