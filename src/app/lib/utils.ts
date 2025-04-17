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
    'ETHs': 1585.91
  }

  if (supported[symbol]) {
    return supported[symbol];
  }

  return 1; 
}