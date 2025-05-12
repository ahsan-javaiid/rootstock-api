
import { NextResponse } from "next/server";
import { providers, utils, Contract } from 'ethers';
import cors from '../../../lib/cors';
import { abi } from '../../../lib/abi';
import { ethers } from "ethers";
import {getDatePast24Hours, getDaysDiff, logger ,getHoursDifference, getPreviousDate, isWithin, isAmountValid, isDateValid, getExchangeRate, telemetry } from "@/app/lib/utils";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const ROOTSTOCK_RPC_NODE = "https://public-node.rsk.co";

const rskProvider = new providers.JsonRpcProvider(ROOTSTOCK_RPC_NODE);

const stRif = '0x5db91e24bd32059584bbdb831a901f1199f3d459'.toLowerCase();

const STRIFTokenContract = new Contract(stRif, abi, rskProvider);

function isValidAddress(address: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(address)
}

/**
 * Binary search for block closest to target timestamp.
 */
async function findClosestBlock(provider: any, targetTimestamp: number, startBlock: number, endBlock: number) {
  let bestBlock = startBlock;
  while (startBlock <= endBlock) {
    const mid = Math.floor((startBlock + endBlock) / 2);
    const block = await provider.getBlock(mid);
    if (!block) break;
    if (block.timestamp < targetTimestamp) {
      startBlock = mid + 1;
    } else {
      bestBlock = mid;
      endBlock = mid - 1;
    }
  }
  return bestBlock;
}

const CAMPAIGN_DAYS = 15;
const ENTRIES_PER_100 = 1;
const MAX_ENTRIES = 60;
const BLOCK_TIME_SECONDS = 25; // Approximate for Rootstock

/**
 * Calculates total entries earned during a 15-day campaign.
 */
