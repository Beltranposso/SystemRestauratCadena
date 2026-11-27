/**
 * Color de marca: contraste (WCAG), derivación de tonos y sugerencias a partir de los píxeles
 * de un logo. Funciones puras: la web las usa para recomendar y la API para validar.
 */

export type Rgb = [number, number, number];

export const MARCA_POR_DEFECTO = {
  nombre: 'Fogón',
  colorPrimario: '#D62828',
  colorAcento: '#FFB703',
} as const;

/** Tinta de la interfaz (texto sobre el color de acento). */
export const TINTA = '#1F1A17';
const BLANCO: Rgb = [255, 255, 255];
const NEGRO: Rgb = [0, 0, 0];

export const esHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

export function hexARgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbAHex([r, g, b]: Rgb): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Luminancia relativa WCAG 2.x */
export function luminancia([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Relación de contraste entre dos colores (1 a 21). AA texto normal: 4.5; texto grande: 3. */
export function contraste(a: string | Rgb, b: string | Rgb): number {
  const la = luminancia(typeof a === 'string' ? hexARgb(a) : a);
  const lb = luminancia(typeof b === 'string' ? hexARgb(b) : b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mezcla `a` con `b` en proporción t (0 = a, 1 = b). */
export function mezclar(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function rgbAHsl([r, g, b]: Rgb): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === R
      ? ((G - B) / d + (G < B ? 6 : 0)) * 60
      : max === G
        ? ((B - R) / d + 2) * 60
        : ((R - G) / d + 4) * 60;
  return [h, s, l];
}

export function hslARgb(h: number, s: number, l: number): Rgb {
  const H = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [canal(H + 1 / 3) * 255, canal(H) * 255, canal(H - 1 / 3) * 255];
}

/**
 * Oscurece (hacia negro) o aclara (hacia blanco) el color lo justo para alcanzar el contraste
 * pedido contra `fondo`. Devuelve el color original si ya cumple.
 */
export function ajustarContraste(color: string, fondo: string, minimo: number): string {
  const base = hexARgb(color);
  if (contraste(base, fondo) >= minimo) return rgbAHex(base);
  const hacia = luminancia(hexARgb(fondo)) > 0.5 ? NEGRO : BLANCO;
  for (let t = 0.04; t <= 1; t += 0.04) {
    const c = mezclar(base, hacia, t);
    if (contraste(c, fondo) >= minimo) return rgbAHex(c);
  }
  return rgbAHex(hacia);
}

/** Los cuatro tonos que usa la interfaz, derivados de los dos colores elegidos. */
export function derivarPaleta(colorPrimario: string, colorAcento: string) {
  const p = hexARgb(colorPrimario);
  const a = hexARgb(colorAcento);
  return {
    primario: rgbAHex(p),
    primarioOscuro: rgbAHex(mezclar(p, NEGRO, 0.22)),
    acento: rgbAHex(a),
    acentoSuave: rgbAHex(mezclar(a, BLANCO, 0.62)),
  };
}

/** Qué tan legible queda la combinación en la interfaz. */
export function evaluarColores(colorPrimario: string, colorAcento: string) {
  const sobrePrimario = contraste(colorPrimario, '#FFFFFF'); // botones: texto blanco
  const sobreAcento = contraste(colorAcento, TINTA); // botón dorado e insignias: texto oscuro
  return {
    sobrePrimario,
    sobreAcento,
    /** AA para texto normal en ambos */
    optimo: sobrePrimario >= 4.5 && sobreAcento >= 4.5,
    /** Mínimo que acepta la API: AA para texto grande (3:1) */
    aceptable: sobrePrimario >= 3 && sobreAcento >= 3,
  };
}

export interface Sugerencia {
  nombre: string;
  descripcion: string;
  colorPrimario: string;
  colorAcento: string;
}

/**
 * Colores dominantes de una imagen. `pixeles` es RGBA plano (ImageData.data).
 * Ignora transparentes y casi grises; agrupa por cubos de color y prioriza los saturados.
 */
export function coloresDominantes(pixeles: ArrayLike<number>, maximo = 5): Rgb[] {
  const cubos = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < pixeles.length; i += 4) {
    const r = pixeles[i]!;
    const g = pixeles[i + 1]!;
    const b = pixeles[i + 2]!;
    if (pixeles[i + 3]! < 128) continue;
    const [, s, l] = rgbAHsl([r, g, b]);
    if (s < 0.22 || l < 0.1 || l > 0.93) continue; // fondo blanco, negro o gris
    const clave = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const c = cubos.get(clave) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++;
    c.r += r;
    c.g += g;
    c.b += b;
    cubos.set(clave, c);
  }
  // Los bordes suavizados del logo crean mezclas con pocos píxeles: se descartan (< 3 %)
  const total = [...cubos.values()].reduce((t, c) => t + c.n, 0);
  const candidatos = [...cubos.values()]
    .filter((c) => c.n >= total * 0.03)
    .map((c) => {
      const rgb: Rgb = [c.r / c.n, c.g / c.n, c.b / c.n];
      return { rgb, peso: c.n * (0.5 + rgbAHsl(rgb)[1]) };
    })
    .sort((x, y) => y.peso - x.peso);

  const elegidos: Rgb[] = [];
  const distancia = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  for (const c of candidatos) {
    if (elegidos.every((e) => distancia(e, c.rgb) > 70)) elegidos.push(c.rgb);
    if (elegidos.length >= maximo) break;
  }
  return elegidos;
}

const diferenciaTono = (a: Rgb, b: Rgb) => {
  const d = Math.abs(rgbAHsl(a)[0] - rgbAHsl(b)[0]) % 360;
  return d > 180 ? 360 - d : d;
};

/** Acento claro y vivo a partir de un tono (para fondos con texto oscuro). */
function acentoDesdeTono(h: number): string {
  return ajustarContraste(rgbAHex(hslARgb(h, 0.9, 0.58)), TINTA, 4.5);
}

/**
 * Combinaciones recomendadas para el logo. Todas cumplen AA (4.5:1): el primario se oscurece
 * si hace falta para que el texto blanco se lea, y el acento se aclara para el texto oscuro.
 */
export function sugerirPaletas(dominantes: Rgb[]): Sugerencia[] {
  if (!dominantes.length) {
    return [
      {
        nombre: 'Clásica',
        descripcion: 'El logo no tiene colores vivos: usa la paleta por defecto.',
        colorPrimario: MARCA_POR_DEFECTO.colorPrimario,
        colorAcento: MARCA_POR_DEFECTO.colorAcento,
      },
      {
        nombre: 'Sobria',
        descripcion: 'Azul petróleo con acento ámbar, para logos en blanco y negro.',
        colorPrimario: '#1D5C63',
        colorAcento: '#F2B544',
      },
    ];
  }
  const primario = (c: Rgb) => ajustarContraste(rgbAHex(c), '#FFFFFF', 4.5);
  const acento = (c: Rgb) => ajustarContraste(rgbAHex(c), TINTA, 4.5);
  const [d0, ...resto] = dominantes as [Rgb, ...Rgb[]];
  const h0 = rgbAHsl(d0)[0];
  const segundo = resto.find((c) => diferenciaTono(c, d0) >= 25);

  const lista: Sugerencia[] = [];
  if (segundo)
    lista.push({
      nombre: 'Del logo',
      descripcion: 'Los dos colores principales de tu logo.',
      colorPrimario: primario(d0),
      colorAcento: acento(segundo),
    });
  // Invertida solo si el segundo color ya es oscuro: aclarar un amarillo a botón da un oliva turbio
  if (segundo && contraste(segundo, '#FFFFFF') >= 3)
    lista.push({
      nombre: 'Del logo, invertida',
      descripcion: 'El segundo color del logo para botones y el principal para resaltar.',
      colorPrimario: primario(segundo),
      colorAcento: acento(d0),
    });
  lista.push(
    {
      nombre: 'Análoga',
      descripcion: 'El color del logo con un acento de tono vecino, cálido y armónico.',
      colorPrimario: primario(d0),
      colorAcento: acentoDesdeTono(h0 + 40),
    },
    {
      nombre: 'Complementaria',
      descripcion: 'Acento del tono opuesto: máximo contraste para promociones.',
      colorPrimario: primario(d0),
      colorAcento: acentoDesdeTono(h0 + 180),
    },
    {
      nombre: 'Monocromática',
      descripcion: 'Un solo tono en dos intensidades, discreta y elegante.',
      colorPrimario: primario(d0),
      colorAcento: acento(mezclar(d0, BLANCO, 0.55)),
    },
  );

  const vistas = new Set<string>();
  return lista.filter((s) => {
    const k = s.colorPrimario + s.colorAcento;
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}
