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

export const telemetry = async (json: any) => {
  const token = process.env.telemetry;
  const envname = process.env.envname;

  if (token && envname === 'prod') {
    try {
      const resp = await fetch('https://s1280654.eu-nbg-2.betterstackdata.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
        body: JSON.stringify({ message: json, timestamp: new Date().toISOString() })
      });
  
      if (!resp.ok) {
        // Handle HTTP errors (non-2xx)
        const error = await resp.text();
        console.error('Error sending telemetry:', resp.statusText, error);

        return error;
      }
      
      const result = await resp.text();
      console.log('Telemetry:', result);

      return result;
    } catch (e) {
      console.log(e);
    }
  }
}

export function getDatePast24Hours() {
  const now = new Date();
  const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours in milliseconds
  return pastDate;
}

export function getHoursDifference(p1: string, p2: string) {
  const date1 = new Date(p1);
  date1.setHours(0, 0, 0, 0);

  const date2 = new Date(p2);

  const diffInMs =date2.getTime() - date1.getTime(); // Difference in milliseconds
  const diffInHours = diffInMs / (1000 * 60 * 60); // Convert ms to hours
  return diffInHours;
}

export function getPreviousDate(date: string) {
  const date1 = new Date(date);
  date1.setHours(0, 0, 0, 0);

  date1.setDate(date1.getDate() - 1);
  return date1;
}

export function getDaysDiff(date1: Date, date2: Date) {

  date1.setHours(0, 0, 0, 0);
  const diffTime = Math.abs(date1.getTime() - date2.getTime()); // difference in milliseconds
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // convert to days

  console.log(`Difference is ${diffDays} days`);
  return diffDays;
}