import { NextResponse } from "next/server";
import cors from '../../../../../lib/cors';
import { oku, okuTokens } from "@/app/lib/partners/oku";
import { sushi, sushiTokens } from "@/app/lib/partners/sushi";
import { woodswap, woodTokens } from "@/app/lib/partners/woodswap";
import { isWithin, isAmountValid, isDateValid, getExchangeRate } from "@/app/lib/utils";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function isValidAddress(address: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(address)
}

function objectToQueryParams(obj: any) {
  return Object.entries(obj)
    .map(([key, value]) =>
      encodeURIComponent(key) + '=' + encodeURIComponent(value as string)
    )
    .join('&');
}

const getDataFromUrl = async (link: string) => {
  try {
    const response = await fetch(link);
    if (response.ok && response.status === 200) {
      const data = await response.json();

      return Promise.resolve(data);

    } else {
      console.log('error:', response.statusText);
      return Promise.reject(response.statusText);
    }
  } catch (e) {
    console.log('error:', e);
    return Promise.reject(e);
  }
}

function getTxUrl(address: string, q: string, baseUrlType: string) {
  const txNormalUrl = `https://rootstock.blockscout.com/api/v2/addresses/${address}/transactions?${q}`;
  const txTokenTransferUrl = `https://rootstock.blockscout.com/api/v2/addresses/${address}/token-transfers?type=&${q}`;

  if (baseUrlType === 'normal') {
    return txNormalUrl;
  }

  return txTokenTransferUrl;
}

const contractMap: any = {
  oku: oku,
  sushi: sushi,
  woodswap: woodswap,
};
const tokenMap: any = {
  oku: okuTokens.map(e => e.toLowerCase()),
  sushi: sushiTokens.map(e => e.toLowerCase()),
  woodswap: woodTokens.map(e => e.toLowerCase()),
};

const checkTxSummary = async (hash: string, txType: string, amount: number, partner: string, ret: any) => {
  
  const txSummaryUrl = `https://rootstock.blockscout.com/api/v2/transactions/${hash}/summary`;

  console.log('checking summary: ', txSummaryUrl);
  const txSummary = await getDataFromUrl(txSummaryUrl);
  const classType = txSummary.data?.debug_data?.model_classification_type;


  for (const summary of txSummary.data.summaries) {
    let tokenMetadatas = [];
    let tokenValues = [];

    if (txType === 'swap' && classType === 'swap') {
      tokenMetadatas.push(summary?.summary_template_variables?.outgoing_token?.value);
      tokenValues.push(summary?.summary_template_variables?.outgoing_amount?.value);

      tokenMetadatas.push(summary?.summary_template_variables?.incoming_token?.value);
      tokenValues.push(summary?.summary_template_variables?.incoming_amount?.value);
    } else {
      // lend case 
      tokenMetadatas.push(summary?.summary_template_variables?.token0?.value);
      tokenValues.push(summary?.summary_template_variables?.amount0?.value);
    }

    let index = 0;
    for (const tokenMetadata of tokenMetadatas) {
      const tokenValue = tokenValues[index];

      if (tokenMetadata && tokenValue) {
        const tokenSymbol = tokenMetadata.symbol;
        const value = Number(tokenValue);

        let exchangeRate = getExchangeRate(tokenSymbol); // consider it a dollar - USDT
        if (tokenMetadata.exchange_rate) {
          exchangeRate = tokenMetadata.exchange_rate
        }

        const inUSD = value * Number(exchangeRate);
        console.log('swap amount of: ', tokenSymbol, inUSD);

        if (inUSD >= amount) { // $50
          ret.partner = partner;
          ret.isVerified = true;
          ret.txType = txType;
          ret.tokenName = tokenSymbol;
          ret.tokenValue = value;
          ret.tokenValueUSD = inUSD;
          ret.exchangeRate = exchangeRate;
          ret.matchedTx = hash;

          return ret;
        }
      }

      index++;
    }
  }

  return ret; 
}

