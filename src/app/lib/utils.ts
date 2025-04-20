export const isWithin = (timestamp: string, start: string, end: string | null | undefined) => {
  const inputDate = new Date(timestamp);
  const startDate = new Date(start);

  startDate.setHours(0, 0, 0, 0);
 
  if (!end) {
    return inputDate >= startDate
  }
 
  const endDate = new Date(end);
  endDate.setHours(23, 59, 59, 999);

  // Check if the input date is within the range (inclusive)
   return inputDate >= startDate && inputDate <= endDate;
}

export const isAmountValid = (amount: string) => {
  if (!amount) {
    return false; 
  }

  const val = Number(amount);

  return !Number.isNaN(val) && Number.isFinite(val);
};

export const isDateValid = (date: string) => {
  return new Date(date).toString() !== 'Invalid Date';
}

export const getExchangeRate = (symbol: string) => {
  const supported: any = {
    'ETHs': 1578.52,
    'lRBTC': 83794,
    'RBTC': 83794,
    'lRIF': 0.04279797,
    'lUSDCe': 1,
    'lUSDT': 1,
    'lWETH': 1578.52,
    'RIF': 0.04340247,
    'WETH': 1578.52,
    'USDC.e': 1
  }

  if (supported[symbol]) {
    return supported[symbol];
  }

  return 1; 
}