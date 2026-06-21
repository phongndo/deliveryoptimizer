export function formatUsPhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function isComplete10DigitUsPhone(formatted: string): boolean {
  return formatted.replace(/\D/g, "").length === 10;
}

export function toE164UsPhone(formatted: string): string {
  return `+1${formatted.replace(/\D/g, "")}`;
}
