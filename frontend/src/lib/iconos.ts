import {
  Baby,
  Banknote,
  Bike,
  BookOpen,
  Briefcase,
  Bus,
  Cake,
  Car,
  Cat,
  Church,
  Cigarette,
  Clapperboard,
  Coffee,
  Coins,
  CreditCard,
  Dog,
  Drill,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  Hammer,
  HandCoins,
  Heart,
  HeartPulse,
  Home,
  Hotel,
  type LucideIcon,
  Landmark,
  Laptop,
  Leaf,
  Lightbulb,
  Martini,
  Music,
  Package,
  PawPrint,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Scissors,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Stethoscope,
  Tag,
  Ticket,
  Train,
  TrendingUp,
  Trophy,
  Tv,
  Umbrella,
  Utensils,
  Wallet,
  Wifi,
  Wine,
  Wrench,
} from "lucide-react"

// Los iconos que se pueden elegir para una categoria.
//
// Salen de `lucide-react`, que ya usamos en toda la interfaz: mismo trazo, mismo
// criterio geometrico, hace juego con la tipografia por construccion. No hace
// falta ninguna dependencia nueva.
//
// **Es un subconjunto a proposito.** La libreria trae ~1.700 y elegir entre
// 1.700 no es elegir, es buscar; ademas obligaria a empaquetarlos todos para un
// selector. Estos son los que sirven para categorias de gasto y de ingreso, y la
// lista se amplia cuando falte alguno, no antes.
//
// Lo que se guarda en `categories.icon` es la **clave** de este mapa. Si algun
// dia se saca una de aca, las categorias que la usaban caen al icono por
// defecto en vez de romper.

export interface IconoCatalogo {
  clave: string
  Icono: LucideIcon
  // Para el buscador: sinonimos en español, que es como los va a buscar quien
  // usa la app. "comida" tiene que encontrar el tenedor.
  busqueda: string
}

