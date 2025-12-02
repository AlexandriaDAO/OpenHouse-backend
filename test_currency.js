// Simple test script
const { parseAmountToE6s } = require('./openhouse_frontend/src/utils/currency.ts');

// Since I can't easily require TS files in node without setup, I'll just paste the logic here for a quick verify script
const DECIMALS = 6;
const parse = (amount) => {
  const cleanAmount = amount.replace(/,/g, '').trim();
  if (!cleanAmount || cleanAmount === '.') return 0n;
  const parts = cleanAmount.split('.');
  let integerPart = parts[0] || '0';
  if (integerPart.length > 1 && integerPart.startsWith('0')) {
    integerPart = integerPart.replace(/^0+/, '');
    if (integerPart === '') integerPart = '0';
  }
  let fractionalPart = parts[1] || '';
  if (fractionalPart.length > DECIMALS) {
    fractionalPart = fractionalPart.substring(0, DECIMALS);
  }
  while (fractionalPart.length < DECIMALS) {
    fractionalPart += '0';
  }
  return BigInt(`${integerPart}${fractionalPart}`);
};

const tests = [
  { input: "1", expected: 1000000n },
  { input: "0.01", expected: 10000n },
  { input: "1.234567", expected: 1234567n },
  { input: "1.2345678", expected: 1234567n }, // Truncate
  { input: "0.000001", expected: 1n },
  { input: "0", expected: 0n },
  { input: ".5", expected: 500000n },
  { input: "100", expected: 100000000n },
];

let passed = true;
for (const t of tests) {
  const res = parse(t.input);
  if (res !== t.expected) {
    console.error(`FAILED: ${t.input} -> ${res} (expected ${t.expected})`);
    passed = false;
  } else {
    console.log(`PASS: ${t.input} -> ${res}`);
  }
}

if (passed) console.log("All tests passed");
else process.exit(1);
