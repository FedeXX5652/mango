import {
  Banknote,
  CreditCard,
  HandCoins,
  Landmark,
  type LucideIcon,
  PiggyBank,
  TrendingUp,
  Wallet,
} from "lucide-react"

// Icono por tipo de cuenta (mismo vocabulario que TIPOS en Cuentas.tsx).
const ICONO_CUENTA: Record<string, LucideIcon> = {
  cash: Banknote,
  bank: Landmark,
  savings: PiggyBank,
  credit_card: CreditCard,
  investment: TrendingUp,
  loan: HandCoins,
  other: Wallet,
}

export const iconoCuenta = (type: string): LucideIcon => ICONO_CUENTA[type] ?? Wallet