// Agrupados por tema, que es el orden en que se muestran. Dentro de cada grupo,
// del mas probable al menos.
const CATALOGO: { grupo: string; iconos: [string, LucideIcon, string][] }[] = [
  {
    grupo: "Diario",
    iconos: [
      ["carrito", ShoppingCart, "supermercado compras mercado almacen"],
      ["tenedor", Utensils, "comida restaurante almorzar cenar"],
      ["cafe", Coffee, "cafe desayuno merienda bar"],
      ["copa", Wine, "vino bebida alcohol vinoteca"],
      ["trago", Martini, "trago salida boliche bar"],
      ["torta", Cake, "torta postre cumpleaños panaderia"],
      ["bolsa", ShoppingBag, "compras shopping tienda"],
    ],
  },
  {
    grupo: "Transporte",
    iconos: [
      ["auto", Car, "auto coche nafta cochera taxi"],
      ["colectivo", Bus, "colectivo bondi micro sube transporte"],
      ["tren", Train, "tren subte ferrocarril"],
      ["bici", Bike, "bici bicicleta monopatin"],
      ["nafta", Fuel, "nafta combustible gasolina estacion"],
      ["avion", Plane, "avion vuelo viaje pasaje"],
    ],
  },
  {
    grupo: "Casa",
    iconos: [
      ["casa", Home, "casa alquiler hogar expensas"],
      ["luz", Lightbulb, "luz electricidad edesur edenor"],
      ["wifi", Wifi, "wifi internet cable fibra"],
      ["celular", Smartphone, "celular telefono linea datos"],
      ["llave", Wrench, "plomero gasista arreglo mantenimiento"],
      ["martillo", Hammer, "refaccion obra albañil construccion"],
      ["taladro", Drill, "herramientas ferreteria"],
      ["paquete", Package, "envio correo delivery mudanza"],
      ["planta", Leaf, "planta jardin vivero"],
    ],
  },
  {
    grupo: "Salud y cuidado",
    iconos: [
      ["salud", HeartPulse, "salud medico prepaga obra social"],
      ["remedio", Pill, "remedio farmacia medicamento"],
      ["consulta", Stethoscope, "consulta medico turno estudio"],
      ["gimnasio", Dumbbell, "gimnasio gym entrenamiento deporte"],
      ["peluqueria", Scissors, "peluqueria barberia corte"],
      ["belleza", Sparkles, "belleza cosmetica uñas spa"],
      ["cigarrillo", Cigarette, "cigarrillos tabaco"],
    ],
  },
  {
    grupo: "Ocio",
    iconos: [
      ["cine", Clapperboard, "cine pelicula teatro"],
      ["streaming", Tv, "streaming netflix suscripcion tele"],
      ["juego", Gamepad2, "juego videojuego consola"],
      ["musica", Music, "musica spotify recital"],
      ["entrada", Ticket, "entrada recital evento partido"],
      ["hotel", Hotel, "hotel hospedaje vacaciones"],
      ["trofeo", Trophy, "club deporte torneo"],
    ],
  },
  {
    grupo: "Personas",
    iconos: [
      ["regalo", Gift, "regalo cumpleaños navidad"],
      ["ropa", Shirt, "ropa indumentaria calzado"],
      ["bebe", Baby, "bebe hijo pañales jardin"],
      ["estudio", GraduationCap, "colegio universidad cuota estudio"],
      ["libro", BookOpen, "libro libreria curso"],
      ["mascota", PawPrint, "mascota veterinaria"],
      ["perro", Dog, "perro paseador"],
      ["gato", Cat, "gato arena"],
      ["corazon", Heart, "donacion caridad ayuda"],
      ["iglesia", Church, "iglesia diezmo"],
    ],
  },
  {
    grupo: "Dinero",
    iconos: [
      ["sueldo", Banknote, "sueldo salario honorarios cobro"],
      ["trabajo", Briefcase, "trabajo freelance changa"],
      ["ahorro", PiggyBank, "ahorro meta fondo"],
      ["inversion", TrendingUp, "inversion plazo fijo renta"],
      ["banco", Landmark, "banco cuenta comision"],
      ["tarjeta", CreditCard, "tarjeta credito resumen"],
      ["billetera", Wallet, "efectivo billetera caja"],
      ["monedas", Coins, "cambio moneda dolares"],
      ["prestamo", HandCoins, "prestamo deuda cuota"],
      ["impuesto", Receipt, "impuesto afip monotributo factura"],
      ["seguro", Umbrella, "seguro poliza"],
      ["compu", Laptop, "compu software suscripcion"],
    ],
  },
]

// Plano, para buscar y para resolver una clave.
export const ICONOS: IconoCatalogo[] = CATALOGO.flatMap((g) =>
  g.iconos.map(([clave, Icono, busqueda]) => ({ clave, Icono, busqueda })),
)

export const GRUPOS_ICONOS = CATALOGO.map((g) => ({
  grupo: g.grupo,
  iconos: g.iconos.map(([clave, Icono, busqueda]) => ({ clave, Icono, busqueda })),
}))

const POR_CLAVE = new Map(ICONOS.map((i) => [i.clave, i.Icono]))

// El de una categoria sin icono elegido, y el de una clave que ya no existe.
export const ICONO_POR_DEFECTO = Tag

export function iconoDe(clave: string | null | undefined): LucideIcon {
  if (!clave) return ICONO_POR_DEFECTO
  return POR_CLAVE.get(clave) ?? ICONO_POR_DEFECTO
}

// Busca por clave o por sinonimos, sin tildes: "cafe" encuentra el cafe y
// "pañales" encuentra el bebe.
export function filtrarIconos(texto: string): IconoCatalogo[] {
  const q = sinTildes(texto)
  if (!q) return ICONOS
  return ICONOS.filter((i) => sinTildes(i.clave).includes(q) || sinTildes(i.busqueda).includes(q))
}

function sinTildes(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
}