const findSwap = async (address: string, partner: string, txType: string, baseUrlType: string, amount: number, start: string, end: string | null | undefined) => {

  const ret = {
    partner: partner,
    isVerified: false,
    txType: txType,
    tokenName: '',
    tokenValue: 0,
    tokenValueUSD: 0,
    exchangeRate: 0,
    matchedTx: ''
  };

  let maxPagesTocheck = 10;
  let q = '';

  const contractsList = contractMap[partner].filter((c: any) => c.txType === txType);

  do {
    const link = getTxUrl(address, q, baseUrlType);

    console.log('api url:', link);

    const txList = await getDataFromUrl(link);

    if (txList.next_page_params) {
      q = objectToQueryParams(txList.next_page_params);
    } else {
      q = '';
    }

    for (const tx of txList.items) {
      const isDateWithin = isWithin(tx.timestamp, start, end);

      if (!isDateWithin) { // No need to check further deep
        return ret;
      }

      if (contractsList.find((c: any) => (c.method === tx.method)) && tx.status === 'ok') {
        // verify method call
        // verify contract address

        console.log('method matched');
        const hash = tx.hash || tx.transaction_hash;
        console.log('hash: ', hash);
        const txDetailUrl = `https://rootstock.blockscout.com/api/v2/transactions/${hash}`;

        const txData = await getDataFromUrl(txDetailUrl);

        const foundContract = contractsList.find((c: any) => (txData && txData.to && txData.to.hash && c.contract.toLowerCase() === txData.to.hash.toLowerCase() && c.txType === txType && txData.method === c.method));

        const translatedActionType: any = {
          lend: ['token_minting', 'token_transfer', 'collect', 'mint', 'swap', 'mint', 'addLiquidity', 'addLiquidityETH', 'collect', 'supply', 'borrow', 'multicall', 'deposit', 'transfer'],
          swap: ['swap', 'collect']
        };

        if (foundContract && translatedActionType[txType].includes(foundContract.actionType)) {
          // Yes, this address interacted with contract
          console.log('contract address matched');
          // Now find if user swapped the amount from query param;
          if (txData.token_transfers) {
            for (const transfer of txData.token_transfers) {
              const tokenSymbol = transfer.token.symbol;
              const value = Number(transfer.total.value) / (10 ** Number(transfer.total.decimals));

              let exchangeRate = getExchangeRate(tokenSymbol); // consider it a dollar
              if (transfer.token.exchange_rate) {
                exchangeRate = transfer.token.exchange_rate
              }

              const inUSD = value * Number(exchangeRate);

              const tokenAddress = transfer.token.address.toLowerCase();

              let isTokenMatched = tokenMap[partner].includes(tokenAddress);

              if (txType === 'lend') {
                // isTokenMatched = true; // ignore token matching for lend for testing
              }

              if (inUSD >= amount && isTokenMatched) { // $50

                console.log('tx: tx', txData.hash);
                ret.partner = partner;
                ret.isVerified = true;
                ret.txType = txType;
                ret.tokenName = tokenSymbol;
                ret.tokenValue = value;
                ret.tokenValueUSD = inUSD;
                ret.exchangeRate = exchangeRate;
                ret.matchedTx = txData.hash;

                return ret;
              }
            }
            console.log('lets check summary');
            // not found in token transfer - then also check summary 
            await checkTxSummary(hash, txType, amount, partner, ret);

            if (ret.isVerified) return ret; 
          } else {
            // no token transfers - let's check tx event or summary
            await checkTxSummary(hash, txType, amount, partner, ret);

            if (ret.isVerified) return ret; 
          }
        }
      }
    }

    maxPagesTocheck--;
  } while (maxPagesTocheck >= 0 && q != '');

  return ret;
}


export const GET = async (req: any, context: any) => {
  const { params } = context;
  const address = params.address;
  const partner = params.partner;
  const txType = params.type; // where type is swap, lend

  const searchParams = req.nextUrl.searchParams;
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const amount = searchParams.get('amount');


  if (!amount) {
    return NextResponse.json({
      msg: 'Amount to check is required!'
    }, { status: 200, headers: corsHeaders });
  }

  if (!isAmountValid(amount)) {
    return NextResponse.json({
      msg: 'Amount is not valid!'
    }, { status: 200, headers: corsHeaders });
  }

  console.log('dates', startDate, endDate);

  if (!startDate) {
    return NextResponse.json({
      msg: 'Start date is required!'
    }, { status: 200, headers: corsHeaders });
  }

  if (!isDateValid(startDate)) {
    return NextResponse.json({
      msg: 'Start date is not valid!'
    }, { status: 200, headers: corsHeaders });
  }

  if (!isValidAddress(address)) {
    return NextResponse.json({
      msg: 'Address is not valid!'
    }, { status: 200, headers: corsHeaders });
  }

  if (!['oku', 'woodswap', 'sushi'].includes(partner)) {
    return NextResponse.json({
      msg: 'Invalid partner!'
    }, { status: 200, headers: corsHeaders });
  }

  if (!['lend', 'swap'].includes(txType)) {
    return NextResponse.json({
      msg: 'Invalid tx types, supported: lend or swap!'
    }, { status: 200, headers: corsHeaders });
  }

  let ret = await findSwap(address, partner, txType, 'token-transfers', amount, startDate, endDate);

  if (!ret.isVerified) {
    ret = await findSwap(address, partner, txType, 'normal', amount, startDate, endDate);
  }

  return NextResponse.json({
    data: ret
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