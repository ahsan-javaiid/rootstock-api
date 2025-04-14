import { NextResponse } from "next/server";
import cors from '../../../../lib/cors';
import { oku } from "@/app/lib/partners/oku";
import { sushi } from "@/app/lib/partners/sushi";
import { woodswap } from "@/app/lib/partners/woodswap";

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

function buildTransfer(transfer: any) {

}

const getDataFromUrl = async (link: string) => {
  try {
    const response = await fetch(link);
    if (response.ok && response.status === 200) {
      const data = await response.json();

      return Promise.resolve(data);

    } else {
      console.log('error');
      console.log('error:', response.statusText);
      return Promise.resolve(null);
    }
  } catch (e) {
    console.log('e:', e);
    return Promise.resolve(null);
  }
}

const findSwap = async (address: string, partner: string) => {
  const contractMap: any = {
    oku: oku,
    sushi: sushi,
    woodswap: woodswap
  };
  const ret = {
    partner: partner,
    swapVerified: false,
    tokenName: '',
    tokenValue: 0,
    tokenValueUSD: 0,
    exchangeRate: 0,
    matchedTx: ''
  };

  let maxPagesTocheck = 2;
  let q = '';

  do {

    // 
    const txNormalUrl = `https://rootstock.blockscout.com/api/v2/addresses/${address}/transactions?${q}`;
    const txTokenTransferUrl = `https://rootstock.blockscout.com/api/v2/addresses/${address}/token-transfers?type=&${q}`;
    
    const link = partner === 'woodswap' ? txNormalUrl: txTokenTransferUrl;
    
    console.log('using link:', link);

    const txList = await getDataFromUrl(link);

    console.log('txList', txList);
    if (txList.next_page_params) {
      q = objectToQueryParams(txList.next_page_params);
    }

    for (const c of contractMap[partner]) {
      for (const tx of txList.items) {
       // console.log('tx:', tx);

        if (tx.method === c.method && tx.status === 'ok') { // verify method call
          // verify contract address

          console.log('method matched');
          const hash = tx.hash || tx.transaction_hash;
          const txDetailUrl = `https://rootstock.blockscout.com/api/v2/transactions/${hash}`;
          const txSummaryUrl = `https://rootstock.blockscout.com/api/v2/transactions/${hash}/summary`;

          const [txData, txSummary] = await Promise.all([
            getDataFromUrl(txDetailUrl),
            getDataFromUrl(txSummaryUrl)
          ]);

          console.log('txData:', txData);
          if (txData && txData.to && txData.to.hash && c.contract.toLowerCase() === txData.to.hash.toLowerCase()) {
            // Yes, this user interacted with this oku contract

            console.log('contract address matched');

            // Now find if he swapped $50;

            // using summeries
            console.log('summaries len:', txSummary.data.summaries.length);
            for (const summary of txSummary.data.summaries) {
              const tokenMetadata = summary?.summary_template_variables?.outgoing_token?.value;
              const tokenValue = summary?.summary_template_variables?.outgoing_amount?.value;

              if (tokenMetadata && tokenValue) {
                const tokenSymbol = tokenMetadata.symbol;
                const value = Number(tokenValue);

                let exchangeRate = 1; // consider it a dollar - USDT
                if (tokenMetadata.exchange_rate) {
                  exchangeRate = tokenMetadata.exchange_rate
                }

                const inUSD = value * Number(exchangeRate);
                console.log('swap amount of: ', tokenSymbol, inUSD);

                if (inUSD >= 50) { // $50
                  ret.partner = 'oku';
                  ret.swapVerified = true;
                  ret.tokenName = tokenSymbol;
                  ret.tokenValue = value;
                  ret.tokenValueUSD = inUSD;
                  ret.exchangeRate = exchangeRate;
                  ret.matchedTx = tx.transaction_hash;

                  return ret;
                }

              }

            }

            if (txSummary.data.summaries.length === 0) {

              if (txData.token_transfers) {
                for (const transfer of txData.token_transfers) {
                  const tokenSymbol = transfer.token.symbol;
                  const value = Number(transfer.total.value) / (10 ** Number(transfer.total.decimals));
    
                  let exchangeRate = 1; // consider it a dollar - USDT
                  if (transfer.token.exchange_rate) {
                    exchangeRate = transfer.token.exchange_rate
                  }
    
                  const inUSD = value * Number(exchangeRate);
    
                  if (inUSD >= 50) { // $50
    
                    console.log('tx: tx', txData.hash);
                    ret.partner = partner;
                    ret.swapVerified = true;
                    ret.tokenName = tokenSymbol;
                    ret.tokenValue = value;
                    ret.tokenValueUSD = inUSD;
                    ret.exchangeRate = exchangeRate;
                    ret.matchedTx = txData.hash;
    
                    return ret;
                  }

                }

              } 

              if (tx.token) {
                const tokenSymbol = tx.token.symbol;
                const value = Number(tx.total.value) / (10 ** Number(tx.total.decimals));
  
                let exchangeRate = 1; // consider it a dollar - USDT
                if (tx.token.exchange_rate) {
                  exchangeRate = tx.token.exchange_rate
                }
  
                const inUSD = value * Number(exchangeRate);
                console.log('swap amount of: ', tokenSymbol, inUSD);
  
                if (inUSD >= 50) { // $50
  
                  console.log('tx: tx', tx);
                  ret.partner = partner;
                  ret.swapVerified = true;
                  ret.tokenName = tokenSymbol;
                  ret.tokenValue = value;
                  ret.tokenValueUSD = inUSD;
                  ret.exchangeRate = exchangeRate;
                  ret.matchedTx = tx.transaction_hash;
  
                  return ret;
                }
              }
    
            }
          }
        }
      }
    }

    maxPagesTocheck--;
  } while (maxPagesTocheck >= 0 || q != '');

  return ret;
}


export const GET = async (req: any, context: any) => {
  const { params } = context;
  const address = params.address;
  const partner = params.partner;

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


  const ret = await findSwap(address, partner);

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