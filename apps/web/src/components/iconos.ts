import {
  CupSoda,
  Drumstick,
  IceCreamCone,
  Package,
  Salad,
  Sandwich,
  Star,
  Tag,
  type LucideIcon,
} from 'lucide-react';

/** Íconos de categoría (el nombre se guarda en categorias.icono). */
export const ICONOS: Record<string, LucideIcon> = {
  package: Package,
  sandwich: Sandwich,
  drumstick: Drumstick,
  salad: Salad,
  'cup-soda': CupSoda,
  'ice-cream-cone': IceCreamCone,
  star: Star,
  tag: Tag,
};