async function calculateCampaignEntries(account: string, startDate: string) {
  const latestBlock = await rskProvider.getBlock("latest");
  const now = latestBlock.timestamp;


  const days = getDaysDiff(new Date(startDate), new Date(now * 1000));

  const entries = [];
  const history: any = {
    holdingDuration: '',
    totalEarnedTickets: 0,
    ticketHistoryByDays: []
  }
  const currentBlockNumber = latestBlock.number;


  for (let i = 0; i < Math.min(CAMPAIGN_DAYS, days); i++) {
    const endTime = now - i * 86400;
    const startTime = endTime - 86400;

    // Estimate blocks from timestamp
    const estimatedEndBlock = currentBlockNumber - Math.floor((now - endTime) / BLOCK_TIME_SECONDS);
    const estimatedStartBlock = currentBlockNumber - Math.floor((now - startTime) / BLOCK_TIME_SECONDS);

    const startBlock = estimatedStartBlock // await findClosestBlock(rskProvider, startTime, estimatedStartBlock - 20, estimatedStartBlock + 20);
    const endBlock = estimatedEndBlock // await findClosestBlock(rskProvider, endTime, estimatedEndBlock - 20, estimatedEndBlock + 20);

    const [startBalance, endBalance] = await Promise.all([
      STRIFTokenContract.balanceOf(account, { blockTag: startBlock }),
      STRIFTokenContract.balanceOf(account, { blockTag: endBlock })
    ]);

    const minBalance = startBalance.lt(endBalance) ? startBalance : endBalance;
    const balanceInUnits = parseFloat(ethers.utils.formatUnits(minBalance, 18));

    const dayEntries = Math.min(Math.floor(balanceInUnits / 100), 4);
    if (dayEntries > 0) {
      entries.push(dayEntries);
      history.ticketHistoryByDays.push({
        from: new Date(startTime *  1000).toDateString(),
        to: new Date(endTime * 1000).toDateString(),
        balance: balanceInUnits,
        tickets: dayEntries
      });
    }
  }

  // Total and apply cap
  console.log('found entries:', entries);
  const totalEntries = Math.min(entries.reduce((a, b) => a + b, 0), MAX_ENTRIES);
 
  history.totalEarnedTickets = totalEntries
  history.holdingDuration = `${history.ticketHistoryByDays.length} days`;
  
  return history;
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

function objectToQueryParams(obj: any) {
  return Object.entries(obj)
    .map(([key, value]) =>
      encodeURIComponent(key) + '=' + encodeURIComponent(value as string)
    )
    .join('&');
}

async function calculateEntriesViaBlockscout(account: string, startDate: string, endDate: string) { 
  // https://rootstock.blockscout.com/api/v2/addresses/0x1723e4d5daAc7D6761941237d9a70b200424AF41/token-transfers?type=ERC-20&filter=to&token=0x5db91e24BD32059584bbDb831A901f1199f3d459
  try {
    const ret = {
      isVerified: false,
      balance: 0,
      tickets: 0,
      network: 'mainnet',
      token: "stRIF",
      holdingDuration: "24h"
    };
  
    let maxPagesTocheck = 10;
    let q = '';

    do {

      const link = `https://rootstock.blockscout.com/api/v2/addresses/${account}/token-transfers?type=ERC-20&filter=to&token=0x5db91e24BD32059584bbDb831A901f1199f3d459`
      console.log('api url:', link);
  
      const txList = await getDataFromUrl(link);
  
      if (txList.next_page_params) {
        q = objectToQueryParams(txList.next_page_params);
      } else {
        q = '';
      }
  
      for (const tx of txList.items) {
        const isDateWithin = isWithin(tx.timestamp, startDate, endDate);
  
        if (!isDateWithin) { // No need to check further deep
          return ret;
        }
  
        // if (contractsList.find((c: any) => (c.method === tx.method))) {
        if (['depositAndDelegate'].includes(tx.method)) {
          // verify method call
          // verify contract address
          // tx.status === 'ok'
          console.log('method matched');
          const hash = tx.hash || tx.transaction_hash;
          console.log('hash: ', hash);
          const txDetailUrl = `https://rootstock.blockscout.com/api/v2/transactions/${hash}`;
  
          const txData = await getDataFromUrl(txDetailUrl);
  
  
          if (txData.status === 'ok') {
            const amount = tx.total.value / 10 ** 18;
            return {
              isVerified: true,
              balance: amount,
              tickets: Math.min(Math.floor(amount / 100), 4),
              network: 'mainnet',
              token: "stRIF",
              holdingDuration: "24h"
            };

          }
        }
      }
  
      maxPagesTocheck--;
    } while (maxPagesTocheck >= 0 && q != '');
  
    return ret;
  } catch (e) {
    console.log('error calling blockscout api: ', e);
    throw e;
  }


}

async function calculateEntries(account: string, startDate: string, endDate: string) { // campaign start date
  let windowStart = getDatePast24Hours();

  const isWindow = isWithin(windowStart.toISOString(), startDate, endDate);

  // Make this condition light 
  // if (!isWindow) {
  //   return {
  //     msg: 'Balance & tickets calculation does not apply on campaign future start date or after campaign end date. Users need to claim tickets every 24h after campaing start. Secondly, wait atleast 24h after campaign start to claim first entry to ensure the sustainable stRIF holding.',
  //     balance: 0,
  //     tickets: 0
  //   }
  // }

  const [currentBlock, currentBalance] = await Promise.all([
    rskProvider.getBlock("latest"),
    STRIFTokenContract.balanceOf(account.toLowerCase())
  ]);

  const approxBlocksPerDay = Math.floor((24 * 60 * 60) / 25); // 30s block time
  const startBlockGuess = currentBlock.number - approxBlocksPerDay;

  console.log('startBlockGuess:', startBlockGuess);
  // closest block at ~24 hours ago

  let bestBlock = startBlockGuess;

  const pastBalance = await STRIFTokenContract.balanceOf(account, { blockTag: bestBlock });

  const minBalance = currentBalance.lt(pastBalance) ? currentBalance : pastBalance;
  const stakedUnits = ethers.utils.formatUnits(minBalance, 18);
  const entries = Math.min(Math.floor(parseFloat(stakedUnits) / 100), 4); // max per day is 4

  return {
    balance: Number(Number(stakedUnits).toFixed(2)),
    tickets: entries
  };
}

export const GET = async (req: any, context: any) => { 

  const { params } = context;
  const searchParams = req.nextUrl.searchParams;

  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const showHistory = searchParams.get('history');

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

  if(!isValidAddress(params.id)) {
    return NextResponse.json({
      msg: 'Address is not valid!'
    }, { status: 200, headers: corsHeaders });
  }

  let resp = {};
  if (showHistory && showHistory === 'true') {
    const [result, history] = await Promise.all([
      calculateEntries(params.id.toLowerCase(), startDate, endDate),
      calculateCampaignEntries(params.id.toLowerCase(), startDate)
    ]);

    resp = {
      ...result,
      network: 'mainnet',
      token: 'stRIF',
      holdingDuration: '24h',
      holdingHistory: history
    };
  } else {
    //const result = await calculateEntries(params.id.toLowerCase(), startDate, endDate);

    const result = await calculateEntriesViaBlockscout(params.id.toLowerCase(), startDate, endDate);
    resp = {
      ...result,
      network: 'mainnet',
      token: 'stRIF',
      holdingDuration: '24h',
    };
  }

  await logger('strif', {
    id: params.id.toLowerCase(),
    ...resp
  });

  return NextResponse.json({
    data:  resp
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