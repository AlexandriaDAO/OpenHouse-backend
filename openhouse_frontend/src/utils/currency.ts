export const DECIMALS = 6;

/**
 * Safely parses a string amount to e6s (BigInt) without floating point errors.
 * Truncates decimals beyond 6 places.
 * @param amount The string amount (e.g. "1.23")
 * @returns BigInt representation in e6s
 */
export const parseAmountToE6s = (amount: string): bigint => {
  // Remove any non-numeric characters except dot
  const cleanAmount = amount.replace(/,/g, '').trim();
  
  if (!cleanAmount || cleanAmount === '.') return 0n;

  const parts = cleanAmount.split('.');
  
  // Integer part
  let integerPart = parts[0] || '0';
  // Remove leading zeros unless it's just "0"
  if (integerPart.length > 1 && integerPart.startsWith('0')) {
    integerPart = integerPart.replace(/^0+/, '');
    if (integerPart === '') integerPart = '0';
  }

  // Fractional part
  let fractionalPart = parts[1] || '';
  
  // Truncate to 6 decimals if longer
  if (fractionalPart.length > DECIMALS) {
    fractionalPart = fractionalPart.substring(0, DECIMALS);
  }
  
  // Pad with zeros if shorter
  while (fractionalPart.length < DECIMALS) {
    fractionalPart += '0';
  }

  return BigInt(`${integerPart}${fractionalPart}`);
};

/**
 * Formats e6s (BigInt) to a string representation.
 * @param e6s The amount in e6s
 * @returns Formatted string (e.g. "1.230000")
 */
export const formatE6sToAmount = (e6s: bigint): string => {
  const str = e6s.toString().padStart(DECIMALS + 1, '0');
  const integerPart = str.slice(0, -DECIMALS);
  const fractionalPart = str.slice(-DECIMALS);
  return `${integerPart}.${fractionalPart}`;
};
