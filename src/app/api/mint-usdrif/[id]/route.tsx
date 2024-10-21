import { NextResponse } from "next/server";
import { providers, utils, Contract } from 'ethers';
import cors from '../../../lib/cors';
import { abi } from '../../../lib/abi';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const ROOTSTOCK_RPC_NODE = "https://public-node.rsk.co";

const rskProvider = new providers.JsonRpcProvider(ROOTSTOCK_RPC_NODE);

const stRif = '0x3A15461d8AE0f0Fb5fA2629e9dA7D66A794a6E37'.toLowerCase();

const STRIFTokenContract = new Contract(stRif, abi, rskProvider);

const balaneOfUSDRif = async (address: string) => {
  const balance = await STRIFTokenContract.balanceOf(address.toLowerCase());
  const formattedBalance = utils.formatUnits(balance, 18);
  
  return formattedBalance;
}


let RIF_VALUE = 0.078623;
let LAST_UPDATED: any = new Date();
let isFirstTime = true;

const rifToUSD = async () => {
  if (oneDayPast() || isFirstTime) {

    // fetch latest value
    try {
      const link = `https://api.coingecko.com/api/v3/simple/price?ids=rif-token&vs_currencies=usd`;
      const response = await fetch(link);
      
      if (response.ok && response.status === 200) {
        const data =  await response.json();
        const val = data["rif-token"];
        if (val && val.usd) {
          // update value
          RIF_VALUE = val.usd;
          LAST_UPDATED = new Date();
          isFirstTime = false;
          return Promise.resolve(RIF_VALUE);
        } else {
          return Promise.resolve(RIF_VALUE);
        }
      } else {
        return Promise.resolve(RIF_VALUE);
      }
    } catch (e) {
      return Promise.resolve(RIF_VALUE);
    }
  } else {
    // use old value
    return Promise.resolve(RIF_VALUE);
  }
}

const oneDayPast = () => {
  if (LAST_UPDATED) {
    const currentDate = new Date();
    const differenceInMilliseconds = currentDate.getTime() - LAST_UPDATED.getTime();
    // 1 * 24 * 60 * 60 * 1000 is one day
    const threeMonthsInMilliseconds = 1 * 24 * 60 * 60 * 1000;
    // Check if the difference is greater than 1 day 
    return differenceInMilliseconds > threeMonthsInMilliseconds;
  }
   
  return false;
}

function isValidAddress(address: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(address)
}



const lookupBlockscoutIndexer = async (address: string, retry: number, next: any, acc: any = []) => {
  try {
    let q = '';
    if (next && next.block_number) {
        q = `&block_numbeer=${next.block_number}&index=${next.index}`;
    }
   
    const link = `https://rootstock.blockscout.com/api/v2/addresses/${address}/token-transfers?type=ERC-20&filter=to&token=0x2aCc95758f8b5F583470bA265Eb685a8f45fC9D5?${q}`;
   
    console.log(link);
    const response = await fetch(link);
    console.log('response: ', response.status);
    if (response.ok && response.status === 200) {
      const data =  await response.json();

      const newItems = acc.concat(data.items);

      if (data.next_page_params) {
        return await lookupBlockscoutIndexer(address, --retry, data.next_page_params, newItems);
      }


      return Promise.resolve({ items: newItems, status: 'ok' });

    } else {
      if (retry === 0) {
        return Promise.resolve({ items: acc, status: 'error' });
      } 
      // retry 
      return await lookupBlockscoutIndexer(address, retry - 1, next, acc);
    }

  } catch (e) {
    console.log('this should not execute:', e);
    return Promise.resolve({ items: [], status: 'error' });
  }
}





export const GET = async (req: any, context: any) => { 
  const { params } = context;

  if(!isValidAddress(params.id)) {
    return NextResponse.json({
      msg: 'Address is not valid!'
    }, { status: 200, headers: corsHeaders });
  }
  const retryCount = 10;

  const [data, rifValue, balance] = await Promise.all([
    lookupBlockscoutIndexer(params.id, retryCount, '', []),
    rifToUSD(),
    balaneOfUSDRif(params.id)
  ]);

  console.log(rifValue);
 
  const responseData = {
    mintedUSDRIF: false,
    rifUsed: 0,
    swapTimestamp: '',
    USDRIF_Balance: parseFloat( balance )
  }
  data.items.reverse().forEach((tx: any) => {
    if (tx.method === 'mintTP' && tx.to && tx.to.hash.toLowerCase() === '0xA27024eD70035E46DBa712609FC2AFA1c97aa36a'.toLowerCase()) {
      if (tx.total) {
        const value = utils.formatUnits(tx.total.value, tx.total.decimals);
        if (Number(value) >= 100) {
          responseData.mintedUSDRIF = true;
          responseData.rifUsed = parseFloat(value);
          responseData.swapTimestamp = tx.timestamp;
        }
      }
    }
  })


  return NextResponse.json({
    data: {
      ...responseData,
      network: 'mainnet',
      site: 'rifonchain.com'
    }
  }, { status: 200, headers: corsHeaders });
}

export async function OPTIONS(request: Request) {
  return cors(
    request,
    new Response(null, {
      status: 204,
    })
  );
}