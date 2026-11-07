import { logger } from '../config/logger';

export interface Correo {
  para: string;
  asunto: string;
  texto: string;
}

export interface TransporteCorreo {
  enviar(correo: Correo): Promise<void>;
}

/**
 * Transporte de desarrollo: registra el correo en el log en lugar de enviarlo.
 * En la Fase 5 se reemplaza por SMTP (p. ej. nodemailer + Mailtrap/Ethereal) sin tocar los servicios.
 */
export const transporteLog: TransporteCorreo = {
  async enviar(correo) {
    logger.info(
      { para: correo.para, asunto: correo.asunto },
      `✉ Correo (simulado): ${correo.texto}`,
    );
  },
};

let transporte: TransporteCorreo = transporteLog;

export const usarTransporteCorreo = (t: TransporteCorreo) => {
  transporte = t;
};

export const enviarCorreo = (correo: Correo) => transporte.enviar(correo);
